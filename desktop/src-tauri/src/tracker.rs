use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use crate::supabase::{self, Auth};

pub type SharedAuth = Arc<Mutex<Option<Auth>>>;

// Stop flushing activity data after this many seconds of system-wide inactivity.
// Chosen to be well below the IDLE threshold (120 s) so the activity log doesn't
// accumulate stale time while the user is away.
const SYSTEM_IDLE_CUTOFF_SEC: u64 = 60;

// Returns the name of the currently focused app via NSWorkspace.
#[cfg(target_os = "macos")]
fn active_app_name() -> Option<String> {
    use objc2_app_kit::NSWorkspace;
    let name = unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let app = workspace.frontmostApplication()?;
        app.localizedName()?
    };
    Some(name.to_string())
}

#[cfg(not(target_os = "macos"))]
fn active_app_name() -> Option<String> {
    None
}

// Returns seconds since the last keyboard or mouse event anywhere on the system.
// Uses CGEventSourceSecondsSinceLastEventType so only real input counts — not
// Bluetooth audio controls, game controllers, or other HID peripherals.
// No special macOS permissions required. Returns 0 on any error.
#[cfg(target_os = "macos")]
fn system_idle_sec() -> u64 {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
    }

    const HID: i32 = 1;
    const LEFT_MOUSE_DOWN:  u32 = 1;
    const RIGHT_MOUSE_DOWN: u32 = 3;
    const MOUSE_MOVED:      u32 = 5;
    const KEY_DOWN:         u32 = 10;
    const FLAGS_CHANGED:    u32 = 12;

    let secs = unsafe {
        let mouse_move  = CGEventSourceSecondsSinceLastEventType(HID, MOUSE_MOVED);
        let left_click  = CGEventSourceSecondsSinceLastEventType(HID, LEFT_MOUSE_DOWN);
        let right_click = CGEventSourceSecondsSinceLastEventType(HID, RIGHT_MOUSE_DOWN);
        let key_down    = CGEventSourceSecondsSinceLastEventType(HID, KEY_DOWN);
        let modifiers   = CGEventSourceSecondsSinceLastEventType(HID, FLAGS_CHANGED);
        mouse_move.min(left_click).min(right_click).min(key_down).min(modifiers)
    };
    secs as u64
}

#[cfg(not(target_os = "macos"))]
fn system_idle_sec() -> u64 {
    0
}

pub async fn run(auth_state: SharedAuth, app: tauri::AppHandle) {
    let mut buffer: HashMap<String, u32> = HashMap::new();
    let mut current_app: Option<String> = None;
    let mut app_since = Instant::now();
    let mut last_flush = Instant::now();

    // Idle state machine.
    // was_idle: true once we've sent the IDLE signal; false after ACTIVE sent.
    // idle_counter_sec: how many consecutive seconds of inactivity we've accumulated
    // between 15s checks (mirrors what the user sees as "the idle counter going up").
    let mut was_idle = false;
    let mut idle_counter_sec: u64 = 0;

    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;

        // ── App tracking (every 5 s) ──────────────────────────────────────────
        let new_app = active_app_name();
        if new_app != current_app {
            if let Some(ref old_app) = current_app {
                let elapsed = app_since.elapsed().as_secs() as u32;
                if elapsed > 0 {
                    *buffer.entry(old_app.clone()).or_insert(0) += elapsed;
                }
            }
            current_app = new_app;
            app_since = Instant::now();
        }

        if last_flush.elapsed() < Duration::from_secs(15) {
            continue;
        }
        last_flush = Instant::now();

        // Commit current app's elapsed time to the buffer.
        if let Some(ref cur) = current_app {
            let elapsed = app_since.elapsed().as_secs() as u32;
            if elapsed > 0 {
                *buffer.entry(cur.clone()).or_insert(0) += elapsed;
                app_since = Instant::now();
            }
        }

        // Auth — needed for both idle signals and the activity flush.
        let (maybe_auth, needs_refresh) = {
            let guard = auth_state.lock().unwrap();
            match guard.as_ref() {
                Some(a) => (Some(a.clone()), supabase::needs_refresh(a)),
                None => (None, false),
            }
        };

        let auth = match maybe_auth {
            None => {
                eprintln!("[tandem] not signed in — skipping");
                buffer.clear();
                continue;
            }
            Some(a) if needs_refresh => match supabase::refresh(&a).await {
                Ok(fresh) => {
                    supabase::save_auth(&fresh);
                    *auth_state.lock().unwrap() = Some(fresh.clone());
                    eprintln!("[tandem] token refreshed for {}", fresh.email);
                    fresh
                }
                Err(e) => {
                    eprintln!("[tandem] token refresh failed ({e}) — signing out");
                    *auth_state.lock().unwrap() = None;
                    supabase::clear_auth();
                    crate::tray::update_tray_status(&app, "");
                    buffer.clear();
                    continue;
                }
            },
            Some(a) => a,
        };

        let idle_sec = system_idle_sec();

        // ── Idle state machine (every 15 s) ───────────────────────────────────
        //
        // Every 15 s we check how long the system has been idle.
        //
        //  • idle_sec < 15  → user was active in the last 15 s  ("active tick")
        //  • idle_sec ≥ 15  → no activity in the last 15 s      ("idle tick")
        //
        // idle_counter_sec accumulates on each idle tick. Once it reaches 120 s
        // we send a single IDLE signal and stop sending more until the user returns.
        // The moment idle_sec drops below 15 (user touches keyboard/mouse) we send
        // a single ACTIVE signal and reset the counter.

        if idle_sec < 15 {
            // Activity detected this window.
            if was_idle {
                // User just returned from idle — send ACTIVE and reset.
                was_idle = false;
                idle_counter_sec = 0;
                eprintln!("[tandem] activity detected after idle — sending ACTIVE signal");
                if let Err(e) = supabase::send_signal(&auth, "active").await {
                    eprintln!("[tandem] send_signal(active) failed: {e}");
                }
            } else {
                idle_counter_sec = 0;
            }
        } else {
            // No activity this 15 s window — advance the counter.
            idle_counter_sec += 15;
            eprintln!("[tandem] idle tick: {idle_counter_sec}s / 120s (system_idle={idle_sec}s)");

            if idle_counter_sec >= 120 && !was_idle {
                was_idle = true;
                eprintln!("[tandem] idle threshold reached — sending IDLE signal");
                if let Err(e) = supabase::send_signal(&auth, "idle").await {
                    eprintln!("[tandem] send_signal(idle) failed: {e}");
                }
            }
        }

        // ── Activity buffer flush ─────────────────────────────────────────────
        // Only flush when the user has been active recently and HearthHall's
        // timer is running. This data drives the per-app time breakdown.
        if idle_sec >= SYSTEM_IDLE_CUTOFF_SEC || buffer.is_empty() {
            buffer.clear();
            continue;
        }

        if !supabase::is_timer_running(&auth).await {
            eprintln!("[tandem] HearthHall timer not running — discarding buffer");
            buffer.clear();
            continue;
        }

        match supabase::flush(&auth, &buffer).await {
            Ok(_) => {
                eprintln!("[tandem] flushed {} app(s) for {}", buffer.len(), auth.email);
                buffer.clear();
            }
            Err(e) => eprintln!("[tandem] flush error: {e}"),
        }
    }
}

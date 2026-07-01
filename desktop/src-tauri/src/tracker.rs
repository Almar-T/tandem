use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use crate::supabase::{self, Auth};

pub type SharedAuth = Arc<Mutex<Option<Auth>>>;

// How many seconds of system-wide inactivity before we stop sending activity
// signals to the PWA. Must be shorter than the PWA's IDLE_THRESHOLD_SEC (120 s)
// so that when the user goes idle, Tauri stops flushing fast enough for the
// PWA idle checker to fire within a reasonable window.
const SYSTEM_IDLE_CUTOFF_SEC: u64 = 60;

// Returns the name of the currently focused app via NSWorkspace.
// This requires no macOS permissions — app name is public information
// exposed to any process by the OS.
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

// Returns seconds since the last keyboard key-press or mouse movement/click.
// Uses CGEventSourceSecondsSinceLastEventType which lets us query specific
// event types — so only real keyboard and mouse input counts, not Bluetooth
// audio controls, game controllers, or other HID peripherals that would
// otherwise reset IOHIDSystem's blunt HIDIdleTime counter.
// No special macOS permissions required. Returns 0 on any error.
#[cfg(target_os = "macos")]
fn system_idle_sec() -> u64 {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
    }

    // CGEventSourceStateID::HIDSystemState = 1
    const HID: i32 = 1;
    // CGEventType values (CGEvent.h)
    const LEFT_MOUSE_DOWN:  u32 = 1;
    const RIGHT_MOUSE_DOWN: u32 = 3;
    const MOUSE_MOVED:      u32 = 5;
    const KEY_DOWN:         u32 = 10;
    const FLAGS_CHANGED:    u32 = 12; // modifier keys (Shift, Ctrl, Cmd…)

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
    0 // assume active on non-macOS
}

pub async fn run(auth_state: SharedAuth, app: tauri::AppHandle) {
    // buffer: app_name -> accumulated_seconds
    let mut buffer: HashMap<String, u32> = HashMap::new();
    let mut current_app: Option<String> = None;
    let mut app_since = Instant::now();
    let mut last_flush = Instant::now();

    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;

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

        if last_flush.elapsed() < Duration::from_secs(60) {
            continue;
        }
        last_flush = Instant::now();

        if let Some(ref cur) = current_app {
            let elapsed = app_since.elapsed().as_secs() as u32;
            if elapsed > 0 {
                *buffer.entry(cur.clone()).or_insert(0) += elapsed;
                app_since = Instant::now();
            }
        }

        if buffer.is_empty() {
            continue;
        }

        // Clone auth out of the mutex before any .await — MutexGuard is not Send.
        let (maybe_auth, needs_refresh) = {
            let guard = auth_state.lock().unwrap();
            match guard.as_ref() {
                Some(a) => (Some(a.clone()), supabase::needs_refresh(a)),
                None => (None, false),
            }
        };

        let auth = match maybe_auth {
            None => {
                eprintln!("[tandem] not signed in — buffered data discarded");
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
                    eprintln!("[tandem] token refresh failed ({e}) — signed out, update tray");
                    *auth_state.lock().unwrap() = None;
                    supabase::clear_auth();
                    // Update the tray so the user knows tracking has stopped.
                    crate::tray::update_tray_status(&app, "");
                    buffer.clear();
                    continue;
                }
            },
            Some(a) => a,
        };

        if !supabase::is_timer_running(&auth).await {
            eprintln!("[tandem] HearthHall timer not running — buffered data discarded");
            buffer.clear();
            continue;
        }

        let idle_sec = system_idle_sec();
        if idle_sec >= SYSTEM_IDLE_CUTOFF_SEC {
            // System idle — discard without flushing. No INSERT means no Realtime
            // signal, so the PWA idle checker can fire.
            eprintln!("[tandem] system idle {idle_sec}s ≥ {SYSTEM_IDLE_CUTOFF_SEC}s — skipping flush");
            buffer.clear();
            continue;
        }

        // User has been active in the last 60 s — flush app-time data. This INSERT
        // triggers the PWA's Realtime subscription and calls recordActivity(),
        // keeping the idle clock fresh.
        match supabase::flush(&auth, &buffer).await {
            Ok(_) => {
                eprintln!("[tandem] flushed {} app(s) for {}", buffer.len(), auth.email);
                buffer.clear();
            }
            Err(e) => eprintln!("[tandem] flush error: {e}"),
        }
    }
}

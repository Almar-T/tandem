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

// Returns seconds since the last system-wide keyboard or mouse event using
// IOKit's HIDIdleTime counter. No special macOS permissions required.
// Returns 0 on any error (safe default: assume user is active).
#[cfg(target_os = "macos")]
fn system_idle_sec() -> u64 {
    let out = std::process::Command::new("ioreg")
        .args(["-c", "IOHIDSystem"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok());

    out.and_then(|s| {
        for line in s.lines() {
            if line.contains("HIDIdleTime") {
                if let Some(val) = line.split('=').nth(1) {
                    if let Ok(ns) = val.trim().parse::<u64>() {
                        return Some(ns / 1_000_000_000);
                    }
                }
            }
        }
        None
    })
    .unwrap_or(0)
}

#[cfg(not(target_os = "macos"))]
fn system_idle_sec() -> u64 {
    0 // assume active on non-macOS
}

pub async fn run(auth_state: SharedAuth) {
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

        if let Some(ref app) = current_app {
            let elapsed = app_since.elapsed().as_secs() as u32;
            if elapsed > 0 {
                *buffer.entry(app.clone()).or_insert(0) += elapsed;
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
            None => None,
            Some(a) if needs_refresh => match supabase::refresh(&a).await {
                Ok(fresh) => {
                    supabase::save_auth(&fresh);
                    *auth_state.lock().unwrap() = Some(fresh.clone());
                    Some(fresh)
                }
                Err(_) => {
                    *auth_state.lock().unwrap() = None;
                    supabase::clear_auth();
                    None
                }
            },
            Some(a) => Some(a),
        };

        match auth {
            None => {
                buffer.clear();
            }
            Some(a) => {
                if supabase::is_timer_running(&a).await {
                    let idle_sec = system_idle_sec();
                    if idle_sec < SYSTEM_IDLE_CUTOFF_SEC {
                        // User has been active in the last 60 s — flush app-time
                        // data. This INSERT triggers the PWA's Realtime subscription
                        // and calls recordActivity(), keeping the idle clock fresh.
                        match supabase::flush(&a, &buffer).await {
                            Ok(_) => buffer.clear(),
                            Err(e) => eprintln!("[tandem] flush error: {e}"),
                        }
                    } else {
                        // System idle — discard without flushing. No INSERT means
                        // no Realtime signal, so the PWA idle checker can fire.
                        eprintln!("[tandem] system idle {idle_sec}s ≥ {SYSTEM_IDLE_CUTOFF_SEC}s — skipping flush");
                        buffer.clear();
                    }
                } else {
                    buffer.clear();
                }
            }
        }
    }
}

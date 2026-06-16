use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use crate::supabase::{self, Auth};

pub type SharedAuth = Arc<Mutex<Option<Auth>>>;

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
                    match supabase::flush(&a, &buffer).await {
                        Ok(_) => buffer.clear(),
                        Err(e) => eprintln!("[tandem] flush error: {e}"),
                    }
                } else {
                    buffer.clear();
                }
            }
        }
    }
}

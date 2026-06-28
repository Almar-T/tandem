#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod supabase;
mod tray;
mod tracker;

use std::sync::{Arc, Mutex};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tracker::SharedAuth;

// ─── Tauri commands (called from the login window JS) ────────────────────────

#[tauri::command]
async fn cmd_sign_in(
    email: String,
    password: String,
    state: tauri::State<'_, SharedAuth>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let auth = supabase::sign_in(&email, &password).await?;
    let email_out = auth.email.clone();
    supabase::save_auth(&auth);
    *state.lock().unwrap() = Some(auth);
    tray::update_tray_status(&app, &email_out);
    Ok(email_out)
}

#[tauri::command]
fn cmd_get_status(state: tauri::State<'_, SharedAuth>) -> Option<String> {
    state.lock().unwrap().as_ref().map(|a| a.email.clone())
}

#[tauri::command]
fn cmd_sign_out(state: tauri::State<'_, SharedAuth>, app: tauri::AppHandle) {
    *state.lock().unwrap() = None;
    supabase::clear_auth();
    tray::update_tray_status(&app, "");
}

// ─── Main ────────────────────────────────────────────────────────────────────

fn main() {
    let auth_state: SharedAuth = Arc::new(Mutex::new(supabase::load_auth()));
    let tracker_auth = auth_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(auth_state)
        .setup(move |app| {
            // Tray-only app on macOS — hide from Dock
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let initial_label = {
                let state = app.state::<SharedAuth>();
                let guard = state.lock().unwrap();
                guard.as_ref().map(|a| format!("Tracking as {}", a.email))
                    .unwrap_or_else(|| "Not signed in".to_string())
            };

            let menu = tray::build_menu(app.handle(), &initial_label)?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit"   => app.exit(0),
                    "open"   => show_window(app),
                    "update" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            check_update(handle).await;
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        show_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Background tracker — pass AppHandle so it can update the tray
            // if auth is revoked at runtime.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(tracker::run(tracker_auth, handle));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![cmd_sign_in, cmd_get_status, cmd_sign_out])
        .run(tauri::generate_context!())
        .expect("error starting Tandem");
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

async fn check_update(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => {
                eprintln!("[updater] new version {} available, downloading…", update.version);
                if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                    eprintln!("[updater] install error: {e}");
                } else {
                    app.restart();
                }
            }
            Ok(None) => eprintln!("[updater] already up to date"),
            Err(e)   => eprintln!("[updater] check failed: {e}"),
        },
        Err(e) => eprintln!("[updater] init failed: {e}"),
    }
}

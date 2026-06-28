use tauri::menu::{Menu, MenuItem};

pub fn build_menu(app: &tauri::AppHandle, status_label: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let status = MenuItem::with_id(app, "status", status_label,         false, None::<&str>)?;
    let open   = MenuItem::with_id(app, "open",   "Open / Sign in",    true,  None::<&str>)?;
    let update = MenuItem::with_id(app, "update", "Check for updates", true,  None::<&str>)?;
    let quit   = MenuItem::with_id(app, "quit",   "Quit",              true,  None::<&str>)?;
    Menu::with_items(app, &[&status, &open, &update, &quit])
}

pub fn update_tray_status(app: &tauri::AppHandle, email: &str) {
    let label = if email.is_empty() {
        "Not signed in".to_string()
    } else {
        format!("Tracking as {email}")
    };
    if let Some(tray) = app.tray_by_id("main") {
        if let Ok(menu) = build_menu(app, &label) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

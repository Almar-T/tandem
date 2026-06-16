use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

const SUPABASE_URL: &str = "https://zcyxixadcqmwarmnysxg.supabase.co";
const SUPABASE_ANON_KEY: &str = "sb_publishable_j0giWNW4qSA7geUwOHCMYA_ZaYgK7it";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Auth {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: String,
    pub email: String,
    pub expires_at: u64, // unix ms
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub async fn sign_in(email: &str, password: &str) -> Result<Auth, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/auth/v1/token?grant_type=password", SUPABASE_URL))
        .header("apikey", SUPABASE_ANON_KEY)
        .json(&serde_json::json!({ "email": email, "password": password }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    if let Some(err) = body.get("error_description").or_else(|| body.get("msg")) {
        return Err(err.as_str().unwrap_or("Sign-in failed").to_string());
    }

    let expires_in = body["expires_in"].as_u64().unwrap_or(3600);
    Ok(Auth {
        access_token: body["access_token"].as_str().unwrap_or("").to_string(),
        refresh_token: body["refresh_token"].as_str().unwrap_or("").to_string(),
        user_id: body["user"]["id"].as_str().unwrap_or("").to_string(),
        email: body["user"]["email"].as_str().unwrap_or("").to_string(),
        expires_at: now_ms() + expires_in * 1000,
    })
}

pub async fn refresh(auth: &Auth) -> Result<Auth, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/auth/v1/token?grant_type=refresh_token", SUPABASE_URL))
        .header("apikey", SUPABASE_ANON_KEY)
        .json(&serde_json::json!({ "refresh_token": auth.refresh_token }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let expires_in = body["expires_in"].as_u64().unwrap_or(3600);
    Ok(Auth {
        access_token: body["access_token"].as_str().unwrap_or("").to_string(),
        refresh_token: body["refresh_token"].as_str().unwrap_or("").to_string(),
        user_id: body["user"]["id"].as_str().unwrap_or("").to_string(),
        email: body["user"]["email"].as_str().unwrap_or("").to_string(),
        expires_at: now_ms() + expires_in * 1000,
    })
}

pub async fn is_timer_running(auth: &Auth) -> bool {
    let client = reqwest::Client::new();
    let res = client
        .get(format!(
            "{}/rest/v1/work_sessions?user_id=eq.{}&ended_at=is.null&select=id&limit=1",
            SUPABASE_URL, auth.user_id
        ))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", auth.access_token))
        .send()
        .await;

    match res {
        Ok(r) => r
            .json::<Vec<serde_json::Value>>()
            .await
            .map(|v| !v.is_empty())
            .unwrap_or(false),
        Err(_) => false,
    }
}

// Map of app_name -> active_sec
pub async fn flush(auth: &Auth, buffer: &HashMap<String, u32>) -> Result<(), String> {
    if buffer.is_empty() {
        return Ok(());
    }
    let rows: Vec<serde_json::Value> = buffer
        .iter()
        .map(|(app, secs)| {
            serde_json::json!({
                "user_id": auth.user_id,
                "app_name": app,
                "active_sec": secs,
            })
        })
        .collect();

    let client = reqwest::Client::new();
    client
        .post(format!("{}/rest/v1/desktop_activity", SUPABASE_URL))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", auth.access_token))
        .header("Prefer", "return=minimal")
        .json(&rows)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_auth(auth: &Auth) {
    if let Some(dir) = dirs::data_local_dir().map(|d| d.join("tandem")) {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("auth.json"), serde_json::to_string(auth).unwrap_or_default());
    }
}

pub fn load_auth() -> Option<Auth> {
    let path = dirs::data_local_dir()?.join("tandem").join("auth.json");
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

pub fn clear_auth() {
    if let Some(path) = dirs::data_local_dir().map(|d| d.join("tandem").join("auth.json")) {
        let _ = std::fs::remove_file(path);
    }
}

pub fn needs_refresh(auth: &Auth) -> bool {
    now_ms() > auth.expires_at.saturating_sub(60_000)
}

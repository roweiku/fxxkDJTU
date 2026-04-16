mod ocr;
mod batch_ocr;
mod batch_invoice;
mod extract_ocr;
mod extract_invoice;

#[cfg(debug_assertions)]
mod debug_utils;

use ocr::{OcrManager, OcrResult};
use std::sync::Arc;
use tauri::{State, AppHandle};

// 应用状态 Arc提供线程安全的共享所有权
pub struct AppState {
    ocr_manager: Arc<OcrManager>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 初始化 OCR 引擎（接收完整路径）
#[tauri::command]
fn initialize_ocr(
    state: State<AppState>,
    det_path: String,
    rec_path: String,
    charset_path: String,
) -> Result<(), String> {
    state.ocr_manager.initialize(&det_path, &rec_path, &charset_path)
}

// 对图片文件进行 OCR 识别
#[tauri::command]
fn ocr_recognize_file(state: State<AppState>, image_path: String) -> Result<Vec<OcrResult>, String> {
    state.ocr_manager.recognize_file(&image_path)
}

// 批量处理 OCR
#[tauri::command]
async fn batch_process_ocr_command(
    files: Vec<String>,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let ocr_manager = Arc::clone(&state.ocr_manager);
    
    batch_ocr::batch_process_ocr(files, app_handle, ocr_manager)
        .await
        .map_err(|e| e.to_string())
}

// 批量处理发票
#[tauri::command]
async fn batch_invoice_command(
    files: Vec<String>,
    app_handle: AppHandle,
) -> Result<(), String> {
    batch_invoice::batch_process_invoice(files, app_handle)
        .await
        .map_err(|e| e.to_string())
}

// 热重载模型配置（接收完整路径）
#[tauri::command]
fn set_models_config(
    state: State<AppState>,
    det_path: String,
    rec_path: String,
    charset_path: String,
) -> Result<(), String> {
    state.ocr_manager.set_models_config(det_path, rec_path, charset_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 创建应用状态
    let app_state = AppState {
        ocr_manager: Arc::new(OcrManager::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            greet,
            initialize_ocr,
            ocr_recognize_file,
            batch_process_ocr_command,
            batch_invoice_command,
            set_models_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

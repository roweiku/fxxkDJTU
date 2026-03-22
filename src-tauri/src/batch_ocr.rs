use crate::ocr::OcrManager;
use crate::extract_ocr::{extract_transaction, TransactionInfo};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// 单个文件处理完成事件（每个文件处理完后发送）
#[derive(Debug, Clone, Serialize)]
pub struct FileOcrProcessedEvent {
    pub file_path: String,
    pub file_name: String,
    pub timestamp: i64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transaction_info: Option<TransactionInfo>,
}

impl FileOcrProcessedEvent {
    fn from_result(path: &str, name: &str, info: TransactionInfo) -> Self {
        let (status, message) = info.validate();
        Self {
            file_path: path.to_string(),
            file_name: name.to_string(),
            status,
            timestamp: now_timestamp_ms(),
            transaction_info: Some(info),
            message,
        }
    }

    fn from_error(path: &str, name: &str, err: String) -> Self {
        Self {
            file_path: path.to_string(),
            file_name: name.to_string(),
            status: "extract_ocr::error".to_string(),
            timestamp: now_timestamp_ms(),
            transaction_info: None,
            message: Some(err),
        }
    }
}

/// 批处理进度事件（每处理一个文件发送一次）
#[derive(Debug, Clone, Serialize)]
pub struct BatchOcrProgressEvent {
    pub current_index: usize,
    pub total_count: usize,
    pub current_file_path: String,
    pub current_file_name: String,
}

fn now_timestamp_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock before UNIX epoch")
        .as_millis() as i64
}

/// 批量处理 OCR
pub async fn batch_process_ocr(
    files: Vec<String>,
    app_handle: AppHandle,
    ocr_manager: Arc<OcrManager>,
) -> anyhow::Result<()> {
    // let start_time = std::time::Instant::now();
    let total_count = files.len();

    for (index, file_path) in files.iter().enumerate() {
        let file_name = std::path::Path::new(&file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // 发送进度事件
        let progress = BatchOcrProgressEvent {
            current_index: index,
            total_count,
            current_file_path: file_path.clone(),
            current_file_name: file_name.clone(),
        };
        
        if let Err(e) = app_handle.emit("batch-progress", &progress) {
            eprintln!("[WARN] 发送进度事件失败: {}", e);
        }

        // 处理单个文件
        let result = match ocr_manager.recognize_file(file_path) {
            Ok(ocr_results) => {
                match extract_transaction(&ocr_results) {
                    None => {
                        #[cfg(debug_assertions)]
                        eprintln!("[DEBUG] 文件 {} 无法识别交易类型", file_name);
                        FileOcrProcessedEvent::from_error(file_path, &file_name, "无法识别交易类型".to_string())
                    }
                    Some(transaction_info) => {
                        let result = FileOcrProcessedEvent::from_result(file_path, &file_name, transaction_info);

                        #[cfg(debug_assertions)]
                        if let Err(e) = crate::debug_utils::save_ocr_result_to_file(&result, &ocr_results, &app_handle) {
                            eprintln!("[WARN] 保存结果文件失败: {}", e);
                        }

                        result
                    }
                }
            }
            Err(err) => {
                let msg = format!("OCR 识别失败: {}", err);
                #[cfg(debug_assertions)]
                eprintln!("[ERROR] {}", msg);
                FileOcrProcessedEvent::from_error(file_path, &file_name, msg)
            }
        };

        // Debug 输出：交易信息
        #[cfg(debug_assertions)]
        if let Some(ref trans_info) = result.transaction_info {
            eprintln!("[DEBUG] 提取的交易信息:");
            if let Ok(trans_json) = serde_json::to_string_pretty(trans_info) {
                eprintln!("{}", trans_json);
            }
        }

        // 发送文件处理完成事件
        if let Err(e) = app_handle.emit("file-processed", &result) {
            eprintln!("[WARN] 发送文件处理事件失败: {}", e);
        }
    }

    Ok(())
}

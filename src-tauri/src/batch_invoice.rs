use crate::extract_invoice::{extract_invoice, InvoiceInfo};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Emitter};

/// 单个发票文件处理完成事件
#[derive(Debug, Clone, Serialize)]
pub struct FileInvoiceProcessedEvent {
    pub file_path: String,
    pub file_name: String,
    pub timestamp: i64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_info: Option<InvoiceInfo>,
}

impl FileInvoiceProcessedEvent {
    fn from_result(path: &str, name: &str, info: InvoiceInfo) -> Self {
        let (status, message) = info.validate();
        Self {
            file_path: path.to_string(),
            file_name: name.to_string(),
            status,
            timestamp: now_timestamp_ms(),
            invoice_info: Some(info),
            message,
        }
    }

    fn from_error(path: &str, name: &str, err: String) -> Self {
        Self {
            file_path: path.to_string(),
            file_name: name.to_string(),
            status: "extract_invoice::error".to_string(),
            timestamp: now_timestamp_ms(),
            invoice_info: None,
            message: Some(err),
        }
    }
}

/// 批量发票处理进度事件
#[derive(Debug, Clone, Serialize)]
pub struct BatchInvoiceProgressEvent {
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

/// 批量处理发票
pub async fn batch_process_invoice(
    files: Vec<String>,
    app_handle: AppHandle,
) -> anyhow::Result<()> {
    let total_count = files.len();

    for (index, file_path) in files.iter().enumerate() {
        let file_name = std::path::Path::new(&file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // 发送进度事件
        let progress = BatchInvoiceProgressEvent {
            current_index: index,
            total_count,
            current_file_path: file_path.clone(),
            current_file_name: file_name.clone(),
        };

        if let Err(e) = app_handle.emit("batch-invoice-progress", &progress) {
            eprintln!("[WARN] 发送发票进度事件失败: {}", e);
        }

        // 处理单个 PDF 文件
        let result = match extract_invoice(Path::new(file_path)) {
            Ok(invoice_info) => {
                #[cfg(debug_assertions)]
                if let Ok(json) = serde_json::to_string_pretty(&invoice_info) {
                    eprintln!("[DEBUG] 提取的发票信息:\n{}", json);
                }
                FileInvoiceProcessedEvent::from_result(file_path, &file_name, invoice_info)
            }
            Err(err) => {
                #[cfg(debug_assertions)]
                eprintln!("[ERROR] PDF 解析失败: {}", err);
                FileInvoiceProcessedEvent::from_error(file_path, &file_name, err.to_string())
            }
        };

        // 发送文件处理完成事件
        if let Err(e) = app_handle.emit("file-invoice-processed", &result) {
            eprintln!("[WARN] 发送文件处理事件失败: {}", e);
        }
    }

    Ok(())
}

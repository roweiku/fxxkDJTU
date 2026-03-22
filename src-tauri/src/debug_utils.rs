use crate::batch_ocr::FileOcrProcessedEvent;
use crate::ocr::OcrResult;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 获取应用数据目录下的结果保存路径
fn get_results_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    let results_dir = app_data_dir.join("ocr_results");
    
    // 创建目录（如果不存在）
    if !results_dir.exists() {
        fs::create_dir_all(&results_dir)
            .map_err(|e| format!("创建结果目录失败: {}", e))?;
    }
    
    Ok(results_dir)
}

/// 保存单个文件的 OCR 结果到 JSON（用于调试）
pub fn save_ocr_result_to_file(
    file_result: &FileOcrProcessedEvent,
    ocr_results: &[OcrResult],
    app_handle: &AppHandle,
) -> Result<String, String> {
    let results_dir = get_results_dir(app_handle)?;
    
    // 生成文件名: ocr_result_{timestamp}_{file_name}.json
    let safe_filename = file_result.file_name.replace("/", "_").replace("\\", "_");
    let output_filename = format!("ocr_result_{}_{}.json", file_result.timestamp, safe_filename);
    let output_path = results_dir.join(&output_filename);
    
    // 构造包含 OCR 原始结果的调试数据
    #[derive(Serialize)]
    struct DebugOutput<'a> {
        file_result: &'a FileOcrProcessedEvent,
        ocr_results: &'a [OcrResult],
    }
    
    let debug_data = DebugOutput {
        file_result,
        ocr_results,
    };
    
    // 序列化为美化的 JSON
    let json_content = serde_json::to_string_pretty(&debug_data)
        .map_err(|e| format!("JSON 序列化失败: {}", e))?;
    
    // 写入文件
    fs::write(&output_path, json_content)
        .map_err(|e| format!("写入文件失败: {}", e))?;
    
    println!("OCR结果已成功保存到: {}", output_path.display());

    Ok(output_path.to_string_lossy().to_string())
}

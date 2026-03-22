use ocr_rs::{OcrEngine, OcrEngineConfig, DetOptions};
use image;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// OCR 识别结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    /// 识别的文本内容
    pub text: String,
    /// 置信度 (0.0 - 1.0)
    pub confidence: f32,
    /// 文本框位置 (x, y, width, height)
    pub bbox: BoundingBox,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// OCR 引擎管理器
pub struct OcrManager {
    engine: Mutex<Option<OcrEngine>>,
}

impl OcrManager {
    /// 创建新的 OCR 管理器
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }

    /// 使用完整路径初始化 OCR 引擎
    pub fn initialize(&self, det_path: &str, rec_path: &str, charset_path: &str) -> Result<(), String> {
        let mut engine = self.engine.lock().unwrap();

        // 如果已经初始化,则跳过
        if engine.is_some() {
            return Ok(());
        }

        // 创建检测模型选项
        let det_options = DetOptions::new()
            .with_max_side_len(1280)
            .with_box_threshold(0.5)
            .with_score_threshold(0.3);

        // 配置引擎
        let engine_config = OcrEngineConfig::new()
            .with_threads(4)
            .with_det_options(det_options);

        // 初始化引擎
        let ocr_engine = OcrEngine::new(
            det_path,
            rec_path,
            charset_path,
            Some(engine_config),
        )
        .map_err(|e| format!("初始化 OCR 引擎失败: {}", e))?;

        *engine = Some(ocr_engine);
        Ok(())
    }

    /// 热重载引擎（接收完整路径）
    pub fn set_models_config(&self, det_path: String, rec_path: String, charset_path: String) -> Result<(), String> {
        // 尝试用新配置初始化引擎
        let det_options = DetOptions::new()
            .with_max_side_len(1280)
            .with_box_threshold(0.5)
            .with_score_threshold(0.3);

        let engine_config = OcrEngineConfig::new()
            .with_threads(4)
            .with_det_options(det_options);

        let new_engine = OcrEngine::new(
            &det_path,
            &rec_path,
            &charset_path,
            Some(engine_config),
        )
        .map_err(|e| format!("初始化新模型失败: {}", e))?;

        // 成功初始化后，替换旧引擎
        let mut engine = self.engine.lock().unwrap();
        *engine = Some(new_engine);

        Ok(())
    }
    
    /// 对图片进行 OCR 识别
    pub fn recognize_file(&self, image_path: &str) -> Result<Vec<OcrResult>, String> {
        let engine = self.engine.lock().unwrap();
        let engine = engine.as_ref().ok_or("OCR 引擎未初始化")?;

        // 加载图片
        let img = image::open(image_path)
            .map_err(|e| format!("无法打开图片 {}: {}", image_path, e))?;

        // 执行 OCR 识别
        let results = engine
            .recognize(&img)
            .map_err(|e| format!("OCR 识别失败: {}", e))?;

        // 转换结果格式
        let ocr_results: Vec<OcrResult> = results
            .iter()
            .map(|r| {
                let rect = &r.bbox.rect;
                OcrResult {
                    text: r.text.clone(),
                    confidence: r.confidence,
                    bbox: BoundingBox {
                        x: rect.left(),
                        y: rect.top(),
                        width: rect.width(),
                        height: rect.height(),
                    },
                }
            })
            .collect();

        Ok(ocr_results)
    }
}

impl Default for OcrManager {
    fn default() -> Self {
        Self::new()
    }
}

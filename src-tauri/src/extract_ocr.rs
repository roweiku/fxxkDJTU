use crate::ocr::OcrResult;
use regex::Regex;
use serde::{Deserialize, Serialize};

/// 提取策略枚举（公开以便外部使用）
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractStrategy {
    Taobao,    // 淘宝订单
    Alipay,     // 支付宝账单
}

/// 交易信息结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionInfo {
    /// 策略类型
    pub strategy_type: Option<ExtractStrategy>,
    /// 实付款金额（正数）
    pub amount: Option<f64>,
    /// 订单号
    pub order_id: Option<String>,
    /// 支付时间
    pub pay_time: Option<String>,
}

impl TransactionInfo {
    /// 验证交易信息完整性，返回 (status, message)
    pub fn validate(&self) -> (String, Option<String>) {
        let Some(_strategy) = self.strategy_type else {
            return ("extract_ocr::error".to_string(), Some("未知策略类型".to_string()));
        };

        let mut missing = Vec::new();
        if self.amount.is_none() { missing.push("金额"); }
        if self.order_id.is_none() { missing.push("订单号"); }
        if self.pay_time.is_none() { missing.push("支付时间"); }

        if missing.is_empty() {
            return ("extract_ocr::success".to_string(), None);
        }
        let msg = format!("交易缺失: {}", missing.join("、"));
        if self.amount.is_some() {
            return ("extract_ocr::check".to_string(), Some(msg));
        }
        ("extract_ocr::error".to_string(), Some(msg))
    }
}

/// 检测应该使用哪个提取策略
fn detect_strategy(ocr_results: &[OcrResult]) -> Option<ExtractStrategy> {
    // 使用正则表达式进行策略检测
    let alipay_pattern = Regex::new(r"账单详情").ok()?;
    let taobao_pattern = Regex::new(r"加入购物车").ok()?;
    
    // 优先检测支付宝账单（避免与淘宝订单冲突）
    for result in ocr_results {
        if alipay_pattern.is_match(&result.text) {
            #[cfg(debug_assertions)]
            eprintln!("[INFO] 检测到策略: 支付宝账单");
            return Some(ExtractStrategy::Alipay);
        }
    }
    
    // 检测淘宝订单
    for result in ocr_results {
        if taobao_pattern.is_match(&result.text) {
            #[cfg(debug_assertions)]
            eprintln!("[INFO] 检测到策略: 淘宝订单");
            return Some(ExtractStrategy::Taobao);
        }
    }
    
    #[cfg(debug_assertions)]
    eprintln!("[WARN] 未检测到任何已知策略关键字");
    None
}

/// 淘宝订单提取策略
fn extract_taobao_order(ocr_results: &[OcrResult]) -> TransactionInfo {
    let mut info = TransactionInfo {
        strategy_type: Some(ExtractStrategy::Taobao),
        amount: None,
        order_id: None,
        pay_time: None,
    };

    // 遍历 OCR 结果提取信息
    for (index, result) in ocr_results.iter().enumerate() {
        let text = &result.text;


        // 提取实付款金额（金额可能与"实付款"在同一文本，也可能在下一个文本框）
        if text.contains("实付款") || text.contains("合计") {
            info.amount = extract_amount_taobao(text).or_else(|| {
                find_next_text(ocr_results, index)
                    .and_then(|r| extract_standalone_amount(&r.text))
                    .or_else(|| {
                        find_prev_text(ocr_results, index)
                            .and_then(|r| extract_standalone_amount(&r.text))
                    })
            });
        }


        // 提取付款时间
        if text.contains("付款时间") {
            info.pay_time = find_next_text(ocr_results, index)
                .filter(|next_result| check_y_position(&ocr_results[index], next_result, 10))
                .and_then(|r| extract_time(&r.text));
        }


        // 提取支付宝交易号
        if text.contains("支付宝交易号") {
            info.order_id = find_next_text(ocr_results, index)
                .filter(|next_result| check_y_position(&ocr_results[index], next_result, 10))
                .and_then(|r| extract_28_digit_number(&r.text));
        }
    }

    // Fallback：如果标签匹配失败（如 OCR 误读"支付宝交易号"），全文扫描 28 位数字
    // if info.order_id.is_none() {
    //     info.order_id = ocr_results.iter().find_map(|r| extract_28_digit_number(&r.text));
    // }

    info
}

/// 支付宝账单提取策略
fn extract_alipay_bill(ocr_results: &[OcrResult]) -> TransactionInfo {
    let mut info = TransactionInfo {
        strategy_type: Some(ExtractStrategy::Alipay),
        amount: None,
        order_id: None,
        pay_time: None,
    };

    // 遍历 OCR 结果提取信息
    for (index, result) in ocr_results.iter().enumerate() {
        let text = &result.text;

        // 提取米
        if text.contains("交易成功") || text.contains("支付成功") {
            info.amount = find_prev_text(ocr_results, index)
                .and_then(|r| extract_amount_alipay(&r.text));
        }

        // 提取支付时间
        if text.contains("支付时间") {
            info.pay_time = find_next_text(ocr_results, index)
                .filter(|next_result| check_y_position(&ocr_results[index], next_result, 10))
                .and_then(|r| extract_time(&r.text));
        }

        // 提取订单号（28位）
        if text == "订单号" {
            info.order_id = find_next_text(ocr_results, index)
                .filter(|next_result| check_y_position(&ocr_results[index], next_result, 10))
                .and_then(|r| extract_28_digit_number(&r.text));
        }
    }

    info
}

/// 从 OCR 结果中提取交易信息
pub fn extract_transaction(ocr_results: &[OcrResult]) -> Option<TransactionInfo> {
    if ocr_results.is_empty() {
        return None;
    }

    // 检测策略
    let strategy = detect_strategy(ocr_results)?;
    
    // 根据策略提取信息
    let info = match strategy {
        ExtractStrategy::Taobao => extract_taobao_order(ocr_results),
        ExtractStrategy::Alipay => extract_alipay_bill(ocr_results),
    };
    
    Some(info)
}

/// 查找上一个文本框（不做 y 轴验证）
fn find_prev_text(results: &[OcrResult], index: usize) -> Option<&OcrResult> {
    if index == 0 {
        return None;
    }
    Some(&results[index - 1])
}

/// 查找下一个文本框
fn find_next_text(results: &[OcrResult], index: usize) -> Option<&OcrResult> {
    if index + 1 >= results.len() {
        return None;
    }
    Some(&results[index + 1])
}

/// 检查两个 OCR 结果的 y 坐标是否在容差范围内
fn check_y_position(
    result1: &OcrResult,
    result2: &OcrResult,
    y_tolerance: i32,
) -> bool {
    let y1 = result1.bbox.y;
    let y2 = result2.bbox.y;
    let distance = (y2 - y1).abs();
    
    if distance <= y_tolerance {
        true
    } else {
        #[cfg(debug_assertions)]
        eprintln!(
            "[WARN] y 轴验证失败: y1={}, y2={}, 差距={}",
            y1, y2, distance
        );
        false
    }
}

/// 提取金额 - 淘宝订单（从"实付款￥165.53"中提取 165.53）
fn extract_amount_taobao(text: &str) -> Option<f64> {
    // 兼容多种货币符号：￥、¥、或无符号
    let re = Regex::new(r"实付款[￥¥]?([\d.]+)").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse::<f64>().ok())
}

// TODO 合并
/// 提取独立金额文本（如 "¥19.6" 或 "￥64.84"）
fn extract_standalone_amount(text: &str) -> Option<f64> {
    let re = Regex::new(r"^[￥¥]([\d.]+)$").ok()?;
    re.captures(text.trim())
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse::<f64>().ok())
}

/// 提取金额 - 支付宝账单（从"-41.78"中提取绝对值 41.78）
fn extract_amount_alipay(text: &str) -> Option<f64> {
    // 提取数字（可能有负号），然后取绝对值
    let re = Regex::new(r"-?([\d.]+)").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse::<f64>().ok())
        .map(|amount| amount.abs())
}

/// 提取订单号 - 淘宝订单（从"4911250501574051722复制"中提取19位数字）
fn extract_order_id_taobao(text: &str) -> Option<String> {
    // 提取"复制"前的数字（假设订单号为19位）
    let re = Regex::new(r"(\d{19}).*复制").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

/// 提取28位数字（支付宝订单号、支付宝交易号等）
fn extract_28_digit_number(text: &str) -> Option<String> {
    let re = Regex::new(r"(\d{28})").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

/// 提取时间（兼容多种格式）
fn extract_time(text: &str) -> Option<String> {
    // 匹配格式："2025-12-09 15:14:54" 或 "2025-11-2820:43:28"（无空格）
    let re = Regex::new(r"(\d{4}-\d{2}-\d{2}\s?\d{2}:\d{2}:\d{2})").ok()?;
    re.captures(text).and_then(|cap| cap.get(1)).map(|m| {
        let time_str = m.as_str();
        // 规范化：如果无空格则添加空格
        if time_str.contains(' ') {
            time_str.to_string()
        } else {
            // "2025-11-2820:43:28" -> "2025-11-28 20:43:28"
            if let Ok(re_fix) = Regex::new(r"(\d{4}-\d{2}-\d{2})(\d{2}:\d{2}:\d{2})") {
                re_fix.replace(time_str, "$1 $2").to_string()
            } else {
                time_str.to_string()
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_amount_taobao() {
        assert_eq!(extract_amount_taobao("实付款￥165.53"), Some(165.53));
        assert_eq!(extract_amount_taobao("实付款¥165.53"), Some(165.53));
        assert_eq!(extract_amount_taobao("实付款165.53"), Some(165.53));
    }

    #[test]
    fn test_extract_amount_alipay() {
        assert_eq!(extract_amount_alipay("-41.78"), Some(41.78));
        assert_eq!(extract_amount_alipay("41.78"), Some(41.78));
    }

    #[test]
    fn test_extract_order_id_taobao() {
        assert_eq!(
            extract_order_id_taobao("4911250501574051722复制"),
            Some("4911250501574051722".to_string())
        );
    }

    #[test]
    fn test_extract_28_digit_number() {
        // 支付宝订单号
        assert_eq!(
            extract_28_digit_number("2025122222001420951414706480"),
            Some("2025122222001420951414706480".to_string())
        );
        // 支付宝交易号
        assert_eq!(
            extract_28_digit_number("2025112822001120951455157241"),
            Some("2025112822001120951455157241".to_string())
        );
    }

    #[test]
    fn test_extract_time() {
        assert_eq!(
            extract_time("2025-12-09 15:14:54"),
            Some("2025-12-09 15:14:54".to_string())
        );
        assert_eq!(
            extract_time("2025-11-2820:43:28"),
            Some("2025-11-28 20:43:28".to_string())
        );
    }
}

use crate::ocr::OcrResult;
use regex::Regex;
use serde::{Deserialize, Serialize};

const OCR_Y_TOLERANCE: i32 = 15;

/// 提取策略枚举（公开以便外部使用）
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractStrategy {
    Taobao,
    Xianyu,
    Alipay,
    Jd,
    Bank,
    Meituan,
    MeituanPay,
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
    /// 商家名称
    pub merchant: Option<String>,
}

impl TransactionInfo {
    /// 验证交易信息完整性，返回 (status, message)
    pub fn validate(&self) -> (String, Option<String>) {
        let Some(strategy) = self.strategy_type else {
            return (
                "extract_ocr::error".to_string(),
                Some("未知策略类型".to_string()),
            );
        };

        let mut missing = Vec::new();
        if self.amount.is_none() {
            missing.push("金额");
        }
        let order_id_optional =
            matches!(strategy, ExtractStrategy::Bank | ExtractStrategy::Meituan);
        if !order_id_optional && self.order_id.is_none() {
            missing.push("订单号");
        }
        if strategy != ExtractStrategy::Meituan && self.pay_time.is_none() {
            missing.push("支付时间");
        }

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
    let contains = |keyword: &str| ocr_results.iter().any(|r| r.text.contains(keyword));

    // 优先检测支付宝账单（避免与淘宝订单冲突）
    if contains("账单详情") {
        #[cfg(debug_assertions)]
        eprintln!("[INFO] 检测到策略: 支付宝账单");
        return Some(ExtractStrategy::Alipay);
    }

    if contains("账单") && contains("美团") && contains("交易单号") {
        #[cfg(debug_assertions)]
        eprintln!("[INFO] 检测到策略: 美团账单");
        return Some(ExtractStrategy::MeituanPay);
    }

    // 京东支付样例来自银行/数字人民币明细页。
    if contains("明细详情")
        && contains("交易时间")
        && (contains("交易账户") || contains("账户余额"))
    {
        #[cfg(debug_assertions)]
        eprintln!("[INFO] 检测到策略: 银行交易明细");
        return Some(ExtractStrategy::Bank);
    }

    if contains("订单详情") && (contains("订单编号") || contains("京东") || contains("自营"))
    {
        #[cfg(debug_assertions)]
        eprintln!("[INFO] 检测到策略: 京东订单");
        return Some(ExtractStrategy::Jd);
    }

    if contains("闲鱼转卖") && contains("支付宝交易号") {
        #[cfg(debug_assertions)]
        eprintln!("[INFO] 检测到策略: 闲鱼订单");
        return Some(ExtractStrategy::Xianyu);
    }

    if contains("商品费用") && contains("订单信息") && contains("实付款") {
        #[cfg(debug_assertions)]
        eprintln!("[INFO] 检测到策略: 美团订单");
        return Some(ExtractStrategy::Meituan);
    }

    if contains("加入购物车") {
        #[cfg(debug_assertions)]
        eprintln!("[INFO] 检测到策略: 淘宝订单");
        return Some(ExtractStrategy::Taobao);
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
        merchant: None,
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
                .filter(|next_result| {
                    check_y_position(&ocr_results[index], next_result, OCR_Y_TOLERANCE)
                })
                .and_then(|r| extract_time(&r.text));
        }

        // 提取支付宝交易号
        if text.contains("支付宝交易号") {
            info.order_id = find_next_text(ocr_results, index)
                .filter(|next_result| {
                    check_y_position(&ocr_results[index], next_result, OCR_Y_TOLERANCE)
                })
                .and_then(|r| extract_28_digit_number(&r.text));
        }
    }

    info
}

fn extract_xianyu_order(ocr_results: &[OcrResult]) -> TransactionInfo {
    let mut info = extract_taobao_order(ocr_results);
    info.strategy_type = Some(ExtractStrategy::Xianyu);
    info
}

/// 支付宝账单提取策略
fn extract_alipay_bill(ocr_results: &[OcrResult]) -> TransactionInfo {
    let mut info = TransactionInfo {
        strategy_type: Some(ExtractStrategy::Alipay),
        amount: None,
        order_id: None,
        pay_time: None,
        merchant: None,
    };

    // 遍历 OCR 结果提取信息
    for (index, result) in ocr_results.iter().enumerate() {
        let text = &result.text;

        // 提取金额
        if text.contains("交易成功") || text.contains("支付成功") || text.contains("自动扣款成功")
        {
            info.amount =
                find_prev_text(ocr_results, index).and_then(|r| extract_amount_alipay(&r.text));
        }

        // 提取支付时间
        if text.contains("支付时间") {
            info.pay_time = find_next_text(ocr_results, index)
                .filter(|next_result| {
                    check_y_position(&ocr_results[index], next_result, OCR_Y_TOLERANCE)
                })
                .and_then(|r| extract_time(&r.text));
        }

        // 提取订单号（28位）
        if text == "订单号" {
            info.order_id = find_next_text(ocr_results, index)
                .filter(|next_result| {
                    check_y_position(&ocr_results[index], next_result, OCR_Y_TOLERANCE)
                })
                .and_then(|r| extract_28_digit_number(&r.text));
        }
    }

    info
}

/// 京东订单详情提取策略
fn extract_jd_order(ocr_results: &[OcrResult]) -> TransactionInfo {
    let mut info = TransactionInfo {
        strategy_type: Some(ExtractStrategy::Jd),
        amount: None,
        order_id: None,
        pay_time: None,
        merchant: None,
    };

    for (index, result) in ocr_results.iter().enumerate() {
        let text = &result.text;

        if text.contains("实付款") || text.contains("合计") {
            let amount = extract_amount_jd(text).or_else(|| {
                ocr_results.iter().skip(index + 1).take(3).find_map(|r| {
                    extract_amount_jd(&r.text).or_else(|| extract_standalone_amount(&r.text))
                })
            });
            if amount.is_some() {
                info.amount = amount;
            }
        }

        if text.contains("订单编号") || text.contains("订单号") {
            info.order_id = extract_jd_order_id(text).or_else(|| {
                ocr_results
                    .iter()
                    .skip(index + 1)
                    .take(3)
                    .find_map(|r| extract_jd_order_id(&r.text))
            });
        }

        if text.contains("支付时间") {
            info.pay_time = extract_time(text).or_else(|| {
                ocr_results
                    .iter()
                    .skip(index + 1)
                    .take(3)
                    .find_map(|r| extract_time(&r.text))
            });
        }
    }

    info
}

/// 银行/数字人民币交易明细提取策略
fn extract_bank_transaction(ocr_results: &[OcrResult]) -> TransactionInfo {
    let mut info = TransactionInfo {
        strategy_type: Some(ExtractStrategy::Bank),
        amount: ocr_results
            .iter()
            .find_map(|r| extract_negative_currency_amount(&r.text))
            .or_else(|| {
                // 部分银行把支出金额渲染为无负号的货币文本；取页面上第一个金额，
                // 避免误取靠后的“账户余额”。
                ocr_results
                    .iter()
                    .find_map(|r| extract_currency_amount(&r.text))
            }),
        order_id: None,
        pay_time: None,
        merchant: None,
    };

    for (index, result) in ocr_results.iter().enumerate() {
        if result.text.contains("交易时间") {
            info.pay_time = extract_time(&result.text).or_else(|| {
                ocr_results
                    .iter()
                    .skip(index + 1)
                    .take(3)
                    .find_map(|r| extract_time(&r.text))
            });
            break;
        }
    }

    info
}

fn extract_meituan_order(ocr_results: &[OcrResult]) -> TransactionInfo {
    let mut info = TransactionInfo {
        strategy_type: Some(ExtractStrategy::Meituan),
        amount: None,
        order_id: None,
        pay_time: None,
        merchant: extract_meituan_merchant(ocr_results),
    };

    for (index, result) in ocr_results.iter().enumerate() {
        if result.text.contains("实付") {
            info.amount = extract_amount_meituan(&result.text)
                .or_else(|| {
                    find_prev_text(ocr_results, index)
                        .and_then(|r| extract_standalone_amount(&r.text))
                })
                .or(info.amount);
        }
    }

    info
}

fn extract_meituan_payment(ocr_results: &[OcrResult]) -> TransactionInfo {
    let mut info = TransactionInfo {
        strategy_type: Some(ExtractStrategy::MeituanPay),
        amount: ocr_results
            .iter()
            .find_map(|r| extract_negative_currency_amount(&r.text)),
        order_id: None,
        pay_time: None,
        merchant: extract_meituan_merchant(ocr_results),
    };

    for (index, result) in ocr_results.iter().enumerate() {
        if result.text.contains("交易单号") {
            info.order_id = ocr_results
                .iter()
                .skip(index + 1)
                .take(3)
                .find_map(|r| extract_28_digit_number(&r.text));
        }
        if result.text.contains("支付时间") {
            info.pay_time = ocr_results
                .iter()
                .skip(index + 1)
                .take(3)
                .find_map(|r| extract_time(&r.text));
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
        ExtractStrategy::Xianyu => extract_xianyu_order(ocr_results),
        ExtractStrategy::Alipay => extract_alipay_bill(ocr_results),
        ExtractStrategy::Jd => extract_jd_order(ocr_results),
        ExtractStrategy::Bank => extract_bank_transaction(ocr_results),
        ExtractStrategy::Meituan => extract_meituan_order(ocr_results),
        ExtractStrategy::MeituanPay => extract_meituan_payment(ocr_results),
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
fn check_y_position(result1: &OcrResult, result2: &OcrResult, y_tolerance: i32) -> bool {
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
    let re = Regex::new(r"实付款[￥¥]?\s*([\d,，]+(?:\.\d+)?)").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .and_then(|m| parse_amount(m.as_str()))
}

// TODO 合并
/// 提取独立金额文本（如 "¥19.6" 或 "￥64.84"）。
///
/// 容忍金额尾部 OCR 噪声字符（实测样本中常见 'v'、'>'、'^' 等图标被误识为字符），
/// 因此不再用 `$` 锚定行尾，但仍要求文本以 ￥/¥ 开头以避免误命中减免/折扣行。
fn extract_standalone_amount(text: &str) -> Option<f64> {
    let re = Regex::new(r"^[￥¥]\s*([\d,，]+(?:\.\d+)?)").ok()?;
    re.captures(text.trim())
        .and_then(|cap| cap.get(1))
        .and_then(|m| parse_amount(m.as_str()))
}

/// 京东订单金额（如“共减¥16 合计¥19.9”或“实付款 ¥84”）
fn extract_amount_jd(text: &str) -> Option<f64> {
    let re = Regex::new(r"(?:实付款|合计)[^0-9]{0,16}[￥¥]?\s*([\d,，]+(?:\.\d+)?)").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .and_then(|m| parse_amount(m.as_str()))
}

fn extract_amount_meituan(text: &str) -> Option<f64> {
    let re = Regex::new(r"(?:实付款|实付)[^0-9]{0,8}([\d,，]+(?:\.\d+)?)").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .and_then(|m| parse_amount(m.as_str()))
}

fn extract_meituan_merchant(ocr_results: &[OcrResult]) -> Option<String> {
    for result in ocr_results {
        let text = result.text.trim().trim_end_matches('>');
        if let Some((merchant, _)) = text.split_once("-美团App-") {
            return Some(merchant.trim().to_string());
        }
        if (text.contains("商行") || text.contains("超市") || text.contains("商店"))
            && !text.contains("支付技术")
        {
            return Some(text.to_string());
        }
    }
    None
}

/// 京东订单号通常为 16 位；保留 16～20 位范围以兼容版式变化。
fn extract_jd_order_id(text: &str) -> Option<String> {
    let re = Regex::new(r"(\d{16,20})").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

fn extract_negative_currency_amount(text: &str) -> Option<f64> {
    // OCR 可能把货币符号和负数拆成两个文本框，因此货币符号可选，
    // 但必须保留前导负号，避免把日期或账户余额当成消费金额。
    let re = Regex::new(r"^(?:[￥¥Y]\s*)?[-−]\s*([\d,，]+(?:\.\d+)?)").ok()?;
    re.captures(text.trim())
        .and_then(|cap| cap.get(1))
        .and_then(|m| parse_amount(m.as_str()))
}

fn extract_currency_amount(text: &str) -> Option<f64> {
    let re = Regex::new(r"^[￥¥Y]\s*[-−]?\s*([\d,，]+(?:\.\d+)?)").ok()?;
    re.captures(text.trim())
        .and_then(|cap| cap.get(1))
        .and_then(|m| parse_amount(m.as_str()))
}

/// 提取金额 - 支付宝账单（从"-41.78"中提取绝对值 41.78）
fn extract_amount_alipay(text: &str) -> Option<f64> {
    // 提取数字（可能有负号），然后取绝对值
    let re = Regex::new(r"-?([\d,，]+(?:\.\d+)?)").ok()?;
    re.captures(text)
        .and_then(|cap| cap.get(1))
        .and_then(|m| parse_amount(m.as_str()))
        .map(|amount| amount.abs())
}

fn parse_amount(text: &str) -> Option<f64> {
    text.replace(',', "").replace('，', "").parse::<f64>().ok()
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
    if let Some(time) = re.captures(text).and_then(|cap| cap.get(1)).map(|m| {
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
    }) {
        return Some(time);
    }

    let re_cn = Regex::new(r"(\d{4})年(\d{1,2})月(\d{1,2})日\s?(\d{2}:\d{2}:\d{2})").ok()?;
    re_cn.captures(text).map(|cap| {
        format!(
            "{}-{:02}-{:02} {}",
            cap.get(1).unwrap().as_str(),
            cap.get(2).unwrap().as_str().parse::<u32>().unwrap_or(0),
            cap.get(3).unwrap().as_str().parse::<u32>().unwrap_or(0),
            cap.get(4).unwrap().as_str()
        )
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

use regex::Regex;
use serde::Serialize;
use std::path::Path;

/// 发票错误类型
#[derive(Debug, thiserror::Error)]
pub enum InvoiceError {
    #[error("PdfExtractError: {0}")]
    PdfExtractError(pdf_extract::OutputError),
    #[error("PDF为空或无法找到末页")]
    PageNotFound,
}

/// 发票信息结构
#[derive(Debug, Clone, Serialize)]
pub struct InvoiceInfo {
    pub invoice_number: String,
    pub invoice_date: String,
    pub buyer: String,
    pub buyer_tax_number: String,
    pub seller: String,
    pub seller_tax_number: String,
    pub item_content: String,
    pub amount: String,
    pub remark: String,
    pub page_count: usize,
}

impl Default for InvoiceInfo {
    fn default() -> Self {
        Self {
            invoice_number: String::new(),
            invoice_date: String::new(),
            buyer: String::new(),
            buyer_tax_number: String::new(),
            seller: String::new(),
            seller_tax_number: String::new(),
            item_content: String::new(),
            amount: String::new(),
            remark: String::new(),
            page_count: 0,
        }
    }
}

impl InvoiceInfo {
    /// 验证发票信息完整性，返回 (status, message)
    pub fn validate(&self) -> (String, Option<String>) {
        let mut missing = Vec::new();
        if self.invoice_number.is_empty() { missing.push("发票号码"); }
        if self.invoice_date.is_empty() { missing.push("开票日期"); }
        // if self.buyer.is_empty() { missing.push("购买方"); }
        // if self.buyer_tax_number.is_empty() { missing.push("购买方税号"); }
        // if self.seller.is_empty() { missing.push("销售方"); }
        // if self.seller_tax_number.is_empty() { missing.push("销售方税号"); }
        // if self.item_content.is_empty() { missing.push("项目内容"); }
        if self.amount.is_empty() { missing.push("金额"); }

        if missing.is_empty() {
            return ("extract_invoice::success".to_string(), None);
        }
        let msg = format!("发票缺失: {}", missing.join("、"));
        if !self.amount.is_empty() {
            return ("extract_invoice::check".to_string(), Some(msg));
        }
        ("extract_invoice::error".to_string(), Some(msg))
    }
}

/// 从PDF发票中提取信息
fn parse_invoice(
    text: &str, 
    buyer_keyword: Option<&str>
) -> InvoiceInfo {
    let buyer_keyword = buyer_keyword.unwrap_or("");
    let mut info = InvoiceInfo::default();

    // 提取发票号码 (20位纯数字)
    let fp_regex = Regex::new(r"\b(\d{20})\b").unwrap();
    if let Some(caps) = fp_regex.captures(text) {
        info.invoice_number = caps.get(1).unwrap().as_str().to_string();
    }

    // 提取开票日期
    let date_regex = Regex::new(r"(\d{4})年(\d{1,2})月(\d{1,2})日").unwrap();
    if let Some(caps) = date_regex.captures(text) {
        let year = caps.get(1).unwrap().as_str();
        let month = format!("{:02}", caps.get(2).unwrap().as_str().parse::<u32>().unwrap_or(0));
        let day = format!("{:02}", caps.get(3).unwrap().as_str().parse::<u32>().unwrap_or(0));
        info.invoice_date = format!("{}-{}-{}", year, month, day);
    }

    // 提取税号（18位，可能包含字母）
    let tax_regex = Regex::new(r"\b[0-9A-Z]{18}\b").unwrap();
    let tax_numbers: Vec<String> = tax_regex
        .find_iter(text)
        .map(|m| m.as_str().to_string())
        .collect();

    let valid_taxes: Vec<String> = tax_numbers
        .into_iter()
        .filter(|t| !(t.chars().all(|c| c.is_ascii_digit()) && t.len() == 20))
        .collect();

    if valid_taxes.len() >= 1 {
        info.buyer_tax_number = valid_taxes[0].clone();
    }
    if valid_taxes.len() >= 2 {
        info.seller_tax_number = valid_taxes[1].clone();
    }

    // 提取项目内容
    let item_regex = Regex::new(r"\*([^*]+)\*").unwrap();
    if let Some(caps) = item_regex.captures(text) {
        let item = caps.get(0).unwrap().as_str();
        info.item_content = item.chars().take(30).collect();
    }

    // 排除模式
    let exclude_patterns = vec![
        r"\*[^*]+\*",
        r"项目|规格|单位|数量|单价|金额|税率|税额|合计|备注|开票人|下载次数|发票号码|开票日期",
        r"国家税务总局|发票监制|电子发票|普通发票|广东省税务局",
        r"价税合计|大写|小写",
    ];

    // 销售方关键词
    let seller_keywords = vec![
        "有限公司", "股份有限公司", "科技", "网络", "文化", "婴童",
        "贸易", "酒店", "饭店", "娱乐", "百货", "商店",
        "餐饮店", "饮食店", "加油站", "石油化工",
        "商行", "电子商务商行", "大学", "部"
    ];

    // 提取所有可能的销售方名称
    let mut all_sellers = Vec::new();
    let lines: Vec<&str> = text.lines().collect();

    for line in lines {
        let line = line.trim();
        if line.len() < 5 || line.len() > 60 {
            continue;
        }

        // 检查排除模式
        let should_exclude = exclude_patterns.iter().any(|pattern| {
            Regex::new(pattern).unwrap().is_match(line)
        });
        if should_exclude {
            continue;
        }

        // 检查是否包含销售方关键词
        if seller_keywords.iter().any(|kw| line.contains(kw)) {
            if !line.ends_with('费') {
                if !all_sellers.contains(&line.to_string()) {
                    all_sellers.push(line.to_string());
                }
            }
        }
    }

    // println!("{:?}", all_sellers);

    // 识别购买方（根据传入的关键词匹配）
    if !buyer_keyword.is_empty() {
        for seller in &all_sellers {
            if seller.contains(buyer_keyword) {
                info.buyer = seller.clone();
                break;
            }
        }
    }
    if info.buyer.is_empty() && !all_sellers.is_empty() {
        info.buyer = all_sellers[0].clone();
    }

    // 销售方是第二个不同的商家
    for seller in &all_sellers {
        if seller != &info.buyer {
            info.seller = seller.clone();
            break;
        }
    }

    // 如果没找到，尝试从税号附近提取
    if info.seller.is_empty() && !info.seller_tax_number.is_empty() {
        let tax = &info.seller_tax_number;
        if let Some(idx) = text.find(tax) {
            let raw_start = idx.saturating_sub(100);
            let raw_end = (idx + 100).min(text.len());
            // 与 UTF-8 字符边界对齐避免 tokio-runtime-worker 线程恐慌
            let start = (0..=raw_start).rev().find(|&i| text.is_char_boundary(i)).unwrap_or(0);
            let end = (raw_end..=text.len()).find(|&i| text.is_char_boundary(i)).unwrap_or(text.len());
            let context = &text[start..end];
            
            let keywords = vec!["店", "商行", "有限公司", "商贸", "科技", "贸易", "酒店", "饭店", "餐饮"];
            for kw in keywords {
                let escaped_kw = regex::escape(kw);
                let pattern = format!(r"([^\s\n]+{}[^\s\n]*)", escaped_kw);
                if let Ok(kw_regex) = Regex::new(&pattern) {
                    if let Some(caps) = kw_regex.captures(context) {
                        let seller = caps.get(1).unwrap().as_str()
                            .trim_matches(|c: char| c == '*' || c == '、' || c == '。' || c == '.' || c == '\n' || c == '\t' || c == '\r');
                        if seller != info.buyer && seller.len() > 4 {
                            info.seller = seller.to_string();
                            break;
                        }
                    }
                }
            }
        }
    }

    // 提取金额 - 优先找"圆整"后的金额
    let yuanzheng_regex = Regex::new(r"圆整\s*[¥￥]?\s*([\d,]+\.?\d*)").unwrap();
    if let Some(caps) = yuanzheng_regex.captures(text) {
        info.amount = caps.get(1).unwrap().as_str().replace(',', "");
    } else {
        // 找所有¥后的金额，取最大的（价税合计通常是最大的）
        let amount_regex = Regex::new(r"[¥￥]\s*([\d,]+\.?\d*)").unwrap();
        let mut amounts_float: Vec<(f64, String)> = Vec::new();

        for caps in amount_regex.captures_iter(text) {
            if let Some(amt_str) = caps.get(1) {
                let amt_str_clean = amt_str.as_str().replace(',', "");
                if let Ok(amt) = amt_str_clean.parse::<f64>() {
                    if amt > 0.0 && amt < 10000000.0 {
                        amounts_float.push((amt, amt_str.as_str().to_string()));
                    }
                }
            }
        }

        if !amounts_float.is_empty() {
            let max_amount = amounts_float.iter().max_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
            if let Some(max) = max_amount {
                info.amount = max.1.replace(',', "");
            }
        }
    }

    info
}

pub fn extract_invoice(pdf_path: &Path) -> Result<InvoiceInfo, InvoiceError> {
    let pages =
        pdf_extract::extract_text_by_pages(pdf_path).map_err(InvoiceError::PdfExtractError)?;

    let page_count = pages.len();
    let last_page_text = pages.last().ok_or(InvoiceError::PageNotFound)?;

    let mut info = parse_invoice(last_page_text, Some("大学"));
    info.page_count = page_count;

    Ok(info)
}

// 发票信息类型定义

export interface InvoiceInfo {
  invoice_number: string;
  invoice_date: string;
  buyer: string;
  buyer_tax_number: string;
  seller: string;
  seller_tax_number: string;
  item_content: string;
  amount: string;
  remark: string;
  page_count: number;
}

export interface FileInvoiceProcessedEvent {
  file_path: string;
  file_name: string;
  status: 'success' | 'warning' | 'failed';
  timestamp: number;
  invoice_info?: InvoiceInfo;
  message?: string;
}

export interface BatchInvoiceProgress {
  current_index: number;
  total_count: number;
  current_file_path: string;
  current_file_name: string;
}

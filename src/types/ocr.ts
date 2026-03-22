export interface OcrResult {
  text: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ModelConfig {
  det_model: string;
  rec_model: string;
  charset: string;
}

export interface TransactionInfo {
  strategy_type?: 'taobao' | 'alipay';
  amount: number | null;
  order_id: string | null;
  pay_time: string | null;
}

export interface FileProcessedEvent {
  file_path: string;
  file_name: string;
  status: string;
  timestamp: number;
  transaction_info?: TransactionInfo;
  message?: string;
}

export interface BatchProgress {
  current_index: number;
  total_count: number;
  current_file_path: string;
  current_file_name: string;
}

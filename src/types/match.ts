// 匹配工作流类型定义

/** 结果来源类型 */
export type ReviewSource = 'taobao' | 'alipay' | 'invoice';

/** 审核状态 */
export type ReviewStatus = 'success' | 'check' | 'error';

/**
 * 统一的审核项 —— 从 OCR/Invoice 结果转换而来
 */
export interface ReviewItem {
  /** 唯一标识 */
  id: string;
  /** 来源类型 */
  source: ReviewSource;
  /** 处理状态 */
  status: ReviewStatus;
  /** 用户是否已确认 */
  confirmed: boolean;
  /** 原始文件路径 */
  filePath: string;
  /** 原始文件名 */
  fileName: string;
  /** 金额 */
  amount: number | null;
  /** 订单号（淘宝/支付宝共享28位交易号） */
  orderId: string | null;
  /** 支付时间 */
  payTime: string | null;
  /** 发票号码（仅 invoice） */
  invoiceNumber: string | null;
  /** 开票日期（仅 invoice） */
  invoiceDate: string | null;
  /** 销售方（仅 invoice） */
  seller: string | null;
  /** 购买方（仅 invoice） */
  buyer: string | null;
  /** 项目内容（仅 invoice） */
  itemContent: string | null;
  /** 备注（仅 invoice） */
  remark: string | null;
  /** 发票 PDF 页数（仅 invoice） */
  pageCount: number | null;
}

/** OCR 子条目（淘宝+支付宝配对） */
export interface OcrEntry {
  taobao: ReviewItem | null;
  alipay: ReviewItem | null;
  amount: number | null;
  orderId: string | null;
  payTime: string | null;
}

/** 发票子条目 */
export interface InvoiceEntry {
  invoice: ReviewItem;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAmount: number | null;
}

/**
 * 匹配组 —— 支持 1:1 普通匹配和 N:1 发票合并
 */
export interface MatchGroup {
  /** 唯一标识 */
  id: string;
  /** OCR 子条目列表（普通匹配=1项，发票合并=多项） */
  ocrEntries: OcrEntry[];
  /** 发票子条目（无发票时为 null） */
  invoiceEntry: InvoiceEntry | null;
  /** 匹配方式 */
  matchType: 'auto' | 'manual' | 'invoice-merge';
}

/** 审核表格行的显示状态 */
export type RowDisplayStatus = 'pending' | 'unmatched' | 'auto-matched' | 'manual-matched' | 'invoice-merged';

/** 字段冲突：同一字段在不同来源有不同值 */
export interface FieldConflict {
  field: string;
  label: string;
  values: { source: ReviewSource; value: string | number }[];
}

/** resolveOcrFields 返回的字段集 */
export interface OcrFieldSet {
  amount: number | null;
  orderId: string | null;
  payTime: string | null;
}

/** resolveOcrFields 返回结果 */
export type ResolvedOcrFields =
  | ({ ok: true } & OcrFieldSet)
  | { ok: false; conflicts: FieldConflict[]; partial: OcrFieldSet };

/** checkInvoiceMerge 返回结果 */
export interface InvoiceMergeResult {
  canMerge: boolean;
  invoiceId: string;
  /** 可合并的 group ID 或 item ID */
  candidateIds: string[];
  totalAmount: number;
}

/**
 * 审核表格行 —— 单项或合并组
 */
export interface ReviewRow {
  /** 唯一标识（单项用 item.id，组用 group.id） */
  id: string;
  /** 行内包含的所有项 */
  items: ReviewItem[];
  /** 对应的匹配组（单项为 null） */
  group: MatchGroup | null;
  /** 显示状态 */
  status: RowDisplayStatus;
}

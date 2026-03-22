import { defineStore } from 'pinia';
import Decimal from 'decimal.js';
import { useOcrStore } from './ocrStore';
import type {
  ReviewItem,
  ReviewSource,
  ReviewStatus,
  MatchGroup,
  OcrEntry,
  InvoiceEntry,
  ReviewRow,
  FieldConflict,
  ResolvedOcrFields,
  OcrFieldSet,
  InvoiceMergeResult,
} from '../types/match';
import type { FileProcessedEvent } from '../types/ocr';
import type { FileInvoiceProcessedEvent } from '../types/invoice';

let nextId = 1;
function genId(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

/** 防抖定时器 */
let _matchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 后端 status 字符串 → 前端 ReviewStatus */
function mapStatus(raw: string): ReviewStatus {
  if (raw.endsWith('::success')) return 'success';
  if (raw.endsWith('::check')) return 'check';
  return 'error';
}

/** 从 OCR 结果转换为 ReviewItem */
function ocrToReview(e: FileProcessedEvent): ReviewItem {
  const source: ReviewSource =
    e.transaction_info?.strategy_type === 'taobao' ? 'taobao' : 'alipay';
  return {
    id: genId(source),
    source,
    status: mapStatus(e.status),
    confirmed: false,
    filePath: e.file_path,
    fileName: e.file_name,
    amount: e.transaction_info?.amount ?? null,
    orderId: e.transaction_info?.order_id ?? null,
    payTime: e.transaction_info?.pay_time ?? null,
    invoiceNumber: null,
    invoiceDate: null,
    seller: null,
    buyer: null,
    itemContent: null,
    remark: null,
    pageCount: null,
  };
}

/** 从 Invoice 结果转换为 ReviewItem */
function invoiceToReview(e: FileInvoiceProcessedEvent): ReviewItem {
  let amt: number | null = null;
  if (e.invoice_info?.amount) {
    try { amt = new Decimal(e.invoice_info.amount).toNumber(); } catch { amt = null; }
  }
  return {
    id: genId('invoice'),
    source: 'invoice',
    status: mapStatus(e.status),
    confirmed: false,
    filePath: e.file_path,
    fileName: e.file_name,
    amount: amt !== null ? amt : null,
    orderId: null,
    payTime: null,
    invoiceNumber: e.invoice_info?.invoice_number ?? null,
    invoiceDate: e.invoice_info?.invoice_date ?? null,
    seller: e.invoice_info?.seller ?? null,
    buyer: e.invoice_info?.buyer ?? null,
    itemContent: e.invoice_info?.item_content ?? null,
    remark: e.invoice_info?.remark ?? null,
    pageCount: e.invoice_info?.page_count ?? null,
  };
}

/** 金额精确比较（使用 Decimal） */
function amountEquals(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  try { return new Decimal(a).equals(new Decimal(b)); } catch { return false; }
}

/** 特例关键词列表 */
const SPECIAL_SELLERS = ['立创', '铨洲'];

/**
 * 判断匹配组是否"匹配成功"：
 * - invoice-merge 类型始终视为成功
 * - 规则 A：淘宝 + 支付宝 + 发票三者都存在
 * - 规则 B：发票的 seller 或 itemContent 包含特例关键词
 */
function isGroupSuccessful(group: MatchGroup): boolean {
  if (group.matchType === 'invoice-merge') return true;
  const ocr = group.ocrEntries[0];
  if (ocr?.taobao && ocr?.alipay && group.invoiceEntry) return true;
  if (group.invoiceEntry) {
    const { seller, itemContent } = group.invoiceEntry.invoice;
    for (const keyword of SPECIAL_SELLERS) {
      if (seller?.includes(keyword) || itemContent?.includes(keyword)) return true;
    }
  }
  return false;
}

/** 从 ReviewItem 创建 InvoiceEntry */
function createInvoiceEntry(invoice: ReviewItem): InvoiceEntry {
  return {
    invoice,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    invoiceAmount: invoice.amount,
  };
}

/** 从淘宝/支付宝 ReviewItem 创建 OcrEntry */
function createOcrEntry(
  taobao: ReviewItem | null,
  alipay: ReviewItem | null,
  overrideFields?: Partial<OcrFieldSet>,
): OcrEntry {
  const items = [taobao, alipay].filter((x): x is ReviewItem => x !== null);
  const resolved = resolveOcrFields(items);
  const fields = resolved.ok ? resolved : resolved.partial;
  return {
    taobao,
    alipay,
    amount: overrideFields?.amount !== undefined ? overrideFields.amount : fields.amount,
    orderId: overrideFields?.orderId !== undefined ? overrideFields.orderId : fields.orderId,
    payTime: overrideFields?.payTime !== undefined ? overrideFields.payTime : fields.payTime,
  };
}

/** 创建 MatchGroup 对象的工厂函数（单 OcrEntry） */
function createGroup(
  items: { taobao?: ReviewItem | null; alipay?: ReviewItem | null; invoice?: ReviewItem | null },
  matchType: 'auto' | 'manual',
  overrideFields?: Partial<OcrFieldSet>,
): MatchGroup {
  const taobao = items.taobao ?? null;
  const alipay = items.alipay ?? null;
  const invoice = items.invoice ?? null;

  return {
    id: genId('group'),
    ocrEntries: [createOcrEntry(taobao, alipay, overrideFields)],
    invoiceEntry: invoice ? createInvoiceEntry(invoice) : null,
    matchType,
  };
}

/** 判断项是否已确认（success 自动视为已确认） */
function isConfirmed(item: ReviewItem): boolean {
  return item.confirmed || item.status === 'success';
}

/** 收集 MatchGroup 中所有非空项 */
function groupItems(g: MatchGroup): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const entry of g.ocrEntries) {
    if (entry.taobao) items.push(entry.taobao);
    if (entry.alipay) items.push(entry.alipay);
  }
  if (g.invoiceEntry) items.push(g.invoiceEntry.invoice);
  return items;
}

/** 收集一组 MatchGroup 中的所有 item ID */
function collectItemIds(groups: MatchGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const g of groups) {
    for (const item of groupItems(g)) ids.add(item.id);
  }
  return ids;
}

/** 两个 ReviewItem 是否宽松可匹配（金额/订单号/时间任一命中） */
function itemsCanMatch(a: ReviewItem, b: ReviewItem): boolean {
  if (a.amount !== null && b.amount !== null && amountEquals(a.amount, b.amount)) return true;
  if (a.orderId && b.orderId && a.orderId === b.orderId) return true;
  const timeA = a.payTime ?? a.invoiceDate;
  const timeB = b.payTime ?? b.invoiceDate;
  if (timeA && timeB && timeA === timeB) return true;
  return false;
}

/** OCR 聚合字段定义 */
const OCR_FIELD_DEFS: {
  target: keyof OcrFieldSet;
  source: keyof ReviewItem;
  label: string;
  type: 'number' | 'string';
}[] = [
  { target: 'amount', source: 'amount', label: '金额', type: 'number' },
  { target: 'orderId', source: 'orderId', label: '订单号', type: 'string' },
  { target: 'payTime', source: 'payTime', label: '支付时间', type: 'string' },
];

/**
 * 从淘宝/支付宝 ReviewItem 解析 OCR 聚合字段
 * 无冲突时返回 { ok: true, ... }，有冲突返回 { ok: false, conflicts, partial }
 */
function resolveOcrFields(items: ReviewItem[]): ResolvedOcrFields {
  const result: Record<string, string | number | null> = { amount: null, orderId: null, payTime: null };
  const conflicts: FieldConflict[] = [];

  for (const def of OCR_FIELD_DEFS) {
    const nonNull = items
      .filter((it) => it[def.source] !== null && it[def.source] !== undefined)
      .map((it) => ({ source: it.source, value: it[def.source] as string | number }));

    if (nonNull.length === 0) continue;

    const first = nonNull[0].value;
    const allSame = def.type === 'number'
      ? nonNull.every((v) => amountEquals(v.value as number, first as number))
      : nonNull.every((v) => v.value === first);

    if (allSame) {
      result[def.target] = first;
    } else {
      conflicts.push({ field: def.target, label: def.label, values: nonNull });
      result[def.target] = first;
    }
  }

  const fields: OcrFieldSet = {
    amount: result.amount as number | null,
    orderId: result.orderId as string | null,
    payTime: result.payTime as string | null,
  };

  if (conflicts.length === 0) {
    return { ok: true, ...fields };
  }
  return { ok: false, conflicts, partial: fields };
}

export const useMatchStore = defineStore('match', {
  state: () => ({
    /** 所有审核项 */
    reviewItems: [] as ReviewItem[],
    /** 匹配结果组 */
    matchedGroups: [] as MatchGroup[],
    /** 多选选中的 ID（行 ID，可能是 item.id 或 group.id） */
    selectedIds: new Set<string>(),
  }),

  getters: {
    /** 可参与匹配的项（已确认 + 非 error） */
    matchableItems: (state) =>
      state.reviewItems.filter((r) => isConfirmed(r) && r.status !== 'error'),

    /** 已被分组的 item ID 集合 */
    matchedItemIds: (state) => collectItemIds(state.matchedGroups),

    /** 匹配成功的组 */
    successfulGroups: (state) =>
      state.matchedGroups.filter(isGroupSuccessful),

    /** 匹配成功的 item ID 集合 */
    successfullyMatchedItemIds(): Set<string> {
      return collectItemIds(this.successfulGroups);
    },

    /**
     * 审核表格行：分组项合并为一行，未分组项为单行
     * 排序：待确认 → 未匹配 → 已匹配
     */
    reviewRows(state): ReviewRow[] {
      const rows: ReviewRow[] = [];
      const groupedItemIds = this.matchedItemIds;

      // 分组行
      for (const g of state.matchedGroups) {
        const items = groupItems(g);
        const allConfirmed = items.every(isConfirmed);
        let status: import('../types/match').RowDisplayStatus;
        if (g.matchType === 'invoice-merge') {
          status = 'invoice-merged';
        } else if (isGroupSuccessful(g)) {
          status = g.matchType === 'auto' ? 'auto-matched' : 'manual-matched';
        } else {
          status = allConfirmed ? 'unmatched' : 'pending';
        }
        rows.push({ id: g.id, items, group: g, status });
      }

      // 未分组的单项行
      for (const item of state.reviewItems) {
        if (groupedItemIds.has(item.id)) continue;
        rows.push({
          id: item.id,
          items: [item],
          group: null,
          status: isConfirmed(item) ? 'unmatched' : 'pending',
        });
      }

      // 排序：pending → unmatched → auto-matched → manual-matched
      const statusOrder: Record<string, number> = { pending: 0, unmatched: 1, 'invoice-merged': 2, 'auto-matched': 3, 'manual-matched': 4 };
      rows.sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));

      return rows;
    },

    /** 是否所有非 error 项都已确认 */
    allNonErrorConfirmed: (state) =>
      state.reviewItems
        .filter((r) => r.status !== 'error')
        .every(isConfirmed),

    /** 是否有审核项 */
    hasReviewItems: (state) => state.reviewItems.length > 0,

    /**
     * 宽松可匹配行 ID 集合
     * 当选中单个未匹配未分组项时激活
     */
    matchableRowIds(): Set<string> {
      if (this.selectedIds.size !== 1) return new Set();

      const selectedId = [...this.selectedIds][0];
      const rows = this.reviewRows;
      const selectedRow = rows.find((r) => r.id === selectedId);
      if (!selectedRow || selectedRow.status !== 'unmatched' || selectedRow.group !== null) {
        return new Set();
      }

      const sel = selectedRow.items[0];
      const ids = new Set<string>([selectedId]);

      for (const row of rows) {
        if (row.id === selectedId || row.status !== 'unmatched') continue;
        if (row.items.some((item) => itemsCanMatch(sel, item))) {
          ids.add(row.id);
        }
      }

      return ids;
    },

    /**
     * 是否有未分组但可参与匹配的已确认项 ≥ 2 且来源 ≥ 2 种
     * 用于"拆散"后显示自动匹配按钮
     */
    hasUnmatchedMatchableItems(): boolean {
      const groupedIds = this.matchedItemIds;
      const ungrouped = this.matchableItems.filter((r) => !groupedIds.has(r.id));
      if (ungrouped.length < 2) return false;
      const sources = new Set(ungrouped.map((r) => r.source));
      return sources.size >= 2;
    },
  },

  actions: {
    /** 从 ocrStore 导入结果并转换为 ReviewItem */
    importFromOcrStore() {
      const ocrStore = useOcrStore();
      this.reviewItems = [];
      this.matchedGroups = [];
      this.selectedIds.clear();

      for (const r of ocrStore.batchResults) {
        this.reviewItems.push(ocrToReview(r));
      }
      for (const r of ocrStore.invoiceResults) {
        this.reviewItems.push(invoiceToReview(r));
      }
    },

    /** 实时追加单个 OCR 结果 */
    addResultFromOcr(event: FileProcessedEvent) {
      this.reviewItems.push(ocrToReview(event));
      this.scheduleAutoMatch();
    },

    /** 实时追加单个 Invoice 结果 */
    addResultFromInvoice(event: FileInvoiceProcessedEvent) {
      this.reviewItems.push(invoiceToReview(event));
      this.scheduleAutoMatch();
    },

    /** 更新审核项字段（行内编辑，自动处理类型转换） */
    updateField(id: string, key: string, rawValue: string, type: 'text' | 'number') {
      const parsed = type === 'number'
        ? (rawValue ? parseFloat(rawValue) : null)
        : (rawValue || null);
      const item = this.reviewItems.find((r) => r.id === id);
      if (item) {
        Object.assign(item, { [key]: parsed });
        this.scheduleAutoMatch();
      }
    },

    /** 确认单个项 */
    confirmItem(id: string) {
      const item = this.reviewItems.find((r) => r.id === id);
      if (item) {
        item.confirmed = true;
        this.scheduleAutoMatch();
      }
    },

    /** 批量确认所有 success 和 check 项 */
    confirmAllNonError() {
      for (const item of this.reviewItems) {
        if (item.status !== 'error') {
          item.confirmed = true;
        }
      }
      this.scheduleAutoMatch();
    },

    /**
     * 选中行（仅非已匹配行可选）
     * @param ctrlKey 是否按住 Ctrl（多选模式）
     */
    selectRow(rowId: string, ctrlKey: boolean) {
      // 已匹配行不可选中
      if (this.successfullyMatchedItemIds.has(rowId)) return;
      if (this.successfulGroups.some((g) => g.id === rowId)) return;

      if (ctrlKey) {
        if (this.selectedIds.has(rowId)) {
          this.selectedIds.delete(rowId);
        } else {
          this.selectedIds.add(rowId);
        }
      } else {
        if (this.selectedIds.size === 1 && this.selectedIds.has(rowId)) {
          this.selectedIds.clear();
        } else {
          this.selectedIds.clear();
          this.selectedIds.add(rowId);
        }
      }
    },

    /** 清除选中 */
    clearSelection() {
      this.selectedIds.clear();
    },

    /** 防抖触发自动匹配（200ms） */
    scheduleAutoMatch() {
      if (_matchDebounceTimer) clearTimeout(_matchDebounceTimer);
      _matchDebounceTimer = setTimeout(() => {
        this.runAutoMatch();
        _matchDebounceTimer = null;
      }, 200);
    },

    /** 执行自动匹配（增量模式：保留已有组，填充空槽 + 新建组） */
    runAutoMatch() {
      const matchable = this.matchableItems;
      // 已在组中的 item ID（跳过）
      const usedIds = collectItemIds(this.matchedGroups);

      // 未分组的候选项池
      const ungroupedTaobao = matchable.filter((r) => r.source === 'taobao' && !usedIds.has(r.id));
      const ungroupedAlipay = matchable.filter((r) => r.source === 'alipay' && !usedIds.has(r.id));
      const ungroupedInvoice = matchable.filter((r) => r.source === 'invoice' && !usedIds.has(r.id));
      const localUsed = new Set<string>();

      // 阶段 0：尝试填充已有组的空槽
      for (const g of this.matchedGroups) {
        if (g.matchType === 'invoice-merge') continue;
        const ocr = g.ocrEntries[0];
        if (!ocr) continue;

        if (!g.invoiceEntry) {
          const refAmount = ocr.amount;
          if (refAmount !== null) {
            const inv = ungroupedInvoice.find(
              (i) => !localUsed.has(i.id) && amountEquals(i.amount, refAmount),
            );
            if (inv) {
              localUsed.add(inv.id);
              g.invoiceEntry = createInvoiceEntry(inv);
            }
          }
        }
        if (!ocr.taobao && ocr.orderId) {
          const tb = ungroupedTaobao.find(
            (t) => !localUsed.has(t.id) && t.orderId === ocr.orderId,
          );
          if (tb) {
            localUsed.add(tb.id);
            ocr.taobao = tb;
            const resolved = resolveOcrFields([ocr.taobao, ocr.alipay].filter(Boolean) as ReviewItem[]);
            const fields = resolved.ok ? resolved : resolved.partial;
            Object.assign(ocr, fields);
          }
        }
        if (!ocr.alipay && ocr.orderId) {
          const ap = ungroupedAlipay.find(
            (a) => !localUsed.has(a.id) && a.orderId === ocr.orderId,
          );
          if (ap) {
            localUsed.add(ap.id);
            ocr.alipay = ap;
            const resolved = resolveOcrFields([ocr.taobao, ocr.alipay].filter(Boolean) as ReviewItem[]);
            const fields = resolved.ok ? resolved : resolved.partial;
            Object.assign(ocr, fields);
          }
        }
      }

      const poolTb = ungroupedTaobao.filter((r) => !localUsed.has(r.id));
      const poolAp = ungroupedAlipay.filter((r) => !localUsed.has(r.id));
      const poolInv = ungroupedInvoice.filter((r) => !localUsed.has(r.id));

      // 阶段 1：Taobao ↔ Alipay 通过 orderId 精确匹配
      const newGroups: MatchGroup[] = [];
      for (const tb of poolTb) {
        if (!tb.orderId || localUsed.has(tb.id)) continue;
        const ap = poolAp.find(
          (a) => !localUsed.has(a.id) && a.orderId === tb.orderId,
        );
        if (ap) {
          localUsed.add(tb.id);
          localUsed.add(ap.id);
          newGroups.push(createGroup({ taobao: tb, alipay: ap }, 'auto'));
        }
      }

      // 阶段 2：已配对新组 ↔ Invoice 通过金额匹配
      for (const g of newGroups) {
        const refAmount = g.ocrEntries[0]?.amount;
        if (refAmount === null || refAmount === undefined) continue;
        const inv = poolInv.find(
          (i) => !localUsed.has(i.id) && amountEquals(i.amount, refAmount),
        );
        if (inv) {
          localUsed.add(inv.id);
          g.invoiceEntry = createInvoiceEntry(inv);
        }
      }

      // 阶段 3：剩余单项 ↔ Invoice 通过金额匹配
      const remainTb = poolTb.filter((r) => !localUsed.has(r.id));
      const remainAp = poolAp.filter((r) => !localUsed.has(r.id));
      const remainInv = poolInv.filter((r) => !localUsed.has(r.id));

      for (const item of [...remainTb, ...remainAp]) {
        if (item.amount === null || localUsed.has(item.id)) continue;
        const inv = remainInv.find(
          (i) => !localUsed.has(i.id) && amountEquals(i.amount, item.amount),
        );
        if (inv) {
          localUsed.add(item.id);
          localUsed.add(inv.id);
          newGroups.push(createGroup(
            { taobao: item.source === 'taobao' ? item : null, alipay: item.source === 'alipay' ? item : null, invoice: inv },
            'auto',
          ));
        }
      }

      this.matchedGroups.push(...newGroups);
    },

    /**
     * 准备手动合并：检测冲突
     * 返回 null 表示不满足合并条件
     */
    prepareManualMatch(): { items: ReviewItem[]; groupIdsToRemove: string[]; resolved: ResolvedOcrFields } | null {
      const ids = [...this.selectedIds];
      if (ids.length < 2) return null;

      const allItems: ReviewItem[] = [];
      const groupIdsToRemove: string[] = [];

      for (const rowId of ids) {
        const existingGroup = this.matchedGroups.find((g) => g.id === rowId);
        if (existingGroup) {
          allItems.push(...groupItems(existingGroup));
          groupIdsToRemove.push(existingGroup.id);
        } else {
          const item = this.reviewItems.find((r) => r.id === rowId);
          if (item) allItems.push(item);
        }
      }

      const sources = new Set(allItems.map((r) => r.source));
      if (sources.size < 2) return null;

      const ocrItems = allItems.filter((r) => r.source !== 'invoice');
      const resolved = resolveOcrFields(ocrItems);
      return { items: allItems, groupIdsToRemove, resolved };
    },

    /**
     * 执行手动合并（冲突已解决或无冲突时调用）
     */
    executeManualMatch(
      items: ReviewItem[],
      groupIdsToRemove: string[],
      overrideFields?: Partial<OcrFieldSet>,
    ) {
      const taobao = items.find((r) => r.source === 'taobao') ?? null;
      const alipay = items.find((r) => r.source === 'alipay') ?? null;
      const invoice = items.find((r) => r.source === 'invoice') ?? null;

      if (groupIdsToRemove.length > 0) {
        this.matchedGroups = this.matchedGroups.filter(
          (g) => !groupIdsToRemove.includes(g.id),
        );
      }

      this.matchedGroups.push(
        createGroup({ taobao, alipay, invoice }, 'manual', overrideFields),
      );
      this.selectedIds.clear();
    },

    /** 手动匹配：将选中的行合并为一组（无冲突时直接合并） */
    manualMatch() {
      const prep = this.prepareManualMatch();
      if (!prep) return;
      if (prep.resolved.ok) {
        this.executeManualMatch(prep.items, prep.groupIdsToRemove);
      }
      // 有冲突时由组件层调用 prepareManualMatch + dialog + executeManualMatch
    },

    /** 拆散匹配组 */
    unmatchGroup(groupId: string) {
      this.matchedGroups = this.matchedGroups.filter((g) => g.id !== groupId);
    },

    /**
     * 在候选金额中寻找子集和等于 target（最多 maxSize 个）
     * 返回匹配的候选索引数组，或 null
     */
    _findSubsetSum(
      candidates: { id: string; amount: number }[],
      target: number,
      maxSize: number = 3,
    ): number[] | null {
      const targetDec = new Decimal(target);
      const n = candidates.length;

      for (let size = 2; size <= Math.min(maxSize, n); size++) {
        const indices: number[] = [];
        const found = (function search(start: number, remaining: Decimal, depth: number): boolean {
          if (depth === size) return remaining.isZero();
          for (let i = start; i <= n - (size - depth); i++) {
            indices.push(i);
            if (search(i + 1, remaining.minus(candidates[i].amount), depth + 1)) return true;
            indices.pop();
          }
          return false;
        })(0, targetDec, 0);

        if (found) return indices;
      }
      return null;
    },

    /**
     * 检查发票合并：输入发票 item ID，返回是否可合并及候选 ID
     * @param execute 为 true 时直接执行合并
     */
    checkInvoiceMerge(invoiceItemId: string, execute?: boolean): InvoiceMergeResult | null {
      const invoiceItem = this.reviewItems.find((r) => r.id === invoiceItemId);
      if (!invoiceItem || invoiceItem.source !== 'invoice' || invoiceItem.amount === null) return null;

      // 发票已在组中则跳过
      const usedIds = collectItemIds(this.matchedGroups);
      if (usedIds.has(invoiceItemId)) return null;

      const targetAmount = invoiceItem.amount;

      // 收集候选：未匹配组的 ocrEntry 金额 + 未分组的已确认单项金额
      const candidates: { id: string; amount: number; type: 'group' | 'item' }[] = [];

      for (const g of this.matchedGroups) {
        if (g.matchType === 'invoice-merge') continue;
        if (isGroupSuccessful(g)) continue;
        if (g.invoiceEntry) continue;
        for (const ocr of g.ocrEntries) {
          if (ocr.amount !== null) {
            candidates.push({ id: g.id, amount: ocr.amount, type: 'group' });
          }
        }
      }

      const matchable = this.matchableItems;
      for (const item of matchable) {
        if (item.source === 'invoice') continue;
        if (usedIds.has(item.id)) continue;
        if (item.amount === null) continue;
        candidates.push({ id: item.id, amount: item.amount, type: 'item' });
      }

      const indices = this._findSubsetSum(candidates, targetAmount);
      if (!indices) {
        return { canMerge: false, invoiceId: invoiceItemId, candidateIds: [], totalAmount: targetAmount };
      }

      const candidateIds = indices.map((i) => candidates[i].id);
      const result: InvoiceMergeResult = {
        canMerge: true,
        invoiceId: invoiceItemId,
        candidateIds,
        totalAmount: targetAmount,
      };

      if (execute) {
        this._executeInvoiceMerge(invoiceItem, indices.map((i) => candidates[i]));
      }

      return result;
    },

    /** 执行发票合并（内部方法） */
    _executeInvoiceMerge(
      invoiceItem: ReviewItem,
      candidates: { id: string; amount: number; type: 'group' | 'item' }[],
    ) {
      const ocrEntries: OcrEntry[] = [];
      const groupIdsToRemove: string[] = [];

      for (const c of candidates) {
        if (c.type === 'group') {
          const g = this.matchedGroups.find((mg) => mg.id === c.id);
          if (g) {
            ocrEntries.push(...g.ocrEntries);
            groupIdsToRemove.push(g.id);
          }
        } else {
          const item = this.reviewItems.find((r) => r.id === c.id);
          if (item) {
            ocrEntries.push(createOcrEntry(
              item.source === 'taobao' ? item : null,
              item.source === 'alipay' ? item : null,
            ));
          }
        }
      }

      if (groupIdsToRemove.length > 0) {
        this.matchedGroups = this.matchedGroups.filter(
          (g) => !groupIdsToRemove.includes(g.id),
        );
      }

      this.matchedGroups.push({
        id: genId('group'),
        ocrEntries,
        invoiceEntry: createInvoiceEntry(invoiceItem),
        matchType: 'invoice-merge',
      });
    },

    /** 遍历所有未匹配发票，尝试发票合并 */
    runInvoiceMerge() {
      const usedIds = collectItemIds(this.matchedGroups);
      const unmatchedInvoices = this.matchableItems.filter(
        (r) => r.source === 'invoice' && !usedIds.has(r.id) && r.amount !== null,
      );

      for (const inv of unmatchedInvoices) {
        // 每次合并后 usedIds 可能变化，重新检查
        const currentUsedIds = collectItemIds(this.matchedGroups);
        if (currentUsedIds.has(inv.id)) continue;
        this.checkInvoiceMerge(inv.id, true);
      }
    },

    /** 确认发票合并：将 invoice-merge 转为 auto-matched */
    confirmInvoiceMerge(groupId: string) {
      const g = this.matchedGroups.find((mg) => mg.id === groupId);
      if (g && g.matchType === 'invoice-merge') {
        g.matchType = 'auto';
      }
    },

    /** 重置所有匹配状态 */
    reset() {
      this.reviewItems = [];
      this.matchedGroups = [];
      this.selectedIds.clear();
    },
  },
});

<template>
  <section v-if="matchStore.hasReviewItems" class="space-y-4">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <Receipt class="w-5 h-5" /> 结果审核
      </h3>
      <div class="flex items-center gap-2">
        <label
          class="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none"
          @click.prevent="showMatched = !showMatched"
        >
          <Checkbox
            :checked="showMatched"
          />
          显示已匹配
        </label>
        <Button
          v-if="matchStore.selectedIds.size >= 2"
          size="sm"
          @click="handleManualMatch()"
        >
          合并为一组 ({{ matchStore.selectedIds.size }})
        </Button>
        <Button
          v-if="matchStore.hasUnmatchedMatchableItems"
          size="sm"
          variant="outline"
          @click="matchStore.runAutoMatch()"
        >
          自动匹配
        </Button>
        <Button
          v-if="!matchStore.allNonErrorConfirmed"
          size="sm"
          variant="outline"
          @click="matchStore.confirmAllNonError()"
        >
          一键确认所有
        </Button>
        <!-- debug -->
        <Button
          variant="outline"
          @click="matchStore.runInvoiceMerge()"
        >
          发票合并
        </Button>
      </div>
    </div>

    <!-- 表格 -->
    <div class="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-10">来源</TableHead>
            <TableHead>文件名</TableHead>
            <TableHead class="w-24">金额</TableHead>
            <TableHead>订单号 / 发票号</TableHead>
            <TableHead>时间</TableHead>
            <TableHead class="w-20 text-center">状态</TableHead>
            <TableHead class="w-20 text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="row in displayRows"
            :key="row.id"
            class="transition-colors"
            :class="rowClass(row)"
            @click="onRowClick(row, $event)"
          >
            <!-- 来源图标 -->
            <TableCell>
              <template v-if="row.group">
                <div class="flex flex-col gap-1">
                  <div v-for="(entry, i) in row.group.ocrEntries" :key="i" class="flex gap-1">
                    <SourceIcon v-if="entry.taobao" source="taobao" size="sm" />
                    <SourceIcon v-if="entry.alipay" source="alipay" size="sm" />
                  </div>
                  <SourceIcon v-if="row.group.invoiceEntry" source="invoice" size="sm" />
                </div>
              </template>
              <template v-else>
                <div class="flex flex-col gap-1">
                  <div v-if="ocrItems(row).length" class="flex gap-1">
                    <SourceIcon v-for="item in ocrItems(row)" :key="item.id" :source="item.source" size="sm" />
                  </div>
                  <SourceIcon v-for="item in invoiceItems(row)" :key="item.id" :source="item.source" size="sm" />
                </div>
              </template>
            </TableCell>

            <!-- 文件名 -->
            <TableCell class="max-w-[300px]">
              <template v-if="row.group">
                <div class="flex flex-col gap-0.5">
                  <div v-for="(entry, i) in row.group.ocrEntries" :key="i" class="flex gap-2">
                    <span v-if="entry.taobao" class="truncate text-sm" :title="entry.taobao.fileName">{{ entry.taobao.fileName }}</span>
                    <span v-if="entry.alipay" class="truncate text-sm" :title="entry.alipay.fileName">{{ entry.alipay.fileName }}</span>
                  </div>
                  <span
                    v-if="row.group.invoiceEntry"
                    class="truncate block text-sm"
                    :title="row.group.invoiceEntry.invoice.fileName"
                  >{{ row.group.invoiceEntry.invoice.fileName }}</span>
                </div>
              </template>
              <template v-else>
                <div class="flex flex-col gap-0.5">
                  <div v-if="ocrItems(row).length" class="flex gap-2">
                    <span
                      v-for="item in ocrItems(row)"
                      :key="item.id"
                      class="truncate text-sm"
                      :title="item.fileName"
                    >{{ item.fileName }}</span>
                  </div>
                  <span
                    v-for="item in invoiceItems(row)"
                    :key="item.id"
                    class="truncate block text-sm"
                    :title="item.fileName"
                  >{{ item.fileName }}</span>
                </div>
              </template>
            </TableCell>

            <!-- 金额 -->
            <TableCell>
              <template v-if="row.group">
                <div class="flex flex-col gap-0.5 text-muted-foreground">
                  <template v-if="row.group.ocrEntries.length > 1">
                    <span v-for="(entry, i) in row.group.ocrEntries" :key="i">
                      {{ entry.amount != null ? `¥${entry.amount}` : '—' }}
                    </span>
                    <div v-if="row.group.invoiceEntry" class="flex items-center gap-1 border-t pt-0.5">
                      <SourceIcon source="invoice" size="sm" />
                      <span>{{ row.group.invoiceEntry.invoiceAmount != null ? `¥${row.group.invoiceEntry.invoiceAmount}` : '—' }}</span>
                    </div>
                  </template>
                  <template v-else-if="groupAmountsSame(row.group)">
                    <span>{{ row.group.ocrEntries[0]?.amount != null ? `¥${row.group.ocrEntries[0].amount}` : (row.group.invoiceEntry?.invoiceAmount != null ? `¥${row.group.invoiceEntry.invoiceAmount}` : '—') }}</span>
                  </template>
                  <template v-else>
                    <div class="flex items-center gap-1">
                      <SourceIcon source="taobao" size="sm" />
                      <span>{{ row.group.ocrEntries[0]?.amount != null ? `¥${row.group.ocrEntries[0].amount}` : '—' }}</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <SourceIcon source="invoice" size="sm" />
                      <span>{{ row.group.invoiceEntry?.invoiceAmount != null ? `¥${row.group.invoiceEntry.invoiceAmount}` : '—' }}</span>
                    </div>
                  </template>
                </div>
              </template>
              <template v-else>
                <EditableCell
                  :value="primaryItem(row).amount"
                  type="number"
                  prefix="¥"
                  @save="(v) => matchStore.updateField(primaryItem(row).id, 'amount', v, 'number')"
                />
              </template>
            </TableCell>

            <!-- 订单号/发票号 -->
            <TableCell>
              <template v-if="row.group">
                <div class="flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
                  <template v-for="(entry, i) in row.group.ocrEntries" :key="'ocr-'+i">
                    <span v-if="entry.orderId">{{ entry.orderId }}</span>
                  </template>
                  <span v-if="row.group.invoiceEntry?.invoiceNumber">{{ row.group.invoiceEntry.invoiceNumber }}</span>
                  <span v-if="!row.group.ocrEntries.some(e => e.orderId) && !row.group.invoiceEntry?.invoiceNumber">—</span>
                </div>
              </template>
              <div v-else class="flex flex-col gap-0.5">
                <template v-for="ident in rowIdentifiers(row)" :key="`${ident.itemId}-${ident.key}`">
                  <EditableCell
                    :value="ident.value"
                    class="font-mono text-xs"
                    @save="(v) => matchStore.updateField(ident.itemId, ident.key, v, 'text')"
                  />
                </template>
              </div>
            </TableCell>

            <!-- 时间 -->
            <TableCell>
              <template v-if="row.group">
                <div class="flex flex-col gap-0.5 text-sm text-muted-foreground">
                  <template v-for="(entry, i) in row.group.ocrEntries" :key="'time-'+i">
                    <span v-if="entry.payTime">{{ entry.payTime }}</span>
                  </template>
                  <span v-if="row.group.invoiceEntry?.invoiceDate">{{ row.group.invoiceEntry.invoiceDate }}</span>
                  <span v-if="!row.group.ocrEntries.some(e => e.payTime) && !row.group.invoiceEntry?.invoiceDate">—</span>
                </div>
              </template>
              <div v-else class="flex flex-col gap-0.5">
                <template v-for="t in rowTimes(row)" :key="`${t.itemId}-${t.key}`">
                  <EditableCell
                    :value="t.value"
                    @save="(v) => matchStore.updateField(t.itemId, t.key, v, 'text')"
                  />
                </template>
              </div>
            </TableCell>

            <!-- 状态标签 -->
            <TableCell class="text-center">
              <Badge v-if="row.status === 'invoice-merged'" variant="outline" class="text-xs bg-green-50 text-green-700 border-green-200">
                发票合并
              </Badge>
              <Badge v-else-if="row.status === 'auto-matched'" variant="default" class="text-xs">
                自动匹配
              </Badge>
              <Badge v-else-if="row.status === 'manual-matched'" variant="default" class="text-xs">
                手动匹配
              </Badge>
              <Badge v-else-if="row.status === 'unmatched'" variant="secondary" class="text-xs">
                未匹配
              </Badge>
              <Badge v-else-if="hasError(row)" variant="destructive" class="text-xs">
                错误
              </Badge>
              <Badge v-else variant="outline" class="text-xs">
                待确认
              </Badge>
            </TableCell>

            <!-- 操作 -->
            <TableCell class="text-center" @click.stop>
              <Button
                v-if="row.status === 'pending' && !hasError(row)"
                size="sm"
                variant="ghost"
                class="h-7 px-2 text-xs"
                @click="confirmRow(row)"
              >
                确认
              </Button>
              <template v-else-if="row.status === 'invoice-merged' && row.group">
                <div class="flex gap-1 justify-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 px-2 text-xs"
                    @click="matchStore.confirmInvoiceMerge(row.group.id)"
                  >
                    确认
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 px-2 text-xs text-muted-foreground"
                    @click="matchStore.unmatchGroup(row.group.id)"
                  >
                    拆散
                  </Button>
                </div>
              </template>
              <Button
                v-else-if="row.group"
                size="sm"
                variant="ghost"
                class="h-7 px-2 text-xs text-muted-foreground"
                @click="matchStore.unmatchGroup(row.group.id)"
              >
                拆散
              </Button>
            </TableCell>
          </TableRow>

          <TableRow v-if="displayRows.length === 0">
            <TableCell :colspan="7" class="text-center text-muted-foreground py-8">
              暂无数据
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- 生成 PDF 按钮 -->
    <div v-if="matchStore.successfulGroups.length > 0" class="flex justify-end">
      <Button
        :disabled="isGeneratingPdf"
        @click="handleGeneratePdf"
      >
        {{ isGeneratingPdf ? '生成中...' : `生成PDF (${matchStore.successfulGroups.length})` }}
      </Button>
    </div>

    <MergeConflictDialog
      :open="conflictDialogOpen"
      :conflicts="pendingConflicts"
      @cancel="conflictDialogOpen = false"
      @resolve="onConflictResolved"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Receipt } from 'lucide-vue-next';
import { useMatchStore } from '@/stores/matchStore';
import { usePdfStore } from '@/stores/pdfStore';
import { generateFromGroups } from '@/lib/pdfme/pdfGenerator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import SourceIcon from './SourceIcon.vue';
import EditableCell from './EditableCell.vue';
import MergeConflictDialog from './MergeConflictDialog.vue';
import type { ReviewRow, ReviewItem, FieldConflict, MatchGroup, OcrFieldSet } from '@/types/match';

const matchStore = useMatchStore();
const pdfStore = usePdfStore();
const router = useRouter();
const showMatched = ref(false);

// 冲突 Dialog 状态
const conflictDialogOpen = ref(false);
const pendingConflicts = ref<FieldConflict[]>([]);
const pendingMergeItems = ref<ReviewItem[]>([]);
const pendingGroupIdsToRemove = ref<string[]>([]);

const displayRows = computed(() => {
  if (showMatched.value) return matchStore.reviewRows;
  return matchStore.reviewRows.filter((r) => r.status !== 'auto-matched' && r.status !== 'manual-matched');
});

/** 判断行是否为已匹配状态（不可选中） */
function isMatchedRow(row: ReviewRow) {
  return row.status === 'auto-matched' || row.status === 'manual-matched' || row.status === 'invoice-merged';
}

/** 行的主要项（用于编辑和显示单值字段） */
function primaryItem(row: ReviewRow) {
  return row.items[0];
}

/** 行是否包含 error 项 */
function hasError(row: ReviewRow) {
  return row.items.some((item) => item.status === 'error');
}

/** 获取标识字段（订单号或发票号）的 key 和 value */
function identifierField(item: ReviewItem) {
  return item.source === 'invoice'
    ? { key: 'invoiceNumber', value: item.invoiceNumber }
    : { key: 'orderId', value: item.orderId };
}

/** 获取时间字段的 key 和 value */
function timeField(item: ReviewItem) {
  return item.source === 'invoice'
    ? { key: 'invoiceDate', value: item.invoiceDate }
    : { key: 'payTime', value: item.payTime };
}

/** 淘宝/支付宝项（横向显示） */
function ocrItems(row: ReviewRow) {
  return row.items.filter((i) => i.source !== 'invoice');
}

/** 发票项（竖向显示） */
function invoiceItems(row: ReviewRow) {
  return row.items.filter((i) => i.source === 'invoice');
}

/** group 的 OCR 金额和发票金额是否相同（单 ocrEntry 时比较） */
function groupAmountsSame(g: MatchGroup): boolean {
  if (g.ocrEntries.length !== 1) return false;
  const ocrAmt = g.ocrEntries[0]?.amount;
  const invAmt = g.invoiceEntry?.invoiceAmount;
  if (ocrAmt == null || invAmt == null) return true;
  return ocrAmt === invAmt;
}

/** 行的标识列表（orderId + invoiceNumber 去重） */
function rowIdentifiers(row: ReviewRow): { key: string; value: string | null; itemId: string; source: string }[] {
  const ids: { key: string; value: string | null; itemId: string; source: string }[] = [];
  const seen = new Set<string>();
  for (const item of row.items) {
    const f = identifierField(item);
    const dedup = `${f.key}:${f.value}`;
    if (!seen.has(dedup)) {
      seen.add(dedup);
      ids.push({ key: f.key, value: f.value, itemId: item.id, source: item.source });
    }
  }
  return ids;
}

/** 行的时间列表（payTime + invoiceDate 去重） */
function rowTimes(row: ReviewRow): { key: string; value: string | null; itemId: string; source: string }[] {
  const times: { key: string; value: string | null; itemId: string; source: string }[] = [];
  const seen = new Set<string>();
  for (const item of row.items) {
    const f = timeField(item);
    const dedup = `${f.key}:${f.value}`;
    if (!seen.has(dedup)) {
      seen.add(dedup);
      times.push({ key: f.key, value: f.value, itemId: item.id, source: item.source });
    }
  }
  return times;
}

/** 行选中 */
function rowClass(row: ReviewRow): string {
  const classes: string[] = [];
  const isMatched = isMatchedRow(row);
  const isInvMerged = row.status === 'invoice-merged';
  const isSelected = matchStore.selectedIds.has(row.id);
  const hintActive = matchStore.matchableRowIds.size > 0;

  if (isInvMerged) {
    classes.push('bg-green-50/40 dark:bg-green-950/20 cursor-default');
  } else if (isMatched) {
    classes.push('opacity-40 cursor-default');
  } else if (row.status === 'pending') {
    if (hasError(row)) {
      classes.push('bg-red-50/60 dark:bg-red-950/20');
    } else {
      classes.push('bg-yellow-50/60 dark:bg-yellow-950/20');
    }
  } else {
    classes.push('cursor-pointer');
    if (!isSelected) {
      classes.push('hover:bg-accent/50');
    }
  }

  if (isSelected) {
    classes.push('bg-primary/10');
  }

  // 匹配提示：非选中的未匹配行变淡但保持可点击
  if (hintActive && !isMatched && !isSelected && row.status === 'unmatched') {
    if (!matchStore.matchableRowIds.has(row.id)) {
      classes.push('opacity-30');
    }
  }

  return classes.join(' ');
}

function onRowClick(row: ReviewRow, event: MouseEvent) {
  if (isMatchedRow(row)) return;
  if (row.status === 'unmatched') {
    matchStore.selectRow(row.id, event.ctrlKey || event.metaKey);
  }
}

function confirmRow(row: ReviewRow) {
  for (const item of row.items) {
    matchStore.confirmItem(item.id);
  }
}

/** 手动合并（带冲突检测） */
function handleManualMatch() {
  const prep = matchStore.prepareManualMatch();
  if (!prep) return;

  if (prep.resolved.ok) {
    matchStore.executeManualMatch(prep.items, prep.groupIdsToRemove);
  } else {
    pendingConflicts.value = prep.resolved.conflicts;
    pendingMergeItems.value = prep.items;
    pendingGroupIdsToRemove.value = prep.groupIdsToRemove;
    conflictDialogOpen.value = true;
  }
}

function onConflictResolved(resolved: Record<string, string | number>) {
  conflictDialogOpen.value = false;
  matchStore.executeManualMatch(
    pendingMergeItems.value,
    pendingGroupIdsToRemove.value,
    resolved as Partial<OcrFieldSet>,
  );
}

// PDF 生成
const isGeneratingPdf = ref(false);

async function handleGeneratePdf() {
  isGeneratingPdf.value = true;
  try {
    const result = await generateFromGroups(matchStore.successfulGroups);

    if (result.skippedGroups.length > 0) {
      console.warn(`跳过 ${result.skippedGroups.length} 个无匹配模板的组`);
    }

    if (result.template.schemas.length === 0) {
      console.warn('没有可生成的组');
      return;
    }

    pdfStore.setTemplateAndInputs(result.template, result.inputs);
    router.push('/pdfme/form-viewer');
  } catch (e) {
    console.error('PDF 生成失败:', e);
  } finally {
    isGeneratingPdf.value = false;
  }
}

</script>

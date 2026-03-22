<template>
  <div class="max-w-5xl mx-auto p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold text-primary flex items-center gap-2">
        <Package class="w-5 h-5" /> 批量处理
      </h2>
      <div class="flex gap-2">
        <Button
          @click="initAndSelect"
          :disabled="isBatchProcessing"
        >
          {{ isBatchProcessing ? '处理中...' : (ocrInitialized ? '选择文件/文件夹' : '初始化并选择') }}
        </Button>
        <Button
          v-if="hasAnyResults"
          variant="outline"
          @click="clearResults"
        >
          清空结果
        </Button>
      </div>
    </div>

    <!-- 合并进度区 -->
    <Card v-if="isBatchProcessing && (batchProgress || invoiceProgress)">
      <CardContent class="p-4 space-y-4">
        <!-- OCR 进度 -->
        <div v-if="batchProgress" class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium flex items-center gap-1">
              <Image class="w-4 h-4" /> OCR: {{ batchProgress.current_file_name }}
            </span>
            <span class="text-muted-foreground">
              {{ batchProgress.current_index + 1 }} / {{ batchProgress.total_count }}
            </span>
          </div>
          <Progress :model-value="progressPercent" class="h-3" />
        </div>

        <!-- 发票进度 -->
        <div v-if="invoiceProgress" class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium flex items-center gap-1">
              <Receipt class="w-4 h-4" /> 发票: {{ invoiceProgress.current_file_name }}
            </span>
            <span class="text-muted-foreground">
              {{ invoiceProgress.current_index + 1 }} / {{ invoiceProgress.total_count }}
            </span>
          </div>
          <Progress :model-value="invoiceProgressPercent" class="h-3" />
        </div>
      </CardContent>
    </Card>

    <!-- 匹配工作流（实时显示） -->
    <template v-if="matchStore.hasReviewItems">
      <ResultReview />
    </template>

    <!-- 确认弹窗 -->
    <ConfirmDialog
      v-model:open="confirmDialogOpen"
      title="开始批量处理"
      description="已扫描到以下文件，是否开始处理？"
      :items="confirmDialogItems"
      confirm-text="开始处理"
      @confirm="onConfirmProcess"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { Package, Image, Receipt } from 'lucide-vue-next';
import { useOcrStore } from '../stores/ocrStore';
import { useMatchStore } from '../stores/matchStore';
import { scanDirectory, IMAGE_EXTENSIONS, PDF_EXTENSIONS } from '../utils/fileScanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import ResultReview from './ResultReview.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import type { ConfirmItem } from './ConfirmDialog.vue';

const ocrStore = useOcrStore();
const matchStore = useMatchStore();

const ocrInitialized = computed(() => ocrStore.ocrInitialized);
const isBatchProcessing = computed(() => ocrStore.isBatchProcessing);
const batchProgress = computed(() => ocrStore.batchProgress);
const progressPercent = computed(() => ocrStore.progressPercent);
const invoiceProgress = computed(() => ocrStore.invoiceProgress);
const invoiceProgressPercent = computed(() => ocrStore.invoiceProgressPercent);

const hasAnyResults = computed(
  () => ocrStore.batchResults.length > 0 || ocrStore.invoiceResults.length > 0,
);

// 确认弹窗状态
const confirmDialogOpen = ref(false);
const confirmDialogItems = ref<ConfirmItem[]>([]);
const pendingImageFiles = ref<string[]>([]);
const pendingPdfFiles = ref<string[]>([]);

let cleanupListeners: (() => void) | null = null;

async function initAndSelect() {
  try {
    if (!ocrInitialized.value) {
      await ocrStore.initOcr();
    }
    await selectFiles();
  } catch (error) {
    console.error('[初始化] 错误:', error);
    alert('初始化失败: ' + error);
  }
}

async function selectFiles() {
  try {
    const selected = await open({
      multiple: true,
      directory: true,
    });

    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];

    const imageFiles: string[] = [];
    const pdfFiles: string[] = [];

    for (const path of paths) {
      const images = await scanDirectory(path, IMAGE_EXTENSIONS, true);
      const pdfs = await scanDirectory(path, PDF_EXTENSIONS, true);
      imageFiles.push(...images);
      pdfFiles.push(...pdfs);
    }

    if (imageFiles.length === 0 && pdfFiles.length === 0) {
      alert('未找到任何图片或 PDF 文件');
      return;
    }

    // 准备确认弹窗数据
    pendingImageFiles.value = imageFiles;
    pendingPdfFiles.value = pdfFiles;
    confirmDialogItems.value = [];
    if (imageFiles.length > 0) {
      confirmDialogItems.value.push({ icon: '🖼️', label: '图片文件', count: imageFiles.length });
    }
    if (pdfFiles.length > 0) {
      confirmDialogItems.value.push({ icon: '📄', label: 'PDF 文件', count: pdfFiles.length });
    }
    confirmDialogOpen.value = true;
  } catch (error) {
    console.error('[文件选择] 错误:', error);
    alert('文件选择失败: ' + error);
  }
}

async function onConfirmProcess() {
  confirmDialogOpen.value = false;

  // 清空之前的匹配状态
  matchStore.reset();

  // 同时启动批处理
  if (pendingImageFiles.value.length > 0) {
    ocrStore.startBatchOcr(pendingImageFiles.value);
  }
  if (pendingPdfFiles.value.length > 0) {
    ocrStore.startBatchInvoice(pendingPdfFiles.value);
  }
}

function clearResults() {
  ocrStore.clearBatchResults();
}

onMounted(async () => {
  cleanupListeners = await ocrStore.setupEventListeners();
});

onUnmounted(() => {
  if (cleanupListeners) {
    cleanupListeners();
  }
});
</script>

import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getDefaultConfig } from '@/utils/modelValidator';
import { useMatchStore } from './matchStore';
import type { 
  OcrResult, 
  FileProcessedEvent,
  BatchProgress, 
  ModelConfig,
} from '../types/ocr';
import type {
  FileInvoiceProcessedEvent,
  BatchInvoiceProgress,
} from '../types/invoice';

// Module-level guard: ensures listeners are set up only once, cleaned up on re-setup
let _activeUnlisteners: Array<() => void> = [];

export const useOcrStore = defineStore('ocr', {
  state: () => ({
    // OCR 引擎状态
    ocrInitialized: false,
    
    // 批处理相关
    isBatchProcessing: false,
    activeTaskCount: 0,
    batchProgress: null as BatchProgress | null,
    batchResults: [] as FileProcessedEvent[],
    
    // 发票批处理相关
    invoiceProgress: null as BatchInvoiceProgress | null,
    invoiceResults: [] as FileInvoiceProcessedEvent[],
    
    // 单文件 OCR 相关（保持向后兼容）
    isProcessing: false,
    currentImage: '',
    currentResults: [] as OcrResult[],
    
    // 模型配置（完整路径，初始化为空）
    modelConfig: null as ModelConfig | null,
  }),
  
  getters: {
    successResults: (state) => 
      state.batchResults.filter((r: FileProcessedEvent) => r.status === 'success'),
    failedResults: (state) => 
      state.batchResults.filter((r: FileProcessedEvent) => r.status === 'failed'),
    warningResults: (state) =>
      state.batchResults.filter((r: FileProcessedEvent) => r.status === 'warning'),
    successCount: (state) => 
      state.batchResults.filter((r: FileProcessedEvent) => r.status === 'success' || r.status === 'warning').length,
    failedCount: (state) =>
      state.batchResults.filter((r: FileProcessedEvent) => r.status === 'failed').length,
    progressPercent: (state) => {
      if (!state.batchProgress) return 0;
      return Math.round((state.batchProgress.current_index + 1) / state.batchProgress.total_count * 100);
    },
    
    // 发票相关 getters
    invoiceSuccessCount: (state) =>
      state.invoiceResults.filter((r: FileInvoiceProcessedEvent) => r.status === 'success' || r.status === 'warning').length,
    invoiceFailedCount: (state) =>
      state.invoiceResults.filter((r: FileInvoiceProcessedEvent) => r.status === 'failed').length,
    invoiceProgressPercent: (state) => {
      if (!state.invoiceProgress) return 0;
      return Math.round((state.invoiceProgress.current_index + 1) / state.invoiceProgress.total_count * 100);
    },
  },
  
  actions: {
    // 初始化 OCR 引擎
    async initOcr() {
      try {
        if (!this.modelConfig) {
          this.modelConfig = await getDefaultConfig();
        }
        
        await invoke('initialize_ocr', {
          detPath: this.modelConfig.det_model,
          recPath: this.modelConfig.rec_model,
          charsetPath: this.modelConfig.charset,
        });
        
        this.ocrInitialized = true;
        console.log('[OCR Store] OCR 引擎初始化成功');
      } catch (error) {
        console.error('[OCR Store] OCR 初始化失败:', error);
        throw error;
      }
    },
    
    // 单文件 OCR
    async recognizeFile(imagePath: string) {
      this.isProcessing = true;
      this.currentImage = imagePath;
      this.currentResults = [];
      
      try {
        const results = await invoke<OcrResult[]>('ocr_recognize_file', { imagePath });
        this.currentResults = results;
        return results;
      } catch (error) {
        console.error('[OCR Store] OCR 识别失败:', error);
        throw error;
      } finally {
        this.isProcessing = false;
      }
    },
    
    // 开始批量 OCR
    async startBatchOcr(filePaths: string[]) {
      if (!this.ocrInitialized) {
        throw new Error('OCR 引擎未初始化');
      }
      
      // 重置状态
      this.isBatchProcessing = true;
      this.activeTaskCount++;
      this.batchProgress = null;
      this.batchResults = [];
      
      console.log('[OCR Store] 开始批量处理', { count: filePaths.length });
      
      try {
        await invoke('batch_process_ocr_command', { files: filePaths });
      } catch (error) {
        console.error('[OCR Store] 批量处理失败:', error);
        throw error;
      } finally {
        this.activeTaskCount--;
        if (this.activeTaskCount === 0) {
          this.isBatchProcessing = false;
        }
        this.batchProgress = null;
        console.log('[OCR Store] 批量处理完成');
      }
    },
    
    // 处理进度事件
    handleBatchProgress(progress: BatchProgress) {
      this.batchProgress = progress;
      console.log('[OCR Store] 进度更新:', progress);
    },
    
    // 处理文件完成事件
    handleFileProcessed(event: FileProcessedEvent) {
      console.log('[DEBUG] FileProcessedEvent:', JSON.stringify(event, null, 2));
      this.batchResults.push(event);
      console.log('[OCR Store] 文件处理完成:', event.file_name);
      // 实时推送到匹配 store
      const matchStore = useMatchStore();
      matchStore.addResultFromOcr(event);
    },
    
    // 清空批处理结果
    clearBatchResults() {
      this.batchResults = [];
      this.batchProgress = null;
      this.invoiceResults = [];
      this.invoiceProgress = null;
      const matchStore = useMatchStore();
      matchStore.reset();
    },
    
    // 开始批量发票处理
    async startBatchInvoice(filePaths: string[]) {
      // 重置发票状态
      this.isBatchProcessing = true;
      this.activeTaskCount++;
      this.invoiceProgress = null;
      this.invoiceResults = [];
      
      console.log('[OCR Store] 开始批量发票处理', { count: filePaths.length });
      
      try {
        await invoke('batch_invoice_command', { files: filePaths });
      } catch (error) {
        console.error('[OCR Store] 批量发票处理失败:', error);
        throw error;
      } finally {
        this.activeTaskCount--;
        if (this.activeTaskCount === 0) {
          this.isBatchProcessing = false;
        }
        this.invoiceProgress = null;
        console.log('[OCR Store] 批量发票处理完成');
      }
    },
    
    // 处理发票进度事件
    handleInvoiceProgress(progress: BatchInvoiceProgress) {
      this.invoiceProgress = progress;
      console.log('[OCR Store] 发票进度更新:', progress);
    },
    
    // 处理发票文件完成事件
    handleFileInvoiceProcessed(event: FileInvoiceProcessedEvent) {
      console.log('[DEBUG] FileInvoiceProcessedEvent:', JSON.stringify(event, null, 2));
      this.invoiceResults.push(event);
      console.log('[OCR Store] 发票文件处理完成:', event.file_name);
      // 实时推送到匹配 store
      const matchStore = useMatchStore();
      matchStore.addResultFromInvoice(event);
    },
    
    // 设置事件监听器（模块级去重：重新调用会先清理旧监听）
    async setupEventListeners() {
      // 清理上次注册的监听器（防止 HMR 重复注册）
      _activeUnlisteners.forEach((fn) => fn());
      _activeUnlisteners = [];

      const unlistenProgress = await listen<BatchProgress>('batch-progress', (event) => {
        this.handleBatchProgress(event.payload);
      });
      
      const unlistenFileProcessed = await listen<FileProcessedEvent>('file-processed', (event) => {
        this.handleFileProcessed(event.payload);
      });
      
      // 发票事件监听
      const unlistenInvoiceProgress = await listen<BatchInvoiceProgress>('batch-invoice-progress', (event) => {
        this.handleInvoiceProgress(event.payload);
      });
      
      const unlistenFileInvoiceProcessed = await listen<FileInvoiceProcessedEvent>('file-invoice-processed', (event) => {
        this.handleFileInvoiceProcessed(event.payload);
      });

      const cleanup = () => {
        unlistenProgress();
        unlistenFileProcessed();
        unlistenInvoiceProgress();
        unlistenFileInvoiceProcessed();
        _activeUnlisteners = [];
      };

      _activeUnlisteners = [
        unlistenProgress,
        unlistenFileProcessed,
        unlistenInvoiceProgress,
        unlistenFileInvoiceProcessed,
      ];

      // 返回取消监听函数
      return cleanup;
    },

    // 设置模型配置并热重载引擎
    async setModelConfig(config: ModelConfig) {
      try {
        await invoke('set_models_config', {
          detPath: config.det_model,
          recPath: config.rec_model,
          charsetPath: config.charset,
        });
        this.modelConfig = config;
        console.log('[OCR Store] 模型配置已更新:', config);
      } catch (error) {
        console.error('[OCR Store] 设置模型配置失败:', error);
        throw error;
      }
    },
  },

  persist: {
    paths: ['modelConfig'],
  },
});

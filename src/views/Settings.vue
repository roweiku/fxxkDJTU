<template>
  <div class="max-w-7xl mx-auto p-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold">OCR 模型配置</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
        配置检测模型、识别模型和字符集文件
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <!-- 检测模型 -->
      <div class="space-y-2">
        <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          检测模型 (Det)
        </label>
        <Select v-model="selectedConfig!.det_model" v-if="selectedConfig">
          <SelectTrigger>
            <SelectValue placeholder="选择检测模型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem 
              v-for="model in classifiedModels.detModels" 
              :key="model" 
              :value="model"
            >
              {{ extractFileName(model) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- 识别模型 -->
      <div class="space-y-2">
        <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          识别模型 (Rec)
        </label>
        <Select v-model="selectedConfig!.rec_model" v-if="selectedConfig">
          <SelectTrigger>
            <SelectValue placeholder="选择识别模型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem 
              v-for="model in classifiedModels.recModels" 
              :key="model" 
              :value="model"
            >
              {{ extractFileName(model) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- 字符集 -->
      <div class="space-y-2">
        <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          字符集 (Charset)
        </label>
        <Select v-model="selectedConfig!.charset" v-if="selectedConfig">
          <SelectTrigger>
            <SelectValue placeholder="选择字符集" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem 
              v-for="charset in classifiedModels.charsets" 
              :key="charset" 
              :value="charset"
            >
              {{ extractFileName(charset) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div class="flex gap-3">
      <Button variant="outline" @click="resetToDefault">
        重置为默认
      </Button>
    </div>

    <!-- 消息提示 -->
    <div 
      v-if="message" 
      :class="[
        'mt-4 p-4 rounded-lg text-sm',
        messageType === 'success' 
          ? 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200'
          : 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-200'
      ]"
    >
      {{ message }}
    </div>

    <!-- 版本信息与更新 -->
    <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
      <h2 class="text-lg font-semibold mb-4">关于</h2>
      <div class="flex items-center gap-4">
        <span class="text-sm text-gray-600 dark:text-gray-400">
          当前版本：<span class="font-mono font-medium text-gray-800 dark:text-gray-200">v{{ appVersion }}</span>
        </span>
        <Button 
          variant="outline" 
          size="sm" 
          :disabled="checking" 
          @click="manualCheckUpdate"
        >
          {{ checking ? '检查中...' : '检查更新' }}
        </Button>
        <span 
          v-if="updateMessage" 
          class="text-sm"
          :class="updateMessageType === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
        >
          {{ updateMessage }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, onMounted, watch } from 'vue';
import { getVersion } from '@tauri-apps/api/app';
import { useOcrStore } from '@/stores/ocrStore';
import type { ModelConfig } from '@/types/ocr';
import { 
  classifyModelFiles, 
  getDefaultConfig,
  getModelsDirectory,
  type ClassifiedModels 
} from '@/utils/modelValidator';
import { scanDirectory, MODEL_EXTENSIONS } from '@/utils/fileScanner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

console.log('[Settings] 组件正在初始化...');

const ocrStore = useOcrStore();
const selectedConfig = ref<ModelConfig | null>(null);
const classifiedModels = ref<ClassifiedModels>({
  detModels: [],
  recModels: [],
  charsets: [],
});
const message = ref('');
const messageType = ref<'success' | 'error'>('success');

// 版本与更新
const appVersion = ref('');
const checking = ref(false);
const updateMessage = ref('');
const updateMessageType = ref<'success' | 'error'>('success');
const checkForUpdate = inject<(manual: boolean) => Promise<boolean>>('checkForUpdate');

console.log('[Settings] State 初始化完成:', { 
  selectedConfig: selectedConfig.value, 
  classifiedModels: classifiedModels.value 
});

// 防抖定时器
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Watch 配置变化，自动保存
watch(
  selectedConfig,
  async (newConfig) => {
    if (!newConfig) return;
    console.log('[Settings] 配置已修改，准备自动保存:', newConfig);
    
    // 清除之前的定时器
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    
    // 800ms 防抖
    saveTimer = setTimeout(async () => {
      try {
        await ocrStore.setModelConfig(newConfig);
        showMessage('配置已自动保存', 'success');
      } catch (error) {
        console.error('[Settings] 自动保存失败:', error);
        showMessage('自动保存失败: ' + error, 'error');
      }
    }, 800);
  },
  { deep: true } // 深度监听对象属性
);

function extractFileName(fullPath: string): string {
  return fullPath.split('/').pop() || '';
}

onMounted(async () => {
  console.log('[Settings] onMounted 钩子触发！');
  try {
    appVersion.value = await getVersion();
    await loadModels();
    await loadCurrentConfig();
    console.log('[Settings] onMounted 完成');
  } catch (error) {
    console.error('[Settings] onMounted 错误:', error);
  }
});

async function loadModels() {
  try {
    const modelsDir = await getModelsDirectory();
    console.log('[Settings] 开始扫描模型目录:', modelsDir);
    const files = await scanDirectory(modelsDir, MODEL_EXTENSIONS, false);
    console.log('[Settings] 扫描到的文件:', files);
    
    classifiedModels.value = classifyModelFiles(files);
    console.log('[Settings] 分类后的模型:', classifiedModels.value);
  } catch (error) {
    console.error('[Settings] 加载模型失败:', error);
    showMessage('加载可用模型失败: ' + error, 'error');
  }
}

async function loadCurrentConfig() {
  if (ocrStore.modelConfig) {
    selectedConfig.value = { ...ocrStore.modelConfig };
  } else {
    selectedConfig.value = await getDefaultConfig();
  }
}

async function resetToDefault() {
  selectedConfig.value = await getDefaultConfig();
  showMessage('已重置为默认配置', 'success');
}

async function manualCheckUpdate() {
  if (!checkForUpdate) return;
  checking.value = true;
  updateMessage.value = '';
  try {
    const found = await checkForUpdate(true);
    if (!found) {
      updateMessage.value = '已是最新版本';
      updateMessageType.value = 'success';
      setTimeout(() => updateMessage.value = '', 3000);
    }
  } catch (e) {
    updateMessage.value = '检查失败';
    updateMessageType.value = 'error';
    setTimeout(() => updateMessage.value = '', 3000);
  } finally {
    checking.value = false;
  }
}

function showMessage(msg: string, type: 'success' | 'error') {
  message.value = msg;
  messageType.value = type;
  setTimeout(() => message.value = '', 3000);
}
</script>


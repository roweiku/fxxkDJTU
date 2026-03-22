<script setup lang="ts">
import { onMounted } from 'vue';
import { useOcrStore } from './stores/ocrStore';

const ocrStore = useOcrStore();

onMounted(async () => {
  await ocrStore.initOcr();
});
</script>

<template>
  <div class="h-screen flex flex-col">
    <!-- 顶部导航 -->
    <nav class="flex gap-2 p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <router-link 
        to="/" 
        class="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        active-class="!bg-blue-500 !text-white"
      >
        批量 OCR
      </router-link>
      <router-link 
        to="/settings" 
        class="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        active-class="!bg-blue-500 !text-white"
      >
        设置
      </router-link>
      <router-link 
        to="/pdfme/form-viewer" 
        class="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        active-class="!bg-blue-500 !text-white"
      >
        PDF 表单
      </router-link>
    </nav>

    <!-- 主内容区 -->
    <main class="flex-1 overflow-y-auto">
      <router-view />
    </main>
  </div>
</template>

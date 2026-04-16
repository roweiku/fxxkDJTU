<script setup lang="ts">
import { ref, provide, onMounted } from 'vue';
import { check } from '@tauri-apps/plugin-updater';
import { useOcrStore } from './stores/ocrStore';
import UpdateDialog from './components/UpdateDialog.vue';

const ocrStore = useOcrStore();

// 更新相关状态
const updateDialogRef = ref<InstanceType<typeof UpdateDialog>>();
const showUpdate = ref(false);
const updateVersion = ref('');
const updateBody = ref('');
const isManualFallback = ref(false);
let pendingUpdate: Awaited<ReturnType<typeof check>> | null = null;

const SKIPPED_VERSION_KEY = 'skipped_update_version';

async function checkForUpdate(manual = false): Promise<boolean> {
  try {
    const update = await check();
    if (!update) {
      return false;
    }

    // 手动检查时不跳过版本
    if (!manual) {
      const skipped = localStorage.getItem(SKIPPED_VERSION_KEY);
      if (skipped === update.version) return false;
    }

    updateVersion.value = update.version;
    updateBody.value = update.body || '';
    isManualFallback.value = false;
    pendingUpdate = update;
    showUpdate.value = true;
    return true;
  } catch (e) {
    console.warn('检查更新失败:', e);
    if (manual) throw e;
    return false;
  }
}

// 暴露给子组件通过 inject 调用
provide('checkForUpdate', checkForUpdate);

function handleSkipVersion(version: string) {
  localStorage.setItem(SKIPPED_VERSION_KEY, version);
}

async function handleInstall() {
  if (!pendingUpdate) return;
  const dialog = updateDialogRef.value;
  if (!dialog) return;

  dialog.setDownloading(true);
  try {
    let totalBytes = 0;
    let downloadedBytes = 0;
    await pendingUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          totalBytes = event.data.contentLength ?? 0;
          dialog.setProgress(0, totalBytes, 0);
          break;
        case 'Progress':
          downloadedBytes += event.data.chunkLength;
          const pct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
          dialog.setProgress(pct, totalBytes, downloadedBytes);
          break;
        case 'Finished':
          dialog.setProgress(100, totalBytes, totalBytes);
          break;
      }
    });
    // 安装完成后 Tauri 会自动重启
  } catch (e) {
    console.warn('自动更新失败，回退到手动下载:', e);
    dialog.setDownloading(false);
    // 回退到手动下载引导
    isManualFallback.value = true;
  }
}

onMounted(async () => {
  await ocrStore.initOcr();
  checkForUpdate();
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

    <!-- 更新弹窗 -->
    <UpdateDialog
      ref="updateDialogRef"
      :open="showUpdate"
      :version="updateVersion"
      :body="updateBody"
      :is-manual-fallback="isManualFallback"
      @update:open="showUpdate = $event"
      @install="handleInstall"
      @skip-version="handleSkipVersion"
    />
  </div>
</template>

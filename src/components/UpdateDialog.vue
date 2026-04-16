<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ isManualFallback ? '发现新版本' : '软件更新' }}</DialogTitle>
        <DialogDescription>
          <template v-if="isManualFallback">
            新版本 {{ version }} 已发布，当前系统不支持自动更新，请前往 Release 页面手动下载安装。
          </template>
          <template v-else-if="downloading">
            正在下载更新 {{ version }}...
          </template>
          <template v-else>
            发现新版本 {{ version }}，是否立即更新？
          </template>
        </DialogDescription>
      </DialogHeader>

      <!-- 下载进度 -->
      <div v-if="downloading" class="space-y-2">
        <Progress :model-value="progress" />
        <p class="text-xs text-muted-foreground text-center">{{ progressText }}</p>
      </div>

      <!-- 更新日志 -->
      <div v-if="body && !downloading" class="changelog-content max-h-48 overflow-y-auto text-sm text-muted-foreground bg-muted/50 rounded p-3" v-html="renderedBody" />

      <DialogFooter class="gap-2">
        <template v-if="isManualFallback">
          <Button variant="outline" @click="handleClose(false)">关闭</Button>
          <Button @click="openReleasePage">前往下载</Button>
        </template>
        <template v-else-if="downloading">
          <!-- 下载中无按钮 -->
        </template>
        <template v-else>
          <Button variant="ghost" size="sm" @click="handleSkipVersion">不再提醒</Button>
          <Button variant="outline" @click="handleClose(false)">下次提醒</Button>
          <Button @click="handleInstall">立即安装</Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const props = defineProps<{
  open: boolean;
  version: string;
  body: string;
  isManualFallback: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  'install': [];
  'skip-version': [version: string];
}>();

const downloading = ref(false);
const progress = ref(0);
const contentLength = ref(0);
const downloaded = ref(0);

const renderedBody = computed(() => {
  if (!props.body) return '';
  const raw = marked.parse(props.body, { async: false }) as string;
  return DOMPurify.sanitize(raw);
});

const progressText = computed(() => {
  if (contentLength.value > 0) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    return `${mb(downloaded.value)} / ${mb(contentLength.value)} MB`;
  }
  return `${progress.value}%`;
});

function handleClose(val: boolean) {
  if (!downloading.value) {
    emit('update:open', val);
  }
}

function handleSkipVersion() {
  emit('skip-version', props.version);
  emit('update:open', false);
}

function handleInstall() {
  emit('install');
}

async function openReleasePage() {
  await openUrl('https://github.com/roweiku/fxxkDJTU/releases/latest');
  emit('update:open', false);
}

// 暴露方法供父组件调用更新下载进度
function setDownloading(val: boolean) {
  downloading.value = val;
}
function setProgress(p: number, total: number, done: number) {
  progress.value = p;
  contentLength.value = total;
  downloaded.value = done;
}

defineExpose({ setDownloading, setProgress });
</script>

<style scoped>
.changelog-content :deep(h1),
.changelog-content :deep(h2),
.changelog-content :deep(h3) {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0.5rem 0 0.25rem;
}
.changelog-content :deep(h1) {
  display: none;
}
.changelog-content :deep(ul),
.changelog-content :deep(ol) {
  padding-left: 1.25rem;
  margin: 0.25rem 0;
}
.changelog-content :deep(li) {
  margin: 0.125rem 0;
  list-style-type: disc;
}
.changelog-content :deep(p) {
  margin: 0.25rem 0;
}
.changelog-content :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
}
.changelog-content :deep(code) {
  font-size: 0.8em;
  background: hsl(var(--muted));
  padding: 0.1em 0.3em;
  border-radius: 0.25rem;
}
.changelog-content :deep(hr) {
  margin: 0.5rem 0;
  border-color: hsl(var(--border));
}
</style>

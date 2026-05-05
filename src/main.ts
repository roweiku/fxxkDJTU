import { createApp } from "vue";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import Toast from "vue-toastification";
import "vue-toastification/dist/index.css";
import router from "./router";
import App from "./App.vue";
import './style.css'

try {
  const raw = localStorage.getItem('ocr');
  if (raw) {
    const parsed = JSON.parse(raw);
    const RUNTIME_KEYS = [
      'isBatchProcessing',
      'activeTaskCount',
      'isProcessing',
      'batchProgress',
      'batchResults',
      'invoiceProgress',
      'invoiceResults',
      'currentImage',
      'currentResults',
      'ocrInitialized',
    ];
    let mutated = false;
    for (const k of RUNTIME_KEYS) {
      if (k in parsed) {
        delete parsed[k];
        mutated = true;
      }
    }
    if (mutated) {
      localStorage.setItem('ocr', JSON.stringify(parsed));
    }
  }
} catch {
  // 解析失败就清掉，让 Pinia 用默认 state 启动
  localStorage.removeItem('ocr');
}

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(Toast);
app.mount("#app");

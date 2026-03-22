<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { Template, checkTemplate, getInputFromTemplate, Lang } from '@pdfme/common';
import { Form, Viewer } from '@pdfme/ui';
import {
  getFontsData,
  getTemplateById,
  getBlankTemplate,
  handleLoadTemplate,
  generatePDF,
  isJsonString,
  translations,
} from '@/lib/pdfme/helper';
import { getPlugins } from '@/lib/pdfme/plugins';
import { usePdfStore } from '@/stores/pdfStore';
import PdfmeNavBar from '@/components/pdfme/PdfmeNavBar.vue';

type Mode = 'form' | 'viewer';

const toast = useToast();
const route = useRoute();
const router = useRouter();
const pdfStore = usePdfStore();

const uiRef = ref<HTMLDivElement | null>(null);
let ui: Form | Viewer | null = null;

const mode = ref<Mode>((localStorage.getItem('mode') as Mode) ?? 'form');

async function buildUi(m: Mode) {
  if (!uiRef.value) return;
  try {
    let template: Template = getBlankTemplate();
    const templateIdFromQuery = route.query.template as string | undefined;
    if (templateIdFromQuery) {
      router.replace({ query: { ...route.query, template: undefined } });
    }

    if (templateIdFromQuery) {
      const templateJson = await getTemplateById(templateIdFromQuery);
      checkTemplate(templateJson);
      template = templateJson;
      if (!pdfStore.template) {
        pdfStore.setTemplateAndInputs(templateJson, []);
      }
    } else if (pdfStore.template) {
      checkTemplate(pdfStore.template);
      template = pdfStore.template;
    }

    let inputs = getInputFromTemplate(template);
    if (pdfStore.inputs) {
      inputs = pdfStore.inputs;
    }

    ui = new (m === 'form' ? Form : Viewer)({
      domContainer: uiRef.value,
      template,
      inputs,
      options: {
        font: getFontsData(),
        lang: 'en',
        theme: {
          token: {
            colorPrimary: '#25c2a0',
          },
        },
      },
      plugins: getPlugins(),
    });
  } catch {
    pdfStore.clear();
  }
}

function onChangeMode(e: Event) {
  const target = e.target as HTMLInputElement;
  const value = target.value as Mode;
  mode.value = value;
  localStorage.setItem('mode', value);
  ui?.destroy();
  buildUi(value);
}

function onGetInputs() {
  if (ui) {
    const inputs = ui.getInputs();
    toast.info('Dumped as console.log');
    console.log(inputs);
  }
}

function onSetInputs() {
  if (ui) {
    const prompt = window.prompt('Enter Inputs JSONString') || '';
    try {
      const json = isJsonString(prompt) ? JSON.parse(prompt) : [{}];
      ui.setInputs(json);
    } catch (e) {
      alert(e);
    }
  }
}

function onSaveInputs() {
  if (ui) {
    const inputs = ui.getInputs();
    pdfStore.inputs = inputs;
    toast.success('Saved inputs');
  }
}

function onResetInputs() {
  pdfStore.inputs = null;
  if (ui) {
    const template = ui.getTemplate();
    ui.setInputs(getInputFromTemplate(template));
  }
}

function onChangeLang(e: Event) {
  const target = e.target as HTMLSelectElement;
  ui?.updateOptions({ lang: target.value as Lang });
}

function onLoadTemplate(e: Event) {
  handleLoadTemplate(e, ui);
}

async function onGeneratePDF() {
  const startTimer = performance.now();
  await generatePDF(ui);
  const endTimer = performance.now();
  toast.info(`Generated PDF in ${Math.round(endTimer - startTimer)}ms ⚡️`);
}

const navItems = [
  { label: 'Lang' },
  { label: 'Mode' },
  { label: 'Load Template' },
  { label: '' },
  { label: '' },
  { label: '' },
  { label: '' },
];

onMounted(() => {
  buildUi(mode.value);
});

onUnmounted(() => {
  ui?.destroy();
});
</script>

<template>
  <PdfmeNavBar :items="navItems">
    <template #item-0>
      <select
        class="w-full border rounded px-2 py-1"
        @change="onChangeLang"
      >
        <option v-for="t in translations" :key="t.value" :value="t.value">
          {{ t.label }}
        </option>
      </select>
    </template>

    <template #item-1>
      <div class="mt-2">
        <input
          type="radio"
          id="form"
          value="form"
          :checked="mode === 'form'"
          @change="onChangeMode"
        />
        <label for="form" class="mr-2"> Form </label>
        <input
          type="radio"
          id="viewer"
          value="viewer"
          :checked="mode === 'viewer'"
          @change="onChangeMode"
        />
        <label for="viewer"> Viewer </label>
      </div>
    </template>

    <template #item-2>
      <input
        type="file"
        accept="application/json"
        @change="onLoadTemplate"
        class="w-full text-sm border rounded"
      />
    </template>

    <template #item-3>
      <div class="flex gap-2">
        <button
          class="px-2 py-1 border rounded hover:bg-gray-100"
          @click="onGetInputs"
        >
          Get Inputs
        </button>
        <button
          class="px-2 py-1 border rounded hover:bg-gray-100"
          @click="onSetInputs"
        >
          Set Inputs
        </button>
      </div>
    </template>

    <template #item-4>
      <div class="flex gap-2">
        <button
          class="px-2 py-1 border rounded hover:bg-gray-100"
          @click="onSaveInputs"
        >
          Save Inputs
        </button>
        <button
          class="px-2 py-1 border rounded hover:bg-gray-100"
          @click="onResetInputs"
        >
          Reset Inputs
        </button>
      </div>
    </template>

    <template #item-5>
      <button
        id="generate-pdf"
        class="px-2 py-1 border rounded hover:bg-gray-100"
        @click="onGeneratePDF"
      >
        Generate PDF
      </button>
    </template>

  </PdfmeNavBar>
  <div ref="uiRef" class="flex-1 w-full h-full" />
</template>

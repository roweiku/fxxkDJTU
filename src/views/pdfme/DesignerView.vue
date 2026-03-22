<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { cloneDeep, Template, checkTemplate, Lang, isBlankPdf } from '@pdfme/common';
import { Designer } from '@pdfme/ui';
import {
  getFontsData,
  getTemplateById,
  getBlankTemplate,
  readFile,
  handleLoadTemplate,
  generatePDF,
  downloadJsonFile,
  translations,
} from '@/lib/pdfme/helper';
import { getPlugins } from '@/lib/pdfme/plugins';
import PdfmeNavBar from '@/components/pdfme/PdfmeNavBar.vue';

const toast = useToast();
const route = useRoute();
const router = useRouter();

const designerRef = ref<HTMLDivElement | null>(null);
let designer: Designer | null = null;

const editingStaticSchemas = ref(false);
let originalTemplate: Template | null = null;

async function buildDesigner() {
  if (!designerRef.value) return;
  try {
    let template: Template = getBlankTemplate();
    const templateIdFromQuery = route.query.template as string | undefined;
    if (templateIdFromQuery) {
      router.replace({ query: { ...route.query, template: undefined } });
    }
    const templateFromLocal = localStorage.getItem('template');

    if (templateIdFromQuery) {
      const templateJson = await getTemplateById(templateIdFromQuery);
      checkTemplate(templateJson);
      template = templateJson;
      if (!templateFromLocal) {
        localStorage.setItem('template', JSON.stringify(templateJson));
      }
    } else if (templateFromLocal) {
      const templateJson = JSON.parse(templateFromLocal) as Template;
      checkTemplate(templateJson);
      template = templateJson;
    }

    designer = new Designer({
      domContainer: designerRef.value,
      template,
      options: {
        font: getFontsData(),
        lang: 'en',
        theme: {
          token: { colorPrimary: '#25c2a0' },
        },
        icons: {
          multiVariableText:
            '<svg fill="#000000" width="24px" height="24px" viewBox="0 0 24 24"><path d="M6.643,13.072,17.414,2.3a1.027,1.027,0,0,1,1.452,0L20.7,4.134a1.027,1.027,0,0,1,0,1.452L9.928,16.357,5,18ZM21,20H3a1,1,0,0,0,0,2H21a1,1,0,0,0,0-2Z"/></svg>',
        },
        maxZoom: 250,
      },
      plugins: getPlugins(),
    });
    designer.onSaveTemplate(onSaveTemplate);
  } catch (error) {
    localStorage.removeItem('template');
    console.error(error);
  }
}

function onChangeBasePDF(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files?.[0]) {
    readFile(target.files[0], 'dataURL').then(async (basePdf) => {
      if (designer) {
        const newTemplate = cloneDeep(designer.getTemplate());
        newTemplate.basePdf = basePdf;
        designer.updateTemplate(newTemplate);
      }
    });
  }
}

function onDownloadTemplate() {
  if (designer) {
    downloadJsonFile(designer.getTemplate(), 'template');
    toast.success('Template downloaded!');
  }
}

function onSaveTemplate(template?: Template) {
  if (designer) {
    localStorage.setItem(
      'template',
      JSON.stringify(template || designer.getTemplate())
    );
    toast.success('Saved on local storage');
  }
}

function onResetTemplate() {
  localStorage.removeItem('template');
  if (designer) {
    designer.updateTemplate(getBlankTemplate());
  }
}

function toggleEditingStaticSchemas() {
  if (!designer) return;

  if (!editingStaticSchemas.value) {
    const currentTemplate = cloneDeep(designer.getTemplate());
    if (!isBlankPdf(currentTemplate.basePdf)) {
      toast.error('The current template cannot edit the static schema.');
      return;
    }

    originalTemplate = currentTemplate;

    const { width, height } = currentTemplate.basePdf;
    const staticSchema = currentTemplate.basePdf.staticSchema || [];
    designer.updateTemplate({
      ...currentTemplate,
      schemas: [staticSchema],
      basePdf: { width, height, padding: [0, 0, 0, 0] },
    });

    editingStaticSchemas.value = true;
  } else {
    const editedTemplate = designer.getTemplate();
    if (!originalTemplate) return;
    const merged = cloneDeep(originalTemplate);
    if (!isBlankPdf(merged.basePdf)) {
      toast.error('Invalid basePdf format');
      return;
    }

    merged.basePdf.staticSchema = editedTemplate.schemas[0];
    designer.updateTemplate(merged);

    originalTemplate = null;
    editingStaticSchemas.value = false;
  }
}

function onChangeLang(e: Event) {
  const target = e.target as HTMLSelectElement;
  designer?.updateOptions({ lang: target.value as Lang });
}

function onLoadTemplate(e: Event) {
  handleLoadTemplate(e, designer);
}

async function onGeneratePDF() {
  const startTimer = performance.now();
  await generatePDF(designer);
  const endTimer = performance.now();
  toast.info(`Generated PDF in ${Math.round(endTimer - startTimer)}ms ⚡️`);
}

const navItems = [
  { label: 'Lang' },
  { label: 'Change BasePDF' },
  { label: 'Load Template' },
  { label: 'Edit static schema' },
  { label: '' },
  { label: '' },
  { label: '' },
];

onMounted(() => {
  buildDesigner();
});

onUnmounted(() => {
  designer?.destroy();
});
</script>

<template>
  <PdfmeNavBar :items="navItems">
    <template #item-0>
      <select
        :disabled="editingStaticSchemas"
        :class="['w-full border rounded px-2 py-1', editingStaticSchemas ? 'opacity-50 cursor-not-allowed' : '']"
        @change="onChangeLang"
      >
        <option v-for="t in translations" :key="t.value" :value="t.value">
          {{ t.label }}
        </option>
      </select>
    </template>

    <template #item-1>
      <input
        :disabled="editingStaticSchemas"
        type="file"
        accept="application/pdf"
        :class="['w-full text-sm border rounded', editingStaticSchemas ? 'opacity-50 cursor-not-allowed' : '']"
        @change="onChangeBasePDF"
      />
    </template>

    <template #item-2>
      <input
        :disabled="editingStaticSchemas"
        type="file"
        accept="application/json"
        :class="['w-full text-sm border rounded', editingStaticSchemas ? 'opacity-50 cursor-not-allowed' : '']"
        @change="onLoadTemplate"
      />
    </template>

    <template #item-3>
      <button
        class="px-2 py-1 border rounded hover:bg-gray-100 w-full disabled:opacity-50 disabled:cursor-not-allowed"
        @click="toggleEditingStaticSchemas"
      >
        {{ editingStaticSchemas ? 'End editing' : 'Start editing' }}
      </button>
    </template>

    <template #item-4>
      <div class="flex gap-2">
        <button
          id="save-local"
          :disabled="editingStaticSchemas"
          :class="['px-2 py-1 border rounded hover:bg-gray-100 w-full', editingStaticSchemas ? 'opacity-50 cursor-not-allowed' : '']"
          @click="onSaveTemplate()"
        >
          Save Local
        </button>
        <button
          id="reset-template"
          :disabled="editingStaticSchemas"
          :class="['px-2 py-1 border rounded hover:bg-gray-100 w-full', editingStaticSchemas ? 'opacity-50 cursor-not-allowed' : '']"
          @click="onResetTemplate"
        >
          Reset
        </button>
      </div>
    </template>

    <template #item-5>
      <div class="flex gap-2">
        <button
          :disabled="editingStaticSchemas"
          :class="['px-2 py-1 border rounded hover:bg-gray-100 w-full', editingStaticSchemas ? 'opacity-50 cursor-not-allowed' : '']"
          @click="onDownloadTemplate"
        >
          DL Template
        </button>
        <button
          id="generate-pdf"
          :disabled="editingStaticSchemas"
          :class="['px-2 py-1 border rounded hover:bg-gray-100 w-full', editingStaticSchemas ? 'opacity-50 cursor-not-allowed' : '']"
          @click="onGeneratePDF"
        >
          Generate PDF
        </button>
      </div>
    </template>

  </PdfmeNavBar>
  <div ref="designerRef" class="flex-1 w-full h-full" />
</template>

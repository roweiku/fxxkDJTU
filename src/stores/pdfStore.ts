import { shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { Template } from '@pdfme/common';

export const usePdfStore = defineStore('pdf', () => {
  const template = shallowRef<Template | null>(null);
  const inputs = shallowRef<Record<string, string>[] | null>(null);

  function setTemplateAndInputs(t: Template, i: Record<string, string>[]) {
    template.value = t;
    inputs.value = i;
  }

  function clear() {
    template.value = null;
    inputs.value = null;
  }

  return { template, inputs, setTemplateAndInputs, clear };
});

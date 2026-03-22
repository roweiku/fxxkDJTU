<template>
  <div class="inline-flex items-center min-w-0">
    <Input
      v-if="editing"
      ref="inputRef"
      :model-value="draft"
      class="h-6 text-sm px-1 w-full"
      :type="type === 'number' ? 'number' : 'text'"
      @update:model-value="draft = String($event)"
      @blur="commit"
      @keydown.enter="commit"
      @keydown.escape="cancel"
    />
    <span
      v-else
      class="cursor-pointer hover:underline truncate"
      :class="$attrs.class"
      @click="startEdit"
    >
      <template v-if="value != null">
        {{ prefix }}{{ value }}
      </template>
      <span v-else class="text-muted-foreground/50 italic">(空)</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { Input } from '@/components/ui/input';

const props = withDefaults(
  defineProps<{
    value: string | number | null | undefined;
    type?: 'text' | 'number';
    prefix?: string;
  }>(),
  { type: 'text', prefix: '' },
);

const emit = defineEmits<{
  save: [value: string];
}>();

defineOptions({ inheritAttrs: false });

const editing = ref(false);
const draft = ref('');
const inputRef = ref<InstanceType<typeof Input> | null>(null);

function startEdit() {
  draft.value = props.value != null ? String(props.value) : '';
  editing.value = true;
  nextTick(() => {
    const el = inputRef.value?.$el?.querySelector?.('input') ?? inputRef.value?.$el;
    el?.focus?.();
  });
}

function commit() {
  if (!editing.value) return;
  editing.value = false;
  emit('save', draft.value);
}

function cancel() {
  editing.value = false;
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => !v && emit('cancel')">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>字段冲突</DialogTitle>
        <DialogDescription>
          以下字段在不同来源中有不同值，请为每个字段选择保留值。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div v-for="c in conflicts" :key="c.field" class="space-y-1.5">
          <label class="text-sm font-medium">{{ c.label }}</label>
          <div class="space-y-1">
            <label
              v-for="(v, i) in c.values"
              :key="i"
              class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
              :class="selections[c.field] === i ? 'border-primary bg-primary/5' : ''"
            >
              <input
                type="radio"
                :name="c.field"
                :checked="selections[c.field] === i"
                class="accent-primary"
                @change="selections[c.field] = i"
              />
              <SourceIcon :source="v.source" size="sm" />
              <span class="font-mono">{{ formatValue(v.value) }}</span>
            </label>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('cancel')">取消</Button>
        <Button :disabled="!allSelected" @click="onConfirm">确认合并</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import SourceIcon from './SourceIcon.vue';
import type { FieldConflict } from '@/types/match';

const props = defineProps<{
  open: boolean;
  conflicts: FieldConflict[];
}>();

const emit = defineEmits<{
  cancel: [];
  resolve: [resolved: Record<string, string | number>];
}>();

const selections = reactive<Record<string, number>>({});

// 每次打开时重置选择
watch(() => props.open, (val) => {
  if (val) {
    for (const key of Object.keys(selections)) {
      delete selections[key];
    }
  }
});

const allSelected = computed(() =>
  props.conflicts.every((c) => selections[c.field] !== undefined),
);

function formatValue(v: string | number): string {
  return typeof v === 'number' ? `¥${v}` : String(v);
}

function onConfirm() {
  const resolved: Record<string, string | number> = {};
  for (const c of props.conflicts) {
    const idx = selections[c.field];
    if (idx !== undefined) {
      resolved[c.field] = c.values[idx].value;
    }
  }
  emit('resolve', resolved);
}
</script>

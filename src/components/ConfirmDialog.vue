<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">{{ description }}</DialogDescription>
      </DialogHeader>

      <div v-if="items.length > 0" class="max-h-48 overflow-y-auto space-y-1 text-sm">
        <div
          v-for="(item, idx) in items"
          :key="idx"
          class="flex items-center gap-2 rounded px-2 py-1 bg-muted/50"
        >
          <span>{{ item.icon }}</span>
          <span class="truncate">{{ item.label }}</span>
          <span class="ml-auto text-muted-foreground">{{ item.count }} 个</span>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button variant="outline" @click="$emit('update:open', false)">取消</Button>
        <Button @click="$emit('confirm')">{{ confirmText }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmItem {
  icon: string;
  label: string;
  count: number;
}

withDefaults(defineProps<{
  open: boolean;
  title: string;
  description?: string;
  items?: ConfirmItem[];
  confirmText?: string;
}>(), {
  items: () => [],
  confirmText: '确认',
});

defineEmits<{
  'update:open': [value: boolean];
  'confirm': [];
}>();
</script>

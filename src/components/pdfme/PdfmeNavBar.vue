<script setup lang="ts">
import { ref } from 'vue';
import { Menu, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

export type NavItem = {
  label: string;
};

defineProps<{
  items: NavItem[];
}>();

const mobileMenuOpen = ref(false);
</script>

<template>
  <nav class="border-b bg-white">
    <div class="mx-auto px-2">
      <div class="relative flex h-16 items-center justify-between">
        <div class="flex flex-1 items-center justify-start sm:items-stretch sm:justify-start">
          <div class="hidden sm:block">
            <div
              class="grid gap-4 text-sm items-end justify-items-center"
              :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }"
            >
              <div v-for="(item, index) in items" :key="item.label || String(index)">
                <label class="block mb-1 font-medium text-gray-700">{{ item.label }}</label>
                <slot :name="`item-${index}`" />
              </div>
            </div>
          </div>
        </div>

        <div class="absolute inset-y-0 right-0 flex items-center sm:hidden">
          <Button
            variant="outline"
            size="icon"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <span class="sr-only">Open main menu</span>
            <X v-if="mobileMenuOpen" class="block h-4 w-4" aria-hidden="true" />
            <Menu v-else class="block h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>

    <div v-if="mobileMenuOpen" class="sm:hidden border-t bg-white z-10 w-full absolute">
      <div class="px-2 pt-2 pb-3 space-y-2 text-sm shadow-md rounded-md bg-white">
        <div
          v-for="(item, index) in items"
          :key="item.label || String(index)"
          class="flex flex-col border-b border-gray-200 py-2"
        >
          <span class="block mb-1">{{ item.label }}</span>
          <slot :name="`item-${index}`" />
        </div>
      </div>
    </div>
  </nav>
</template>

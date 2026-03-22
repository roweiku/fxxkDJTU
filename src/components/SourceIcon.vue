<template>
  <img
    v-if="source === 'taobao'"
    :src="taobaoSvg"
    alt="淘宝"
    :class="iconClass"
  />
  <img
    v-else-if="source === 'alipay'"
    :src="alipaySvg"
    alt="支付宝"
    :class="iconClass"
  />
  <Receipt v-else :class="iconClass" class="text-muted-foreground" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Receipt } from 'lucide-vue-next';
import taobaoSvg from '@/assets/taobao.svg';
import alipaySvg from '@/assets/alipay.svg';
import type { ReviewSource } from '@/types/match';

const props = withDefaults(
  defineProps<{
    source: ReviewSource;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { size: 'md' },
);

const iconClass = computed(() => {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
  return sizeMap[props.size];
});
</script>

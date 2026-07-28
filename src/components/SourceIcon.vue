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
  <Fish
    v-else-if="source === 'xianyu'"
    :class="iconClass"
    class="text-orange-500"
    aria-label="闲鱼"
  />
  <ShoppingCart
    v-else-if="source === 'jd'"
    :class="iconClass"
    class="text-red-600"
    aria-label="京东"
  />
  <Landmark
    v-else-if="source === 'bank'"
    :class="iconClass"
    class="text-blue-600"
    aria-label="银行交易明细"
  />
  <Store
    v-else-if="source === 'meituan'"
    :class="iconClass"
    class="text-yellow-500"
    aria-label="美团订单"
  />
  <WalletCards
    v-else-if="source === 'meituan_pay'"
    :class="iconClass"
    class="text-yellow-600"
    aria-label="美团账单"
  />
  <Receipt v-else :class="iconClass" class="text-muted-foreground" aria-label="发票" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Fish,
  Landmark,
  Receipt,
  ShoppingCart,
  Store,
  WalletCards,
} from 'lucide-vue-next';
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

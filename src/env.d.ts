/// <reference types="vite/client" />

// Pinia persist plugin type augmentation
import 'pinia';
declare module 'pinia' {
  export interface DefineStoreOptionsBase<S, Store> {
    persist?: any;
  }
}

declare module 'pinia-plugin-persistedstate';

import { createRouter, createWebHistory } from 'vue-router';
import BatchOcr from '@/components/BatchOcr.vue';
import Settings from '@/views/Settings.vue';
import DesignerView from '@/views/pdfme/DesignerView.vue';
import FormAndViewerView from '@/views/pdfme/FormAndViewerView.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: BatchOcr,
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
  },
  {
    path: '/pdfme/designer',
    name: 'PdfmeDesigner',
    component: DesignerView,
  },
  {
    path: '/pdfme/form-viewer',
    name: 'PdfmeFormViewer',
    component: FormAndViewerView,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

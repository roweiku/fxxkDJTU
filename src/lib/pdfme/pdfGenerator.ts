import { readFile } from '@tauri-apps/plugin-fs';
import { Template, checkTemplate } from '@pdfme/common';
import type { MatchGroup } from '@/types/match';

/** 可用模板 key */
type TemplateKey = '1pdf1img' | '1pdf2img' | '3pdf1img';

/** 模板字段与数据的映射描述 */
interface FieldMapping {
  /** 模板 schema field name → 数据源 */
  fieldName: string;
  type: 'pdf' | 'image';
  /** embeddedPdfPage 的 pageIndex */
  pageIndex?: number;
  /** ocrEntry 索引 */
  ocrEntryIndex?: number;
  /** 'taobao' | 'alipay' */
  ocrSource?: 'taobao' | 'alipay';
}

/** 每个模板 key 对应的字段映射 */
const TEMPLATE_FIELD_MAPS: Record<TemplateKey, FieldMapping[]> = {
  '1pdf1img': [
    { fieldName: 'field1', type: 'pdf', pageIndex: 0 },
    { fieldName: 'field2', type: 'image', ocrEntryIndex: 0, ocrSource: 'taobao' },
    { fieldName: 'field3', type: 'image', ocrEntryIndex: 0, ocrSource: 'alipay' },
  ],
  '1pdf2img': [
    { fieldName: 'field1', type: 'pdf', pageIndex: 0 },
    { fieldName: 'field2', type: 'image', ocrEntryIndex: 0, ocrSource: 'taobao' },
    { fieldName: 'field3', type: 'image', ocrEntryIndex: 0, ocrSource: 'alipay' },
    { fieldName: 'field4', type: 'image', ocrEntryIndex: 1, ocrSource: 'taobao' },
    { fieldName: 'field5', type: 'image', ocrEntryIndex: 1, ocrSource: 'alipay' },
  ],
  '3pdf1img': [
    { fieldName: 'field1', type: 'pdf', pageIndex: 0 },
    { fieldName: 'field2', type: 'image', ocrEntryIndex: 0, ocrSource: 'taobao' },
    { fieldName: 'field3', type: 'image', ocrEntryIndex: 0, ocrSource: 'alipay' },
    { fieldName: 'field4', type: 'pdf', pageIndex: 1 },
    { fieldName: 'field5', type: 'pdf', pageIndex: 2 },
  ],
};

export interface PdfGenerationResult {
  template: Template;
  inputs: Record<string, string>[];
  skippedGroups: string[];
}

/**
 * 根据发票 PDF 页数和 OcrEntry 数量选择模板
 */
export function selectTemplate(pageCount: number, ocrEntryCount: number): TemplateKey | null {
  if (pageCount >= 2 && ocrEntryCount === 1) return '3pdf1img';
  if (pageCount === 1 && ocrEntryCount === 1) return '1pdf1img';
  if (pageCount === 1 && ocrEntryCount === 2) return '1pdf2img';
  return null;
}

/**
 * 读取文件并转为 data URI (base64)
 */
async function readFileAsDataUri(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  let mime: string;
  if (ext === 'pdf') mime = 'application/pdf';
  else if (ext === 'png') mime = 'image/png';
  else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
  else if (ext === 'bmp') mime = 'image/bmp';
  else if (ext === 'webp') mime = 'image/webp';
  else mime = 'application/octet-stream';

  const binary = Array.from(new Uint8Array(bytes)).map(b => String.fromCharCode(b)).join('');
  const base64 = btoa(binary);
  return `data:${mime};base64,${base64}`;
}

/**
 * 加载模板 JSON
 */
async function loadTemplate(key: TemplateKey): Promise<Template> {
  const resp = await fetch(`/template-assets/${key}/template.json`);
  if (!resp.ok) throw new Error(`Failed to load template: ${key}`);
  const template = await resp.json() as Template;
  checkTemplate(template);
  return template;
}

/**
 * 为单个匹配组构建 pdfme inputs
 */
async function buildInputForGroup(
  group: MatchGroup,
  key: TemplateKey,
): Promise<Record<string, string>> {
  const mappings = TEMPLATE_FIELD_MAPS[key];
  const input: Record<string, string> = {};

  for (const m of mappings) {
    if (m.type === 'pdf') {
      const invoicePath = group.invoiceEntry?.invoice.filePath;
      if (invoicePath) {
        input[m.fieldName] = await readFileAsDataUri(invoicePath);
      }
    } else if (m.type === 'image') {
      const entry = group.ocrEntries[m.ocrEntryIndex ?? 0];
      if (!entry) continue;
      const item = m.ocrSource === 'taobao' ? entry.taobao : entry.alipay;
      if (item?.filePath) {
        input[m.fieldName] = await readFileAsDataUri(item.filePath);
      }
    }
  }

  return input;
}

/**
 * 从成功匹配组列表生成合并的 pdfme Template + inputs
 */
export async function generateFromGroups(
  groups: MatchGroup[],
): Promise<PdfGenerationResult> {
  const skippedGroups: string[] = [];
  const allSchemas: Template['schemas'] = [];
  const mergedInput: Record<string, string> = {};

  // 缓存已加载的模板
  const templateCache = new Map<TemplateKey, Template>();

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];

    // 确定发票页数
    const pageCount = group.invoiceEntry?.invoice.pageCount ?? 1;
    const ocrEntryCount = group.ocrEntries.length;
    const key = selectTemplate(pageCount, ocrEntryCount);

    if (!key) {
      skippedGroups.push(group.id);
      continue;
    }

    // 加载模板（带缓存）
    if (!templateCache.has(key)) {
      templateCache.set(key, await loadTemplate(key));
    }
    const template = templateCache.get(key)!;

    // 为当前组的字段名添加前缀以避免冲突
    const prefix = `g${gi}_`;
    for (const schemaPage of template.schemas) {
      const renamedPage = (schemaPage as Array<{ name: string; [k: string]: unknown }>).map(
        field => ({ ...field, name: prefix + field.name }),
      );
      allSchemas.push(renamedPage as Template['schemas'][number]);
    }

    // 构建 inputs 并重命名 key
    const rawInput = await buildInputForGroup(group, key);
    for (const [k, v] of Object.entries(rawInput)) {
      mergedInput[prefix + k] = v;
    }
  }

  // 使用第一个模板的 basePdf 作为合并模板的 basePdf
  const firstTemplate = templateCache.values().next().value;
  const basePdf = firstTemplate?.basePdf ?? {
    width: 297,
    height: 210,
    padding: [20, 10, 20, 10],
  };

  const mergedTemplate: Template = {
    schemas: allSchemas,
    basePdf,
    pdfmeVersion: '5.5.8',
  };

  return { template: mergedTemplate, inputs: [mergedInput], skippedGroups };
}

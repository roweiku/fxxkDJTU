import { describe, it, expect } from 'vitest';
import { selectTemplate } from './pdfGenerator';

describe('selectTemplate', () => {
  it('选择 1pdf1img 当 ocrEntryCount=1', () => {
    expect(selectTemplate(1, 1)).toBe('1pdf1img');
    expect(selectTemplate(3, 1)).toBe('1pdf1img');
  });

  it('选择 1pdf2img 当 ocrEntryCount=2', () => {
    expect(selectTemplate(1, 2)).toBe('1pdf2img');
    expect(selectTemplate(2, 2)).toBe('1pdf2img');
  });

  it('返回 null 当 ocrEntryCount 无匹配', () => {
    expect(selectTemplate(1, 0)).toBeNull();
    expect(selectTemplate(1, 3)).toBeNull();
  });
});

/**
 * embeddedPdfPage cache key 碰撞测试
 *
 * 模拟 pdfme schemas 中 getCacheKey 的逻辑，验证不同 PDF
 * 不会因为共享 header 而产生相同的 cache key。
 */
describe('embeddedPdfPage cache key uniqueness', () => {
  const oldCacheKey = (type: string, pageIndex: number, input: string) =>
    `${type}_${pageIndex}_${input.slice(0, 64)}`;

  const newCacheKey = (type: string, pageIndex: number, input: string) =>
    `${type}_${pageIndex}_${input.length}_${input.slice(0, 64)}_${input.slice(-64)}`;

  const commonPrefix = 'data:application/pdf;base64,JVBERi0xLjcKJeLjz9MKMSAwIG9iag0KPDY2Njc3OA';
  const pdfA = commonPrefix + 'AAAA'.repeat(100) + 'uniqueEndingA';
  const pdfB = commonPrefix + 'BBBB'.repeat(100) + 'uniqueEndingB';

  it('旧 cache key 会碰撞（同一 pageIndex + 相同 header → 相同 key）', () => {
    const keyA = oldCacheKey('embeddedPdfPage', 0, pdfA);
    const keyB = oldCacheKey('embeddedPdfPage', 0, pdfB);
    expect(keyA).toBe(keyB);
  });

  it('新 cache key 不碰撞（length + tail 区分不同 PDF）', () => {
    const keyA = newCacheKey('embeddedPdfPage', 0, pdfA);
    const keyB = newCacheKey('embeddedPdfPage', 0, pdfB);
    expect(keyA).not.toBe(keyB);
  });

  it('新 cache key 对同一 PDF 不同页仍可区分', () => {
    const key0 = newCacheKey('embeddedPdfPage', 0, pdfA);
    const key1 = newCacheKey('embeddedPdfPage', 1, pdfA);
    expect(key0).not.toBe(key1);
  });

  it('新 cache key 对完全相同的输入产生相同 key（缓存命中）', () => {
    const key1 = newCacheKey('embeddedPdfPage', 0, pdfA);
    const key2 = newCacheKey('embeddedPdfPage', 0, pdfA);
    expect(key1).toBe(key2);
  });
});

/**
 * Schema prefix 隔离测试
 */
describe('schema prefix isolation', () => {
  it('不同组使用不同 prefix 避免 field name 冲突', () => {
    const groups = [0, 1, 2];
    const fieldNames = ['field1', 'field2', 'field3'];
    const allNames: string[] = [];

    for (const gi of groups) {
      const prefix = `g${gi}_`;
      for (const name of fieldNames) {
        allNames.push(prefix + name);
      }
    }

    expect(new Set(allNames).size).toBe(allNames.length);
    expect(allNames[0]).toBe('g0_field1');
    expect(allNames[3]).toBe('g1_field1');
    expect(allNames[6]).toBe('g2_field1');
  });
});

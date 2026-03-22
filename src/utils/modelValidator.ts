/**
 * 模型文件分类工具
 * 根据文件名关键词将模型文件分类为 det/rec/charset
 */

import { resolveResource } from '@tauri-apps/api/path';
import type { ModelConfig } from '@/types/ocr';

/**
 * 获取模型目录路径（支持开发和生产环境）
 * - 开发环境：src-tauri/models
 * - 生产环境：$RESOURCE/models
 */
export async function getModelsDirectory(): Promise<string> {
  const modelsPath = await resolveResource('models');
  console.log('[ModelValidator] 模型目录路径:', modelsPath);
  return modelsPath;
}

export interface ClassifiedModels {
  detModels: string[];
  recModels: string[];
  charsets: string[];
}

/**
 * 将模型文件列表分类
 * @param filePaths 完整路径数组
 * @returns 分类后的模型对象（包含完整路径）
 */
export function classifyModelFiles(filePaths: string[]): ClassifiedModels {
  console.log('[ModelValidator] 开始分类，输入文件数:', filePaths.length);
  const detModels: string[] = [];
  const recModels: string[] = [];
  const charsets: string[] = [];

  filePaths.forEach(fullPath => {
    const fileName = fullPath.split('/').pop()!;
    const lower = fileName.toLowerCase();
    console.log('[ModelValidator] 分类文件:', { fullPath, fileName, lower });
    
    // 检测模型：包含"det" + .mnn扩展名
    if (lower.includes('det') && lower.endsWith('.mnn')) {
      console.log('[ModelValidator] → Det 模型');
      detModels.push(fullPath);
    } 
    // 识别模型：包含"rec" + .mnn扩展名
    else if (lower.includes('rec') && lower.endsWith('.mnn')) {
      console.log('[ModelValidator] → Rec 模型');
      recModels.push(fullPath);
    } 
    // 字符集：.txt扩展名
    else if (lower.endsWith('.txt')) {
      console.log('[ModelValidator] → Charset');
      charsets.push(fullPath);
    } else {
      console.log('[ModelValidator] → 未匹配');
    }
  });

  // 按字母顺序排序
  detModels.sort();
  recModels.sort();
  charsets.sort();

  const result = { detModels, recModels, charsets };
  console.log('[ModelValidator] 分类完成:', result);
  return result;
}

/**
 * 获取默认配置（异步，动态解析路径）
 */
export async function getDefaultConfig(): Promise<ModelConfig> {
  const modelsDir = await getModelsDirectory();
  return {
    det_model: `${modelsDir}/PP-OCRv5_mobile_det.mnn`,
    rec_model: `${modelsDir}/PP-OCRv5_mobile_rec.mnn`,
    charset: `${modelsDir}/ppocr_keys_v5.txt`,
  };
}

/**
 * 验证模型配置是否有效
 * @param detModel 检测模型文件名
 * @param recModel 识别模型文件名
 * @param charset 字符集文件名
 * @returns 是否有效
 */
export function isValidModelConfig(
  detModel: string,
  recModel: string,
  charset: string
): boolean {
  const detValid = detModel.toLowerCase().includes('det') && detModel.toLowerCase().endsWith('.mnn');
  const recValid = recModel.toLowerCase().includes('rec') && recModel.toLowerCase().endsWith('.mnn');
  const charsetValid = charset.toLowerCase().endsWith('.txt');
  
  return detValid && recValid && charsetValid;
}

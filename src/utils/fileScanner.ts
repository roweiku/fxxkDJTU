import { readDir } from '@tauri-apps/plugin-fs';

export type FileTypeFilter = string[]; // 扩展名数组，如 ['png', 'jpg']

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'PNG', 'JPG', 'JPEG', 'BMP', 'WEBP'];
export const PDF_EXTENSIONS = ['pdf', 'PDF'];
export const MODEL_EXTENSIONS = ['mnn', 'txt'];

/**
 * 扫描目录，返回符合过滤条件的文件
 * @param dirPath 目录路径
 * @param extensions 扩展名数组（不区分大小写）
 * @param recursive 是否递归扫描子目录
 * @returns 排序后的文件路径数组
 */
export async function scanDirectory(
  dirPath: string,
  extensions: string[],
  recursive = false
): Promise<string[]> {
  // 移除尾部斜杠
  const normalizedPath = dirPath.replace(/\/$/, '');
  console.log('[FileScanner] 扫描参数:', { dirPath, normalizedPath, extensions, recursive });
  
  const result: string[] = [];
  const lowerExtensions = extensions.map(e => e.toLowerCase().replace(/^\./, ''));
  
  await scanRecursive(normalizedPath, lowerExtensions, recursive, result);
  console.log('[FileScanner] 扫描结果:', result);
  return result.sort();
}

/**
 * 递归扫描目录的内部实现
 */
async function scanRecursive(
  path: string,
  extensions: string[],
  recursive: boolean,
  result: string[]
) {
  try {
    // 如果是单个文件
    if (!path.endsWith('/') && matchesExtension(path, extensions)) {
      console.log('[FileScanner] 单文件匹配:', path);
      result.push(path);
      return;
    }
    
    console.log('[FileScanner] 读取目录:', path);
    const entries = await readDir(path);
    console.log('[FileScanner] 目录条目数:', entries.length);
    
    for (const entry of entries) {
      const fullPath = `${path}/${entry.name}`;
      console.log('[FileScanner] 处理文件:', { name: entry.name, fullPath, isDirectory: entry.isDirectory });
      
      if (entry.isDirectory && recursive) {
        await scanRecursive(fullPath, extensions, true, result);
      } else if (!entry.isDirectory && matchesExtension(entry.name, extensions)) {
        console.log('[FileScanner] ✓ 匹配文件:', fullPath);
        result.push(fullPath);
      }
    }
  } catch (error) {
    console.error('[FileScanner] 读取路径失败:', path, error);
  }
}

/**
 * 检查文件名是否匹配扩展名
 */
function matchesExtension(filename: string, extensions: string[]): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? extensions.includes(ext) : false;
}

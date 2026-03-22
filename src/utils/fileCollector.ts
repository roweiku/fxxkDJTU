import { readDir } from '@tauri-apps/plugin-fs';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'PNG', 'JPG', 'JPEG', 'BMP', 'WEBP'];

/**
 * 检查文件是否为图片
 */
function isImageFile(fileName: string): boolean {
  const ext = fileName.split('.').pop();
  return ext ? IMAGE_EXTENSIONS.includes(ext) : false;
}

/**
 * 递归收集目录中的所有图片文件
 */
export async function collectImageFiles(paths: string[]): Promise<string[]> {
  const imageFiles: string[] = [];
  
  console.debug('[文件遍历] 开始收集图片文件', { paths });
  
  for (const path of paths) {
    await collectImagesRecursive(path, imageFiles);
  }
  
  console.debug('[文件遍历] 收集完成', { 
    totalFiles: imageFiles.length,
    files: imageFiles 
  });
  
  return imageFiles;
}

/**
 * 递归遍历目录
 */
async function collectImagesRecursive(path: string, result: string[]) {
  try {
    // 检查是否为文件
    if (!path.endsWith('/') && isImageFile(path)) {
      console.debug('[文件遍历] 发现图片文件:', path);
      result.push(path);
      return;
    }
    
    // 读取目录
    const entries = await readDir(path);
    
    for (const entry of entries) {
      const fullPath = `${path}/${entry.name}`;
      
      if (entry.isDirectory) {
        // 递归处理子目录
        await collectImagesRecursive(fullPath, result);
      } else if (isImageFile(entry.name)) {
        console.debug('[文件遍历] 发现图片文件:', fullPath);
        result.push(fullPath);
      }
    }
  } catch (error) {
    console.error('[文件遍历] 读取路径失败:', path, error);
    // 继续处理其他路径
  }
}

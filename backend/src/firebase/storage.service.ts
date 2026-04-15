import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from './firebase.service';

@Injectable()
export class StorageService {
  constructor(private readonly firebaseService: FirebaseService) {}
  private readonly logger = new Logger(StorageService.name);

  /**
   * Получает bucket для работы с Firebase Storage
   */
  private async getBucket() {
    const admin = this.firebaseService.getAdmin();
    if (!admin) {
      throw new Error('Firebase not configured');
    }
    const storage = admin.storage();
    const app = admin.app();
    
    let bucketName = app.options.storageBucket || process.env.FIREBASE_STORAGE_BUCKET;
    
    if (!bucketName) {
      const { getFirebaseCredentials } = await import('../config/env-loader');
      const serviceAccount = getFirebaseCredentials();
      if (serviceAccount?.project_id) {
        // Пробуем новый формат сначала (firebasestorage.app), потом старый (appspot.com)
        bucketName = `${serviceAccount.project_id}.firebasestorage.app`;
      }
    }
    
    let bucket;
    if (bucketName) {
      try {
        bucket = storage.bucket(bucketName);
        // Пробуем проверить, но не критично
        try {
          await bucket.getMetadata();
          this.logger.log(`Using bucket: ${bucketName}`);
        } catch (error: any) {
          // Если bucket не найден, используем дефолтный без проверки
          this.logger.warn(`Bucket "${bucketName}" not found, using default bucket without metadata check`);
          bucket = storage.bucket();
          this.logger.log(`Using default bucket: ${bucket.name} (without metadata check)`);
        }
      } catch (error: any) {
        this.logger.warn(`Error getting bucket "${bucketName}", using default: ${error.message}`);
        bucket = storage.bucket();
        this.logger.log(`Using default bucket: ${bucket?.name || 'default'} (without metadata check)`);
      }
    } else {
      bucket = storage.bucket();
      this.logger.log(`Using default bucket: ${bucket?.name || 'default'} (without metadata check)`);
    }
    
    return bucket;
  }

  /**
   * Удаляет файл из Firebase Storage по URL или имени файла
   */
  async deleteFile(fileUrlOrPath: string): Promise<boolean> {
    try {
      if (!fileUrlOrPath) {
        return false;
      }

      const bucket = await this.getBucket();
      
      // Извлекаем путь к файлу из URL или используем как есть
      let filePath: string;
      
      if (fileUrlOrPath.startsWith('http://') || fileUrlOrPath.startsWith('https://')) {
        // Извлекаем путь из URL
        // Пример: https://storage.googleapis.com/bucket-name/path/to/file.jpg
        const urlParts = fileUrlOrPath.split('/');
        const bucketNameIndex = urlParts.findIndex(part => part.includes('.appspot.com') || part.includes('firebasestorage'));
        
        if (bucketNameIndex >= 0 && bucketNameIndex < urlParts.length - 1) {
          // Берем все части после bucket name
          filePath = urlParts.slice(bucketNameIndex + 1).join('/');
          
          // Убираем query параметры если есть
          filePath = filePath.split('?')[0];
          filePath = filePath.split('#')[0];
        } else {
          // Пытаемся извлечь путь другим способом
          const pathMatch = fileUrlOrPath.match(/\/o\/(.+?)(\?|$)/);
          if (pathMatch) {
            filePath = decodeURIComponent(pathMatch[1]);
          } else {
            this.logger.warn(`Could not extract path from URL: ${fileUrlOrPath}`);
            return false;
          }
        }
      } else {
        // Используем как путь напрямую
        filePath = fileUrlOrPath;
      }

      // Удаляем файл
      const fileRef = bucket.file(filePath);
      const [exists] = await fileRef.exists();
      
      if (!exists) {
        this.logger.warn(`File does not exist: ${filePath}`);
        return false;
      }

      await fileRef.delete();
      this.logger.log(`File deleted successfully: ${filePath}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Error deleting file ${fileUrlOrPath}:`, error.message);
      // Не выбрасываем ошибку, чтобы не блокировать удаление записи
      return false;
    }
  }

  /**
   * Удаляет несколько файлов
   */
  async deleteFiles(fileUrlsOrPaths: string[]): Promise<number> {
    if (!fileUrlsOrPaths || fileUrlsOrPaths.length === 0) {
      return 0;
    }

    const results = await Promise.allSettled(
      fileUrlsOrPaths.map(url => this.deleteFile(url))
    );

    const deletedCount = results.filter(
      result => result.status === 'fulfilled' && result.value === true
    ).length;

    this.logger.log(`Deleted ${deletedCount}/${fileUrlsOrPaths.length} files`);
    return deletedCount;
  }

  /**
   * Извлекает путь к файлу из URL Firebase Storage
   */
  extractFilePathFromUrl(url: string): string | null {
    if (!url) return null;

    try {
      // Для signed URLs или прямых URLs
      if (url.includes('storage.googleapis.com')) {
        const urlParts = url.split('/');
        const bucketIndex = urlParts.findIndex(part => 
          part.includes('.appspot.com') || part.includes('firebasestorage')
        );
        
        if (bucketIndex >= 0 && bucketIndex < urlParts.length - 1) {
          let path = urlParts.slice(bucketIndex + 1).join('/');
          path = path.split('?')[0]; // Убираем query params
          path = path.split('#')[0]; // Убираем hash
          return decodeURIComponent(path);
        }
      }

      // Для Firebase Storage API URLs (https://firebasestorage.googleapis.com/...)
      if (url.includes('firebasestorage.googleapis.com')) {
        const match = url.match(/\/o\/(.+?)(\?|$)/);
        if (match) {
          return decodeURIComponent(match[1]);
        }
      }

      return null;
    } catch (error: any) {
      this.logger.warn(`Could not extract path from URL: ${url}`, error.message);
      return null;
    }
  }
}

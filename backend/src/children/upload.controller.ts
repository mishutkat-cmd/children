import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { memoryStorage } from 'multer';
import * as path from 'path';
import { FirebaseService } from '../firebase/firebase.service';
import { getFirebaseCredentials } from '../config/env-loader';

/**
 * Magic-byte signatures for the image MIME types we accept. The client's
 * `Content-Type` header is trusted by multer's fileFilter, but an attacker
 * can label a `.svg` (XSS payload) or `.html` as `image/png` and walk past
 * the filter. We re-check the first ~16 bytes of the buffer here.
 *
 *   JPEG: FF D8 FF
 *   PNG:  89 50 4E 47 0D 0A 1A 0A
 *   GIF:  47 49 46 38 (37|39) 61
 *   WEBP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
 */
function sniffImageMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61
  ) return 'image/gif';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}

/**
 * Strip every character that isn't a-z / A-Z / 0-9 / . / _ / - from the
 * client-supplied filename, drop any directory components, and trim to
 * 80 chars. Forces `.<ext>` to be present (defaults to .bin). The final
 * Storage object key still gets a folder prefix + uuid suffix, so the
 * result here is only the "trailing display name" used in the URL.
 */
function sanitizeFilename(raw: string, fallbackExt: string): string {
  const base = path.basename(raw || '');
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  if (!safe || safe === '.' || safe === '..') return `file.${fallbackExt}`;
  if (!safe.includes('.')) return `${safe}.${fallbackExt}`;
  return safe;
}

const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

@Controller('upload')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARENT')
export class UploadController {
  constructor(private firebaseService: FirebaseService) {}

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Недопустимый тип файла. Разрешены только изображения.'), false);
        }
      },
    }),
  )
  async uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    return this.uploadFile(file, 'avatars');
  }

  @Post('badge')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Недопустимый тип файла. Разрешены только изображения.'), false);
        }
      },
    }),
  )
  async uploadBadge(@UploadedFile() file: Express.Multer.File) {
    return this.uploadFile(file, 'badges');
  }

  @Post('reward')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Недопустимый тип файла. Разрешены только изображения.'), false);
        }
      },
    }),
  )
  async uploadReward(@UploadedFile() file: Express.Multer.File) {
    return this.uploadFile(file, 'rewards');
  }

  @Post('proof')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Недопустимый тип файла. Разрешены только изображения.'), false);
        }
      },
    }),
  )
  async uploadProof(@UploadedFile() file: Express.Multer.File) {
    return this.uploadFile(file, 'proofs');
  }

  @Post('wishlist')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Недопустимый тип файла. Разрешены только изображения.'), false);
        }
      },
    }),
  )
  async uploadWishlist(@UploadedFile() file: Express.Multer.File) {
    return this.uploadFile(file, 'wishlist');
  }

  @Post('character')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Недопустимый тип файла. Разрешены только изображения.'), false);
        }
      },
    }),
  )
  async uploadCharacter(@UploadedFile() file: Express.Multer.File) {
    return this.uploadFile(file, 'characters');
  }

  // Универсальный метод для загрузки файлов в Firebase Storage
  private async uploadFile(file: Express.Multer.File, folder: 'avatars' | 'badges' | 'rewards' | 'proofs' | 'wishlist' | 'characters') {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    try {
      // Проверяем, что Firebase инициализирован
      if (!this.firebaseService.isEnabled()) {
        throw new InternalServerErrorException('Firebase не инициализирован');
      }

      // Получаем Firebase Storage via FirebaseService (no top-level firebase-admin import)
      const admin = this.firebaseService.getAdmin();
      if (!admin) {
        throw new InternalServerErrorException('Firebase не инициализирован');
      }
      const storage = admin.storage();
      const app = admin.app();
      
      // Получаем bucket из конфигурации приложения (установлен при инициализации)
      let bucketName = app.options.storageBucket || process.env.FIREBASE_STORAGE_BUCKET;
      
      // Если bucketName не указан, пытаемся получить из serviceAccount
      if (!bucketName) {
        const serviceAccount = getFirebaseCredentials();
        if (serviceAccount?.project_id) {
          // Пробуем новый формат сначала, потом старый
          bucketName = `${serviceAccount.project_id}.firebasestorage.app`;
        }
      }
      
      // Если bucketName все еще не указан, используем дефолтный bucket без имени
      // Это автоматически выберет дефолтный bucket проекта
      if (!bucketName) {
        console.warn('[UploadController] Bucket не указан, используем дефолтный bucket проекта');
      }
      
      // Получаем bucket - используем дефолтный bucket без проверки метаданных
      // Это позволяет работать даже если bucket еще не создан явно в консоли
      let bucket;
      let actualBucketName: string;
      
      try {
        // Если bucketName указан, пытаемся использовать его
        if (bucketName) {
          bucket = storage.bucket(bucketName);
          actualBucketName = bucketName;
          
          // Пробуем проверить существование, но не критично
          try {
            await bucket.getMetadata();
            console.log(`[UploadController] Используется указанный bucket: ${actualBucketName}`);
          } catch (metadataError: any) {
            // Если bucket не найден, используем дефолтный без проверки
            console.warn(`[UploadController] Bucket "${bucketName}" не найден, используем дефолтный bucket без проверки`);
            bucket = storage.bucket(); // Дефолтный bucket
            actualBucketName = bucket.name;
            console.log(`[UploadController] Используется дефолтный bucket: ${actualBucketName} (без проверки метаданных)`);
          }
        } else {
          // Используем дефолтный bucket без имени - он определяется автоматически
          bucket = storage.bucket();
          actualBucketName = bucket.name;
          console.log(`[UploadController] Используется дефолтный bucket: ${actualBucketName} (без проверки метаданных)`);
        }
      } catch (error: any) {
        // Если все еще ошибка, пробуем самый простой вариант
        console.warn(`[UploadController] Ошибка при получении bucket: ${error.message}, используем дефолтный без проверки`);
        bucket = storage.bucket();
        actualBucketName = bucket?.name || 'default';
      }
      
      // Финальная проверка
      if (!bucket) {
        throw new InternalServerErrorException(
          `Firebase Storage bucket не доступен. Убедитесь, что:\n` +
          `1. Firebase Storage включен в Firebase Console\n` +
          `2. Service Account имеет права доступа к Storage\n` +
          `3. Проект Firebase правильно настроен`
        );
      }
      
      // Defense-in-depth check on the upload payload:
      //   1. Multer's fileFilter already gates on Content-Type, but that
      //      is client-supplied and trivially spoofed (an .svg can claim
      //      to be image/png).
      //   2. Re-check the buffer's magic bytes here. If they don't match
      //      one of our four accepted image types, refuse the upload.
      //   3. Use the SNIFFED mime as the authoritative Content-Type when
      //      we write to Storage, so a successful upload always serves
      //      under the correct type later.
      //   4. Replace the client originalname with a sanitized form: no
      //      path components, allowed chars only, length-capped.
      const sniffed = sniffImageMime(file.buffer);
      if (!sniffed) {
        throw new BadRequestException('Файл не похож на изображение (не прошёл magic-byte проверку).');
      }
      if (!ACCEPTED_MIME.has(file.mimetype) || !ACCEPTED_MIME.has(sniffed)) {
        throw new BadRequestException('Недопустимый тип изображения.');
      }
      const safeOriginalName = sanitizeFilename(file.originalname, MIME_TO_EXT[sniffed] || 'bin');

      // Генерируем уникальное имя файла в соответствующей папке
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const fileName = `${folder}/${folder}-${uniqueSuffix}-${safeOriginalName}`;

      // Загружаем файл в Firebase Storage
      let fileRef = bucket.file(fileName);

      try {
        await fileRef.save(file.buffer, {
          metadata: {
            // Sniffed content type, not the client-supplied one.
            contentType: sniffed,
            cacheControl: 'public, max-age=31536000', // Кеширование на 1 год
          },
        });
        console.log(`[UploadController] Файл успешно загружен: ${fileName} в bucket ${actualBucketName}`);
      } catch (saveError: any) {
        // При 404 (bucket не существует) пробуем legacy bucket: projectId.appspot.com
        const isBucketNotFound = saveError.code === 404 || saveError.message?.includes('bucket') || saveError.message?.includes('not exist');
        if (isBucketNotFound) {
          const serviceAccount = getFirebaseCredentials();
          const projectId = serviceAccount?.project_id;
          const legacyBucketName = projectId ? `${projectId}.appspot.com` : null;
          if (legacyBucketName && bucketName?.endsWith('.firebasestorage.app')) {
            try {
              const legacyBucket = storage.bucket(legacyBucketName);
              await legacyBucket.file(fileName).save(file.buffer, {
                metadata: { contentType: sniffed, cacheControl: 'public, max-age=31536000' },
              });
              if (folder !== 'proofs') {
                try {
                  await legacyBucket.file(fileName).makePublic();
                } catch (_) {}
              }
              console.log(`[UploadController] Файл загружен в legacy bucket: ${legacyBucketName}`);
              actualBucketName = legacyBucketName;
              bucket = legacyBucket;
              fileRef = legacyBucket.file(fileName);
            } catch (legacyErr: any) {
              // Оба варианта не сработали — отдаём инструкции
              throw new InternalServerErrorException(
                `Firebase Storage bucket не существует или недоступен.\n\n` +
                `Ожидаемый bucket: \`childrenevolvenext.firebasestorage.app\` или \`childrenevolvenext.appspot.com\`\n\n` +
                `Для решения:\n` +
                `1. Откройте https://console.firebase.google.com\n` +
                `2. Выберите проект childrenevolvenext\n` +
                `3. Раздел "Storage" → "Get Started" (создайте bucket)\n` +
                `4. Режим "Production", выберите регион\n` +
                `5. Подождите пару минут, перезапустите backend.\n\n` +
                `Ошибка: ${saveError.message}`
              );
            }
          } else {
            throw new InternalServerErrorException(
              `Firebase Storage bucket не существует или недоступен.\n\n` +
              `Ожидаемый bucket: \`childrenevolvenext.firebasestorage.app\`\n\n` +
              `Для решения:\n` +
              `1. Откройте https://console.firebase.google.com\n` +
              `2. Выберите проект childrenevolvenext\n` +
              `3. Раздел "Storage" → "Get Started"\n` +
              `4. Создайте bucket, перезапустите backend.\n\n` +
              `Ошибка: ${saveError.message}`
            );
          }
        } else {
          throw saveError;
        }
      }

      // Делаем файл публично доступным (если правила Storage разрешают)
      // Для proofs не делаем публичным (только для аутентифицированных)
      if (folder !== 'proofs') {
        try {
          await fileRef.makePublic();
          console.log(`[UploadController] File made public successfully: ${fileName}`);
        } catch (error: any) {
          // Если не удалось сделать публичным (например, из-за правил), используем signed URL
          console.warn(`[UploadController] Could not make file public, using signed URL: ${error.message}`);
        }
      }

      // Получаем публичный URL или signed URL
      let fileUrl: string;
      try {
        if (folder === 'proofs') {
          // Для proofs всегда используем signed URL (приватные файлы)
          const [signedUrl] = await fileRef.getSignedUrl({
            action: 'read',
            expires: '03-09-2491', // Далекая дата (максимум для signed URL)
          });
          fileUrl = signedUrl;
        } else {
          // Для остальных типов используем прямой URL (публичные файлы)
          fileUrl = `https://storage.googleapis.com/${actualBucketName}/${fileName}`;
        }
      } catch (error: any) {
        // Если не удалось получить signed URL, используем прямой URL
        fileUrl = `https://storage.googleapis.com/${actualBucketName}/${fileName}`;
        console.log(`[UploadController] Using direct URL: ${fileUrl}`);
      }

      return {
        url: fileUrl,
        filename: fileName,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        folder: folder,
      };
    } catch (error: any) {
      console.error(`[UploadController] Error uploading ${folder} to Firebase Storage:`, error.message);
      console.error('[UploadController] Error stack:', error.stack);
      throw new InternalServerErrorException(`Ошибка при загрузке файла в Firebase Storage: ${error.message}`);
    }
  }
}

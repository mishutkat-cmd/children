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
import { LocalStorageService } from '../files/local-storage.service';

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
  constructor(private storage: LocalStorageService) {}

  @Post('avatar')
  // аватар меняет и ребёнок, и родитель
  @Roles('PARENT', 'CHILD')
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
  // фото-подтверждение задания загружает ребёнок
  @Roles('PARENT', 'CHILD')
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
  // картинку желания добавляет ребёнок
  @Roles('PARENT', 'CHILD')
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
  private async uploadFile(
    file: Express.Multer.File,
    folder: 'avatars' | 'badges' | 'rewards' | 'proofs' | 'wishlist' | 'characters',
  ) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    // Defense-in-depth on the upload payload:
    //   1. Multer's fileFilter already gates on Content-Type, but that is
    //      client-supplied and trivially spoofed (an .svg can claim to be
    //      image/png).
    //   2. Re-check the buffer's magic bytes here. If they don't match one of
    //      our four accepted image types, refuse the upload.
    //   3. Replace the client originalname with a sanitized form: no path
    //      components, allowed characters only, length-capped.
    const sniffed = sniffImageMime(file.buffer);
    if (!sniffed) {
      throw new BadRequestException('Файл не похож на изображение (не прошёл magic-byte проверку).');
    }
    if (!ACCEPTED_MIME.has(file.mimetype) || !ACCEPTED_MIME.has(sniffed)) {
      throw new BadRequestException('Недопустимый тип изображения.');
    }
    const safeOriginalName = sanitizeFilename(file.originalname, MIME_TO_EXT[sniffed] || 'bin');

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const objectPath = `${folder}/${folder}-${uniqueSuffix}-${safeOriginalName}`;

    try {
      // LocalStorageService decides where this lands: public folders go under
      // the web-served root, proofs go outside it and are readable only
      // through the authenticated /api/v1/files route.
      const { url } = await this.storage.save(objectPath, file.buffer);

      return {
        url,
        filename: objectPath,
        originalName: file.originalname,
        size: file.size,
        mimetype: sniffed,
        folder,
      };
    } catch (error: any) {
      console.error(`[UploadController] Error storing ${folder} upload:`, error.message);
      throw new InternalServerErrorException(`Ошибка при сохранении файла: ${error.message}`);
    }
  }
}

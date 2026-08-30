import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { AudioService, DEFAULT_DURATION_SEC } from './audio.service';
import { CreateAudioRequestDto, SetConsentDto } from './dto/audio.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User, RequestUser } from '../common/decorators/user.decorator';

// @Roles на каждом обработчике: RolesGuard читает метаданные и с класса, и с
// метода, но явные роли здесь надёжнее и не дают ребёнку дёрнуть чужой роут.
@Controller('audio')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AudioController {
  constructor(private audioService: AudioService) {}

  /** Ребёнок опрашивает: есть ли обращённый к нему запрос. Объявлен ДО ':id'. */
  @Get('requests/pending')
  @Roles('CHILD')
  pending(@User() user: RequestUser) {
    return this.audioService.pendingForChild(user.userId, user.familyId);
  }

  /** Согласие ребёнка на запись без отдельного разрешения каждый раз. */
  @Get('consent')
  @Roles('CHILD')
  getConsent(@User() user: RequestUser) {
    return this.audioService.getConsent(user.userId, user.familyId);
  }

  @Patch('consent')
  @Roles('CHILD')
  setConsent(@User() user: RequestUser, @Body() dto: SetConsentDto) {
    return this.audioService.setConsent(user.userId, user.familyId, dto.enabled);
  }

    @Post('requests')
  @Roles('PARENT')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@User() user: RequestUser, @Body() dto: CreateAudioRequestDto) {
    return this.audioService.createRequest(
      user.familyId,
      user.userId,
      dto.childId,
      dto.durationSec ?? DEFAULT_DURATION_SEC,
    );
  }

  @Get('requests')
  @Roles('PARENT')
  list(@User() user: RequestUser) {
    return this.audioService.listForParent(user.familyId);
  }

  @Get('requests/:id')
  @Roles('PARENT')
  getOne(@User() user: RequestUser, @Param('id') id: string) {
    return this.audioService.getOne(user.familyId, id);
  }

  @Post('requests/:id/deny')
  @Roles('CHILD')
  @HttpCode(HttpStatus.OK)
  deny(@User() user: RequestUser, @Param('id') id: string) {
    return this.audioService.deny(user.userId, user.familyId, id);
  }

  @Post('requests/:id/audio')
  @Roles('CHILD')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // до 60 c записи укладывается с запасом
      fileFilter: (_req, file, cb) => {
        // Клиент шлёт m4a/aac в MP4-контейнере. Тип с устройства не абсолютная
        // гарантия, но грубый фильтр отсекает явно чужие загрузки.
        const ok = /^audio\//.test(file.mimetype) || file.mimetype === 'application/octet-stream';
        cb(ok ? null : new BadRequestException('Ожидается аудиофайл'), ok);
      },
    }),
  )
  upload(@User() user: RequestUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.audioService.fulfil(user.userId, user.familyId, id, file);
  }
}

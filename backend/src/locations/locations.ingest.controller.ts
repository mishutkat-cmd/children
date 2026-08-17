import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LocationsService } from './locations.service';
import { DeviceTokenGuard } from '../common/guards/device-token.guard';
import { Device, DeviceContext } from '../common/decorators/device.decorator';
import { IngestBatchDto } from './dto/locations.dto';

/**
 * Единственный роут, открытый по долгоживущему токену устройства.
 * Всё остальное требует обычной авторизации.
 */
@Controller('locations')
export class LocationsIngestController {
  constructor(private locationsService: LocationsService) {}

  @Post('batch')
  @UseGuards(DeviceTokenGuard)
  @HttpCode(HttpStatus.OK)
  // Устройство шлёт батчами раз в минуту; 30/мин — запас на разгребание очереди
  // после офлайна, но не на бесконечный цикл при баге в клиенте.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async ingest(@Device() device: DeviceContext, @Body() dto: IngestBatchDto) {
    return this.locationsService.ingest(device, dto);
  }
}

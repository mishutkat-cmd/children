import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export type LocationSource = 'background' | 'foreground' | 'manual';
export type PermissionState = 'always' | 'whenInUse' | 'denied' | 'undetermined';

export class LocationPointDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  /** Радиус погрешности в метрах (CEP68). Точки хуже MAX_ACCURACY_M сервер отбрасывает. */
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracy: number;

  /** Время фикса НА УСТРОЙСТВЕ — не время запроса: батч может прийти сильно позже. */
  @IsISO8601()
  capturedAt: string;

  @IsOptional()
  @IsNumber()
  altitude?: number;

  /** м/с. iOS отдаёт -1, когда скорость неизвестна — нормализуем на сервере. */
  @IsOptional()
  @IsNumber()
  speed?: number;

  /** Градусы, -1 если неизвестно. */
  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsBoolean()
  isMoving?: boolean;

  /** Android: координаты подделаны mock-провайдером. Не отбрасываем — показываем родителю. */
  @IsOptional()
  @IsBoolean()
  mocked?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  battery?: number;

  @IsOptional()
  @IsBoolean()
  isCharging?: boolean;

  @IsOptional()
  @IsIn(['background', 'foreground', 'manual'])
  source?: LocationSource;
}

export class IngestBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LocationPointDto)
  points: LocationPointDto[];

  @IsOptional()
  @IsIn(['always', 'whenInUse', 'denied', 'undetermined'])
  permissionState?: PermissionState;

  @IsOptional()
  @IsBoolean()
  servicesEnabled?: boolean;

  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class UpdateFamilyLocationSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  movingIntervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(7200)
  idleIntervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  historyDays?: number;
}

export class UpdateChildLocationSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  historyDays?: number;
}

export class HistoryQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

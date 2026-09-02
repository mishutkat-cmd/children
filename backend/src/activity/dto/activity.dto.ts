import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AppUsageItemDto {
  /** Идентификатор приложения (Android package name). */
  @IsString()
  packageName: string;

  /** Человекочитаемое имя приложения (как показать родителю). */
  @IsString()
  @IsOptional()
  appLabel?: string;

  /** Сколько миллисекунд в этом приложении за день. */
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60 * 1000)
  totalMs: number;
}

export class ReportUsageDto {
  /** День, к которому относится срез (YYYY-MM-DD, локальная дата устройства). */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AppUsageItemDto)
  apps: AppUsageItemDto[];
}

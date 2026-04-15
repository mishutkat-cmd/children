import {
  IsBoolean,
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  Min,
} from 'class-validator';

export class UpdateDecayRuleDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  startAfterMissedDays?: number;

  @IsEnum(['POINTS', 'PERCENT'])
  @IsOptional()
  decayType?: 'POINTS' | 'PERCENT';

  @IsInt()
  @Min(0)
  @IsOptional()
  decayValue?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxDailyPenalty?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  protectedBalanceDefault?: number;

  @IsEnum(['OFF', 'WARN_ONLY', 'SOFT'])
  @IsOptional()
  mode?: 'OFF' | 'WARN_ONLY' | 'SOFT';
}

export class CreateStreakRuleDto {
  @IsString()
  scope: string; // 'TASK' | 'CATEGORY' | 'DAILY_TOTAL'

  @IsString()
  @IsOptional()
  taskId?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  minTasksPerDay?: number;

  @IsInt()
  @Min(1)
  minDaysForBonus: number;

  @IsEnum(['POINTS', 'MULTIPLIER', 'BADGE'])
  bonusType: 'POINTS' | 'MULTIPLIER' | 'BADGE';

  @IsInt()
  bonusValue: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  cooldownDays?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateStreakRuleDto {
  @IsString()
  @IsOptional()
  scope?: string;

  @IsString()
  @IsOptional()
  taskId?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  minTasksPerDay?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  minDaysForBonus?: number;

  @IsEnum(['POINTS', 'MULTIPLIER', 'BADGE'])
  @IsOptional()
  bonusType?: 'POINTS' | 'MULTIPLIER' | 'BADGE';

  @IsInt()
  @IsOptional()
  bonusValue?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  cooldownDays?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class CreateCharacterDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  imageUrlZero?: string; // 0 баллов

  @IsString()
  @IsOptional()
  imageUrlLow?: string; // 1-99 баллов

  @IsString()
  @IsOptional()
  imageUrlHigh?: string; // 100+ баллов
}

export class UpdateCharacterDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  imageUrlZero?: string;

  @IsString()
  @IsOptional()
  imageUrlLow?: string;

  @IsString()
  @IsOptional()
  imageUrlHigh?: string;
}

import { IsString, IsOptional, IsEnum, IsUUID, IsArray, ArrayMinSize, ArrayMaxSize, IsInt, Min, MaxLength } from 'class-validator';

export class CreateBadgeDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(['STREAK', 'COMPLETION', 'CHALLENGE', 'SPECIAL'])
  @IsOptional()
  category?: 'STREAK' | 'COMPLETION' | 'CHALLENGE' | 'SPECIAL';

  @IsString()
  @IsOptional()
  conditionJson?: string; // JSON строка с условиями выдачи
}

export class AwardBadgeDto {
  @IsUUID()
  badgeId: string;
}

export class CreateAchievementDto {
  @IsString()
  @MaxLength(60)
  title: string;

  @IsString()
  taskId: string;

  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  levels?: [number, number, number];
}

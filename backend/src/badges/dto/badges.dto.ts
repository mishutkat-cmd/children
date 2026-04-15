import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';

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

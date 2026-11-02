import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  Min,
} from 'class-validator';

export class CreateRewardDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  // Ребёнок цену не передаёт: желание без цены ждёт, пока её назначит родитель.
  @IsInt()
  @Min(1)
  @IsOptional()
  costPoints?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  moneyValueCents?: number;

  @IsEnum(['ITEM', 'CASH', 'EVENT'])
  type: 'ITEM' | 'CASH' | 'EVENT';
}

export class UpdateRewardDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  costPoints?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  moneyValueCents?: number;
}

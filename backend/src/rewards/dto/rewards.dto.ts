import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsIn,
  Min,
} from 'class-validator';

/** SHOP — общий магазин наград; PERSONAL — личная цель одного ребёнка; FAMILY — общая семейная цель. */
export const REWARD_SCOPES = ['SHOP', 'PERSONAL', 'FAMILY'] as const;

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

  @IsIn(REWARD_SCOPES as unknown as string[])
  @IsOptional()
  scope?: 'SHOP' | 'PERSONAL' | 'FAMILY';

  /** userId ребёнка, чья это личная цель. Другие дети её не видят. */
  @IsString()
  @IsOptional()
  ownerChildId?: string;
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

  @IsIn(REWARD_SCOPES as unknown as string[])
  @IsOptional()
  scope?: 'SHOP' | 'PERSONAL' | 'FAMILY';

  /** userId ребёнка, чья это личная цель. Другие дети её не видят. */
  @IsString()
  @IsOptional()
  ownerChildId?: string;
}

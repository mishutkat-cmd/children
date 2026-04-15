import { IsUUID, IsArray, IsInt, ValidateNested, IsOptional, IsEnum, IsString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class AddToWishlistDto {
  @IsUUID()
  rewardGoalId: string;

  @IsInt()
  @IsOptional()
  year?: number;

  @IsEnum(['PENDING', 'COMPLETED'])
  @IsOptional()
  status?: 'PENDING' | 'COMPLETED';

  @IsBoolean()
  @IsOptional()
  showOnDashboard?: boolean;
}

export class AddToWishlistForChildDto extends AddToWishlistDto {
  @IsString()
  childId: string;
}

export class UpdateWishlistItemDto {
  @IsEnum(['PENDING', 'COMPLETED'])
  @IsOptional()
  status?: 'PENDING' | 'COMPLETED';

  @IsInt()
  @IsOptional()
  priority?: number;

  @IsInt()
  @IsOptional()
  year?: number;

  @IsInt()
  @IsOptional()
  moneySpent?: number; // Потраченные деньги в центах

  @IsOptional()
  isPurchased?: boolean; // Отметка о покупке

  @IsBoolean()
  @IsOptional()
  showOnDashboard?: boolean; // Показывать на главной странице

  @IsBoolean()
  @IsOptional()
  isFavorite?: boolean; // Избранное желание
}

class WishlistItemDto {
  @IsUUID()
  id: string;

  @IsInt()
  priority: number;
}

export class ReorderWishlistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WishlistItemDto)
  items: WishlistItemDto[];
}

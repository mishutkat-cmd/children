import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, NotEquals } from 'class-validator';

/** Наличные: плюс — пришли (подарили, накопил), минус — потратил. */
export class CashDto {
  @IsInt()
  @NotEquals(0)
  @Min(-10_000_000)
  @Max(10_000_000)
  amountCents: number;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  note?: string;

  /** Родитель указывает ребёнка (userId или childProfileId). */
  @IsString()
  @IsOptional()
  childId?: string;
}

/** Обменять звёзды на гривны по курсу семьи. */
export class ConvertDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  points: number;

  @IsString()
  @IsOptional()
  childId?: string;

  /** Оставить обменянные деньги свободными в кошельке, а не класть на цель. */
  @IsBoolean()
  @IsOptional()
  keepInWallet?: boolean;
}

/** Отложить на цель (плюс) или вернуть из цели в кошелёк (минус). */
export class AllocateDto {
  @IsString()
  rewardId: string;

  @IsInt()
  @NotEquals(0)
  @Min(-10_000_000)
  @Max(10_000_000)
  amountCents: number;

  @IsString()
  @IsOptional()
  childId?: string;
}

export class GoalDoneDto {
  @IsString()
  @IsOptional()
  childId?: string;
}

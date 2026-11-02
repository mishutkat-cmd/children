import { IsString, IsOptional, MinLength, IsIn, IsInt, Min, Max, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Цвет ребёнка: карточки, точки, превью. Ключи палитры, сами цвета — на клиенте. */
export const KID_COLORS = ['peach', 'mint', 'lilac', 'sun', 'sky', 'rose'] as const;
/** Зверьки питомца, окрасы и наряды (рисунки — на клиенте). */
export const PET_KINDS = ['cat', 'fox', 'bunny', 'panda', 'dino', 'owl'] as const;
export const PET_TINTS = ['ginger', 'grey', 'white', 'black', 'pink', 'blue'] as const;
export const PET_OUTFITS = ['none', 'scarf', 'hat', 'glasses', 'crown'] as const;

/** Сколько всего заработанных звёзд открывает наряд (звёзды не списываются). Те же числа — в web/src/lib/pets.ts. */
export const PET_OUTFIT_PRICE: Record<string, number> = { scarf: 0, hat: 300, glasses: 1500, crown: 3000 };
/** Правила питомцев по умолчанию (familySettings.petRules). */
export const PET_RULE_DEFAULTS: Record<string, boolean> = { sadWhenIdle: true, outfits: true, kidCanSwitch: true, voice: false };

export class PetDto {
  @IsIn(PET_KINDS as unknown as string[])
  kind: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  name?: string;

  @IsIn(PET_TINTS as unknown as string[])
  @IsOptional()
  tint?: string;

  @IsIn(PET_OUTFITS as unknown as string[])
  @IsOptional()
  outfit?: string;
}

export class CreateChildDto {
  /** Необязателен: без него сервер придумает служебный логин. */
  @IsString()
  @MinLength(3)
  @IsOptional()
  login?: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @MinLength(4)
  pin?: string;

  @IsIn(KID_COLORS as unknown as string[])
  @IsOptional()
  color?: string;

  @IsInt()
  @Min(2)
  @Max(18)
  @IsOptional()
  age?: number;

  @ValidateNested()
  @Type(() => PetDto)
  @IsOptional()
  pet?: PetDto;
}

export class UpdateChildDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @MinLength(4)
  pin?: string;

  @IsString()
  @IsOptional()
  selectedCharacterId?: string;

  @IsIn(KID_COLORS as unknown as string[])
  @IsOptional()
  color?: string;

  @IsInt()
  @Min(2)
  @Max(18)
  @IsOptional()
  age?: number;

  @ValidateNested()
  @Type(() => PetDto)
  @IsOptional()
  pet?: PetDto;
}

/** Что ребёнок может поменять у себя сам: только питомца. */
export class UpdateMyPetDto {
  @ValidateNested()
  @Type(() => PetDto)
  pet: PetDto;
}

export class CreateParentDto {
  @IsString()
  @MinLength(3)
  login: string;

  @IsString()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

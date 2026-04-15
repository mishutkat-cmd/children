import { IsString, IsOptional, MinLength } from 'class-validator';

export class CreateChildDto {
  @IsString()
  @MinLength(3)
  login: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @MinLength(4)
  pin?: string;
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

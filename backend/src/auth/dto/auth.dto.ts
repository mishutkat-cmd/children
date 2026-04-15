import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  login: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(['PARENT', 'CHILD'])
  role: 'PARENT' | 'CHILD';

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  familyId?: string;
}

export class LoginDto {
  @IsString()
  loginOrEmail: string;

  @IsString()
  password: string;
}

export class ChildPinLoginDto {
  @IsString()
  login: string;

  @IsString()
  @MinLength(4)
  pin: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  login?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

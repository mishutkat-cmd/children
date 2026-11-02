import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateCodeDto {
  @IsString()
  childId: string;
}

export class ClaimCodeDto {
  @IsString()
  @Length(6, 12)
  code: string;

  @IsString()
  @MaxLength(100)
  deviceId: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  platform?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  deviceName?: string;
}

export class SecretDto {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  pictures: string[];
}

export class FamilyPcDto {
  @IsString()
  @IsOptional()
  @MaxLength(60)
  name?: string;
}

export class FamilyPcTokenDto {
  @IsString()
  token: string;
}

export class FamilyPcLoginDto extends SecretDto {
  @IsString()
  token: string;

  @IsString()
  childId: string;
}

export class AcceptInviteDto {
  @IsString()
  @Length(3, 40)
  login: string;

  @IsString()
  @Length(8, 100)
  password: string;

  @IsEmail()
  @IsOptional()
  email?: string;
}

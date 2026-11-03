import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token: string;

  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';
}

export class RemovePushTokenDto {
  @IsString()
  @MaxLength(4096)
  token: string;
}

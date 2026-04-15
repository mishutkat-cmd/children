import { IsUUID, IsOptional, IsInt, Min, IsString } from 'class-validator';

export class CreateExchangeDto {
  @IsUUID()
  @IsOptional()
  rewardGoalId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  cashCents?: number;
}

export class CreateExchangeForChildDto extends CreateExchangeDto {
  @IsString()
  childId: string; // Может быть userId или childProfileId
}

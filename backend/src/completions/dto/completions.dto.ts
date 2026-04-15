import { IsString, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class CreateCompletionDto {
  @IsUUID()
  taskId: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  proofUrl?: string;

  @IsDateString()
  @IsOptional()
  performedAt?: string; // ISO date string для указания конкретной даты выполнения
}

export class CreateCompletionForChildDto extends CreateCompletionDto {
  @IsString() // childId может быть как UUID (userId), так и ChildProfile.id
  childId: string;
}

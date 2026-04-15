import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEnum,
  IsArray,
  Min,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @Min(1)
  points: number;

  @IsEnum(['ONCE', 'DAILY', 'WEEKLY', 'CUSTOM'])
  frequency: 'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM';

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  daysOfWeek?: number[];

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsBoolean()
  @IsOptional()
  requiresProof?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresParentApproval?: boolean;
}

export class UpdateTaskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  points?: number;

  @IsEnum(['ONCE', 'DAILY', 'WEEKLY', 'CUSTOM'])
  @IsOptional()
  frequency?: 'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM';

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  daysOfWeek?: number[];

  @IsBoolean()
  @IsOptional()
  requiresProof?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresParentApproval?: boolean;

  @IsString()
  @IsOptional()
  assignedTo?: string;
}

export class AssignTaskDto {
  @IsArray()
  @IsString({ each: true })
  childIds: string[];
}

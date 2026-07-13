import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type { ConditionFlexibilityMode } from '@scoutlgs/core';

export class OptimizeListQueryDto {
  @IsOptional()
  @IsString()
  minimumCondition?: string;

  @IsOptional()
  @IsString()
  stores?: string;

  @IsOptional()
  @IsIn(['strict', 'allow-if-needed', 'allow-if-cheaper'])
  conditionFlexibility?: ConditionFlexibilityMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  maxDowngradeSteps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  downgradePenaltyPerStep?: number;
}

import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import {
  Intent,
  RefineAction,
  Tone,
} from '../providers/ai-provider.interface';

const TONES: Tone[] = [
  'light_flirt',
  'deep_flirt',
  'funny',
  'confident',
  'professional',
];

class ContextDto {
  @IsOptional()
  @IsString()
  appHint?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  history?: string[];
}

export class GenerateRepliesDto {
  @IsString()
  @Length(1, 2000)
  message: string;

  @IsIn(TONES)
  tone: Tone;

  @IsIn(['reply', 'rewrite'])
  intent: Intent;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContextDto)
  context?: ContextDto;
}

export class RefineDto {
  @IsString()
  @Length(1, 2000)
  text: string;

  @IsIn(['shorter', 'funnier', 'more_direct'])
  action: RefineAction;
}

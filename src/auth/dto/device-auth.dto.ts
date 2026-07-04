import { IsIn, IsString, Length } from 'class-validator';

export class DeviceAuthDto {
  @IsString()
  @Length(8, 128)
  deviceIdentifier: string;

  @IsIn(['ios'])
  platform: string;
}

import { IsEmail, IsString, Length } from 'class-validator';

export class EmailAuthDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 128)
  password: string;

  /** The calling device gets linked to the account. */
  @IsString()
  @Length(8, 128)
  deviceIdentifier: string;
}

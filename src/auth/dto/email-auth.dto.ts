import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 128)
  password: string;

  /** Optional handle — lowercase letters, numbers, underscore. */
  @IsOptional()
  @Matches(/^[a-z0-9_]{3,30}$/, {
    message: 'username must be 3-30 chars: a-z, 0-9, underscore',
  })
  username?: string;

  /** The calling device gets linked to the account. */
  @IsString()
  @Length(8, 128)
  deviceIdentifier: string;
}

/** Login with email OR username (at least one). Additive vs v0.3 contract. */
export class LoginDto {
  @ValidateIf((o) => !o.username)
  @IsEmail()
  email?: string;

  @ValidateIf((o) => !o.email)
  @IsString()
  @Length(3, 30)
  username?: string;

  @IsString()
  @Length(8, 128)
  password: string;

  @IsString()
  @Length(8, 128)
  deviceIdentifier: string;
}

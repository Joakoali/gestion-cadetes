import { IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(6)
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;
}

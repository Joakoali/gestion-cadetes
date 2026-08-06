import { IsLatitude, IsLongitude, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateCustomerDto {
  @ValidateIf((o) => !o.linkShortCode)
  @IsString()
  @MinLength(2)
  name?: string;

  @ValidateIf((o) => !o.linkShortCode)
  @IsString()
  @MinLength(6)
  phone?: string;

  @ValidateIf((o) => !o.linkShortCode)
  @IsString()
  @MinLength(3)
  addressText?: string;

  @ValidateIf((o) => !o.linkShortCode)
  @IsLatitude()
  lat?: number;

  @ValidateIf((o) => !o.linkShortCode)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  linkShortCode?: string;
}

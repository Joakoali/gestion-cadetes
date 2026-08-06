import { IsLatitude, IsLongitude, IsString, MinLength } from 'class-validator';

export class UpdateLocationDto {
  @IsString()
  @MinLength(3)
  addressText: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}

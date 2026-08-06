import { IsString } from 'class-validator';

export class ReassignDeliveryDto {
  @IsString()
  cadeteUserId: string;
}

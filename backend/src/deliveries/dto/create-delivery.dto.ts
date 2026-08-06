import { IsString } from 'class-validator';

export class CreateDeliveryDto {
  @IsString()
  customerRecordId: string;

  @IsString()
  cadeteUserId: string;
}

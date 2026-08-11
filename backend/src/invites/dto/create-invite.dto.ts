import { IsIn, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateInviteDto {
  @IsIn(['ADMIN', 'MOSTRADOR', 'CADETE'])
  role: Role;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

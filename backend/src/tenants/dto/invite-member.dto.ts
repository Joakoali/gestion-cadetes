import { IsIn, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class InviteMemberDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(6)
  phone: string;

  @IsIn(['ADMIN', 'MOSTRADOR', 'CADETE'])
  role: Role;
}

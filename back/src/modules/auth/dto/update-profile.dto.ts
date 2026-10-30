import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Carlos Pérez', description: 'Nombre y apellido del usuario, en un solo campo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombreApellido?: string;

  @ApiPropertyOptional({ example: '3001234567', description: 'Teléfono del usuario' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefono?: string;
}

import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCnoDenominacionDto {
  @ApiPropertyOptional({ example: 'Administrador de sistemas', description: 'Nueva descripción de la denominación' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  descDenominacion?: string;

  @ApiPropertyOptional({ example: 1, description: 'Estado (1=activo, 0=inactivo)' })
  @IsOptional()
  @IsInt()
  estado?: number;
}

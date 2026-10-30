import { IsString, IsNotEmpty, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCnoDenominacionDto {
  @ApiProperty({ example: '2111', description: 'Código de la ocupación CNO a la que pertenece la denominación' })
  @IsString()
  @IsNotEmpty()
  codOcupacionCno: string;

  @ApiProperty({ example: 'Administrador de sistemas', description: 'Descripción de la denominación. El código (D-{codOcupacion}.NNN) se genera automáticamente en el backend.' })
  @IsString()
  @IsNotEmpty()
  descDenominacion: string;

  @ApiPropertyOptional({ example: 1, description: 'Estado (1=activo, 0=inactivo)' })
  @IsOptional()
  @IsInt()
  estado?: number;
}

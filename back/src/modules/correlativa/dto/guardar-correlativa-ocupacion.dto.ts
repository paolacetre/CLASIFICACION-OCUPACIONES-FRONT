import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CorrelativaOcupacionCuocDto {
  @ApiProperty({ example: '2211', description: 'Código de la ocupación CUOC' })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiPropertyOptional({ example: 'Contadores', description: 'Nombre de la ocupación CUOC' })
  @IsOptional()
  @IsString()
  nombre?: string;
}

export class GuardarCorrelativaOcupacionDto {
  @ApiProperty({ example: '1212', description: 'Código de la ocupación CNO que encabeza la correlativa' })
  @IsString()
  @IsNotEmpty()
  codOcupacionCno: string;

  @ApiPropertyOptional({ example: 'Jefes y supervisores de entidades financieras' })
  @IsOptional()
  @IsString()
  nombOcupacionCno?: string;

  @ApiProperty({ type: [CorrelativaOcupacionCuocDto], description: 'Ocupaciones CUOC relacionadas con esa CNO' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CorrelativaOcupacionCuocDto)
  cuoc: CorrelativaOcupacionCuocDto[];

  @ApiPropertyOptional({ description: 'Observación aplicada a todas las filas de la correlativa' })
  @IsOptional()
  @IsString()
  observacion?: string;
}

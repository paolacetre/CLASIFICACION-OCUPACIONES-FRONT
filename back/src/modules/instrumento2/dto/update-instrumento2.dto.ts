import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FuncionSnapshotDto, NombreSnapshotDto } from './item-snapshot.dto';

export class UpdateInstrumento2Dto {
  @ApiPropertyOptional({ example: '1212-18', description: 'Código de la ocupación a editar (si el instrumento tiene varias)' })
  @IsOptional()
  @IsString()
  codigoOcupacion?: string;

  @ApiPropertyOptional({ example: 'Físicos y astrónomos' })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nivelCualificacion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  areaDesempeno?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fechaRegistro?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fechaInactividad?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trazabilidad?: string;

  @ApiPropertyOptional({ description: 'Nota libre del analista (instrumento.observacion)' })
  @IsOptional()
  @IsString()
  observacion?: string;

  @ApiPropertyOptional({ type: () => [FuncionSnapshotDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FuncionSnapshotDto)
  funciones?: FuncionSnapshotDto[];

  @ApiPropertyOptional({ type: () => [NombreSnapshotDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NombreSnapshotDto)
  denominaciones?: NombreSnapshotDto[];

  @ApiPropertyOptional({ type: () => [NombreSnapshotDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NombreSnapshotDto)
  habilidades?: NombreSnapshotDto[];

  @ApiPropertyOptional({ type: () => [NombreSnapshotDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NombreSnapshotDto)
  conocimientos?: NombreSnapshotDto[];

  @ApiPropertyOptional({ type: () => [NombreSnapshotDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NombreSnapshotDto)
  ocupacionesRelacionadas?: NombreSnapshotDto[];
}

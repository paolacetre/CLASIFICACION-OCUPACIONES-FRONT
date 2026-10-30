import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Campos por los que la tabla de denominaciones CUOC puede ordenarse. */
export const ORDENES_CONSULTA_CUOC_DENOM = ['descripcion', 'ocupacion', 'estado'] as const;
export type OrdenConsultaCuocDenom = (typeof ORDENES_CONSULTA_CUOC_DENOM)[number];

/**
 * Consulta de la pestaña "Denominaciones" de la pantalla CUOC: texto +
 * filtros (heredados de la ocupación dueña) + orden + paginación, resuelto
 * en el servidor.
 */
export class ConsultarCuocDenominacionesDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en el nombre de la denominación' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Nivel de competencia exacto de la ocupación dueña' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nivel?: string;

  @ApiPropertyOptional({ description: 'Área de cualificación exacta de la ocupación dueña' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  area?: string;

  @ApiPropertyOptional({ description: 'Estado (Activo/Inactivo)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  estado?: string;

  @ApiPropertyOptional({ description: 'Código CUOC de la ocupación para filtrar' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codOcupacion?: string;

  @ApiPropertyOptional({ description: 'Número de página (1-indexado)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Registros por página (máx. 500)', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 10;

  @ApiPropertyOptional({ description: 'Campo de ordenamiento', enum: ORDENES_CONSULTA_CUOC_DENOM, default: 'descripcion' })
  @IsOptional()
  @IsIn(ORDENES_CONSULTA_CUOC_DENOM)
  orden: OrdenConsultaCuocDenom = 'descripcion';

  @ApiPropertyOptional({ description: 'Dirección del ordenamiento', enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  direccion: 'ASC' | 'DESC' = 'ASC';
}

/** Fila de la tabla de resultados de la pestaña Denominaciones CUOC. */
export interface CuocDenominacionResultado {
  codigo: number;
  codDenominacion: string;
  nomDenominacion: string;
  estado: string;
  codOcupacion: string;
  nombOcupacion: string;
}

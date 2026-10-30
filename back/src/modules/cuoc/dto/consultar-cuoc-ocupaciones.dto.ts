import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Campos por los que la tabla de resultados CUOC puede ordenarse. */
export const ORDENES_CONSULTA_CUOC = ['codigo', 'nombre', 'estado'] as const;
export type OrdenConsultaCuoc = (typeof ORDENES_CONSULTA_CUOC)[number];

/**
 * Consulta de la pantalla "Ocupaciones — CUOC": texto + filtros + orden +
 * paginación, resuelto en el servidor.
 */
export class ConsultarCuocOcupacionesDto {
  @ApiPropertyOptional({ description: 'Texto a buscar por código o nombre' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Nivel de competencia exacto' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nivel?: string;

  @ApiPropertyOptional({ description: 'Área de cualificación exacta' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  area?: string;

  @ApiPropertyOptional({ description: 'Código del gran grupo (p. ej. "2")' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  granGrupo?: string;

  @ApiPropertyOptional({ description: 'Código del grupo primario (p. ej. "2111")' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  grupoPrimario?: string;

  @ApiPropertyOptional({ description: 'Código o descripción de la función' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  funcion?: string;
  @ApiPropertyOptional({ description: 'Estado (Activo/Inactivo)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  estado?: string;

  @ApiPropertyOptional({ description: 'Número de página (1-indexado)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Registros por página (máx. 100)', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({ description: 'Campo de ordenamiento', enum: ORDENES_CONSULTA_CUOC, default: 'codigo' })
  @IsOptional()
  @IsIn(ORDENES_CONSULTA_CUOC)
  orden: OrdenConsultaCuoc = 'codigo';

  @ApiPropertyOptional({ description: 'Dirección del ordenamiento', enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  direccion: 'ASC' | 'DESC' = 'ASC';
}

/**
 * Fila de la tabla de resultados CUOC. Lleva los contadores de cada bloque.
 */
export interface CuocOcupacionResultado {
  codigo: string;
  nombre: string;
  nivelCompetencia?: string;
  areaCualificacion?: string;
  estado: string;
  denominaciones: number;
  funciones: number;
  destrezas: number;
  conocimientos: number;
}

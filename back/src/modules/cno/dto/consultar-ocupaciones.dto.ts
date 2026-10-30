import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Campos por los que la tabla de resultados puede ordenarse. */
export const ORDENES_CONSULTA = ['codigo', 'nombre', 'nivel', 'estado'] as const;
export type OrdenConsulta = (typeof ORDENES_CONSULTA)[number];

/**
 * Consulta de la pantalla "Ocupaciones — CNO": texto + filtros + orden +
 * paginación, resuelto en el servidor.
 *
 * Es un DTO aparte de `BuscarOcupacionDto` a propósito: aquel alimenta el
 * autocompletado (lista corta, sin filtros, compartido con CUOC y con el
 * buscador de Análisis) y debe seguir devolviendo un arreglo plano.
 */
export class ConsultarOcupacionesDto {
  @ApiPropertyOptional({ description: 'Texto a buscar por código o nombre' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Nivel de cualificación exacto' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nivel?: string;

  @ApiPropertyOptional({ description: 'Área de desempeño exacta' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  area?: string;

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

  @ApiPropertyOptional({ description: 'Campo de ordenamiento', enum: ORDENES_CONSULTA, default: 'codigo' })
  @IsOptional()
  @IsIn(ORDENES_CONSULTA)
  orden: OrdenConsulta = 'codigo';

  @ApiPropertyOptional({ description: 'Dirección del ordenamiento', enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  direccion: 'ASC' | 'DESC' = 'ASC';
}

/**
 * Fila de la tabla de resultados. Lleva los contadores de cada bloque para que
 * la tabla pueda mostrar de un vistazo qué información tiene la ocupación sin
 * traerse las listas completas.
 */
export interface OcupacionResultado {
  codigo: string;
  nombre: string;
  /** Código del nivel («Nivel 1 (A)»): con el nombre forma la etiqueta que se muestra. */
  codNivelCualificacion?: string;
  nivelCualificacion?: string;
  areaDesempeno?: string;
  estado: string;
  denominaciones: number;
  funciones: number;
  habilidades: number;
  conocimientos: number;
}

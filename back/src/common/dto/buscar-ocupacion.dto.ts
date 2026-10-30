import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Filtros del autocompletado de ocupaciones (CNO y CUOC).
 *
 * Existe para que el front no tenga que descargar el catálogo completo sólo
 * para poder sugerir mientras el usuario escribe.
 */
export class BuscarOcupacionDto {
  @ApiPropertyOptional({ description: 'Texto a buscar por código o nombre' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Máximo de sugerencias (máx. 50)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

/** Fila mínima que consume el autocompletado del front. */
export interface OcupacionSugerencia {
  codigo: string;
  nombre: string;
  /**
   * Área de desempeño (CNO) o de cualificación (CUOC). Es opcional a propósito:
   * se agregó para que el buscador pueda mostrar una línea de contexto bajo cada
   * sugerencia, y los consumidores que ya existían (CNO/CUOC) simplemente la
   * ignoran. Puede venir vacía si la ocupación no tiene área asociada.
   */
  area?: string;
}

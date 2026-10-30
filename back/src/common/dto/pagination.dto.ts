import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ description: 'Número de página (1-indexado)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Registros por página (máx. 500)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // 500 y no 100: las pantallas que necesitan el catálogo completo en memoria
  // (autocompletado CNO/CUOC, cruces del Correlativo) reconstruyen el dataset
  // pidiendo páginas; con tope 100 eran ~50 peticiones por catálogo.
  @Max(500)
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export interface PageResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function buildPageResponse<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationDto,
): PageResponse<T> {
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 0,
  };
}

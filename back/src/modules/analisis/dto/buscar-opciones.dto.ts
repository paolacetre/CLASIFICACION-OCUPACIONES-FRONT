import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const TIPOS_OPCION = ['funciones', 'denominaciones', 'habilidades', 'conocimientos'] as const;
export type TipoOpcion = (typeof TIPOS_OPCION)[number];

/** Query de `GET /api/analisis/opciones`: elementos existentes para agregar a una ocupación. */
export class BuscarOpcionesDto {
  @ApiProperty({ enum: TIPOS_OPCION, example: 'funciones' })
  @IsIn(TIPOS_OPCION)
  tipo: TipoOpcion;

  @ApiProperty({ enum: ['CNO', 'CUOC'], example: 'CNO' })
  @IsIn(['CNO', 'CUOC'])
  catalogo: 'CNO' | 'CUOC';

  @ApiPropertyOptional({ example: 'investig', description: 'Texto a buscar en el código o el nombre' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 25, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limite?: number;
}

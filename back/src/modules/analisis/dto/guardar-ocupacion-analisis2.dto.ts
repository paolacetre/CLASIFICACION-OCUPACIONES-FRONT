import { IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PanelAnalisisDto } from './guardar-analisis.dto';

/**
 * Guardar UNA ocupación editada desde Análisis 2 (no el flujo de 3 paneles →
 * Instrumento 2 de Análisis). Reutiliza `PanelAnalisisDto` porque trae
 * exactamente los mismos campos que `OcupacionCopiaService` necesita para
 * armar la copia.
 */
export class GuardarOcupacionAnalisis2Dto {
  @ApiProperty({ enum: ['cno', 'cuoc'], example: 'cno', description: 'Catálogo de origen de la ocupación' })
  @IsIn(['cno', 'cuoc'])
  tipo: 'cno' | 'cuoc';

  @ApiProperty({ type: () => PanelAnalisisDto })
  @ValidateNested()
  @Type(() => PanelAnalisisDto)
  panel: PanelAnalisisDto;
}

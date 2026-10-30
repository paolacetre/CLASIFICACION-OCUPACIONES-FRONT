import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResumenCriterioDto {
  @ApiProperty({ example: 'funcion_1' })
  id: string;

  @ApiProperty({ example: '5. FUNCIONES 1' })
  label: string;
}

export class ResumenRespuestaDto {
  @ApiProperty({ example: 'funcion_1' })
  criterioId: string;

  @ApiProperty({ example: 'aplica', description: 'Veredicto del experto sobre ese campo' })
  estado: string;

  @ApiProperty({ example: '', description: 'Observación del experto' })
  comentario: string;

  @ApiPropertyOptional({ example: 'Coordinar el equipo', description: 'Texto del ítem que vio el experto' })
  valor?: string;

  @ApiPropertyOptional({ description: 'Texto que el experto propone para el ítem (descripción, área)' })
  valorPropuesto?: string;
}

/** Una de las ocupaciones (1 a 3) que se validaron juntas en la agrupación. */
export class ResumenOcupacionDto {
  @ApiProperty({ example: '0112-14-1', description: 'Código de la copia (interno del instrumento)' })
  codigo: string;

  @ApiProperty({ example: '0112', description: 'Código de la ocupación real del catálogo' })
  codigoOriginal: string;

  @ApiProperty({ example: 'Jefes de explotaciones agrícolas' })
  nombre: string;

  @ApiProperty({ enum: ['CNO', 'CUOC'] })
  panelOrigen: 'CNO' | 'CUOC';

  @ApiProperty({ type: () => [ResumenCriterioDto] })
  criterios: ResumenCriterioDto[];

  @ApiProperty({ type: () => [ResumenRespuestaDto] })
  respuestas: ResumenRespuestaDto[];

  @ApiPropertyOptional({ description: 'Campos simples del snapshot de ESTA ocupación (área, nivel, descripción…)' })
  formularioOriginal?: Record<string, unknown>;
}

/**
 * Fila consolidada de Resumen. Espeja `ValidacionResumenRecord` del frontend
 * para que la tabla no necesite adaptaciones.
 */
export class ResumenRecordDto {
  @ApiProperty({ example: '11', description: 'Id del instrumento: la agrupación que comparten sus expertos' })
  token: string;

  @ApiProperty({ example: 42, description: 'Validación de este experto (respuestas.idrespuesta)' })
  respuestaId: number;

  @ApiProperty({ example: 1, description: 'Ronda del envío que respondió' })
  ronda: number;

  @ApiProperty({ example: 'Ana Ruiz', description: 'Experto que validó (de la tabla usuario)' })
  experto: string;

  @ApiProperty({ enum: ['pendiente', 'en_progreso', 'completado'] })
  estadoFlujo: 'pendiente' | 'en_progreso' | 'completado';

  @ApiProperty({ enum: ['I2', 'I3'] })
  instrumentoOrigen: 'I2' | 'I3';

  @ApiProperty({ example: 'instrumento2' })
  instrumentoId: string;

  @ApiProperty({ example: 'prueba.analista@sena.edu.co' })
  analistaId: string;

  @ApiProperty({ example: '2026-09-03T17:07:11.736Z' })
  fecha: string;

  @ApiProperty({
    example: '2026-09-03T17:07:11.736Z',
    description: 'Cuándo se registró el instrumento: el inicio del ciclo de este registro.',
  })
  horaInicio: string;

  @ApiProperty({
    example: '2026-09-05T09:12:44.100Z',
    description: 'Cuándo el experto cerró su veredicto. Vacío si aún no se ha validado.',
  })
  horaFinalizacion: string;

  // ── Informante (lo diligencia el experto en la validación) ──
  @ApiProperty() nombreApellidos: string;
  @ApiProperty() email: string;
  @ApiProperty() telefono: string;
  @ApiProperty() departamento: string;
  @ApiProperty() municipio: string;
  @ApiProperty() empresaEntidad: string;
  @ApiProperty() cargo: string;
  @ApiProperty() profesion: string;

  // ── Ocupación ──
  @ApiProperty() sector: string;
  @ApiProperty({ description: 'Nombre de la ocupación' }) ocupacionCno: string;
  @ApiProperty() codOcupacionCNO: string;
  @ApiProperty() codOcupacionCUOC: string;
  @ApiProperty({ example: 0 }) codArea: number;
  @ApiProperty({ example: 0 }) codNivelCualificacion: number;

  @ApiProperty({
    type: () => [ResumenCriterioDto],
    description:
      'Todos los criterios de la agrupación en plano (compatibilidad). Con varias ocupaciones el id ' +
      'lleva delante la copia ("0112-14-1::funcion_1"); lo agrupado está en `ocupaciones`.',
  })
  criterios: ResumenCriterioDto[];

  @ApiProperty({ type: () => [ResumenRespuestaDto] })
  respuestas: ResumenRespuestaDto[];

  @ApiProperty({
    type: () => [ResumenOcupacionDto],
    description: 'Ocupaciones validadas juntas en este envío, cada una con sus criterios y respuestas',
  })
  ocupaciones: ResumenOcupacionDto[];

  @ApiPropertyOptional({
    description: 'Campos planos adicionales (área, nivel, descripción...) tomados del snapshot',
  })
  formularioOriginal?: Record<string, unknown>;
}

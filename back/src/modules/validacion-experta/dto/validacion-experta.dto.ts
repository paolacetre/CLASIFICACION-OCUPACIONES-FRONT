import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Veredictos posibles del experto sobre un ítem (`pregunta_respuesta.respuesta`). */
export const ESTADOS_CAMPO = ['aplica', 'no_aplica', 'requiere_ajuste', 'propuesta_mejora'] as const;
export type EstadoCampoValidacion = (typeof ESTADOS_CAMPO)[number];

/** Decisión global de UN experto sobre el instrumento (`respuestas.estado`). */
export const ESTADOS_VALIDACION = ['en_revision', 'aprobada', 'rechazada', 'ajustes_solicitados'] as const;
export type EstadoValidacion = (typeof ESTADOS_VALIDACION)[number];

// ─── Entrada ────────────────────────────────────────────────────────────────

export class ValidacionCampoDto {
  @ApiProperty({ example: 'funcion_2', description: 'Campo del snapshot ("nombre", "funcion_2"…)' })
  @IsString()
  @MaxLength(200)
  campo: string;

  @ApiProperty({ enum: ESTADOS_CAMPO, example: 'aplica' })
  @IsIn(ESTADOS_CAMPO as unknown as string[])
  estado: EstadoCampoValidacion;

  /**
   * Comentario del experto. Obligatorio con «propuesta_mejora»; opcional en
   * el resto. El veredicto ya dice si es una propuesta o un comentario.
   */
  @ApiPropertyOptional({ example: 'Precisar el alcance' })
  @IsOptional()
  @IsString()
  comentario?: string;

  /**
   * Copia de ocupación a la que pertenece el campo. Un Instrumento 2 agrupa
   * hasta 3 ocupaciones y el mismo `campo` ("funcion_1") existe en cada una.
   * Si se omite, el campo es de la ocupación principal.
   */
  @ApiPropertyOptional({ example: '0112-14-1', description: 'Copia de ocupación del campo; omitido = la principal' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  codOcupacion?: string;
}

/**
 * Datos generales del informante que diligencia el experto durante la
 * revisión. Opcionales: se guardan tal como vayan, también en borrador; el
 * cierre los exige todos.
 */
export class DatosGeneralesDto {
  // Una sola columna (`respuestas.nombre_apellido`), por petición del cliente.
  @ApiPropertyOptional({ example: 'Ana María Ruiz López' })
  @IsOptional() @IsString() @MaxLength(400)
  nombreApellidos?: string;

  @ApiPropertyOptional({ example: 'ana.ruiz@sena.edu.co' })
  @IsOptional() @IsString() @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional() @IsString() @MaxLength(45)
  telefono?: string;

  @ApiPropertyOptional({ example: 'Antioquia' })
  @IsOptional() @IsString()
  departamento?: string;

  @ApiPropertyOptional({ example: 'Medellín' })
  @IsOptional() @IsString()
  municipio?: string;

  @ApiPropertyOptional({ example: 'SENA' })
  @IsOptional() @IsString()
  empresaEntidad?: string;

  @ApiPropertyOptional({ example: 'Instructora' })
  @IsOptional() @IsString()
  cargo?: string;

  @ApiPropertyOptional({ example: 'Ingeniera de sistemas' })
  @IsOptional() @IsString()
  profesion?: string;
}

/**
 * Lo que el experto propone para la descripción y el área de desempeño de una
 * ocupación. Ya NO reescribe la ocupación: con varios expertos se pisaban.
 * Queda como propuesta en `pregunta_respuesta.valor_propuesto` y el analista
 * decide si la aplica.
 */
export class InfoOcupacionAjusteDto {
  @ApiPropertyOptional({ example: 'Finanzas y Administración' })
  @IsOptional()
  @IsString()
  areaDesempeno?: string;

  @ApiPropertyOptional({ example: 'Planifican, organizan y controlan...' })
  @IsOptional()
  @IsString()
  descripcion?: string;
}

/** Propuesta de área y descripción de UNA de las ocupaciones de la agrupación. */
export class InfoOcupacionAjusteConCodigoDto extends InfoOcupacionAjusteDto {
  @ApiProperty({ example: '0112-14-1', description: 'Copia de ocupación de la propuesta' })
  @IsString()
  @MaxLength(200)
  codOcupacion: string;
}

export class GuardarValidacionExpertaDto {
  @ApiProperty({ enum: ESTADOS_VALIDACION, example: 'aprobada' })
  @IsIn(ESTADOS_VALIDACION as unknown as string[])
  estado: EstadoValidacion;

  @ApiPropertyOptional({ description: 'Observaciones generales del experto' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  /**
   * Puede llegar vacío cuando el experto guarda un avance parcial
   * (`estado: 'en_revision'`) sin haber calificado nada todavía. Para un
   * veredicto final el servicio sí exige todos los campos.
   */
  @ApiProperty({ type: () => [ValidacionCampoDto], description: 'Veredicto por campo' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidacionCampoDto)
  campos: ValidacionCampoDto[];

  @ApiPropertyOptional({ type: () => DatosGeneralesDto, description: 'Datos generales del informante' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DatosGeneralesDto)
  datosGenerales?: DatosGeneralesDto;

  @ApiPropertyOptional({
    type: () => InfoOcupacionAjusteDto,
    description: 'Propuesta de descripción y área para la ocupación principal',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => InfoOcupacionAjusteDto)
  infoOcupacion?: InfoOcupacionAjusteDto;

  @ApiPropertyOptional({
    type: () => [InfoOcupacionAjusteConCodigoDto],
    description:
      'Propuestas por ocupación cuando el instrumento agrupa varias. Si llega, manda sobre `infoOcupacion`.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InfoOcupacionAjusteConCodigoDto)
  infoOcupaciones?: InfoOcupacionAjusteConCodigoDto[];
}

/** Expertos a los que se envía el instrumento (los elige quien lo envía). */
export class EnviarExpertoDto {
  @ApiProperty({ type: [Number], example: [6, 14], description: 'idusuario de los expertos asignados' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos un experto.' })
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  expertos: number[];
}

// ─── Salida ─────────────────────────────────────────────────────────────────

export class ValidacionCampoRespuestaDto extends ValidacionCampoDto {
  @ApiProperty({ example: 15 })
  id: number;

  @ApiPropertyOptional({ description: 'Texto del ítem que vio el experto (pregunta.detalle)' })
  valorOriginal?: string;
}

export class ExpertoResumenDto {
  @ApiProperty({ example: 6 })
  idUsuario: number;

  @ApiProperty({ example: 'Ana Ruiz' })
  nombre: string;

  @ApiProperty({ example: 'ana.ruiz@sena.edu.co' })
  correo: string;
}

export class ValidacionExpertaDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 8, description: 'Instrumento validado' })
  instrumentoId: number;

  @ApiProperty({ example: 1, description: 'Ronda del snapshot que se respondió' })
  ronda: number;

  @ApiProperty({ enum: ESTADOS_VALIDACION })
  estado: EstadoValidacion;

  @ApiProperty({ type: () => ExpertoResumenDto })
  experto: ExpertoResumenDto;

  @ApiPropertyOptional({ nullable: true })
  observaciones?: string | null;

  @ApiProperty({ example: '2026-09-07T16:40:00.000Z' })
  fechaValidacion: string;

  @ApiProperty({ type: () => [ValidacionCampoRespuestaDto] })
  campos: ValidacionCampoRespuestaDto[];

  @ApiPropertyOptional({ type: () => DatosGeneralesDto })
  datosGenerales?: DatosGeneralesDto;

  @ApiProperty({
    type: () => [InfoOcupacionAjusteConCodigoDto],
    description: 'Propuestas del experto de descripción y área, por ocupación',
  })
  infoOcupaciones: InfoOcupacionAjusteConCodigoDto[];

  @ApiProperty({
    description: 'Conteo por veredicto, para que el frontend no tenga que recalcularlo',
    example: { aplica: 8, no_aplica: 1, requiere_ajuste: 2, propuesta_mejora: 0 },
  })
  conteos: Record<EstadoCampoValidacion, number>;
}

/** Estado de UN experto asignado dentro de la ronda vigente. */
export class AvanceExpertoDto extends ExpertoResumenDto {
  @ApiPropertyOptional({ enum: ESTADOS_VALIDACION, nullable: true, description: 'null = aún no ha guardado nada' })
  estado: EstadoValidacion | null;

  @ApiPropertyOptional({ nullable: true })
  fechaValidacion: string | null;
}

/** Cuántos de los expertos asignados ya cerraron su validación. */
export class AvanceValidacionDto {
  @ApiProperty({ example: 1 })
  ronda: number;

  @ApiProperty({ example: 'ENVIADO_EXPERTO' })
  estadoInstrumento: string;

  @ApiProperty({ type: () => [AvanceExpertoDto] })
  expertos: AvanceExpertoDto[];

  @ApiProperty({ example: 11 })
  asignados: number;

  @ApiProperty({ example: 4, description: 'Expertos asignados que ya cerraron su validación' })
  cerrados: number;
}

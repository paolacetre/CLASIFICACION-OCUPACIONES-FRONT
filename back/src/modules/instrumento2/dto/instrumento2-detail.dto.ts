import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Instrumento2Estado } from '../enums/instrumento2-estado.enum';
import { FuncionSnapshotDto, NombreSnapshotDto } from './item-snapshot.dto';
import { PreguntaSnapshotDto } from './pregunta-snapshot.dto';

export class OcupacionResumenDto {
  @ApiProperty({ example: '1212-18', description: 'Código de la copia (interno del instrumento)' })
  codigo: string;

  @ApiProperty({ example: '1212', description: 'Código de la ocupación real del catálogo' })
  codigoOriginal: string;

  @ApiProperty({ example: 'Jefes y supervisores de entidades financieras' })
  nombre: string;

  @ApiProperty({ enum: ['CNO', 'CUOC'] })
  panelOrigen: 'CNO' | 'CUOC';

  @ApiPropertyOptional({ nullable: true })
  nivelCualificacion?: string | null;

  @ApiPropertyOptional({ nullable: true })
  areaDesempeno?: string | null;
}

/**
 * Forma de respuesta única para `GET /api/instrumento2` (array) y
 * `GET /api/instrumento2/:id` (objeto). El id numérico solo se usa para
 * identificar el recurso en la URL — el frontend nunca lo muestra en la UI.
 */
export class Instrumento2DetailDto {
  @ApiProperty({ example: 42, description: 'Id del instrumento (uso interno de la API, no se muestra en UI)' })
  id: number;

  @ApiProperty({ enum: Instrumento2Estado, example: Instrumento2Estado.PENDIENTE })
  estado: Instrumento2Estado;

  @ApiProperty({ example: '2111-45', description: 'Código de la copia de ocupación (CNO o CUOC)' })
  ocupacion: string;

  @ApiProperty({
    example: '2111',
    description:
      'Código de la ocupación REAL del catálogo, sin el sufijo de copia. Es el que se muestra al experto y en los reportes.',
  })
  codigoOriginal: string;

  @ApiProperty({ enum: ['CNO', 'CUOC'], description: 'Catálogo donde vive la copia editable' })
  panelOrigen: 'CNO' | 'CUOC';

  @ApiPropertyOptional({ nullable: true }) nombre?: string | null;
  @ApiPropertyOptional({ nullable: true }) descripcion?: string | null;
  @ApiPropertyOptional({ nullable: true }) nivelCualificacion?: string | null;
  /**
   * Codigo del nivel (`cno_nivel_cualificacion.cod_cualificacion`), aparte del nombre.
   *
   * El frontend necesita el numero para `codNivelCualificacion`, y como antes solo
   * recibia el nombre lo deducia con `Number('Auxiliares y operativos')`, que da NaN
   * y terminaba guardando 0 en instrumento3_propuesta y mostrando 0 en Resumen.
   */
  @ApiPropertyOptional({ nullable: true, example: '3', description: 'Codigo del nivel de cualificacion' })
  codNivelCualificacion?: string | null;
  @ApiPropertyOptional({ nullable: true }) areaDesempeno?: string | null;
  @ApiPropertyOptional({ nullable: true }) fechaRegistro?: string | null;
  @ApiPropertyOptional({ nullable: true }) fechaInactividad?: string | null;
  @ApiPropertyOptional({ nullable: true }) trazabilidad?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Nota libre del analista' }) observacion?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Fecha en que Análisis creó el registro' }) fecha?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Correo/usuario del analista que lo envió' }) analista?: string | null;

  @ApiProperty({ type: () => [FuncionSnapshotDto] }) funciones: FuncionSnapshotDto[];
  @ApiProperty({ type: () => [NombreSnapshotDto] }) denominaciones: NombreSnapshotDto[];
  @ApiProperty({ type: () => [NombreSnapshotDto] }) habilidades: NombreSnapshotDto[];
  @ApiProperty({ type: () => [NombreSnapshotDto] }) conocimientos: NombreSnapshotDto[];
  @ApiProperty({ type: () => [NombreSnapshotDto] }) ocupacionesRelacionadas: NombreSnapshotDto[];

  @ApiPropertyOptional({ type: () => [OcupacionResumenDto], description: 'Ocupaciones asociadas a este instrumento' })
  ocupaciones?: OcupacionResumenDto[];

  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    description:
      'Ya enviado a experto: códigos (de la copia) de las ocupaciones que lleva el snapshot vigente, ' +
      'en el orden del instrumento. null = aún no se ha enviado.',
  })
  ocupacionesEnviadas?: string[] | null;

  @ApiPropertyOptional({
    type: () => [PreguntaSnapshotDto],
    description:
      'Snapshot plano de `pregunta`: los ítems reales que el experto debe validar. ' +
      'Se genera al Guardar / Enviar a experto.',
  })
  preguntas?: PreguntaSnapshotDto[];
}

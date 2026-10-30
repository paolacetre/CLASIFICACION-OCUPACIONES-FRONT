import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Contrato de la API pública del buscador de ocupaciones (sitio externo).
 *
 * Sigue las dos pantallas del buscador: la lista de resultados (ocupación con
 * sus denominaciones) y la ficha de la ocupación. Es un contrato propio y no
 * reutiliza ConsultaOcupacionResult a propósito: la consulta interna puede
 * cambiar sin romper el sitio externo.
 */

export type TipoClasificacion = 'CNO' | 'CUOC';

export class CodigoNombreDto {
  @ApiProperty({ example: '2111' })
  codigo: string;

  @ApiProperty({ example: 'Físicos y astrónomos', nullable: true, type: String })
  nombre: string | null;
}

// ── Pantalla 1: resultados del buscador ─────────────────────────────────────

export class ResultadoBuscadorDto {
  @ApiProperty({ enum: ['CNO', 'CUOC'] })
  tipo: TipoClasificacion;

  @ApiProperty({ example: '0211', description: 'Código de la ocupación. Es texto: puede tener ceros a la izquierda.' })
  codigo: string;

  @ApiProperty({ example: 'Gerentes de ingeniería' })
  nombre: string;

  @ApiProperty({
    type: [CodigoNombreDto],
    description:
      'Denominaciones activas que coinciden con el texto buscado. Si la ocupación coincidió solo por código o nombre, trae todas sus denominaciones activas.',
  })
  denominaciones: CodigoNombreDto[];
}

// ── Pantalla 2: ficha de la ocupación ───────────────────────────────────────

export class UbicacionEstructuraDto {
  @ApiProperty({ type: CodigoNombreDto, nullable: true, description: 'CNO: área de desempeño. CUOC: área de cualificación.' })
  areaDesempeno: CodigoNombreDto | null;

  @ApiProperty({ type: CodigoNombreDto, nullable: true, description: 'CNO: nivel de cualificación. CUOC: nivel de competencia.' })
  nivelCualificacion: CodigoNombreDto | null;

  // Sin área ocupacional ni campo ocupacional: el campo ocupacional
  // (cno_ocupacion.campo_ocup_cno, p. ej. "021", y su descripción) es
  // exclusivo de usuarios APE.
}

export class FuncionFichaDto {
  @ApiProperty({ example: '01', description: 'Consecutivo para mostrar en la lista (01, 02, ...).' })
  numero: string;

  @ApiProperty({ example: 'F-897' })
  codigo: string;

  @ApiProperty({ example: 'Planear, organizar, dirigir y controlar las actividades y operaciones de un departamento…' })
  descripcion: string;
}

export class CorrelativaFichaDto {
  @ApiProperty({ enum: ['CNO', 'CUOC'], description: 'Clasificación de las ocupaciones equivalentes (la contraria a la ficha).' })
  tipo: TipoClasificacion;

  @ApiProperty({ type: [CodigoNombreDto] })
  ocupaciones: CodigoNombreDto[];
}

export class FichaOcupacionDto {
  @ApiProperty({ enum: ['CNO', 'CUOC'] })
  tipo: TipoClasificacion;

  @ApiProperty({ example: '0211' })
  codigo: string;

  @ApiProperty({ example: 'Gerentes de ingeniería' })
  nombre: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  descripcion: string | null;

  @ApiProperty({ type: UbicacionEstructuraDto })
  ubicacion: UbicacionEstructuraDto;

  @ApiProperty({ type: [FuncionFichaDto] })
  funciones: FuncionFichaDto[];

  @ApiProperty({ type: [String], description: 'Siempre vacío por ahora: el catálogo no tiene fuente de normas.' })
  normasAsociadas: string[];

  @ApiProperty({ type: [CodigoNombreDto] })
  denominaciones: CodigoNombreDto[];

  @ApiProperty({ type: [CodigoNombreDto] })
  ocupacionesRelacionadas: CodigoNombreDto[];

  @ApiProperty({ type: [CodigoNombreDto] })
  habilidades: CodigoNombreDto[];

  @ApiProperty({ type: [CodigoNombreDto] })
  conocimientos: CodigoNombreDto[];

  @ApiProperty({ type: CorrelativaFichaDto })
  correlativa: CorrelativaFichaDto;
}

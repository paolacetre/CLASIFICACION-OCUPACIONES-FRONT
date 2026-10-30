import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BuscarOpcionesDto, TipoOpcion } from './dto/buscar-opciones.dto';

export interface OpcionExistente {
  codigo: string;
  nombre: string;
}

/**
 * Consulta de SOLO LECTURA para el selector «Agregar» de Análisis y Comparativa:
 * devuelve funciones, denominaciones, habilidades o conocimientos que ya
 * existen en base de datos, para reutilizarlos en vez de escribirlos de nuevo.
 *
 * Las funciones, habilidades y conocimientos CNO salen de sus catálogos
 * compartidos (`cno_funcion`, `habilidad_destreza`, `cno_conocimiento`).
 * Denominaciones y funciones CUOC pertenecen a cada ocupación, así que se toman
 * de las ocupaciones ORIGINALES (sin las copias de Análisis, que llevan
 * `id_comparativa`) y se deduplican por nombre.
 */
@Injectable()
export class AnalisisOpcionesService {
  constructor(private readonly dataSource: DataSource) {}

  async buscar(dto: BuscarOpcionesDto): Promise<OpcionExistente[]> {
    const texto = (dto.q ?? '').trim();
    const limite = dto.limite ?? 25;
    const sql = this.consulta(dto.tipo, dto.catalogo);

    // $1: patrón (o NULL para no filtrar), $2: límite. `unaccent` no está
    // garantizado en la BD, así que se compara sin tildes con translate().
    const patron = texto ? `%${texto}%` : null;
    const filas: Array<{ codigo: unknown; nombre: unknown }> = await this.dataSource.query(sql, [patron, limite]);

    return filas
      .map((f) => ({ codigo: String(f.codigo ?? '').trim(), nombre: String(f.nombre ?? '').trim() }))
      .filter((f) => f.nombre.length > 0);
  }

  private consulta(tipo: TipoOpcion, catalogo: 'CNO' | 'CUOC'): string {
    const coincide = (codigo: string, nombre: string) =>
      `($1::text IS NULL OR ${codigo}::text ILIKE $1 OR ${this.sinTildes(nombre)} ILIKE ${this.sinTildes('$1')})`;

    if (tipo === 'habilidades') {
      return `SELECT cod_hab_dest AS codigo, nomb_hab_dest AS nombre
                FROM clasificacion.habilidad_destreza
               WHERE ${coincide('cod_hab_dest', 'nomb_hab_dest')}
               ORDER BY nomb_hab_dest LIMIT $2`;
    }

    if (tipo === 'conocimientos') {
      const tabla = catalogo === 'CNO' ? 'cno_conocimiento' : 'cuoc_conocimiento';
      return `SELECT cod_conocimiento AS codigo, nomb_conocimiento AS nombre
                FROM clasificacion.${tabla}
               WHERE ${coincide('cod_conocimiento', 'nomb_conocimiento')}
               ORDER BY nomb_conocimiento LIMIT $2`;
    }

    if (tipo === 'funciones' && catalogo === 'CNO') {
      return `SELECT cod_funcion AS codigo, desc_funcion_cno AS nombre
                FROM clasificacion.cno_funcion
               WHERE ${coincide('cod_funcion', 'desc_funcion_cno')}
               ORDER BY cod_funcion LIMIT $2`;
    }

    if (tipo === 'funciones') {
      return `SELECT DISTINCT ON (lower(f.nom_funcion_cuoc)) f.cod_funcion_cuoc AS codigo, f.nom_funcion_cuoc AS nombre
                FROM clasificacion.cuoc_funciones f
                JOIN clasificacion.cuoc_ocupacion o ON o.cod_ocupacion_cuoc = f.cod_ocupacion_cuoc
               WHERE o.id_comparativa IS NULL AND ${coincide('f.cod_funcion_cuoc', 'f.nom_funcion_cuoc')}
               ORDER BY lower(f.nom_funcion_cuoc) LIMIT $2`;
    }

    if (catalogo === 'CNO') {
      return `SELECT DISTINCT ON (lower(d.desc_denominacion)) d.cod_denominacion_cno AS codigo, d.desc_denominacion AS nombre
                FROM clasificacion.cno_denominacion d
                JOIN clasificacion.cno_ocupacion o ON o.cod_ocupacion_cno = d.cno_cod_ocupacion
               WHERE o.id_comparativa IS NULL AND COALESCE(d.estado, 1) = 1
                 AND ${coincide('d.cod_denominacion_cno', 'd.desc_denominacion')}
               ORDER BY lower(d.desc_denominacion) LIMIT $2`;
    }

    return `SELECT DISTINCT ON (lower(d.nom_denominacion)) d.cod_denominacion AS codigo, d.nom_denominacion AS nombre
              FROM clasificacion.cuoc_denominacion d
              JOIN clasificacion.cuoc_ocupacion o ON o.cod_ocupacion_cuoc = d.cod_ocupacion_cuoc
             WHERE o.id_comparativa IS NULL AND ${coincide('d.cod_denominacion', 'd.nom_denominacion')}
             ORDER BY lower(d.nom_denominacion) LIMIT $2`;
  }

  /** Quita tildes para que «tecnico» encuentre «técnico». */
  private sinTildes(expr: string): string {
    return `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;
  }
}

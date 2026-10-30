import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { ActualizarItemCatalogoDto, CrearItemCatalogoDto } from '../dto/item-catalogo.dto';
import { resincronizarSecuencia, siguienteConsecutivo } from '../../modules/cno/utils/cno-secuencia.util';

/**
 * Describe un catálogo simple (código + nombre + descripción opcional) para
 * crearlo, editarlo y eliminarlo con las mismas reglas en CNO y CUOC:
 * - el nombre es único (Análisis resuelve estos ítems por su nombre);
 * - al renombrar se actualizan las columnas que guardan el nombre como texto;
 * - solo se elimina si ninguna tabla lo referencia.
 *
 * Los nombres de tablas y columnas son constantes del código, nunca vienen del usuario.
 */
export interface CatalogoSimple<T extends ObjectLiteral> {
  entidad: EntityTarget<T>;
  tabla: string;
  colCodigo: string;
  colNombre: string;
  /** Sin columna de descripción propia (p. ej. áreas CUOC, cuyo nombre vive en `descripcion`). */
  colDescripcion?: string;
  /** 'texto': el usuario escribe el código. 'entero': se asigna MAX + 1. */
  codigo: 'texto' | 'entero';
  /** Para los mensajes, con artículo indefinido: 'un área', 'una habilidad'… */
  etiqueta: string;
  /** Columnas que copian el nombre como texto y deben seguirlo al renombrar. */
  nombresCopiados: { tabla: string; colCodigo: string; colNombre: string }[];
  /** Tablas que lo referencian: con alguna fila, no se puede eliminar. */
  usos: { tabla: string; colCodigo: string; descripcion: string }[];
}

export async function crearItemCatalogo<T extends ObjectLiteral>(
  manager: EntityManager,
  cat: CatalogoSimple<T>,
  dto: CrearItemCatalogoDto,
): Promise<T> {
  const nombre = dto.nombre.trim();
  let codigo: string | number;

  if (cat.codigo === 'texto') {
    codigo = dto.codigo?.trim() ?? '';
    if (!codigo) throw new BadRequestException('El código es obligatorio.');
    const [{ existe }] = await manager.query(
      `SELECT EXISTS (SELECT 1 FROM ${cat.tabla} WHERE lower(${cat.colCodigo}) = lower($1)) AS existe`,
      [codigo],
    );
    if (existe) throw new ConflictException(`Ya existe ${cat.etiqueta} con el código ${codigo}.`);
  } else {
    // Las secuencias de estas tablas están desfasadas respecto a los datos
    // cargados desde Excel: el código se calcula con un lock para no chocar.
    codigo = await siguienteConsecutivo(
      manager,
      `catalogo_${cat.tabla}`,
      `SELECT COALESCE(MAX(${cat.colCodigo}), 0) + 1 AS next FROM ${cat.tabla}`,
      [],
    );
  }

  await exigirNombreLibre(manager, cat, nombre, null);

  const columnas = [cat.colCodigo, cat.colNombre];
  const valores: unknown[] = [codigo, nombre];
  if (cat.colDescripcion) {
    columnas.push(cat.colDescripcion);
    valores.push(dto.descripcion?.trim() || null);
  }
  await manager.query(
    `INSERT INTO ${cat.tabla} (${columnas.join(', ')}) VALUES (${valores.map((_, i) => `$${i + 1}`).join(', ')})`,
    valores,
  );
  if (cat.codigo === 'entero') await resincronizarSecuencia(manager, cat.tabla, cat.colCodigo);
  return buscarItem(manager, cat, String(codigo));
}

export async function actualizarItemCatalogo<T extends ObjectLiteral>(
  manager: EntityManager,
  cat: CatalogoSimple<T>,
  cod: string,
  dto: ActualizarItemCatalogoDto,
): Promise<T> {
  const codigo = (await exigirExistente(manager, cat, cod)).codigo;

  if (dto.nombre !== undefined) {
    const nombre = dto.nombre.trim();
    await exigirNombreLibre(manager, cat, nombre, codigo);
    await manager.query(`UPDATE ${cat.tabla} SET ${cat.colNombre} = $1 WHERE ${cat.colCodigo} = $2`, [nombre, codigo]);
    for (const copia of cat.nombresCopiados) {
      await manager.query(`UPDATE ${copia.tabla} SET ${copia.colNombre} = $1 WHERE ${copia.colCodigo} = $2`, [
        nombre,
        codigo,
      ]);
    }
  }
  if (dto.descripcion !== undefined && cat.colDescripcion) {
    await manager.query(`UPDATE ${cat.tabla} SET ${cat.colDescripcion} = $1 WHERE ${cat.colCodigo} = $2`, [
      dto.descripcion.trim() || null,
      codigo,
    ]);
  }
  return buscarItem(manager, cat, String(codigo));
}

export async function eliminarItemCatalogo<T extends ObjectLiteral>(
  manager: EntityManager,
  cat: CatalogoSimple<T>,
  cod: string,
): Promise<{ message: string }> {
  const { codigo, nombre } = await exigirExistente(manager, cat, cod);

  const enUso: string[] = [];
  for (const uso of cat.usos) {
    const [{ total }] = await manager.query(
      `SELECT count(*)::int AS total FROM ${uso.tabla} WHERE ${uso.colCodigo} = $1`,
      [codigo],
    );
    if (total > 0) enUso.push(`${total} ${uso.descripcion}`);
  }
  if (enUso.length) {
    throw new ConflictException(`No se puede eliminar "${nombre}": lo usan ${enUso.join(', ')}.`);
  }

  await manager.query(`DELETE FROM ${cat.tabla} WHERE ${cat.colCodigo} = $1`, [codigo]);
  return { message: `Se eliminó "${nombre}".` };
}

async function exigirExistente<T extends ObjectLiteral>(
  manager: EntityManager,
  cat: CatalogoSimple<T>,
  cod: string,
): Promise<{ codigo: string | number; nombre: string }> {
  const valor = String(cod ?? '').trim();
  const codigo = cat.codigo === 'entero' ? (/^\d{1,9}$/.test(valor) ? Number(valor) : null) : valor;
  const [fila] =
    codigo === null || codigo === ''
      ? []
      : await manager.query(
          `SELECT ${cat.colCodigo} AS codigo, ${cat.colNombre} AS nombre FROM ${cat.tabla} WHERE ${cat.colCodigo} = $1 FOR UPDATE`,
          [codigo],
        );
  if (!fila) throw new NotFoundException(`No existe ${cat.etiqueta} con el código ${valor}.`);
  return fila;
}

async function exigirNombreLibre<T extends ObjectLiteral>(
  manager: EntityManager,
  cat: CatalogoSimple<T>,
  nombre: string,
  excepto: string | number | null,
): Promise<void> {
  const [{ existe }] = await manager.query(
    `SELECT EXISTS (
       SELECT 1 FROM ${cat.tabla}
       WHERE lower(trim(${cat.colNombre})) = lower($1) AND ($2::text IS NULL OR ${cat.colCodigo}::text <> $2::text)
     ) AS existe`,
    [nombre, excepto === null ? null : String(excepto)],
  );
  if (existe) {
    throw new ConflictException(
      `Ya existe ${cat.etiqueta} con el nombre "${nombre}". Usa uno distinto: Análisis identifica estos ítems por su nombre.`,
    );
  }
}

async function buscarItem<T extends ObjectLiteral>(manager: EntityManager, cat: CatalogoSimple<T>, cod: string): Promise<T> {
  const pk = manager.connection.getMetadata(cat.entidad).primaryColumns[0].propertyName;
  const item = await manager.findOne(cat.entidad, {
    where: { [pk]: cat.codigo === 'entero' ? Number(cod) : cod } as never,
  });
  if (!item) throw new NotFoundException(`No existe ${cat.etiqueta} con el código ${cod}.`);
  return item;
}

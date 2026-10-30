import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { Instrumento } from '../instrumento2/entities/instrumento.entity';
import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { Respuesta } from '../encuesta/entities/respuesta.entity';
import { PreguntaRespuesta } from '../encuesta/entities/pregunta-respuesta.entity';
import { Role } from '../../common/enums/role.enum';
import { InstrumentoExperto } from './entities/instrumento-experto.entity';
import { GuardarValidacionExpertaDto, ValidacionCampoDto } from './dto/validacion-experta.dto';
import { ExpertoEnSesion, ValidacionExpertaService } from './validacion-experta.service';

const usuarios: Record<number, { idUsuario: number; nombreApellido: string; correo: string }> = {
  6: { idUsuario: 6, nombreApellido: 'Ana Ruiz', correo: 'ana@sena.edu.co' },
  7: { idUsuario: 7, nombreApellido: 'Luis Gómez', correo: 'luis@sena.edu.co' },
  8: { idUsuario: 8, nombreApellido: 'Marta Díaz', correo: 'marta@sena.edu.co' },
};

/**
 * Base de datos en memoria con lo justo que usa el servicio: `respuestas`,
 * `pregunta_respuesta`, `instrumento_experto` y el estado del instrumento.
 * Así se prueban las reglas de varios expertos sin Postgres.
 */
function crearEntorno(
  instrumento: Partial<Instrumento>,
  preguntas: Array<Partial<Pregunta>>,
  asignados: number[] = [],
) {
  const db = {
    estadoInstrumento: instrumento.estado as string,
    respuestas: [] as any[],
    filas: [] as any[],
    asignados: [...asignados],
    secuencia: 0,
  };

  const conUsuario = (r: any, soloId: boolean) => ({
    ...r,
    usuario: soloId ? r.idUsuario : usuarios[r.idUsuario],
    preguntaRespuestas: db.filas
      .filter((f) => f.idRespuesta === r.idRespuesta)
      .map((f) => ({ ...f, pregunta: preguntas.find((p) => p.idPregunta === f.idPregunta) })),
  });

  const filtroEstado = (estado: any) => (r: any) => {
    if (estado === undefined) return true;
    if (typeof estado === 'object' && estado?.type === 'not') return r.estado !== estado.value;
    return r.estado === estado;
  };

  const queryBuilder = () => {
    const qb: any = {
      select: () => qb,
      where: () => qb,
      andWhere: () => qb,
      innerJoin: () => qb,
      distinct: () => qb,
      orderBy: () => qb,
      addOrderBy: () => qb,
      getRawOne: async () => ({ ronda: Math.max(...preguntas.map((p) => p.ronda ?? 1)) }),
      getMany: async () => Object.values(usuarios),
    };
    return qb;
  };

  const manager: any = {
    createQueryBuilder: jest.fn(queryBuilder),
    findOne: jest.fn(async (entidad: unknown, opciones: any) => {
      if (entidad === Instrumento) return { ...instrumento, estado: db.estadoInstrumento };
      if (entidad === Respuesta) {
        const w = opciones.where;
        const encontrada = db.respuestas.find(
          (r) => r.idUsuario === w.usuario.idUsuario && r.ronda === w.ronda,
        );
        return encontrada ? conUsuario(encontrada, false) : null;
      }
      return null;
    }),
    find: jest.fn(async (entidad: unknown, opciones: any) => {
      if (entidad === Pregunta) return preguntas.filter((p) => (p.ronda ?? 1) === (opciones.where.ronda ?? 1));
      if (entidad === InstrumentoExperto) {
        return db.asignados.map((idUsuario, i) => ({
          id: i + 1,
          usuario: opciones.loadRelationIds ? idUsuario : usuarios[idUsuario],
        }));
      }
      if (entidad === Respuesta) {
        const soloId = !!opciones.loadRelationIds;
        return db.respuestas.filter(filtroEstado(opciones.where.estado)).map((r) => conUsuario(r, soloId));
      }
      return [];
    }),
    create: jest.fn((_entidad: unknown, datos: any) => ({ ...datos })),
    save: jest.fn(async (entidad: unknown, datos: any) => {
      if (entidad !== Respuesta) return datos;
      const fila = {
        ...datos,
        idUsuario: datos.usuario.idUsuario,
        idRespuesta: datos.idRespuesta ?? ++db.secuencia,
      };
      db.respuestas = [...db.respuestas.filter((r) => r.idRespuesta !== fila.idRespuesta), fila];
      return fila;
    }),
    insert: jest.fn(async (entidad: unknown, filas: any[]) => {
      if (entidad === PreguntaRespuesta) {
        db.filas.push(
          ...filas.map((f, i) => ({
            ...f,
            id: db.filas.length + i + 1,
            idRespuesta: f.cabecera.idRespuesta,
            idPregunta: f.pregunta.idPregunta,
          })),
        );
      }
      if (entidad === InstrumentoExperto) db.asignados = filas.map((f) => f.usuario.idUsuario);
    }),
    delete: jest.fn(async (entidad: unknown, where: any) => {
      if (entidad === PreguntaRespuesta) {
        db.filas = db.filas.filter((f) => f.idRespuesta !== where.cabecera.idRespuesta);
      }
    }),
    update: jest.fn(async (_entidad: unknown, _where: unknown, cambios: any) => {
      db.estadoInstrumento = cambios.estado;
    }),
  };

  const dataSource = { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
  const service = new ValidacionExpertaService({ manager } as any, dataSource as any);
  return { service, manager, db };
}

const experto = (idUsuario: number, rol: string = Role.EXPERTO): ExpertoEnSesion => ({
  idUsuario,
  correo: usuarios[idUsuario]?.correo ?? 'x@sena.edu.co',
  rol,
});

const datosGenerales = {
  nombreApellidos: 'Ana Ruiz',
  email: 'ana@sena.edu.co',
  telefono: '3001234567',
  departamento: 'Antioquia',
  municipio: 'Medellín',
  empresaEntidad: 'SENA',
  cargo: 'Instructora',
  profesion: 'Ingeniera',
};

const instrumento: Partial<Instrumento> = {
  idInstrumento: 4,
  tipo: 'instrumento2',
  estado: 'ENVIADO_EXPERTO',
  ocupacion: '1121-4-1',
  comparativaOcupacion: { codigo: 4 } as any,
};

/** Snapshot de dos ocupaciones; la principal con filas sin `cod_ocupacion` (histórico). */
const preguntas: Array<Partial<Pregunta>> = [
  { idPregunta: 1, identificador: 'nombre', detalle: 'Uno', codOcupacion: null, ronda: 1 },
  { idPregunta: 2, identificador: 'descripcion', detalle: 'Desc uno', codOcupacion: null, ronda: 1 },
  { idPregunta: 3, identificador: 'funcion', detalle: 'F1', codOcupacion: null, ronda: 1 },
  { idPregunta: 4, identificador: 'funcion', detalle: 'F2', codOcupacion: null, ronda: 1 },
  { idPregunta: 5, identificador: 'trazabilidad', detalle: 'T', codOcupacion: null, ronda: 1 },
  { idPregunta: 6, identificador: 'nombre', detalle: 'Dos', codOcupacion: '2138-4-2', ronda: 1 },
  { idPregunta: 7, identificador: 'funcion', detalle: 'G1', codOcupacion: '2138-4-2', ronda: 1 },
];

/** Todos los campos calificables, en "aplica". */
const todos = (): ValidacionCampoDto[] => [
  { campo: 'nombre', estado: 'aplica' },
  { campo: 'descripcion', estado: 'aplica' },
  { campo: 'funcion_1', estado: 'aplica' },
  { campo: 'funcion_2', estado: 'aplica' },
  { campo: 'nombre', codOcupacion: '2138-4-2', estado: 'aplica' },
  { campo: 'funcion', codOcupacion: '2138-4-2', estado: 'aplica' },
];

const dto = (cambios: Partial<GuardarValidacionExpertaDto>): GuardarValidacionExpertaDto => ({
  estado: 'aprobada',
  datosGenerales,
  campos: todos(),
  ...cambios,
});

describe('ValidacionExpertaService · respuesta de un experto', () => {
  it('cada veredicto queda enlazado a SU fila de pregunta (también los de la principal sin cod_ocupacion)', async () => {
    const { service, db } = crearEntorno(instrumento, preguntas);
    const resultado = await service.guardar(4, dto({}), experto(6), 'instrumento2');

    expect(db.filas.map((f) => f.idPregunta)).toEqual([1, 2, 3, 4, 6, 7]);
    expect(db.filas.every((f) => f.usuario.idUsuario === 6)).toBe(true);
    expect(resultado.campos.map((c) => [c.campo, c.codOcupacion])).toEqual([
      ['nombre', '1121-4-1'],
      ['descripcion', '1121-4-1'],
      ['funcion_1', '1121-4-1'],
      ['funcion_2', '1121-4-1'],
      ['nombre', '2138-4-2'],
      ['funcion', '2138-4-2'],
    ]);
    // El texto evaluado sale de `pregunta`, no se copia en la respuesta
    expect(resultado.campos[2].valorOriginal).toBe('F1');
    expect(resultado.experto).toEqual({ idUsuario: 6, nombre: 'Ana Ruiz', correo: 'ana@sena.edu.co' });
  });

  it('el comentario va en `otro`, sea propuesta de mejora o comentario libre', async () => {
    const { service, db } = crearEntorno(instrumento, preguntas);
    const campos = todos();
    campos[2] = { ...campos[2], estado: 'propuesta_mejora', comentario: 'Precisar el verbo' };
    campos[3] = { ...campos[3], estado: 'no_aplica', comentario: '  ' };

    const resultado = await service.guardar(4, dto({ estado: 'ajustes_solicitados', campos }), experto(6), 'instrumento2');

    expect(db.filas.find((f) => f.idPregunta === 3)).toEqual(
      expect.objectContaining({ respuesta: 'propuesta_mejora', otro: 'Precisar el verbo' }),
    );
    expect(db.filas.find((f) => f.idPregunta === 4)?.otro).toBeNull();
    expect(resultado.conteos).toEqual({ aplica: 4, no_aplica: 1, requiere_ajuste: 0, propuesta_mejora: 1 });
  });

  it('la descripción corregida queda como propuesta del experto, no reescribe la ocupación', async () => {
    const { service, db, manager } = crearEntorno(instrumento, preguntas);
    const resultado = await service.guardar(
      4,
      dto({
        infoOcupaciones: [
          { codOcupacion: '1121-4-1', descripcion: 'Desc corregida' },
          // Igual a lo enviado: no es una propuesta
          { codOcupacion: '2138-4-2', descripcion: 'Dos' },
        ],
      }),
      experto(6),
      'instrumento2',
    );

    expect(db.filas.find((f) => f.idPregunta === 2)?.valorPropuesto).toBe('Desc corregida');
    expect(resultado.infoOcupaciones).toEqual([{ codOcupacion: '1121-4-1', descripcion: 'Desc corregida' }]);
    // Solo se toca el estado del instrumento, nunca la copia de la ocupación
    expect(manager.update.mock.calls.every(([entidad]: [unknown]) => entidad === Instrumento)).toBe(true);
  });

  it('un campo que no está en el snapshot se rechaza (400) en vez de perderse', async () => {
    const { service } = crearEntorno(instrumento, preguntas);
    await expect(
      service.guardar(4, { estado: 'en_revision', campos: [{ campo: 'funcion_9', estado: 'aplica' }] }, experto(6), 'instrumento2'),
    ).rejects.toThrow(/funcion_9/);
  });

  it('revalidar reemplaza lo de ESE experto sin duplicar su cabecera', async () => {
    const { service, db } = crearEntorno(instrumento, preguntas);
    await service.guardar(4, { estado: 'en_revision', campos: [{ campo: 'nombre', estado: 'aplica' }] }, experto(6), 'instrumento2');
    await service.guardar(4, { estado: 'en_revision', campos: [{ campo: 'nombre', estado: 'no_aplica' }] }, experto(6), 'instrumento2');

    expect(db.respuestas).toHaveLength(1);
    expect(db.filas).toHaveLength(1);
    expect(db.filas[0].respuesta).toBe('no_aplica');
  });
});

describe('ValidacionExpertaService · varios expertos', () => {
  it('un experto no asignado no puede responder (403); el administrador sí', async () => {
    const { service } = crearEntorno(instrumento, preguntas, [6, 7]);
    await expect(service.guardar(4, dto({}), experto(8), 'instrumento2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.guardar(4, { estado: 'en_revision', campos: [] }, experto(8, Role.ADMINISTRADOR), 'instrumento2'),
    ).resolves.toBeDefined();
  });

  it('el instrumento sigue abierto hasta que TODOS los asignados cierran', async () => {
    const { service, db } = crearEntorno(instrumento, preguntas, [6, 7]);

    await service.guardar(4, dto({}), experto(6), 'instrumento2');
    expect(db.estadoInstrumento).toBe('ENVIADO_EXPERTO');

    await service.guardar(4, dto({}), experto(7), 'instrumento2');
    expect(db.estadoInstrumento).toBe('APROBADO_FINAL');
  });

  it('cada experto ve solo su validación', async () => {
    const { service } = crearEntorno(instrumento, preguntas, [6, 7]);
    await service.guardar(4, dto({}), experto(6), 'instrumento2');

    expect(await service.getValidacion(4, experto(7), 'instrumento2')).toBeNull();
    expect((await service.getValidacion(4, experto(6), 'instrumento2'))?.experto.idUsuario).toBe(6);
  });

  it('un borrador no cuenta para el cierre automático', async () => {
    const { service, db } = crearEntorno(instrumento, preguntas, [6, 7]);
    await service.guardar(4, dto({}), experto(6), 'instrumento2');
    await service.guardar(4, { estado: 'en_revision', campos: [] }, experto(7), 'instrumento2');
    expect(db.estadoInstrumento).toBe('ENVIADO_EXPERTO');
  });

  it('sin expertos asignados (históricos) el primer veredicto final cierra, como antes', async () => {
    const { service, db } = crearEntorno(instrumento, preguntas, []);
    await service.guardar(4, dto({ estado: 'ajustes_solicitados' }), experto(6), 'instrumento2');
    expect(db.estadoInstrumento).toBe('AJUSTES_SOLICITADOS');
  });

  it('un instrumento ya cerrado no admite más respuestas (409)', async () => {
    const { service } = crearEntorno({ ...instrumento, estado: 'APROBADO_FINAL' }, preguntas, [6]);
    await expect(service.guardar(4, dto({}), experto(6), 'instrumento2')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ValidacionExpertaService · cierre manual y consolidado', () => {
  it('el analista cierra con las validaciones ya cerradas aunque falten expertos', async () => {
    const { service, db } = crearEntorno(instrumento, preguntas, [6, 7, 8]);
    await service.guardar(4, dto({ estado: 'ajustes_solicitados' }), experto(6), 'instrumento2');
    await service.guardar(4, { estado: 'en_revision', campos: [] }, experto(7), 'instrumento2');

    const avance = await service.cerrarValidacion(4, 'instrumento2');

    expect(db.estadoInstrumento).toBe('AJUSTES_SOLICITADOS');
    expect(avance.asignados).toBe(3);
    expect(avance.cerrados).toBe(1);
  });

  it('no se cierra a mano si ningún experto ha cerrado (409)', async () => {
    const { service } = crearEntorno(instrumento, preguntas, [6, 7]);
    await service.guardar(4, { estado: 'en_revision', campos: [] }, experto(6), 'instrumento2');
    await expect(service.cerrarValidacion(4, 'instrumento2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('consolidado: ajustes manda, aprobado solo si todos aprueban, si no validado', () => {
    const { service } = crearEntorno(instrumento, preguntas);
    expect(service.estadoConsolidado(['aprobada', 'ajustes_solicitados', 'rechazada'])).toBe('AJUSTES_SOLICITADOS');
    expect(service.estadoConsolidado(['aprobada', 'aprobada'])).toBe('APROBADO_FINAL');
    expect(service.estadoConsolidado(['aprobada', 'rechazada'])).toBe('VALIDADO');
  });
});

describe('ValidacionExpertaService · completitud del cierre', () => {
  it('rechaza (400) un cierre al que le falta una ocupación, nombrándola por su código real', async () => {
    const { service, manager } = crearEntorno(instrumento, preguntas);
    const soloPrincipal = todos().filter((c) => !c.codOcupacion);

    await expect(service.guardar(4, dto({ campos: soloPrincipal }), experto(6), 'instrumento2')).rejects.toThrow(
      /la ocupación 2138 tiene 2 criterio\(s\) sin calificar/,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('"Con propuesta de mejora" sin texto se rechaza (es el único comentario obligatorio)', async () => {
    const { service } = crearEntorno(instrumento, preguntas);
    const campos = todos();
    campos[2] = { ...campos[2], estado: 'propuesta_mejora' };

    await expect(service.guardar(4, dto({ campos }), experto(6), 'instrumento2')).rejects.toThrow(
      /«funcion_1» \(ocupación 1121\) está en "Con propuesta de mejora" sin comentario/,
    );
  });

  it('rechaza el cierre si falta un dato del informante', async () => {
    const { service } = crearEntorno(instrumento, preguntas);
    await expect(
      service.guardar(4, dto({ datosGenerales: { ...datosGenerales, cargo: '  ' } }), experto(6), 'instrumento2'),
    ).rejects.toThrow(/falta el dato del informante «Cargo»/);
  });

  it('un borrador (en_revision) se guarda sin exigir completitud ni datos del informante', async () => {
    const { service, db } = crearEntorno(instrumento, preguntas);
    const resultado = await service.guardar(
      4,
      { estado: 'en_revision', campos: [{ campo: 'nombre', estado: 'aplica' }] },
      experto(6),
      'instrumento2',
    );
    expect(resultado.estado).toBe('en_revision');
    expect(db.estadoInstrumento).toBe('ENVIADO_EXPERTO');
    expect(db.respuestas[0].departamento).toBeNull();
  });

  it('Instrumento 3 conserva su contrato: no se le exige el snapshot multi-ocupación', async () => {
    const { service } = crearEntorno({ ...instrumento, tipo: 'instrumento3' }, preguntas);
    const resultado = await service.guardar(
      4,
      { estado: 'aprobada', campos: [{ campo: 'nombre', estado: 'aplica' }] },
      experto(6),
      'instrumento3',
    );
    expect(resultado.estado).toBe('aprobada');
  });

  it('los errores de contenido son BadRequestException (400)', async () => {
    const { service } = crearEntorno(instrumento, preguntas);
    await expect(service.guardar(4, dto({ campos: [] }), experto(6), 'instrumento2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

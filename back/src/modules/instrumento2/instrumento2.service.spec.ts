import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { CnoOcupacion } from '../cno/entities/cno-ocupacion.entity';
import { CuocOcupacion } from '../cuoc/entities/cuoc-ocupacion.entity';
import { BadRequestException } from '@nestjs/common';
import { Instrumento } from './entities/instrumento.entity';
import { Instrumento2Service } from './instrumento2.service';
import { codigoRealDeCopia } from './ocupaciones-de-instrumento';

/** Copia CNO de prueba, con funciones y denominaciones guardadas en desorden. */
const copiaCno = (codigo: string, nombre: string) => ({
  codOcupacionCno: codigo,
  nombOcupacionCno: nombre,
  descripcion: `Descripción de ${nombre}`,
  idComparativa: 3,
  funciones: [
    { codigo: `${codigo}-F2`, descFuncionCno: 'Segunda función', funcion: { codFuncion: 'F-419' } },
    { codigo: `${codigo}-F1`, descFuncionCno: 'Primera función', funcion: { codFuncion: 'F-418' } },
  ],
  denominaciones: [
    { codDenominacionCno: `${codigo}-D10`, descDenominacion: 'Décima' },
    { codDenominacionCno: `${codigo}-D2`, descDenominacion: 'Segunda' },
    { codDenominacionCno: `${codigo}-D1`, descDenominacion: 'Primera' },
  ],
  habilidades: [],
  conocimientos: [],
  relacionadas: [],
});

/** Copia CUOC: función como entero suelto, denominación "<copia>.NNN". */
const copiaCuoc = (codigo: string) => ({
  codOcupacionCuoc: codigo,
  nomOcupacionCuoc: 'Ocupación CUOC',
  descOcupacionCuoc: 'Desc CUOC',
  idComparativa: 3,
  funciones: [
    { codFuncionCuoc: '3', nomFuncionCuoc: 'Tercera' },
    { codFuncionCuoc: '1', nomFuncionCuoc: 'Primera' },
  ],
  denominaciones: [{ codDenominacion: `${codigo}.001`, nomDenominacion: 'Única' }],
  destrezas: [],
  regConocimientos: [],
  ocupacionesAfines: [],
});

const copias: Record<string, any> = {
  '1112-3-1': copiaCno('1112-3-1', 'Ocupación uno'),
  '1131-3-2': copiaCno('1131-3-2', 'Ocupación dos'),
  '01100-3-3': copiaCuoc('01100-3-3'),
};

/** Agrupación combinada: dos CNO y una CUOC. */
const row: any = {
  idInstrumento: 3,
  tipo: 'instrumento2',
  estado: 'ENVIADO_EXPERTO',
  ocupacion: '1112-3-1',
  observacion: 'Nota del analista',
  comparativaOcupacion: {
    codigo: 3,
    ocupacionCno: { codOcupacionCno: '1112-3-1' },
    codOcupacionCno2: '1131-3-2',
    ocupacionCuoc: { codOcupacionCuoc: '01100-3-3' },
  },
};

/**
 * Consultas de `rondas-snapshot`: la ronda más alta guardada y si ya tiene
 * respuestas de expertos.
 */
function queryBuilder(
  ronda: { maxima: number | null; respondida: boolean },
  actualizaciones: any[] = [],
) {
  const qb: any = {
    select: () => qb,
    update: () => qb,
    set: (valores: any) => {
      qb.valores = valores;
      return qb;
    },
    execute: async () => {
      actualizaciones.push({ set: qb.valores, where: qb.condicion });
    },
    where: (condicion: string, parametros?: any) => {
      qb.condicion = { condicion, parametros };
      return qb;
    },
    andWhere: () => qb,
    innerJoin: () => qb,
    getRawOne: async () => ({ ronda: ronda.maxima }),
    getExists: async () => ronda.respondida,
  };
  return qb;
}

function crearServicio(
  preguntasGuardadas: any[] = [],
  ronda: { maxima: number | null; respondida: boolean } = { maxima: null, respondida: false },
) {
  const insertadas: any[] = [];
  const actualizaciones: any[] = [];
  const guardados: any[] = [];
  let instrumento: any = null;
  const manager = {
    createQueryBuilder: jest.fn(() => queryBuilder(ronda, actualizaciones)),
    save: jest.fn(async (_entidad: unknown, fila: any) => {
      guardados.push({ ...fila });
      return fila;
    }),
    findOne: jest.fn(async (entidad: unknown, opciones: any) => {
      if (entidad === Instrumento) return instrumento;
      // Cada catálogo solo encuentra SUS copias, como en la base de datos.
      const copia = copias[opciones.where.codOcupacionCno ?? opciones.where.codOcupacionCuoc];
      if (entidad === CnoOcupacion) return copia?.codOcupacionCno ? copia : null;
      if (entidad === CuocOcupacion) return copia?.codOcupacionCuoc ? copia : null;
      return null;
    }),
    find: jest.fn(async (entidad: unknown) => (entidad === Pregunta ? preguntasGuardadas : [])),
    delete: jest.fn(async (_entidad: unknown, _where: unknown) => undefined),
    insert: jest.fn(async (_entidad: unknown, filas: any[]) => {
      insertadas.push(...filas);
    }),
  };
  const validacionExperta = {
    asignarExpertos: jest.fn(async () => undefined),
    notificarAsignacion: jest.fn(),
  };
  const queryRunner = {
    manager,
    connect: jest.fn(async () => undefined),
    startTransaction: jest.fn(async () => undefined),
    commitTransaction: jest.fn(async () => undefined),
    rollbackTransaction: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
  };
  const service = new Instrumento2Service(
    { manager } as any,
    {} as any,
    validacionExperta as any,
    { extraerCodigoOriginal: (c: string, comp: number) => codigoRealDeCopia(c, comp) } as any,
    { createQueryRunner: () => queryRunner } as any,
  );
  /** Instrumento que devuelve la BD de prueba (copia: el servicio lo muta). */
  const conInstrumento = (fila: any) => {
    instrumento = { ...fila };
  };
  return { service, manager, insertadas, actualizaciones, guardados, validacionExperta, queryRunner, conInstrumento };
}

describe('Instrumento2Service · snapshot multi-ocupación', () => {
  it('regenerarPreguntas guarda los ítems de TODAS las ocupaciones, cada uno con la suya', async () => {
    const { service, manager, insertadas } = crearServicio();
    const escrita = await service.regenerarPreguntas(manager as any, row);

    // Sin respuestas todavía: se reemplaza la ronda vigente (la 1)
    expect(escrita).toBe(1);
    expect(manager.delete).toHaveBeenCalledTimes(1);
    expect(manager.delete.mock.calls[0][1]).toEqual(expect.objectContaining({ ronda: 1 }));
    expect(insertadas.every((fila) => fila.ronda === 1)).toBe(true);
    const porOcupacion = insertadas.reduce<Record<string, number>>((acc, fila) => {
      acc[fila.codOcupacion] = (acc[fila.codOcupacion] ?? 0) + 1;
      return acc;
    }, {});
    expect(Object.keys(porOcupacion)).toEqual(['1112-3-1', '1131-3-2', '01100-3-3']);
    // La observación del analista es de la cabecera: una sola vez, en la principal
    const observaciones = insertadas.filter((f) => f.identificador === 'observacion');
    expect(observaciones.map((f) => f.codOcupacion)).toEqual(['1112-3-1']);
  });

  it('una ronda que ya tiene respuestas no se toca: el snapshot nuevo va en la siguiente', async () => {
    const { service, manager, insertadas } = crearServicio([], { maxima: 2, respondida: true });
    const escrita = await service.regenerarPreguntas(manager as any, row);

    expect(escrita).toBe(3);
    expect(manager.delete).not.toHaveBeenCalled();
    expect(insertadas.length).toBeGreaterThan(0);
    expect(insertadas.every((fila) => fila.ronda === 3)).toBe(true);
  });

  it('descripción y área de desempeño van en el snapshot aunque estén vacías', async () => {
    const vacia = { ...copiaCno('1112-3-1', 'Ocupación uno'), descripcion: null };
    const original = copias['1112-3-1'];
    copias['1112-3-1'] = vacia;
    try {
      const { service, manager, insertadas } = crearServicio();
      const sola = { ...row, comparativaOcupacion: { codigo: 3, ocupacionCno: { codOcupacionCno: '1112-3-1' } } };
      await service.regenerarPreguntas(manager as any, sola);
      const identificadores = insertadas.map((fila) => fila.identificador);
      expect(identificadores).toContain('descripcion');
      expect(identificadores).toContain('area_desempeno');
    } finally {
      copias['1112-3-1'] = original;
    }
  });

  it('con una sola ocupación el snapshot es solo de esa', async () => {
    const { service, manager, insertadas } = crearServicio();
    const sola = { ...row, comparativaOcupacion: { codigo: 3, ocupacionCno: { codOcupacionCno: '1112-3-1' } } };
    await service.regenerarPreguntas(manager as any, sola);
    expect(new Set(insertadas.map((f) => f.codOcupacion))).toEqual(new Set(['1112-3-1']));
  });

  it('normaliza y ordena funciones y denominaciones (CNO): F-<real>.NN, D-<real>.NNN', async () => {
    const { service, manager, insertadas } = crearServicio();
    await service.regenerarPreguntas(manager as any, row);

    const de = (cod: string, id: string) =>
      insertadas.filter((f) => f.codOcupacion === cod && f.identificador === id);
    expect(de('1112-3-1', 'funcion').map((f) => [f.otro, f.detalle])).toEqual([
      ['F-1112.01', 'Primera función'],
      ['F-1112.02', 'Segunda función'],
    ]);
    expect(de('1112-3-1', 'denominacion').map((f) => [f.otro, f.detalle])).toEqual([
      ['D-1112.001', 'Primera'],
      ['D-1112.002', 'Segunda'],
      ['D-1112.003', 'Décima'],
    ]);
    // CUOC: el entero suelto y "<copia>.NNN" salen con el mismo formato
    expect(de('01100-3-3', 'funcion').map((f) => f.otro)).toEqual(['F-01100.01', 'F-01100.02']);
    expect(de('01100-3-3', 'denominacion').map((f) => f.otro)).toEqual(['D-01100.001']);
  });

  it('el detalle conserva el código interno para que la edición no rompa el enlace al catálogo', async () => {
    const { service, manager } = crearServicio();
    const detalle = await (service as any).toOcupacionDto(manager, row, '1112-3-1');
    expect(detalle.funciones.map((f: any) => [f.codigo, f.codigoInterno])).toEqual([
      ['F-1112.01', 'F-418'],
      ['F-1112.02', 'F-419'],
    ]);
  });

  it('al editar, un código normalizado se traduce de vuelta al interno', () => {
    const { service } = crearServicio();
    const vigentes = [{ codigo: 'F-1112.01', codigoInterno: 'F-418' }];
    const resultado = (service as any).conCodigoInterno(
      [
        { codigo: 'F-1112.01', descripcion: 'Editada' },
        { codigo: 'F-900', descripcion: 'Nueva del catálogo' },
        { codigo: 'F-1112.02', codigoInterno: 'F-419', descripcion: 'Con interno' },
      ],
      vigentes,
    );
    expect(resultado.map((f: any) => f.codigo)).toEqual(['F-418', 'F-900', 'F-419']);
    expect(resultado.every((f: any) => !('codigoInterno' in f))).toBe(true);
  });

  it('cargarPreguntasEnLote atribuye a la principal las filas antiguas y completa en memoria las ocupaciones que faltan', async () => {
    const antiguas = [
      { idPregunta: 1, identificador: 'nombre', detalle: 'Ocupación uno', otro: null, codOcupacion: null, instrumento: 3 },
    ];
    const { service, manager } = crearServicio(antiguas);
    const mapa: Map<number, any[]> = await (service as any).cargarPreguntasEnLote(manager, [row]);
    const items = mapa.get(3)!;

    expect(items[0].codOcupacion).toBe('1112-3-1');
    expect(new Set(items.map((i) => i.codOcupacion))).toEqual(new Set(['1112-3-1', '1131-3-2', '01100-3-3']));
  });

  it('cargarPreguntasEnLote muestra solo la ronda vigente de cada instrumento', async () => {
    const filas = [
      { idPregunta: 1, identificador: 'nombre', detalle: 'Ronda uno', otro: null, codOcupacion: '1112-3-1', ronda: 1, instrumento: 3 },
      { idPregunta: 9, identificador: 'nombre', detalle: 'Ronda dos', otro: null, codOcupacion: '1112-3-1', ronda: 2, instrumento: 3 },
    ];
    const { service, manager } = crearServicio(filas);
    const sola = { ...row, estado: 'GUARDADO', comparativaOcupacion: { codigo: 3, ocupacionCno: { codOcupacionCno: '1112-3-1' } } };
    const mapa: Map<number, any[]> = await (service as any).cargarPreguntasEnLote(manager, [sola]);

    expect(mapa.get(3)!.map((item) => item.detalle)).toEqual(['Ronda dos']);
  });

  it('no completa en memoria instrumentos que no están enviados a experto', async () => {
    const antiguas = [
      { idPregunta: 1, identificador: 'nombre', detalle: 'X', otro: null, codOcupacion: null, instrumento: 3 },
    ];
    const { service, manager } = crearServicio(antiguas);
    const mapa: Map<number, any[]> = await (service as any).cargarPreguntasEnLote(manager, [
      { ...row, estado: 'AJUSTES_SOLICITADOS' },
    ]);
    expect(mapa.get(3)!.length).toBe(1);
  });

  it('cargarPreguntasEnLote no completa un snapshot actual: lleva solo las ocupaciones elegidas', async () => {
    const enviadas = [
      { idPregunta: 1, identificador: 'nombre', detalle: 'Ocupación uno', otro: null, codOcupacion: '1112-3-1', instrumento: 3 },
    ];
    const { service, manager } = crearServicio(enviadas);
    const mapa: Map<number, any[]> = await (service as any).cargarPreguntasEnLote(manager, [row]);
    expect(new Set(mapa.get(3)!.map((i) => i.codOcupacion))).toEqual(new Set(['1112-3-1']));
  });
});

describe('Instrumento2Service · elegir ocupaciones al enviar a experto', () => {
  const guardado = { ...row, estado: 'GUARDADO', usuario: { idUsuario: 4 } };

  it('envía solo las elegidas y arma el snapshot con ellas, en el orden del instrumento', async () => {
    const { service, insertadas, guardados, validacionExperta, conInstrumento } = crearServicio();
    conInstrumento(guardado);

    await service.enviarExperto(3, [6], ['01100-3-3', '1112-3-1']);

    const final = guardados.at(-1);
    expect(final.estado).toBe('ENVIADO_EXPERTO');
    expect(final.ocupacion).toBe('1112-3-1');
    expect([...new Set(insertadas.map((f) => f.codOcupacion))]).toEqual(['1112-3-1', '01100-3-3']);
    expect(validacionExperta.asignarExpertos).toHaveBeenCalledTimes(1);
  });

  it('si la principal no se envía, la principal pasa a ser la primera elegida y lleva la observación', async () => {
    const { service, insertadas, guardados, actualizaciones, conInstrumento } = crearServicio();
    conInstrumento(guardado);

    await service.enviarExperto(3, [6], ['1131-3-2']);

    expect(guardados.at(-1).ocupacion).toBe('1131-3-2');
    // Los ítems antiguos sin ocupación se fijan a la principal anterior antes de moverla
    expect(actualizaciones).toEqual([
      expect.objectContaining({ set: { codOcupacion: '1112-3-1' } }),
    ]);
    expect(new Set(insertadas.map((f) => f.codOcupacion))).toEqual(new Set(['1131-3-2']));
    const observaciones = insertadas.filter((f) => f.identificador === 'observacion');
    expect(observaciones.map((f) => f.codOcupacion)).toEqual(['1131-3-2']);
  });

  it.each([
    ['ninguna', []],
    ['solo espacios', ['  ']],
    ['más de 3', ['1112-3-1', '1131-3-2', '01100-3-3', '9999-3-4']],
    ['una que no es del instrumento', ['1112-3-1', '9999-3-4']],
  ])('rechaza la elección: %s, sin tocar nada', async (_caso, ocupaciones) => {
    const { service, guardados, insertadas, queryRunner, conInstrumento } = crearServicio();
    conInstrumento(guardado);

    await expect(service.enviarExperto(3, [6], ocupaciones as string[])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(guardados).toEqual([]);
    expect(insertadas).toEqual([]);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('qué ocupaciones se enviaron sale del snapshot vigente (null si aún no se envía)', () => {
    const { service } = crearServicio();
    const snapshot = [{ codOcupacion: '01100-3-3' }, { codOcupacion: '1112-3-1' }];
    expect((service as any).ocupacionesDelSnapshot(row, snapshot)).toEqual(['1112-3-1', '01100-3-3']);
    expect((service as any).ocupacionesDelSnapshot({ ...row, estado: 'AJUSTES_SOLICITADOS' }, snapshot)).toEqual([
      '1112-3-1',
      '01100-3-3',
    ]);
    expect((service as any).ocupacionesDelSnapshot({ ...row, estado: 'GUARDADO' }, snapshot)).toBeNull();
    expect((service as any).ocupacionesDelSnapshot(row, [])).toBeNull();
  });
});

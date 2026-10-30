import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { Respuesta } from '../encuesta/entities/respuesta.entity';
import { Instrumento3Propuesta } from '../instrumento3/entities/instrumento3-propuesta.entity';
import { ResumenService } from './resumen.service';

/** Instrumento 2 con su comparativa (slots CNO). */
const instrumento = (id: number, slots: string[]) => ({
  idInstrumento: id,
  tipo: 'instrumento2',
  estado: 'AJUSTES_SOLICITADOS',
  ocupacion: slots[0],
  fecha: new Date('2026-09-30T10:00:00Z'),
  usuario: { usuario: 'analista@sena.edu.co' },
  comparativaOcupacion: {
    codigo: id,
    ocupacionCno: { codOcupacionCno: slots[0] },
    codOcupacionCno2: slots[1] ?? null,
    codOcupacionCno3: slots[2] ?? null,
  },
});

const pregunta = (
  id: number,
  instrumentoId: number,
  identificador: string,
  detalle: string,
  cod: string | null,
  ronda = 1,
) => ({
  idPregunta: id,
  identificador,
  detalle,
  otro: null,
  codOcupacion: cod,
  ronda,
  instrumento: instrumentoId,
});

/** Veredicto de un ítem, apuntando a su fila de `pregunta`. */
const veredicto = (preg: ReturnType<typeof pregunta>, respuesta: string | null, extra: Record<string, string> = {}) => ({
  id: preg.idPregunta * 10,
  respuesta,
  otro: null,
  valorPropuesto: null,
  pregunta: preg,
  ...extra,
});

const experto = (idUsuario: number, nombre: string) => ({ idUsuario, nombreApellido: nombre, correo: `${nombre}@sena.edu.co` });

function crearServicio(datos: { instrumentos: any[]; preguntas: any[]; respuestas: any[] }) {
  const manager = {
    find: jest.fn(async (entidad: unknown, opciones: any) => {
      if (entidad === Pregunta) return datos.preguntas;
      if (entidad === Respuesta) {
        // `estado: Not('en_revision')`: el borrador no llega
        const excluido = opciones.where.estado?.value;
        return datos.respuestas.filter((r) => r.estado !== excluido);
      }
      if (entidad === Instrumento3Propuesta) return [];
      return [];
    }),
  };
  const repo = { manager, find: jest.fn(async () => datos.instrumentos) };
  return new ResumenService(repo as any);
}

describe('ResumenService · una fila por experto', () => {
  const tres = instrumento(11, ['5113-11-1', '6212-11-2', '9112-11-3']);
  const historico = instrumento(6, ['1122-6-1', '2233-6-2']);

  const p = {
    nombre1: pregunta(1, 11, 'nombre', 'Archivistas', '5113-11-1'),
    nombre2: pregunta(2, 11, 'nombre', 'Administradores de comercio', '6212-11-2'),
    funcion2: pregunta(3, 11, 'funcion', 'Supervisar ventas', '6212-11-2'),
    nombre3: pregunta(4, 11, 'nombre', 'Jefes de laboratorio', '9112-11-3'),
    desc1: pregunta(7, 11, 'descripcion', 'Desc original', '5113-11-1'),
    // Histórico: filas sin cod_ocupacion → la principal
    historica: pregunta(5, 6, 'nombre', 'Ocupación histórica', null),
    // Ronda 2 del instrumento 6: no la respondió la validación de la ronda 1
    historicaR2: pregunta(8, 6, 'nombre', 'Ocupación corregida', null, 2),
  };

  const servicio = () =>
    crearServicio({
      instrumentos: [tres, historico],
      preguntas: Object.values(p),
      respuestas: [
        {
          idRespuesta: 1,
          instrumento: 11,
          ronda: 1,
          estado: 'ajustes_solicitados',
          fechaValidacion: new Date('2026-10-01T10:00:00Z'),
          usuario: experto(6, 'Ana'),
          nombreApellido: 'Ana Ruiz',
          preguntaRespuestas: [
            veredicto(p.nombre1, 'aplica'),
            veredicto(p.desc1, 'propuesta_mejora', { otro: 'Más concreta', valorPropuesto: 'Desc corregida' }),
            veredicto(p.nombre2, 'aplica'),
            veredicto(p.funcion2, 'no_aplica', { otro: 'ya existe en 2113' }),
            veredicto(p.nombre3, 'propuesta_mejora', { otro: 'Precisar el nombre' }),
          ],
        },
        {
          idRespuesta: 2,
          instrumento: 11,
          ronda: 1,
          estado: 'aprobada',
          fechaValidacion: new Date('2026-10-02T10:00:00Z'),
          usuario: experto(7, 'Luis'),
          preguntaRespuestas: [veredicto(p.nombre1, 'aplica')],
        },
        {
          idRespuesta: 3,
          instrumento: 11,
          ronda: 1,
          estado: 'en_revision',
          fechaValidacion: new Date(),
          usuario: experto(8, 'Marta'),
          preguntaRespuestas: [],
        },
        {
          idRespuesta: 4,
          instrumento: 6,
          ronda: 1,
          estado: 'aprobada',
          fechaValidacion: new Date('2026-09-20T10:00:00Z'),
          usuario: experto(6, 'Ana'),
          preguntaRespuestas: [veredicto(p.historica, 'no_aplica')],
        },
      ],
    });

  it('devuelve una fila por experto que cerró, agrupadas por instrumento, sin borradores', async () => {
    const registros = await servicio().listar();
    expect(registros.map((r) => [r.token, r.experto])).toEqual([
      ['11', 'Ana'],
      ['11', 'Luis'],
      ['6', 'Ana'],
    ]);
    expect(registros.every((r) => r.estadoFlujo === 'completado')).toBe(true);
  });

  it('agrupa los veredictos de ESE experto por ocupación, en el orden de la agrupación', async () => {
    const [ana] = await servicio().listar();

    expect(ana.ocupaciones.map((o) => o.codigoOriginal)).toEqual(['5113', '6212', '9112']);
    expect(ana.ocupaciones.map((o) => o.nombre)).toEqual([
      'Archivistas',
      'Administradores de comercio',
      'Jefes de laboratorio',
    ]);
    const segunda = ana.ocupaciones[1];
    expect(segunda.criterios.map((c) => c.id)).toEqual(['nombre', 'funcion']);
    expect(segunda.respuestas.find((r) => r.criterioId === 'funcion')).toEqual(
      expect.objectContaining({ comentario: 'ya existe en 2113', valor: 'Supervisar ventas' }),
    );
    expect(ana.ocupaciones[2].respuestas[0].comentario).toBe('Precisar el nombre');
  });

  it('la propuesta de texto del experto viaja con su ítem', async () => {
    const [ana] = await servicio().listar();
    const descripcion = ana.ocupaciones[0].respuestas.find((r) => r.criterioId === 'descripcion');
    expect(descripcion?.valorPropuesto).toBe('Desc corregida');
    // El snapshot sigue mostrando lo que se envió
    expect(ana.ocupaciones[0].formularioOriginal?.['descripcion']).toBe('Desc original');
  });

  it('los criterios planos llevan la ocupación delante para no pisarse', async () => {
    const [ana] = await servicio().listar();
    const ids = ana.criterios.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('6212-11-2::funcion');
  });

  it('cada validación se lee contra el snapshot de SU ronda', async () => {
    const historica = (await servicio().listar())[2];
    expect(historica.ronda).toBe(1);
    expect(historica.ocupaciones.map((o) => o.codigo)).toEqual(['1122-6-1']);
    expect(historica.ocupaciones[0].nombre).toBe('Ocupación histórica');
  });

  it('el instrumento lleva sus códigos reales de catálogo y el nombre del informante', async () => {
    const [ana] = await servicio().listar();
    expect(ana.codOcupacionCNO).toBe('5113 | 6212 | 9112');
    expect(ana.instrumentoOrigen).toBe('I2');
    expect(ana.nombreApellidos).toBe('Ana Ruiz');
    expect(ana.formularioOriginal?.['expertoNombre']).toBe('Ana');
  });

  it('los códigos de catálogo son solo los de las ocupaciones que se enviaron a validar', async () => {
    // El instrumento 6 agrupa dos ocupaciones, pero al experto solo le llegó la principal
    const historica = (await servicio().listar())[2];
    expect(historica.codOcupacionCNO).toBe('1122');
  });
});

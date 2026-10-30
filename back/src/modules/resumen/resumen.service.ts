import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';

import { Instrumento } from '../instrumento2/entities/instrumento.entity';
import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { Respuesta } from '../encuesta/entities/respuesta.entity';
import { Instrumento3Propuesta } from '../instrumento3/entities/instrumento3-propuesta.entity';
import { camposDeSnapshot } from '../validacion-experta/campos-validables';
import { expertoDeUsuario } from '../validacion-experta/experto-de-usuario';
import {
  codigoRealDeCopia,
  codigosOcupacionesDeInstrumento,
  ocupacionDeItem,
  panelDeOcupacion,
} from '../instrumento2/ocupaciones-de-instrumento';
import { ResumenOcupacionDto, ResumenRecordDto } from './dto/resumen.dto';


/** Instrumentos que ya llegaron a los expertos: son los que Resumen consolida. */
const ESTADOS_VISIBLES = [
  'ENVIADO_EXPERTO',
  'VALIDADO',
  'AJUSTES_SOLICITADOS',
  'APROBADO_FINAL',
];

/** Validación que el experto aún no cierra: no entra al reporte. */
const BORRADOR = 'en_revision';

/** Identificadores del snapshot que son campos simples, no ítems de lista. */
const CAMPOS_SIMPLES = new Set([
  'nombre',
  'descripcion',
  'nivel_cualificacion',
  'area_desempeno',
  'fecha_registro',
  'fecha_inactividad',
  'trazabilidad',
  'observacion',
  'cod_ocupacion_cno',
  'cod_ocupacion_cuoc',
  'otras_habilidades',
  'otros_conocimientos',
]);

/**
 * Consolida para Resumen las validaciones que los expertos ya cerraron: UNA
 * fila por experto, instrumento y ronda. Varios expertos validan el mismo
 * instrumento, y sus filas comparten `token` (la agrupación).
 *
 * Todo sale de tablas reales: `instrumento` (cabecera), `respuestas` (la
 * validación de cada experto, con los datos del informante),
 * `pregunta_respuesta` (su veredicto por ítem), `pregunta` (el snapshot de esa
 * ronda) e `instrumento3_propuesta` para lo propio de I3.
 *
 * Un borrador ('en_revision', lo que deja «Guardar cambios») no entra: se
 * sigue trabajando, y publicarlo convertía cada guardado intermedio en un
 * registro del reporte con criterios a medio calificar.
 */
@Injectable()
export class ResumenService {
  private readonly logger = new Logger(ResumenService.name);

  constructor(
    @InjectRepository(Instrumento)
    private readonly instrumentoRepo: Repository<Instrumento>,
  ) {}

  async listar(): Promise<ResumenRecordDto[]> {
    const manager = this.instrumentoRepo.manager;

    const instrumentos = await this.instrumentoRepo.find({
      where: { estado: In(ESTADOS_VISIBLES) },
      // La comparativa se carga para poder deshacer con exactitud el sufijo
      // del código de copia (ver `codigoRealDeCopia`). Es un solo JOIN.
      relations: [
        'usuario',
        'comparativaOcupacion',
        // cod_ocupacion_cno / cod_ocupacion_cuoc son JoinColumn de estas dos
        // relaciones: sin cargarlas se pierde el codigo primario de cada
        // catalogo y el reporte sale sin el codigo CUOC.
        'comparativaOcupacion.ocupacionCno',
        'comparativaOcupacion.ocupacionCuoc',
      ],
      order: { idInstrumento: 'DESC' },
    });
    if (instrumentos.length === 0) return [];

    const ids = instrumentos.map((row) => row.idInstrumento);

    // Tres consultas en lote en vez de tres por instrumento
    const respuestas = await manager.find(Respuesta, {
      where: { instrumento: { idInstrumento: In(ids) }, estado: Not(BORRADOR) },
      relations: ['usuario', 'preguntaRespuestas', 'preguntaRespuestas.pregunta'],
      loadRelationIds: { relations: ['instrumento'] },
      order: { fechaValidacion: 'ASC' },
    });
    if (respuestas.length === 0) return [];

    // Todas las rondas: cada validación se lee contra el snapshot que respondió.
    const preguntas = await manager.find(Pregunta, {
      where: { instrumento: { idInstrumento: In(ids) } },
      order: { idPregunta: 'ASC' },
      loadRelationIds: { relations: ['instrumento'] },
    });

    const propuestasI3 = await manager.find(Instrumento3Propuesta, {
      where: { instrumento: { idInstrumento: In(ids) } },
      loadRelationIds: { relations: ['instrumento'] },
    });

    const preguntasPor = new Map<string, Pregunta[]>();
    for (const pregunta of preguntas) {
      const clave = this.claveRonda(pregunta.instrumento as unknown as number, pregunta.ronda);
      preguntasPor.set(clave, [...(preguntasPor.get(clave) ?? []), pregunta]);
    }
    const propuestaPor = new Map<number, Instrumento3Propuesta>();
    for (const p of propuestasI3) {
      propuestaPor.set(p.instrumento as unknown as number, p);
    }
    const respuestasPor = new Map<number, Respuesta[]>();
    for (const respuesta of respuestas) {
      const id = respuesta.instrumento as unknown as number;
      respuestasPor.set(id, [...(respuestasPor.get(id) ?? []), respuesta]);
    }

    const registros = instrumentos.flatMap((row) =>
      (respuestasPor.get(row.idInstrumento) ?? []).map((respuesta) =>
        this.toRecord(
          row,
          preguntasPor.get(this.claveRonda(row.idInstrumento, respuesta.ronda)) ?? [],
          respuesta,
          propuestaPor.get(row.idInstrumento),
        ),
      ),
    );

    this.logger.log(
      `Resumen: ${registros.length} validaciones cerradas en ${respuestasPor.size} de ${instrumentos.length} instrumentos`,
    );
    return registros;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private claveRonda(idInstrumento: number, ronda: number): string {
    return `${idInstrumento}#${ronda ?? 1}`;
  }

  private toRecord(
    row: Instrumento,
    preguntas: Pregunta[],
    respuesta: Respuesta,
    propuesta: Instrumento3Propuesta | undefined,
  ): ResumenRecordDto {
    const esI3 = row.tipo === 'instrumento3';
    // Codigos REALES del catalogo (sin el sufijo de copia) de las ocupaciones
    // que el instrumento agrupa. Un instrumento puede llevar hasta 3 de cada
    // catalogo, asi que se unen con " | " igual que el resto de listas.
    const ocupaciones = this.ocupacionesDelRegistro(row, preguntas, respuesta, propuesta, esI3);
    // Solo las que se validaron en esta ronda: quien envía elige de 1 a 3 de
    // las ocupaciones del grupo, y las que no se enviaron no van al reporte.
    const codigos = esI3
      ? { cno: '', cuoc: '' }
      : this.codigosDeCatalogo(row, new Set(ocupaciones.map((o) => o.codigo)));
    const principal = ocupaciones.find((o) => o.codigo === ocupacionDeItem(null, row)) ?? ocupaciones[0];

    // Los campos planos del registro describen la ocupación PRINCIPAL: con
    // varias ocupaciones, mezclar sus nombres, áreas y listas en un solo campo
    // no identifica a ninguna. Cada una tiene lo suyo en `ocupaciones`.
    const formularioOriginal: Record<string, unknown> = { ...(principal?.formularioOriginal ?? {}) };

    // Criterios y respuestas en plano, para los consumidores que aún no leen
    // `ocupaciones`. Con más de una ocupación el id lleva delante la copia:
    // "funcion_1" existe en cada una y sin prefijo se pisarían.
    const variasOcupaciones = ocupaciones.length > 1;
    const criterios = ocupaciones.flatMap((o) =>
      o.criterios.map((c) => ({
        id: variasOcupaciones ? `${o.codigo}::${c.id}` : c.id,
        label: variasOcupaciones ? `[${o.codigoOriginal}] ${c.label}` : c.label,
      })),
    );
    const respuestasPlanas = ocupaciones.flatMap((o) =>
      o.respuestas.map((r) => ({
        ...r,
        criterioId: variasOcupaciones ? `${o.codigo}::${r.criterioId}` : r.criterioId,
      })),
    );

    const experto = expertoDeUsuario(respuesta.usuario);

    return {
      token: String(row.idInstrumento),
      respuestaId: respuesta.idRespuesta,
      ronda: respuesta.ronda,
      experto: experto.nombre,
      // Solo entran validaciones cerradas
      estadoFlujo: 'completado',
      instrumentoOrigen: esI3 ? 'I3' : 'I2',
      instrumentoId: row.tipo ?? '',
      analistaId: row.usuario?.usuario ?? '',
      fecha: this.fechaAIso(row.fecha) ?? '',

      // El ciclo del registro: cuándo entró y cuándo el experto guardó su
      // validación por última vez.
      horaInicio: this.fechaAIso(row.fecha) ?? '',
      horaFinalizacion: this.fechaAIso(respuesta.fechaValidacion) ?? '',

      // Informante: lo diligencia el experto durante la validación. Para I3 el
      // formulario ya lo traía, así que sirve de respaldo.
      nombreApellidos: respuesta.nombreApellido?.trim() || propuesta?.nombreApellidos || '',
      email: respuesta.email ?? propuesta?.email ?? '',
      telefono: respuesta.telefono ?? propuesta?.telefono ?? '',
      departamento: respuesta.departamento ?? propuesta?.departamento ?? '',
      municipio: respuesta.municipio ?? propuesta?.municipio ?? '',
      empresaEntidad: respuesta.empresaEntidad ?? propuesta?.empresaEntidad ?? '',
      cargo: respuesta.cargo ?? propuesta?.cargo ?? '',
      profesion: respuesta.profesion ?? propuesta?.profesion ?? '',

      sector: propuesta?.sector ?? '',
      ocupacionCno: String(formularioOriginal['nombre'] ?? propuesta?.nombreOcupacion ?? row.ocupacion ?? ''),
      // `row.ocupacion` es el código de la COPIA ("0112-14"). En el reporte va
      // el de la ocupación real del catálogo, igual que en la bandeja del
      // experto; si no, el Excel sale con códigos que no existen en la CNO.
      codOcupacionCNO: String(
        formularioOriginal['cod_ocupacion_cno'] ?? propuesta?.codOcupacionCNO ?? codigos.cno,
      ),
      codOcupacionCUOC: String(
        formularioOriginal['cod_ocupacion_cuoc'] ?? propuesta?.codOcupacionCUOC ?? codigos.cuoc,
      ),
      codArea: propuesta?.codArea ?? 0,
      codNivelCualificacion: propuesta?.codNivelCualificacion ?? 0,

      criterios,
      respuestas: respuestasPlanas,
      ocupaciones,
      formularioOriginal: {
        ...formularioOriginal,
        // Nombres que la tabla de Resumen ya sabe leer
        areaDesempeno: formularioOriginal['area_desempeno'] ?? propuesta?.areaDesempeno ?? '',
        nivelCualificacion:
          formularioOriginal['nivel_cualificacion'] ?? propuesta?.nivelCualificacion ?? '',
        // La columna del reporte se rotula "Nivel de cualificacion" y para I2 el
        // valor util es el TEXTO ("Nivel 1"); el id numerico solo existe en I3.
        // El front resuelve las columnas mirando primero formularioOriginal.
        codNivelCualificacion:
          formularioOriginal['nivel_cualificacion'] ??
          propuesta?.codNivelCualificacion ??
          '',
        descripcion: formularioOriginal['descripcion'] ?? propuesta?.descripcion ?? '',
        observacionesExperto: respuesta.observaciones ?? '',
        expertoNombre: experto.nombre,
        estadoValidacion: respuesta.estado,
      },
    };
  }

  /**
   * Las ocupaciones validadas juntas, cada una con SU snapshot y LAS
   * respuestas de este experto. El orden es el mismo con el que Instrumento 2
   * arma el snapshot y el modal del experto (`codigosOcupacionesDeInstrumento`).
   *
   * Los ítems sin ocupación (anteriores a la migración 028) van a la
   * principal. Una ocupación sin snapshot ni respuestas no se lista.
   */
  private ocupacionesDelRegistro(
    row: Instrumento,
    preguntas: Pregunta[],
    respuesta: Respuesta,
    propuesta: Instrumento3Propuesta | undefined,
    esI3: boolean,
  ): ResumenOcupacionDto[] {
    const ocupacionDe = (pregunta: Pregunta) => ocupacionDeItem(pregunta.codOcupacion, row);

    const preguntasPor = new Map<string, Pregunta[]>();
    for (const pregunta of preguntas) {
      const codigo = ocupacionDe(pregunta);
      preguntasPor.set(codigo, [...(preguntasPor.get(codigo) ?? []), pregunta]);
    }

    // El veredicto apunta a su fila de `pregunta`; el nombre de campo
    // ("funcion_2") sale de la posición de esa fila en su ronda.
    const campoDe = new Map(camposDeSnapshot(preguntas, ocupacionDe).map((c) => [c.item.idPregunta, c]));
    const respuestasPor = new Map<string, ResumenOcupacionDto['respuestas']>();
    for (const fila of respuesta.preguntaRespuestas ?? []) {
      const campo = campoDe.get(fila.pregunta?.idPregunta);
      if (!campo || !fila.respuesta) continue;
      respuestasPor.set(campo.codOcupacion, [
        ...(respuestasPor.get(campo.codOcupacion) ?? []),
        {
          criterioId: campo.campo,
          estado: fila.respuesta,
          comentario: fila.otro ?? '',
          valor: fila.pregunta.detalle ?? '',
          valorPropuesto: fila.valorPropuesto ?? undefined,
        },
      ]);
    }

    const orden = esI3 ? [ocupacionDeItem(null, row)] : codigosOcupacionesDeInstrumento(row);
    for (const codigo of [...preguntasPor.keys(), ...respuestasPor.keys()]) {
      if (!orden.includes(codigo)) orden.push(codigo);
    }

    return orden
      .filter((codigo) => preguntasPor.has(codigo) || respuestasPor.has(codigo))
      .map((codigo) => {
        const formularioOriginal = this.formularioDeSnapshot(preguntasPor.get(codigo) ?? []);
        const respuestas = respuestasPor.get(codigo) ?? [];
        return {
          codigo,
          codigoOriginal: esI3
            ? propuesta?.codOcupacionCNO || codigo
            : codigoRealDeCopia(codigo, row.comparativaOcupacion?.codigo),
          nombre: String(
            formularioOriginal['nombre'] ?? (esI3 ? propuesta?.nombreOcupacion : undefined) ?? codigo,
          ),
          panelOrigen: esI3 ? 'CNO' : panelDeOcupacion(row, codigo),
          // La etiqueta visible ("5. FUNCIONES 2") la pone el frontend a partir
          // del id: es donde vive el catálogo de secciones del formulario.
          criterios: respuestas.map((r) => ({ id: r.criterioId, label: r.criterioId })),
          respuestas,
          formularioOriginal,
        };
      });
  }

  /** Campos simples y listas (como texto legible) del snapshot de una ocupación. */
  private formularioDeSnapshot(preguntas: Pregunta[]): Record<string, unknown> {
    const formulario: Record<string, unknown> = {};
    for (const pregunta of preguntas) {
      if (CAMPOS_SIMPLES.has(pregunta.identificador)) {
        formulario[pregunta.identificador] = pregunta.detalle;
      }
    }
    // Las listas se agregan como texto legible, no como [object Object]
    for (const identificador of ['funcion', 'denominacion', 'habilidad', 'conocimiento', 'relacionada']) {
      const valores = preguntas.filter((p) => p.identificador === identificador).map((p) => p.detalle);
      if (valores.length > 0) {
        formulario[identificador] = valores.join(' | ');
      }
    }
    return formulario;
  }

  /**
   * Codigos REALES (de catalogo) de las ocupaciones que agrupa el instrumento,
   * separados por catalogo.
   *
   * Se leen de `comparativa_ocupacion`, que es donde Analisis deja las hasta 3
   * ocupaciones CNO y las hasta 3 CUOC del grupo. `instrumento.ocupacion` solo
   * guarda la copia PRIMARIA, asi que derivar de ahi dejaba el codigo CUOC
   * siempre vacio (y ponia el codigo CUOC en la columna CNO cuando el panel
   * primario era CUOC).
   *
   * `validadas` acota a las copias que el experto validó (las elegidas al
   * enviar); vacío no filtra.
   */
  private codigosDeCatalogo(row: Instrumento, validadas: ReadonlySet<string>): { cno: string; cuoc: string } {
    const co = row.comparativaOcupacion;
    if (!co) return { cno: '', cuoc: '' };

    const limpiar = (codigos: Array<string | null | undefined>) =>
      codigos
        .map((c) => c?.trim())
        .filter((c) => !!c && (validadas.size === 0 || validadas.has(c)))
        .map((c) => codigoRealDeCopia(c, co.codigo))
        .filter((c): c is string => !!c)
        .filter((c, i, todos) => todos.indexOf(c) === i)
        .join(' | ');

    return {
      cno: limpiar([
        co.ocupacionCno?.codOcupacionCno,
        co.codOcupacionCno2,
        co.codOcupacionCno3,
      ]),
      cuoc: limpiar([
        co.ocupacionCuoc?.codOcupacionCuoc,
        co.codOcupacionCuoc2,
        co.codOcupacionCuoc3,
      ]),
    };
  }

  private fechaAIso(valor: Date | string | null | undefined): string | null {
    if (!valor) return null;
    if (typeof valor === 'string') return valor;
    return valor.toISOString();
  }
}

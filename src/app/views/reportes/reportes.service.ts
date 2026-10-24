import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { text } from '../../shared/api/http-helpers';
import {
  CriterionFamily,
  FAMILY_NUMBER,
  ReportCriterion,
  ReportOccupation,
  ReportRecord,
  classify,
  coincidenceScore,
  criterionStateOf,
  evaluate
} from './reportes.model';

/** Respuesta de un criterio: `criterioId` es el campo del snapshot («funcion_2»). */
interface ResumenRespuestaDto {
  criterioId: string;
  estado: string;
  comentario: string;
  valor?: string;
  valorPropuesto?: string;
}

/** Una de las ocupaciones (1 a 3) que se validaron juntas. */
interface ResumenOcupacionDto {
  /** Copia de la ocupación en el instrumento. */
  codigo: string;
  /** Código de la ocupación en el catálogo. */
  codigoOriginal: string;
  nombre: string;
  panelOrigen: 'CNO' | 'CUOC';
  respuestas: ResumenRespuestaDto[];
  /** Campos del snapshot de esta ocupación (nivel_cualificacion, area_desempeno…). */
  formularioOriginal?: Record<string, unknown>;
}

/** Fila de `GET /api/resumen`: la validación cerrada de UN experto sobre un instrumento. */
interface ResumenDto {
  /** Id del instrumento (la agrupación que comparten sus expertos). */
  token: string;
  /** Experto que validó. */
  experto?: string;
  instrumentoOrigen: 'I2' | 'I3';
  fecha: string;
  horaInicio: string;
  horaFinalizacion: string;
  nombreApellidos: string;
  email: string;
  telefono: string;
  departamento: string;
  municipio: string;
  empresaEntidad: string;
  cargo: string;
  profesion: string;
  sector: string;
  ocupaciones: ResumenOcupacionDto[];
  formularioOriginal?: Record<string, unknown>;
}

/** Identificador del snapshot (sin el número de la lista) → familia del reporte. Los demás no se califican. */
const FIELD_FAMILY: Record<string, CriterionFamily> = {
  nombre: 'name',
  area_desempeno: 'area',
  nivel_cualificacion: 'level',
  descripcion: 'description',
  funcion: 'functions',
  denominacion: 'denominations',
  habilidad: 'skills',
  otras_habilidades: 'skills',
  conocimiento: 'knowledge',
  otros_conocimientos: 'knowledge',
  relacionada: 'related'
};

/** «funcion_2» → { familia: funciones, número: 2 }; «nombre» → { nombre, 0 }; null si no es un criterio del reporte. */
function criterionOf(field: string): { family: CriterionFamily; n: number } | null {
  const list = /^(.+)_(\d+)$/.exec(field);
  const family = FIELD_FAMILY[list?.[1] ?? field];
  if (!family) {
    return null;
  }
  return { family, n: FAMILY_NUMBER[family] >= 5 ? Number(list?.[2] ?? 1) : 0 };
}

/** Arma las ocupaciones de un envío con los criterios que calificó el experto en cada una. */
function toOccupations(dto: ResumenDto): ReportOccupation[] {
  return (dto.ocupaciones ?? []).map((ocupacion) => {
    const criteria: ReportCriterion[] = [];
    for (const answer of ocupacion.respuestas ?? []) {
      const criterion = criterionOf(text(answer.criterioId));
      if (criterion) {
        criteria.push({
          id: `${ocupacion.codigo}::${answer.criterioId}`,
          ...criterion,
          state: criterionStateOf(text(answer.estado)),
          value: text(answer.valor),
          comment: text(answer.comentario)
        });
      }
    }
    const code = text(ocupacion.codigoOriginal) || text(ocupacion.codigo);
    return {
      code,
      catalog: ocupacion.panelOrigen === 'CUOC' || /^\d{5}$/.test(code) ? 'CUOC' : 'CNO',
      name: text(ocupacion.nombre) || code,
      level: text(ocupacion.formularioOriginal?.['nivel_cualificacion']),
      criteria: criteria.sort((a, b) => FAMILY_NUMBER[a.family] - FAMILY_NUMBER[b.family] || a.n - b.n),
      evaluation: evaluate(criteria)
    };
  });
}

function toRecord(dto: ResumenDto, index: number): ReportRecord {
  const occupations = toOccupations(dto);
  const criteria = occupations.flatMap((occupation) => occupation.criteria);
  return {
    id: index + 1,
    group: Number(dto.token),
    kind: dto.instrumentoOrigen === 'I3' ? 'I3' : 'I2',
    startedAt: text(dto.horaInicio),
    finishedAt: text(dto.horaFinalizacion),
    date: text(dto.fecha),
    fullName: text(dto.nombreApellidos),
    email: text(dto.email),
    phone: text(dto.telefono),
    department: text(dto.departamento),
    city: text(dto.municipio),
    company: text(dto.empresaEntidad),
    position: text(dto.cargo),
    profession: text(dto.profesion),
    sector: text(dto.sector),
    occupations,
    evaluation: evaluate(criteria),
    classification: classify(criteria),
    score: coincidenceScore(criteria),
    observations: text(dto.formularioOriginal?.['observacionesExperto'] as string)
  };
}

/**
 * Resumen consolidado contra el backend (`GET /api/resumen`): una fila por cada validación experta
 * cerrada (varios expertos pueden validar el mismo instrumento), con el informante y la
 * calificación de cada criterio por ocupación. Filtros, orden, estadísticas y exportación se
 * resuelven en el navegador sobre esa respuesta.
 */
@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly http = inject(HttpClient);

  /** Una fila por envío (agrupación), en orden de agrupación. */
  list(): Observable<ReportRecord[]> {
    return this.http.get<ResumenDto[]>('/api/resumen').pipe(
      map((rows) => [...(rows ?? [])].sort((a, b) => Number(a.token) - Number(b.token)).map(toRecord))
    );
  }
}

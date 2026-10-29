import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MOCK_LATENCY_MS, clone, mockResponse } from '../../shared/api/mock-api';
import { todayAsStored } from '../../shared/format/today';
import { SESSION } from '../../shared/session';
import { AnalysisCatalog, AnalysisListKey, AnalysisOccupation, itemCode } from '../analisis/analisis.model';
import { COMPARISON_STATUSES, Comparison, ComparisonPage, ComparisonQuery, ComparisonStatus, ComparisonSummary, OCCUPATION_LISTS, OccupationChange, cleanItems, isEditable } from './comparativa.model';
import { COMPARISON_LOCKED, COMPARISON_NOT_FOUND, ComparativaService } from './comparativa.service';
import { normalizeText } from '../../shared/ui/list';

/* ---------- Datos de prueba ---------- */

interface OccupationSeed {
  catalog: AnalysisCatalog;
  code: string;
  name: string;
  level?: string;
  /** Solo CNO, como lo entrega el servidor: «Nivel 1 (A)». */
  levelCode?: string;
  area?: string;
  description?: string;
  functions?: string[];
}

function occupation(seed: OccupationSeed): AnalysisOccupation {
  const items = (list: AnalysisListKey, texts: string[]) => texts.map((text, index) => ({ code: itemCode(list, seed.code, index + 1), text }));
  return {
    catalog: seed.catalog,
    code: seed.code,
    status: 'Activo',
    name: seed.name,
    level: seed.level ?? '',
    ...(seed.levelCode ? { levelCode: seed.levelCode } : {}),
    area: seed.area ?? '',
    description: seed.description ?? '',
    functions: items('functions', seed.functions ?? []),
    skills: [],
    knowledge: [],
    denominations: [],
    related: [],
    registeredAt: '',
    traceability: ''
  };
}

const ARMED_FORCES = occupation({ catalog: 'CUOC', code: '03100', name: 'Otros miembros de las Fuerzas Militares', level: 'Nivel 1', area: 'Seguridad' });

export function createTestComparisons(): Comparison[] {
  return [
    {
      id: 1,
      occupations: [
        occupation({ catalog: 'CNO', code: '0211-1', name: 'Gerentes de ingeniería', level: 'Dirección y Gerencia', area: 'Ciencias Naturales, Aplicadas y Relacionadas' }),
        occupation({ catalog: 'CUOC', code: '01100', name: 'Oficiales de las Fuerzas Militares de la orden', level: 'Nivel 4', area: 'Seguridad' }),
        ARMED_FORCES
      ],
      analyst: 'analista@sena.edu.co',
      date: '22/09/2026',
      status: 'Enviado',
      observation: ''
    },
    {
      id: 2,
      occupations: [
        occupation({ catalog: 'CNO', code: '0211', name: 'Gerentes de ingeniería', level: 'Dirección y Gerencia', area: 'Ciencias Naturales, Aplicadas y Relacionadas' }),
        occupation({ catalog: 'CUOC', code: '01100-2', name: 'Oficiales de las Fuerzas Militares del orden', level: 'Nivel 4', area: 'Seguridad' }),
        ARMED_FORCES
      ],
      analyst: 'analista@sena.edu.co',
      date: '22/09/2026',
      status: 'Enviado',
      observation: ''
    },
    {
      id: 3,
      occupations: [
        occupation({
          catalog: 'CNO',
          code: '2123',
          name: 'Expertos agrícolas y pecuarios',
          level: 'Profesionales, Dirección y Gerencia',
          levelCode: 'Nivel 1 (A)',
          area: 'Ciencias Naturales, Aplicadas y Relacionadas',
          description: 'Asesoran y prestan asistencia técnica a productores agrícolas y pecuarios sobre cultivos, ganadería, suelos y comercialización.'
        }),
        occupation({
          catalog: 'CUOC',
          code: '21321',
          name: 'Agrónomos, agroecólogos, agrícolas, pecuarios y zootecnistas / Agrónomas, agroecólogas, agrícolas, pecuarias y zootecnistas',
          level: 'Nivel 4',
          area: 'Agropecuario, silvicultura, pesca, acuicultura y veterinaria',
          description: 'Investigan, asesoran y prestan asistencia sobre la gestión de explotaciones agrícolas y pecuarias, los cultivos y la cría de animales.'
        })
      ],
      analyst: 'admin@sena.edu.co',
      date: '06/10/2026',
      status: 'Editado',
      observation: ''
    },
    {
      id: 4,
      occupations: [
        occupation({
          catalog: 'CNO',
          code: '7334',
          name: 'Trabajadores del campo',
          level: 'Nivel 3 (C) - Auxiliares y operativos',
          area: 'Explotación primaria y extractiva',
          description:
            'Realizan las faenas relativas al cultivo y la cosecha, a la cría y cuidado de animales y al manejo de productos derivados de sembradíos y actividades de criadero, hacen mantenimiento a infraestructura agrícola. Están empleados por hatos, fincas, granjas y',
          functions: ['Sembrar, cultivar y cosechar productos agrícolas.', 'Alimentar y cuidar el ganado y las aves de corral.']
        }),
        occupation({
          catalog: 'CUOC',
          code: '61121',
          name: 'Agricultores de plantaciones de árboles y arbustos / Agricultoras de plantaciones de árboles y arbustos',
          level: 'Nivel 3',
          area: 'Agropecuario, silvicultura, pesca, acuicultura y veterinaria',
          description:
            'Planean, organizan, dirigen y controlan actividades para plantar y cosechar árboles y arbustos tales como: árboles frutales y nogales, plantas de té y arbustos de café, palma africana, viñedos, arbustos de bayas, árboles de cacao y caucho (de los que pueden recolectar la savia), con la finalidad de venderlos en mercados o entregarlos a compradores u organismos de comercialización. Se pueden desempeñar en empresas forestales, fincas o de forma independiente, entre otros.',
          functions: ['Determinar los tipos y cantidades de cultivos a plantar.', 'Preparar el suelo, sembrar, plantar y cosechar árboles y arbustos.']
        }),
        occupation({
          catalog: 'CUOC',
          code: '61131',
          name: 'Agricultores de huertas, invernaderos, viveros y jardines / Agricultoras de huertas, invernaderos, viveros y jardines',
          level: 'Nivel 3',
          area: 'Agropecuario, silvicultura, pesca, acuicultura y veterinaria',
          description:
            'Planean, organizan, dirigen y controlan actividades de trabajadores y producción en huertas, invernaderos, viveros y jardines, con la finalidad de vender en mercados o entregar los productos a organismos de comercialización. Se pueden desempeñar en huertas, invernaderos, viveros, entre otros.',
          functions: ['Producir plantones, bulbos y semillas.', 'Cultivar flores, hortalizas y plantas en invernaderos y viveros.']
        })
      ],
      analyst: 'admin@sena.edu.co',
      date: '06/10/2026',
      status: 'Enviado',
      observation: ''
    }
  ];
}

/**
 * Solo para pruebas: doble de `ComparativaService` en memoria, con las mismas
 * reglas del backend (una observación por comparativa, guardar la deja
 * "Editado", enviarla la deja "En Instrumento 2" y lo que ya está con el
 * experto no admite cambios).
 */
@Injectable()
export class FakeComparativaService implements Pick<ComparativaService, keyof ComparativaService> {
  private readonly session = inject(SESSION);

  private readonly comparisons = createTestComparisons();

  summary(): Observable<ComparisonSummary> {
    return mockResponse(() => {
      const summary = Object.fromEntries(COMPARISON_STATUSES.map((status) => [status, 0])) as ComparisonSummary;
      this.comparisons.forEach((comparison) => summary[comparison.status]++);
      return summary;
    });
  }

  list(query: ComparisonQuery): Observable<ComparisonPage> {
    return mockResponse(() => {
      const text = normalizeText(query.text);
      const matches = this.comparisons
        .filter(
          (comparison) =>
            (!query.status || comparison.status === query.status) &&
            (!text ||
              String(comparison.id) === text ||
              normalizeText(comparison.analyst).includes(text) ||
              comparison.occupations.some((occupation) => normalizeText(occupation.name).includes(text) || normalizeText(occupation.code).includes(text)))
        )
        .sort((a, b) => b.id - a.id);
      const start = (query.page - 1) * query.pageSize;
      return { items: clone(matches.slice(start, start + query.pageSize)), total: matches.length };
    });
  }

  get(id: number): Observable<Comparison> {
    return mockResponse(() => clone(this.find(id)));
  }

  saveChanges(id: number, changes: OccupationChange[], observation: string | null): Observable<Comparison> {
    return this.change(id, 'Editado', (comparison) => {
      for (const change of changes) {
        const occupation = comparison.occupations.find((item) => (item.copyCode ?? item.code) === change.copyCode);
        if (occupation) {
          Object.assign(occupation, { name: change.name.trim(), level: change.level, area: change.area, description: change.description.trim() });
          OCCUPATION_LISTS.forEach((list) => (occupation[list] = cleanItems(change[list])));
        }
      }
      if (observation !== null) {
        comparison.observation = observation.trim();
      }
    });
  }

  sendToInstrument2(id: number): Observable<Comparison> {
    return this.change(id, 'En Instrumento 2');
  }

  invalidate(): void {
    // En memoria no hay nada que volver a pedir.
  }

  /** Lo que hace el servidor cuando Análisis guarda: crea la comparativa (la usa `FakeAnalisisService`). */
  receive(occupations: AnalysisOccupation[], toInstrument2: boolean): Comparison {
    const comparison: Comparison = {
      id: Math.max(0, ...this.comparisons.map((item) => item.id)) + 1,
      occupations: clone(occupations),
      analyst: this.session.email,
      date: todayAsStored(),
      status: toInstrument2 ? 'En Instrumento 2' : 'Recibido',
      observation: ''
    };
    this.comparisons.push(comparison);
    return clone(comparison);
  }

  private find(id: number): Comparison {
    const comparison = this.comparisons.find((item) => item.id === id);
    if (!comparison) {
      throw new Error(COMPARISON_NOT_FOUND);
    }
    return comparison;
  }

  /** Escritura sobre una comparativa que aún admite cambios: aplica `apply` y cambia el estado. */
  private change(id: number, status: ComparisonStatus, apply: (comparison: Comparison) => void = () => undefined): Observable<Comparison> {
    return mockResponse(() => {
      const comparison = this.find(id);
      if (!isEditable(comparison.status)) {
        throw new Error(COMPARISON_LOCKED);
      }
      apply(comparison);
      comparison.status = status;
      return clone(comparison);
    }, MOCK_LATENCY_MS);
  }
}

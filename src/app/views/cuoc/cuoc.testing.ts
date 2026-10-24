import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { clone, mockResponse } from '../../shared/api/mock-api';
import { CuocCatalogs, CuocFilterOptions, CuocFilters, CuocItem, CuocOccupation, CuocOccupationDetail, CuocPage, CuocQuery } from './cuoc.model';
import { CuocService, OCCUPATION_NOT_FOUND } from './cuoc.service';
import { normalizeText } from '../../shared/ui/list';

/* ---------- Datos de prueba (una muestra, no el catálogo real de la CUOC) ---------- */

const AREA = {
  administracion: 'Administración, finanzas y derecho',
  ciencias: 'Ciencias naturales, matemáticas y estadística',
  construccion: 'Construcción e infraestructura',
  salud: 'Salud y bienestar',
  tic: 'Tecnologías de la información y las comunicaciones'
};

const AREAS: [string, string][] = [
  ['AFIR', 'Actividades físicas, deportivas y recreativas'],
  ['AFDE', AREA.administracion],
  ['CNME', AREA.ciencias],
  ['COIN', AREA.construccion],
  ['EDFO', 'Educación y formación'],
  ['SABI', AREA.salud],
  ['TICO', AREA.tic]
];

/** Grandes grupos de la jerarquía de prueba (el primer dígito del código). */
const MAJOR_GROUPS: [string, string][] = [
  ['1', 'DIRECTORES Y GERENTES'],
  ['2', 'PROFESIONALES, CIENTÍFICOS E INTELECTUALES'],
  ['3', 'TÉCNICOS Y PROFESIONALES DEL NIVEL MEDIO'],
  ['5', 'TRABAJADORES DE LOS SERVICIOS'],
  ['9', 'OCUPACIONES ELEMENTALES']
];

export function createTestCatalogs(): CuocCatalogs {
  return {
    levels: [1, 2, 3, 4].map((level) => ({ id: String(level), name: `Nivel ${level}`, description: '' })),
    areas: AREAS.map(([id, name]) => ({ id, name, description: '' }))
  };
}

interface OccupationSeed {
  code: string;
  name: string;
  area: string;
  status?: CuocOccupation['status'];
  description?: string;
  functions?: string[];
  denominations?: string[];
  skills?: string[];
  knowledge?: string[];
  related?: CuocOccupationDetail['related'];
}

/** Nivel de competencia de prueba según el primer dígito del código (gran grupo). */
function levelOf(code: string): string {
  const group = Number(code[0]);
  return `Nivel ${group <= 2 ? 4 : group === 3 ? 3 : group === 9 ? 1 : 2}`;
}

/** Completa una ocupación de prueba: las cantidades salen de sus listas; el grupo primario son los 4 primeros dígitos. */
function occupation(seed: OccupationSeed): CuocOccupationDetail {
  const items = (texts: string[], code: (position: number) => string): CuocItem[] => texts.map((text, index) => ({ code: code(index + 1), text, active: true }));
  const functions = items(seed.functions ?? [], String);
  const denominations = items(seed.denominations ?? [], (n) => `${seed.code}.${String(n).padStart(3, '0')}`).map((item) => ({ ...item, registeredAt: '' }));
  const skills = items(seed.skills ?? [], String);
  const knowledge = items(seed.knowledge ?? [], String);
  return {
    code: seed.code,
    name: seed.name,
    level: levelOf(seed.code),
    area: seed.area,
    areaCode: AREAS.find(([, name]) => name === seed.area)?.[0] ?? '',
    primaryGroup: `${seed.code.slice(0, 4)} · ${seed.name}`,
    status: seed.status ?? 'Activo',
    registeredAt: '',
    denominationsCount: denominations.length,
    functionsCount: functions.length,
    skillsCount: skills.length,
    knowledgeCount: knowledge.length,
    description: seed.description ?? '',
    levelDescription: '',
    inactiveAt: '',
    traceability: '',
    previousCode: '',
    functions,
    denominations,
    skills,
    knowledge,
    related: seed.related ?? []
  };
}

export function createTestOccupations(): CuocOccupationDetail[] {
  return [
    occupation({ code: '12110', name: 'Directores financieros', area: AREA.administracion }),
    occupation({ code: '21110', name: 'Físicos y astrónomos', area: AREA.ciencias }),
    occupation({ code: '21130', name: 'Químicos', area: AREA.ciencias }),
    occupation({
      code: '22210',
      name: 'Profesionales de enfermería',
      area: AREA.salud,
      description:
        'Prestan servicios de tratamiento, apoyo y cuidado a personas que necesitan atención de enfermería, y asumen la planificación y gestión del cuidado de los pacientes.',
      functions: [
        'Planificar, prestar y evaluar los cuidados de enfermería de los pacientes.',
        'Coordinar la atención de los pacientes con otros profesionales de la salud.',
        'Administrar medicamentos y tratamientos, y vigilar la respuesta de los pacientes.',
        'Orientar a pacientes y familias sobre el cuidado de la salud.'
      ],
      denominations: ['Enfermero profesional', 'Enfermero jefe', 'Enfermero de cuidados intensivos'],
      skills: ['Escucha activa', 'Orientación al servicio', 'Pensamiento crítico', 'Trabajo en equipo'],
      knowledge: ['Enfermería', 'Medicina', 'Psicología', 'Servicio al usuario'],
      related: [
        { code: '32210', name: 'Técnicos en enfermería' },
        { code: '53210', name: 'Auxiliares de salud' }
      ]
    }),
    occupation({ code: '24110', name: 'Contadores', area: AREA.administracion }),
    occupation({ code: '25120', name: 'Desarrolladores de software', area: AREA.tic }),
    occupation({ code: '31120', name: 'Técnico en ingeniería civil', area: AREA.construccion }),
    occupation({ code: '32210', name: 'Técnicos en enfermería', area: AREA.salud }),
    occupation({ code: '33430', name: 'Secretarios de administración y ejecutivos', area: AREA.administracion }),
    occupation({ code: '53210', name: 'Auxiliares de salud', area: AREA.salud }),
    occupation({ code: '93130', name: 'Obreros de construcción de edificios', area: AREA.construccion, status: 'Inactivo' })
  ];
}

/**
 * Solo para pruebas: doble de `CuocService` que responde desde memoria con los
 * datos de arriba, con los mismos filtros, orden y paginación que el backend.
 */
@Injectable()
export class FakeCuocService implements Pick<CuocService, keyof CuocService> {
  private readonly catalogData = createTestCatalogs();
  private readonly occupations = createTestOccupations();

  catalogs(): Observable<CuocCatalogs> {
    return mockResponse(() => clone(this.catalogData));
  }

  /** Niveles, áreas, funciones y la jerarquía (gran grupo = primer dígito; grupo primario = 4 dígitos). */
  filterOptions(): Observable<CuocFilterOptions> {
    return mockResponse(() => ({
      levels: this.catalogData.levels.map((level) => ({ value: level.name, label: level.name })),
      areas: this.catalogData.areas.map((area) => ({ value: area.name, label: area.name })),
      functions: this.occupations.flatMap((item) => item.functions).map((item) => ({ value: item.text, label: item.text })),
      majorGroups: MAJOR_GROUPS.map(([code, name]) => ({ value: code, label: `${code} · ${name}` })),
      primaryGroups: this.occupations.map((item) => ({ value: item.code.slice(0, 4), label: item.primaryGroup, parent: item.code[0] }))
    }));
  }

  search(query: CuocQuery): Observable<CuocPage> {
    return mockResponse(() => {
      const value = (item: CuocOccupation) => ({ code: item.code, name: item.name, status: item.status })[query.sort];
      const direction = query.ascending ? 1 : -1;
      const matches = this.filter(query).sort((a, b) => direction * value(a).localeCompare(value(b), 'es', { numeric: true }));
      const start = (query.page - 1) * query.pageSize;
      const items = matches.slice(start, start + query.pageSize).map(
        ({ code, name, level, area, status, registeredAt, denominationsCount, functionsCount, skillsCount, knowledgeCount }): CuocOccupation => ({
          code,
          name,
          level,
          area,
          status,
          registeredAt,
          denominationsCount,
          functionsCount,
          skillsCount,
          knowledgeCount
        })
      );
      return { items, total: matches.length };
    });
  }

  detail(code: string): Observable<CuocOccupationDetail> {
    return mockResponse(() => {
      const found = this.occupations.find((item) => item.code === code);
      if (!found) {
        throw new Error(OCCUPATION_NOT_FOUND);
      }
      return clone(found);
    });
  }

  private filter(filters: CuocFilters): CuocOccupationDetail[] {
    const query = normalizeText(filters.query);
    return this.occupations.filter(
      (item) =>
        (!query || item.code.includes(query) || normalizeText(item.name).includes(query)) &&
        (!filters.level || item.level === filters.level) &&
        (!filters.area || item.area === filters.area) &&
        (!filters.majorGroup || item.code.startsWith(filters.majorGroup)) &&
        (!filters.primaryGroup || item.code.startsWith(filters.primaryGroup)) &&
        (!filters.function || item.functions.some((fn) => fn.text === filters.function)) &&
        (!filters.status || item.status === filters.status)
    );
  }
}

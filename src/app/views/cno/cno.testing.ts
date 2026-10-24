import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { clone, mockResponse } from '../../shared/api/mock-api';
import { CnoCatalogs, CnoFilterOptions, CnoFilters, CnoItem, CnoOccupation, CnoOccupationDetail, CnoPage, CnoQuery } from './cno.model';
import { CnoService, OCCUPATION_NOT_FOUND } from './cno.service';
import { normalizeText } from '../../shared/ui/list';

/* ---------- Datos de prueba (una muestra, no el catálogo real de la CNO) ---------- */

/** Niveles como los entrega el backend desde el libro CNO 2026: el código es el nivel exacto y el nombre su grupo. */
const LEVELS: { code: string; name: string; description: string }[] = [
  { code: 'Nivel 1 (A)', name: 'Profesionales, Dirección y Gerencia', description: 'Nivel 1 (A): Las funciones de estas ocupaciones suelen ser muy variadas y complejas.' },
  { code: 'Nivel 2 (B)', name: 'Técnicos y supervisores', description: '' },
  { code: 'Nivel 3,4 (C)', name: 'Auxiliares y operativos', description: '' },
  { code: 'Nivel 6 (D)', name: 'Obreros y ayudantes', description: '' }
];

export function createTestCatalogs(): CnoCatalogs {
  const option = (id: string, name: string) => ({ id, name, description: '' });
  return {
    levels: LEVELS.map((level) => ({ id: level.code, name: level.name, description: level.description })),
    areas: [
      option('5', 'Arte, Cultura, Esparcimiento y Deporte'),
      option('2', 'Ciencias Naturales, Aplicadas y Relacionadas'),
      option('4', 'Ciencias Sociales, Educación, Gobierno y Religión'),
      option('0', 'Dirección y Gerencia'),
      option('7', 'Explotación primaria y extractiva'),
      option('1', 'Finanzas y Administración'),
      option('8', 'Operación de Equipos, Transporte y Oficios'),
      option('9', 'Procesamiento, Fabricación y Ensamble'),
      option('3', 'Salud'),
      option('6', 'Ventas y Servicios')
    ]
  };
}

const LEVEL = {
  n1: LEVELS[0],
  n2: LEVELS[1],
  n3: LEVELS[2],
  n6: LEVELS[3]
};
const AREA = {
  finanzas: 'Finanzas y Administración',
  ciencias: 'Ciencias Naturales, Aplicadas y Relacionadas',
  salud: 'Salud',
  arte: 'Arte, Cultura, Esparcimiento y Deporte',
  ventas: 'Ventas y Servicios',
  operacion: 'Operación de Equipos, Transporte y Oficios'
};

interface OccupationSeed {
  code: string;
  name: string;
  level: (typeof LEVELS)[number];
  area: string;
  status?: CnoOccupation['status'];
  description?: string;
  functions?: string[];
  /** Funciones dadas de baja (se agregan al final, inactivas). */
  inactiveFunctions?: string[];
  denominations?: string[];
  inactiveDenominations?: string[];
  skills?: string[];
  knowledge?: string[];
  related?: CnoOccupationDetail['related'];
}

/** Completa una ocupación de prueba: los códigos de sus componentes siguen el formato del catálogo y las cantidades salen de sus listas. */
function occupation(seed: OccupationSeed): CnoOccupationDetail {
  const items = (texts: string[], code: (position: number) => string, active = true, first = 1): CnoItem[] =>
    texts.map((text, index) => ({ code: code(index + first), text, active }));
  const functionCode = (n: number) => `F-${seed.code}.${String(n).padStart(2, '0')}`;
  const denominationCode = (n: number) => `D-${seed.code}.${String(n).padStart(3, '0')}`;
  const functions = [
    ...items(seed.functions ?? [], functionCode),
    ...items(seed.inactiveFunctions ?? [], functionCode, false, (seed.functions ?? []).length + 1)
  ];
  const denominations = [
    ...items(seed.denominations ?? [], denominationCode),
    ...items(seed.inactiveDenominations ?? [], denominationCode, false, (seed.denominations ?? []).length + 1)
  ].map((item) => ({ ...item, registeredAt: '19/10/2026' }));
  const skills = items(seed.skills ?? [], String);
  const knowledge = items(seed.knowledge ?? [], String);
  return {
    code: seed.code,
    name: seed.name,
    level: seed.level.name,
    levelCode: seed.level.code,
    area: seed.area,
    areaCode: createTestCatalogs().areas.find((area) => area.name === seed.area)?.id ?? '',
    status: seed.status ?? 'Activo',
    registeredAt: '',
    denominationsCount: denominations.length,
    functionsCount: functions.length,
    skillsCount: skills.length,
    knowledgeCount: knowledge.length,
    description: seed.description ?? '',
    levelDescription: seed.level.description,
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

export function createTestOccupations(): CnoOccupationDetail[] {
  return [
    occupation({ code: '0111', name: 'Gerentes financieros', level: LEVEL.n1, area: AREA.finanzas }),
    occupation({ code: '1111', name: 'Contadores y auditores', level: LEVEL.n1, area: AREA.finanzas }),
    occupation({ code: '1231', name: 'Técnicos en contabilidad', level: LEVEL.n2, area: AREA.finanzas }),
    occupation({
      code: '2111',
      name: 'Físicos y astrónomos',
      level: LEVEL.n1,
      area: AREA.ciencias,
      description:
        'Dirigen y llevan a cabo investigaciones teóricas y aplicadas que amplían el conocimiento de los fenómenos naturales y desarrollan procesos nuevos en campos como: electrónica, comunicaciones, generación y distribución de energía, aerodinámica, óptica, rayo',
      functions: [
        'Diseñar y dirigir investigaciones en física experimental y teórica.',
        'Analizar datos de investigación y preparar informes.',
        'Participar en equipos de investigación y desarrollo de equipos e instrumentos.',
        'Observar y analizar fenómenos celestes y desarrollar teorías sobre ellos.',
        'Desarrollar métodos de aplicación de leyes y teorías físicas en la industria y la medicina.'
      ],
      inactiveFunctions: ['Calibrar telescopios ópticos de forma manual.'],
      denominations: ['Astrónomo', 'Astrofísico', 'Físico', 'Físico nuclear', 'Físico de materiales'],
      inactiveDenominations: ['Astrólogo'],
      skills: ['Pensamiento crítico', 'Resolución de problemas complejos', 'Análisis de datos', 'Comunicación escrita', 'Trabajo en equipo'],
      knowledge: ['Física', 'Matemáticas', 'Astronomía', 'Informática', 'Metodología de la investigación'],
      related: [
        { code: '2112', name: 'Químicos' },
        { code: '2114', name: 'Meteorólogos' }
      ]
    }),
    occupation({ code: '2112', name: 'Químicos', level: LEVEL.n1, area: AREA.ciencias }),
    occupation({ code: '2113', name: 'Geólogos, geoquímicos y geofísicos', level: LEVEL.n1, area: AREA.ciencias }),
    occupation({ code: '2114', name: 'Meteorólogos', level: LEVEL.n1, area: AREA.ciencias }),
    occupation({ code: '2232', name: 'Técnicos en mecánica y construcción mecánica', level: LEVEL.n2, area: AREA.ciencias }),
    occupation({ code: '3311', name: 'Auxiliares de enfermería', level: LEVEL.n3, area: AREA.salud }),
    occupation({ code: '5122', name: 'Escritores y redactores', level: LEVEL.n1, area: AREA.arte }),
    occupation({ code: '6311', name: 'Vendedores de ventas no técnicas', level: LEVEL.n3, area: AREA.ventas }),
    occupation({ code: '8611', name: 'Ayudantes y obreros de construcción', level: LEVEL.n6, area: AREA.operacion, status: 'Inactivo' })
  ];
}

/**
 * Solo para pruebas: doble de `CnoService` que responde desde memoria con los
 * datos de arriba, con los mismos filtros, orden y paginación que el backend.
 */
@Injectable()
export class FakeCnoService implements Pick<CnoService, keyof CnoService> {
  private readonly catalogData = createTestCatalogs();
  private readonly occupations = createTestOccupations();

  catalogs(): Observable<CnoCatalogs> {
    return mockResponse(() => clone(this.catalogData));
  }

  /** Niveles por su código, áreas y las funciones de las ocupaciones de prueba (por código). */
  filterOptions(): Observable<CnoFilterOptions> {
    return mockResponse(() => ({
      levels: LEVELS.map((level) => ({ value: level.name, label: level.code })),
      areas: this.catalogData.areas.map((area) => ({ value: area.name, label: area.name })),
      functions: this.occupations.flatMap((item) => item.functions).map((item) => ({ value: item.code, label: `${item.code} · ${item.text}` }))
    }));
  }

  search(query: CnoQuery): Observable<CnoPage> {
    return mockResponse(() => {
      const value = (item: CnoOccupation) => ({ code: item.code, name: item.name, level: item.levelCode, status: item.status })[query.sort];
      const direction = query.ascending ? 1 : -1;
      const matches = this.filter(query).sort((a, b) => direction * value(a).localeCompare(value(b), 'es', { numeric: true }));
      const start = (query.page - 1) * query.pageSize;
      const items = matches.slice(start, start + query.pageSize).map(
        ({ code, name, level, levelCode, area, status, registeredAt, denominationsCount, functionsCount, skillsCount, knowledgeCount }): CnoOccupation => ({
          code,
          name,
          level,
          levelCode,
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

  detail(code: string): Observable<CnoOccupationDetail> {
    return mockResponse(() => {
      const found = this.occupations.find((item) => item.code === code);
      if (!found) {
        throw new Error(OCCUPATION_NOT_FOUND);
      }
      return clone(found);
    });
  }

  private filter(filters: CnoFilters): CnoOccupationDetail[] {
    const query = normalizeText(filters.query);
    return this.occupations.filter(
      (item) =>
        (!query || item.code.includes(query) || normalizeText(item.name).includes(query)) &&
        (!filters.level || item.level === filters.level) &&
        (!filters.area || item.area === filters.area) &&
        (!filters.function || item.functions.some((fn) => fn.code === filters.function || fn.text === filters.function)) &&
        (!filters.status || item.status === filters.status)
    );
  }
}

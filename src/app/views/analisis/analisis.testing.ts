import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import { MOCK_LATENCY_MS, clone, mockResponse } from '../../shared/api/mock-api';
import { CnoOccupationDetail } from '../cno/cno.model';
import { CnoService } from '../cno/cno.service';
import { Comparison } from '../comparativa/comparativa.model';
import { ComparativaService } from '../comparativa/comparativa.service';
import { FakeComparativaService } from '../comparativa/comparativa.testing';
import { CuocOccupationDetail } from '../cuoc/cuoc.model';
import { CuocService } from '../cuoc/cuoc.service';
import {
  AnalysisCatalog,
  AnalysisExport,
  AnalysisItem,
  AnalysisLevel,
  AnalysisLevelDraft,
  AnalysisOccupation,
  AnalysisOptions,
  AnalysisSearchResult,
  LEVEL_DESCRIPTION_MAX,
  MAX_OCCUPATIONS,
  MIN_OCCUPATIONS,
  levelText,
  missingFields
} from './analisis.model';
import { AnalisisService, INVALID_LEVEL, INVALID_OCCUPATION_COUNT, LEVEL_NAME_TAKEN, MISSING_REQUIRED_FIELDS } from './analisis.service';

/** Máximo de ocupaciones que devuelve el buscador. */
const SEARCH_LIMIT = 8;

/**
 * Solo para pruebas: doble de `AnalisisService` en memoria. Las ocupaciones
 * salen de los dobles de CNO y CUOC, los niveles creados viven aquí y guardar
 * crea la comparativa en `FakeComparativaService`, como hace el servidor.
 */
@Injectable()
export class FakeAnalisisService implements Pick<AnalisisService, keyof AnalisisService> {
  private readonly cnoService = inject(CnoService);
  private readonly cuocService = inject(CuocService);
  private readonly comparativaService = inject(ComparativaService) as unknown as FakeComparativaService;

  /** Niveles creados para Análisis (copias: los catálogos oficiales no cambian). */
  private readonly levels: AnalysisLevel[] = [];

  /**
   * GET /api/analisis/opciones/:catalogo — niveles de cualificación (los del
   * catálogo y los creados para Análisis) y áreas de desempeño para editar la copia.
   */
  options(catalog: AnalysisCatalog): Observable<AnalysisOptions> {
    const catalogs = catalog === 'CNO' ? this.cnoService.catalogs() : this.cuocService.catalogs();
    return catalogs.pipe(
      map(({ levels, areas }) => ({
        levels: [...levels.map((level) => level.name), ...this.levels.filter((level) => level.catalog === catalog).map((level) => level.name)],
        levelLabels: catalog === 'CNO' ? Object.fromEntries(levels.map((level) => [level.name, levelText({ level: level.name, levelCode: level.id })])) : {},
        areas: areas.map((area) => area.name)
      }))
    );
  }

  /**
   * POST /api/analisis/niveles — crea un nivel de cualificación que solo se
   * usa en Análisis. El servidor le asigna el código (C1, C2, C3…) y exige un
   * nombre distinto de los niveles existentes, que es como Análisis los identifica.
   */
  createLevel(catalog: AnalysisCatalog, draft: AnalysisLevelDraft): Observable<AnalysisLevel> {
    return this.options(catalog).pipe(
      switchMap((options) =>
        mockResponse(() => {
          const name = draft.name.trim();
          const description = draft.description.trim();
          if (!name || description.length > LEVEL_DESCRIPTION_MAX) {
            throw new Error(INVALID_LEVEL);
          }
          if (options.levels.some((level) => level.toLowerCase() === name.toLowerCase())) {
            throw new Error(LEVEL_NAME_TAKEN);
          }
          const level: AnalysisLevel = { code: `C${this.levels.length + 1}`, catalog, name, description };
          this.levels.push(level);
          return clone(level);
        }, MOCK_LATENCY_MS)
      )
    );
  }

  /** GET /api/:catalogo/ocupaciones?q= — ocupaciones del catálogo por código o parte del nombre. */
  search(catalog: AnalysisCatalog, text: string): Observable<AnalysisSearchResult[]> {
    const page = { page: 1, pageSize: SEARCH_LIMIT, sort: 'code', ascending: true } as const;
    const results: Observable<{ items: { code: string; name: string }[] }> =
      catalog === 'CNO'
        ? this.cnoService.search({ query: text, level: '', area: '', status: '', ...page })
        : this.cuocService.search({ query: text, area: '', status: '', ...page });
    return results.pipe(map(({ items }) => items.map(({ code, name }) => ({ catalog, code, name }))));
  }

  /** GET /api/:catalogo/ocupaciones/:codigo — la ocupación completa, lista para agregarla al análisis. */
  occupation(catalog: AnalysisCatalog, code: string): Observable<AnalysisOccupation> {
    const detail: Observable<CnoOccupationDetail | CuocOccupationDetail> = catalog === 'CNO' ? this.cnoService.detail(code) : this.cuocService.detail(code);
    return detail.pipe(
      map((item) => ({
        catalog,
        code: item.code,
        status: item.status,
        name: item.name,
        level: item.level,
        levelCode: 'levelCode' in item ? item.levelCode : undefined,
        area: item.area,
        description: item.description,
        // Los componentes conservan el código con el que vienen del catálogo.
        functions: item.functions,
        skills: item.skills,
        knowledge: item.knowledge,
        denominations: item.denominations,
        related: item.related.map(({ code, name }) => ({ code, text: name })),
        registeredAt: item.registeredAt,
        traceability: item.traceability
      }))
    );
  }

  /** POST /api/analisis — guarda las copias editadas: quedan en Comparativa como una comparativa "Recibido". */
  save(occupations: AnalysisOccupation[]): Observable<Comparison> {
    return this.store(occupations, false);
  }

  /** POST /api/analisis/instrumento-2 — además de guardarlas, la comparativa queda "En Instrumento 2", lista para validación experta. */
  sendToInstrument2(occupations: AnalysisOccupation[]): Observable<Comparison> {
    return this.store(occupations, true);
  }

  /**
   * POST /api/analisis/exportar — las ocupaciones del análisis tal como están
   * en pantalla. El servidor entregará Excel; la API simulada arma un CSV (que
   * Excel abre).
   */
  export(occupations: AnalysisOccupation[]): Observable<AnalysisExport> {
    return mockResponse(() => {
      const texts = (items: AnalysisItem[]) => items.map((item) => `${item.code} ${item.text}`).join(' | ');
      const rows = [
        ['Catálogo', 'Código', 'Ocupación', 'Nivel de cualificación', 'Área de desempeño', 'Descripción', 'Funciones', 'Habilidades', 'Conocimientos', 'Denominaciones'],
         ...occupations.map((item) => [
          item.catalog,
          item.code,
          item.name,
          item.level,
          item.area,
          item.description,
          texts(item.functions),
          texts(item.skills),
          texts(item.knowledge),
          texts(item.denominations)
        ])
      ];
      const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\r\n');
      // El BOM hace que Excel lea las tildes como UTF-8.
      return { blob: new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8' }), fileName: 'analisis-ocupaciones.csv' };
    });
  }

  private store(occupations: AnalysisOccupation[], toInstrument2: boolean): Observable<Comparison> {
    return mockResponse(() => {
      if (occupations.length < MIN_OCCUPATIONS || occupations.length > MAX_OCCUPATIONS) {
        throw new Error(INVALID_OCCUPATION_COUNT);
      }
      if (occupations.some((item) => missingFields(item).length)) {
        throw new Error(MISSING_REQUIRED_FIELDS);
      }
      return this.comparativaService.receive(occupations, toInstrument2);
    }, MOCK_LATENCY_MS);
  }
}

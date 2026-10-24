import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, catchError, of, switchMap, timer } from 'rxjs';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  CORRELATIVA_COLUMNS,
  CorrelationRow,
  CorrelativaColumn,
  CorrelativaExport,
  CorrelativaFilters,
  CorrelativaKind,
  CorrelativaPage,
  CorrelativaQuery,
  createEmptyFilters,
  createEmptyQuery
} from './correlativa.model';
import { CorrelativaService } from './correlativa.service';
import { SEARCH_DEBOUNCE_MS, pageCountOf } from '../../shared/ui/list';
import { PaginationComponent } from '../../shared/ui/pagination.component';

export * from './correlativa.model';

/** Pestaña de la vista. */
interface KindTab {
  id: CorrelativaKind;
  labelKey: string;
  placeholderKey: string;
  icon: string[];
}

/**
 * Vista "Correlativa" del proyecto (Consulta): relaciones entre la CNO y la
 * CUOC por denominación, ocupación o conocimiento, con búsqueda, filtros,
 * paginación y descargas.
 */
@Component({
  selector: 'app-correlativa',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, PaginationComponent],
  templateUrl: './correlativa.component.html',
  styleUrl: './correlativa.component.css'
})
export class CorrelativaComponent implements OnInit {
  private readonly correlativaService = inject(CorrelativaService);
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);

  readonly tabs: KindTab[] = [
    {
      id: 'denominacion',
      labelKey: 'correlativa.tabDenominacion',
      placeholderKey: 'correlativa.searchDenominacion',
      icon: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6']
    },
    {
      id: 'ocupacion',
      labelKey: 'correlativa.tabOcupacion',
      placeholderKey: 'correlativa.searchOcupacion',
      icon: ['M3 8h18v12H3z', 'M9 8V5h6v3', 'M9 8v12M15 8v12']
    },
    {
      id: 'conocimiento',
      labelKey: 'correlativa.tabConocimiento',
      placeholderKey: 'correlativa.searchConocimiento',
      icon: ['M12 6c-2-1.5-5-2-9-2v14c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2z', 'M12 6v14']
    }
  ];

  /** Campos de código del filtro de Denominación, en el orden de la tarjeta. */
  readonly codeFilters: { key: 'cnoOccupationCode' | 'cnoDenominationCode' | 'cuocOccupationCode' | 'cuocDenominationCode'; labelKey: string }[] = [
    { key: 'cnoOccupationCode', labelKey: 'correlativa.colCnoOccupationCode' },
    { key: 'cnoDenominationCode', labelKey: 'correlativa.colCnoDenominationCode' },
    { key: 'cuocOccupationCode', labelKey: 'correlativa.colCuocOccupationCode' },
    { key: 'cuocDenominationCode', labelKey: 'correlativa.colCuocDenominationCode' }
  ];

  kind: CorrelativaKind = 'denominacion';
  query: CorrelativaQuery = createEmptyQuery();
  /** Lo que se escribe en los filtros; pasa a `query` al pulsar «Aplicar filtros». */
  draft: CorrelativaFilters = createEmptyFilters();
  result: CorrelativaPage = { items: [], total: 0 };
  loading = true;
  filtersOpen = false;
  /** Descarga en curso: evita lanzar dos a la vez. */
  downloading = false;

  /** Cada valor es la espera (ms) antes de consultar: 0 para clics, el debounce al escribir. */
  private readonly reload = new Subject<number>();

  constructor() {
    this.reload
      .pipe(
        switchMap((delay) => {
          const kind = this.kind;
          const query = { ...this.query };
          return timer(delay).pipe(
            switchMap(() => this.correlativaService.search(kind, query)),
            catchError(() => {
              this.toastService.error(this.translationService.translate('common.errorGeneric'));
              return of<CorrelativaPage>({ items: [], total: 0 });
            })
          );
        }),
        takeUntilDestroyed()
      )
      .subscribe((result) => {
        this.result = result;
        this.loading = false;
      });
  }

  ngOnInit(): void {
    this.load();
  }

  get tab(): KindTab {
    return this.tabs.find((tab) => tab.id === this.kind)!;
  }

  get columns(): CorrelativaColumn[] {
    return CORRELATIVA_COLUMNS[this.kind];
  }

  /** Ocupación no tiene filtros: solo se busca por texto. */
  get hasFilterOptions(): boolean {
    return this.kind !== 'ocupacion';
  }

  get hasFilters(): boolean {
    return (Object.keys(this.draft) as (keyof CorrelativaFilters)[]).some((key) => !!this.query[key] || !!this.draft[key]);
  }

  get pageCount(): number {
    return pageCountOf(this.result.total, this.query.pageSize);
  }

  /** Cambia de pestaña: empieza una consulta nueva, sin texto ni filtros. */
  selectKind(kind: CorrelativaKind): void {
    if (kind === this.kind) {
      return;
    }
    this.kind = kind;
    this.query = { ...createEmptyQuery(), pageSize: this.query.pageSize };
    this.draft = createEmptyFilters();
    this.filtersOpen = false;
    this.result = { items: [], total: 0 };
    this.load();
  }

  /** Al escribir se vuelve a la primera página y se consulta cuando la escritura hace una pausa. */
  onTextChange(): void {
    this.query.page = 1;
    this.load(SEARCH_DEBOUNCE_MS);
  }

  /** Cambió un filtro o el tamaño de página: vuelve a la primera página. */
  onFiltersChange(): void {
    this.query.page = 1;
    this.load();
  }

  /** Aplicar filtros = copiar lo escrito en el borrador a la consulta; así no se consulta con cada tecla. */
  applyFilters(): void {
    Object.assign(this.query, this.draft);
    this.onFiltersChange();
  }

  clearFilters(): void {
    this.draft = createEmptyFilters();
    this.applyFilters();
  }

  /** Muestra la página elegida. */
  goToPage(page: number): void {
    if (page < 1 || page > this.pageCount || page === this.query.page) {
      return;
    }
    this.query.page = page;
    this.load();
  }

  /** Valor de una celda (los campos de cada pestaña están en `CORRELATIVA_COLUMNS`). */
  cell(row: CorrelationRow, field: string): string | number | boolean {
    return (row as unknown as Record<string, string | number | boolean>)[field];
  }

  /** "Descargar consultadas": todos los registros de la consulta actual, no solo la página. */
  downloadResults(): void {
    this.download(this.correlativaService.export(this.kind, { ...this.query }));
  }

  /** "Descargar todo (CNO y CUOC)": la correlativa completa, sin filtros. */
  downloadAll(): void {
    this.download(this.correlativaService.exportAll());
  }

  private load(delay = 0): void {
    this.loading = true;
    this.reload.next(delay);
  }

  /** Descarga el archivo que arma el servicio (consultadas o toda la tabla). */
  private download(request: Observable<CorrelativaExport>): void {
    if (this.downloading) {
      return;
    }
    this.downloading = true;
    request.subscribe({
      next: ({ blob, fileName }) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        this.downloading = false;
      },
      error: () => {
        this.downloading = false;
        this.toastService.error(this.translationService.translate('common.errorGeneric'));
      }
    });
  }
}

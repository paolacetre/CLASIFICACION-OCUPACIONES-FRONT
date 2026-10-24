import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ReporteDetalleComponent } from './reporte-detalle/reporte-detalle.component';
import { ReporteEstadisticasComponent } from './reporte-estadisticas/reporte-estadisticas.component';
import { criterionTitle, exportRecords } from './reportes.export';
import {
  CLASSIFICATIONS,
  CriterionState,
  EVALUATIONS,
  LIST_FAMILIES,
  ReportCriterion,
  ReportFilters,
  ReportRecord,
  ReportSortColumn,
  activeFilterCount,
  allCriteria,
  dateTime,
  distinctValues,
  emptyFilters,
  matchesFilters,
  searchableText
} from './reportes.model';
import { ReportesService } from './reportes.service';
import { PAGE_SIZES, normalizeText, pageCountOf } from '../../shared/ui/list';
import { PaginationComponent } from '../../shared/ui/pagination.component';

export * from './reportes.model';

/** Columnas de «Reporte completo», en el orden de la versión desplegada. */
const FULL_COLUMNS: readonly ReportSortColumn[] = [
  'id',
  'group',
  'kind',
  'startedAt',
  'finishedAt',
  'date',
  'fullName',
  'email',
  'phone',
  'department',
  'city',
  'company',
  'position',
  'profession',
  'sector'
];

/** Íconos de los indicadores (trazos SVG). */
const EVALUATION_ICONS: Record<string, string> = {
  aprobado: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  con_mejoras: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  parcial: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 8v4M12 16h.01',
  no_aprobado: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM15 9l-6 6M9 9l6 6'
};

/** Filtros de la ficha («Calificación por criterio»). */
type VerdictFilter = 'todos' | CriterionState;

/**
 * Vista «Resumen» (Estadísticas > Reportes; copia de la versión desplegada): los formularios que el
 * experto validó, con su calificación por criterio. Indicadores por resultado (Aprobados, Con
 * mejoras, Parciales, No aprobados), búsqueda, filtros, «Estadísticas», «Exportar Excel» y dos
 * vistas: «Reporte completo» (todas las columnas; clic en una fila abre el detalle por ocupación) y
 * «Fichas» (resumen con el mapa de calificaciones y la ficha desplegable).
 */
@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, DialogDirective, ReporteDetalleComponent, ReporteEstadisticasComponent, PaginationComponent],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.css'
})
export class ReportesComponent implements OnInit {
  private readonly service = inject(ReportesService);
  private readonly translation = inject(TranslationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly evaluations = EVALUATIONS;
  readonly evaluationIcons = EVALUATION_ICONS;
  readonly classifications = CLASSIFICATIONS;
  readonly columns = FULL_COLUMNS;
  readonly dateTime = dateTime;

  records: ReportRecord[] = [];
  loading = true;
  loadError = false;

  search = '';
  filters: ReportFilters = emptyFilters();
  /** Lo que se edita en «Filtrar» hasta pulsar «Aplicar». */
  draftFilters: ReportFilters = emptyFilters();
  filtersOpen = false;
  statsOpen = false;
  exporting = false;

  view: 'full' | 'cards' = 'full';
  sort: ReportSortColumn = 'id';
  ascending = true;
  page = 1;
  pageSize = PAGE_SIZES[0];

  /** Envío abierto en el detalle (Reporte completo). */
  detail: ReportRecord | null = null;
  /** Criterio al que lleva el detalle (clic en un cuadro del mapa de Fichas). */
  focusCriterion: string | null = null;
  /** Fichas desplegadas y el veredicto por el que se filtra cada una. */
  private readonly expanded = new Set<number>();
  private readonly verdicts = new Map<number, VerdictFilter>();

  ngOnInit(): void {
    this.load();
  }

  /** Pide el resumen de los envíos con validación experta cerrada. */
  load(): void {
    this.loading = true;
    this.loadError = false;
    this.service
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (records) => {
          this.records = records;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.loadError = true;
        }
      });
  }

  count(evaluation: string): number {
    return this.records.filter((record) => record.evaluation === evaluation).length;
  }

  /* ---------- Búsqueda, filtros y orden ---------- */

  /** Envíos que cumplen los filtros y la búsqueda, en el orden de la columna elegida. */
  get filtered(): ReportRecord[] {
    const needle = normalizeText(this.search);
    const rows = this.records.filter((record) => matchesFilters(record, this.filters) && (!needle || searchableText(record).includes(needle)));
    const direction = this.ascending ? 1 : -1;
    const key = (record: ReportRecord): string | number => {
      const value =
        this.sort === 'evaluation'
          ? EVALUATIONS.indexOf(record.evaluation as never)
          : this.sort === 'occupations'
            ? record.occupations[0]?.name ?? ''
            : (record as unknown as Record<string, string | number>)[this.sort];
      return typeof value === 'string' ? value.toLowerCase() : value;
    };
    return [...rows].sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      return (x < y ? -1 : x > y ? 1 : 0) * direction || a.id - b.id;
    });
  }

  get activeFilters(): number {
    return activeFilterCount(this.filters);
  }

  /** Opciones de los desplegables de «Filtrar», con lo que hay en los registros. */
  options(field: 'department' | 'city' | 'company' | 'profession' | 'position'): string[] {
    const source = field === 'city' && this.draftFilters.department ? this.records.filter((record) => record.department === this.draftFilters.department) : this.records;
    return distinctValues(source, (record) => record[field]);
  }

  openFilters(): void {
    this.draftFilters = { ...this.filters };
    this.filtersOpen = true;
  }

  applyFilters(): void {
    this.filters = { ...this.draftFilters };
    this.filtersOpen = false;
    this.page = 1;
  }

  clearFilters(): void {
    this.draftFilters = emptyFilters();
  }

  resetAll(): void {
    this.filters = emptyFilters();
    this.search = '';
    this.page = 1;
  }

  /** Ordena por la columna; si ya era la elegida, invierte el sentido. */
  sortBy(column: ReportSortColumn): void {
    if (this.sort === column) {
      this.ascending = !this.ascending;
    } else {
      this.sort = column;
      this.ascending = true;
    }
  }

  ariaSort(column: ReportSortColumn): 'ascending' | 'descending' | null {
    return this.sort === column ? (this.ascending ? 'ascending' : 'descending') : null;
  }

  /* ---------- Paginación ---------- */

  get pageCount(): number {
    return pageCountOf(this.filtered.length, this.pageSize);
  }

  get pageRows(): ReportRecord[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  goToPage(page: number): void {
    this.page = Math.min(Math.max(1, page), this.pageCount);
  }

  onSearchChange(): void {
    this.page = 1;
  }

  /* ---------- Celdas ---------- */

  /** Texto de una celda del reporte completo. */
  cell(record: ReportRecord, column: ReportSortColumn): string {
    switch (column) {
      case 'kind':
        return this.t(`reportes.kind.${record.kind}`);
      case 'startedAt':
      case 'finishedAt':
      case 'date':
        return dateTime(record[column]);
      default:
        return String((record as unknown as Record<string, string | number>)[column] ?? '');
    }
  }

  /* ---------- Fichas ---------- */

  isExpanded(record: ReportRecord): boolean {
    return this.expanded.has(record.group);
  }

  toggleCard(record: ReportRecord): void {
    if (!this.expanded.delete(record.group)) {
      this.expanded.add(record.group);
    }
  }

  criteriaOf(record: ReportRecord): ReportCriterion[] {
    return allCriteria(record);
  }

  /** Conteo de cada veredicto de una ficha (solo los que tienen al menos uno). */
  verdictCounts(record: ReportRecord): Array<{ state: VerdictFilter; total: number }> {
    const criteria = allCriteria(record);
    const states: VerdictFilter[] = ['todos', 'aplica', 'parcial', 'requiere_ajuste', 'no_aplica', 'sin_dato'];
    return states
      .map((state) => ({ state, total: state === 'todos' ? criteria.length : criteria.filter((item) => item.state === state).length }))
      .filter((item) => item.total > 0);
  }

  verdictOf(record: ReportRecord): VerdictFilter {
    return this.verdicts.get(record.group) ?? 'todos';
  }

  setVerdict(record: ReportRecord, state: VerdictFilter): void {
    this.verdicts.set(record.group, state);
  }

  /**
   * Criterios de la ficha agrupados como la desplegada: «Campos principales» (los datos de la
   * ocupación) y un grupo por lista (Funciones, Denominaciones…), con el código de la ocupación
   * delante cuando el envío tiene varias.
   */
  cardGroups(record: ReportRecord): Array<{ titleKey: string; withTitles: boolean; items: Array<{ criterion: ReportCriterion; title: string }> }> {
    const verdict = this.verdictOf(record);
    const many = record.occupations.length > 1;
    const groups = new Map<string, Array<{ criterion: ReportCriterion; title: string }>>();
    for (const occupation of record.occupations) {
      for (const criterion of occupation.criteria) {
        if (verdict !== 'todos' && criterion.state !== verdict) continue;
        const key = LIST_FAMILIES.includes(criterion.family) ? `reportes.family.${criterion.family}` : 'reportes.cards.mainFields';
        const title = `${many ? `[${occupation.code}] ` : ''}${criterionTitle(criterion, (k) => this.t(k))}`;
        groups.set(key, [...(groups.get(key) ?? []), { criterion, title }]);
      }
    }
    const order = ['reportes.cards.mainFields', ...LIST_FAMILIES.map((family) => `reportes.family.${family}`)];
    // Campos principales llevan su título («[2126] 1. Nombre de la ocupación»); las listas, solo el valor.
    return order
      .filter((key) => groups.has(key))
      .map((titleKey) => ({ titleKey, withTitles: titleKey === 'reportes.cards.mainFields', items: groups.get(titleKey)! }));
  }

  /** Etiqueta de un cuadro del mapa: «[2126] 5. Funciones 2 · No aplica — texto validado». */
  cellLabel(record: ReportRecord, criterion: ReportCriterion): string {
    const occupation = record.occupations.find((item) => item.criteria.includes(criterion));
    const title = criterionTitle(criterion, (key) => this.t(key));
    const prefix = record.occupations.length > 1 && occupation ? `[${occupation.code}] ` : '';
    const value = criterion.value.length > 90 ? `${criterion.value.slice(0, 90)}…` : criterion.value;
    return `${prefix}${title} · ${this.t(`reportes.state.${criterion.state}`)}${value ? ` — ${value}` : ''}`;
  }

  /** Clic en un cuadro: abre el detalle por ocupación en la de ese criterio y lo resalta. */
  openCriterion(record: ReportRecord, criterion: ReportCriterion): void {
    this.focusCriterion = criterion.id;
    this.detail = record;
  }

  /** «2126 · Agroecólogos | 21321 · Agrónomos…». */
  occupationsText(record: ReportRecord): string {
    return record.occupations.map((occupation) => `${occupation.code} · ${occupation.name}`).join(' | ') || '—';
  }

  applyCount(record: ReportRecord): number {
    return allCriteria(record).filter((criterion) => criterion.state === 'aplica').length;
  }

  /* ---------- Exportar ---------- */

  /** Descarga en Excel lo filtrado: una fila por ocupación y una columna por criterio. La librería se carga solo al exportar. */
  async exportExcel(): Promise<void> {
    const rows = this.filtered;
    if (!rows.length) {
      this.toast.warning(this.t('reportes.exportEmpty'));
      return;
    }
    this.exporting = true;
    try {
      await exportRecords(rows, (key, params) => this.t(key, params), `Resumen_validacion_${new Date().toISOString().slice(0, 10)}`);
      this.toast.success(this.t('reportes.exportDone', { count: rows.length }));
    } catch {
      this.toast.error(this.t('reportes.exportError'));
    } finally {
      this.exporting = false;
    }
  }

  trackRecord(_index: number, record: ReportRecord): number {
    return record.group;
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }
}

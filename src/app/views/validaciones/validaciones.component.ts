import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ValidacionEditorComponent } from './validacion-editor/validacion-editor.component';
import {
  REVIEW_STATES,
  ReviewRecord,
  ReviewSortColumn,
  ReviewState,
  dayAndTime,
  isEditable,
  searchableText
} from './validaciones.model';
import { ValidacionesService } from './validaciones.service';
import { ComboOption, FilterComboboxComponent, comboOptions } from '../../shared/ui/filter-combobox.component';
import { PAGE_SIZES, normalizeText, pageCountOf } from '../../shared/ui/list';
import { PaginationComponent } from '../../shared/ui/pagination.component';

export * from './validaciones.model';

/** Íconos de los indicadores (trazos SVG), en el orden de `REVIEW_STATES`. */
const STATE_ICONS: Record<ReviewState, string> = {
  received: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  filled: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  edited: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  sent: 'M22 2 11 13M22 2l-7 20-4-9-9-4Z'
};

/**
 * Vista «Validación experta» (Estadísticas > Validaciones; copia de la versión desplegada): la
 * bandeja de los instrumentos que el analista envió al experto, con los cuatro indicadores
 * (Recibido, Diligenciado, Editado, Enviado), búsqueda, filtro de estado, orden por columna y
 * paginación. «Revisar» abre el editor de la validación.
 */
@Component({
  selector: 'app-validaciones',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, ValidacionEditorComponent, PaginationComponent, FilterComboboxComponent],
  templateUrl: './validaciones.component.html',
  styleUrl: './validaciones.component.css'
})
export class ValidacionesComponent implements OnInit {
  private readonly service = inject(ValidacionesService);
  private readonly translation = inject(TranslationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly states = REVIEW_STATES;
  readonly stateIcons = STATE_ICONS;

  records: ReviewRecord[] = [];
  loading = true;
  loadError = false;

  search = '';
  stateFilter: ReviewState | '' = '';
  sort: ReviewSortColumn = 'date';
  ascending = false;
  page = 1;
  pageSize = PAGE_SIZES[0];

  /** Instrumento abierto en el editor. */
  reviewing: ReviewRecord | null = null;

  ngOnInit(): void {
    this.load();
  }

  /** Pide la bandeja (Instrumento 2 e Instrumento 3 enviados al experto). */
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
          this.page = Math.min(this.page, this.pageCount);
        },
        error: () => {
          this.loading = false;
          this.loadError = true;
        }
      });
  }

  count(state: ReviewState): number {
    return this.records.filter((record) => record.state === state).length;
  }

  /** Clic en un indicador: filtra por ese estado (o quita el filtro si ya estaba). */
  toggleState(state: ReviewState): void {
    this.stateFilter = this.stateFilter === state ? '' : state;
    this.page = 1;
  }

  /** Registros del estado elegido que cumplen la búsqueda, en el orden de la columna elegida. */
  get filtered(): ReviewRecord[] {
    const needle = normalizeText(this.search);
    const rows = this.records.filter((record) => (!this.stateFilter || record.state === this.stateFilter) && (!needle || searchableText(record).includes(needle)));
    const direction = this.ascending ? 1 : -1;
    const key = (record: ReviewRecord): string | number => {
      switch (this.sort) {
        case 'id':
          return record.id;
        case 'kind':
          return record.kind;
        case 'occupation':
          return record.occupations[0]?.name.toLowerCase() ?? '';
        case 'analyst':
          return record.analyst.toLowerCase();
        case 'state':
          return REVIEW_STATES.indexOf(record.state);
        default:
          return record.date;
      }
    };
    return [...rows].sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      return (x < y ? -1 : x > y ? 1 : 0) * direction || b.id - a.id;
    });
  }

  get pageCount(): number {
    return pageCountOf(this.filtered.length, this.pageSize);
  }

  get pageRows(): ReviewRecord[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  get hasFilters(): boolean {
    return !!this.search.trim() || !!this.stateFilter;
  }

  /** Ordena por la columna; si ya era la elegida, invierte el sentido. La fecha empieza por la más reciente. */
  sortBy(column: ReviewSortColumn): void {
    if (this.sort === column) {
      this.ascending = !this.ascending;
    } else {
      this.sort = column;
      this.ascending = column !== 'date';
    }
  }

  ariaSort(column: ReviewSortColumn): 'ascending' | 'descending' | null {
    return this.sort === column ? (this.ascending ? 'ascending' : 'descending') : null;
  }

  goToPage(page: number): void {
    this.page = Math.min(Math.max(1, page), this.pageCount);
  }

  stateOptions(): ComboOption[] {
    return comboOptions(this.states, (state) => state, (state) => this.translation.translate(`validaciones.state.${state}`));
  }

  onFiltersChange(): void {
    this.page = 1;
  }

  clearFilters(): void {
    this.search = '';
    this.stateFilter = '';
    this.page = 1;
  }

  /** «Hoy» / «Ayer» o la fecha, y la hora. */
  when(record: ReviewRecord): { day: string; time: string } {
    const value = dayAndTime(record.date);
    return { day: value.relative ? this.t(`validaciones.${value.relative}`) : value.day, time: value.time };
  }

  /** Ocupación principal de la fila (la primera); null si el instrumento no trae ninguna. */
  first(record: ReviewRecord): ReviewRecord['occupations'][number] | null {
    return record.occupations[0] ?? null;
  }

  editable(record: ReviewRecord): boolean {
    return isEditable(record.state);
  }

  /** Copia el ID al portapapeles y lo avisa. */
  copyId(record: ReviewRecord): void {
    const done = () => this.toast.success(this.t('validaciones.idCopied', { id: record.id }));
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(String(record.id)).then(done, () => undefined);
    }
  }

  open(record: ReviewRecord): void {
    this.reviewing = record;
  }

  /** El editor guardó: la bandeja vuelve a pedirse (el estado puede haber cambiado). */
  onSaved(): void {
    this.load();
  }

  onClosed(): void {
    this.reviewing = null;
  }

  trackRecord(_index: number, record: ReviewRecord): string {
    return `${record.kind}-${record.id}`;
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }
}

import { CommonModule } from '@angular/common';
import { Directive, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EMPTY, Observable, Subject, catchError, expand, of, reduce, switchMap, timer } from 'rxjs';
import { DialogDirective } from '../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ADMIN_ROLE, ROLE_LABELS, SESSION } from '../../shared/session';
import { ToastService } from '../../shared/toast/toast.service';
import { PAGE_SIZES, SEARCH_DEBOUNCE_MS, pageCountOf } from '../../shared/ui/list';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { GuideDialogComponent, GuideStep } from '../../shared/ui/guide-dialog.component';
import { FilterComboboxComponent } from './filter-combobox/filter-combobox.component';
import {
  ConsultaClassification,
  ConsultaDetail,
  ConsultaDetailTab,
  ConsultaFilterKey,
  ConsultaFilterOptions,
  ConsultaFilters,
  ConsultaItem,
  ConsultaOccupation,
  ConsultaSortColumn,
  ConsultaSource,
  EXPORT_COLUMNS,
  ExportColumn,
  FilterOption,
  createEmptyFilters,
  hasActiveFilters
} from './consulta-ocupaciones.model';

export * from './consulta-ocupaciones.model';

/** Lo que importan las dos pantallas de Consulta (CNO y CUOC), que comparten plantilla. */
export const CONSULTA_IMPORTS = [CommonModule, FormsModule, TranslatePipe, DialogDirective, PaginationComponent, GuideDialogComponent, FilterComboboxComponent];

/** Desde cuántas opciones un selector lleva buscador. */
const LONG_LIST_MIN = 8;

/** Ícono de cada filtro en la tarjeta (los mismos del front original). */
export type FilterIcon = 'level' | 'group' | 'folder' | 'area' | 'function' | 'status';

/** Un selector de la tarjeta «Filtros de búsqueda». */
export interface FilterField {
  key: ConsultaFilterKey;
  /** Clave sin el prefijo de la clasificación (se arma con `k()`). */
  labelKey: string;
  /** Texto de la opción vacía («Todos» / «Todas»), también sin prefijo. */
  allKey: string;
  icon: FilterIcon;
  options: FilterOption[];
  /** Filtro del que depende: solo se ofrecen las opciones de lo elegido allí. */
  dependsOn?: ConsultaFilterKey;
  /** El texto de sus opciones es una clave de traducción (el estado). */
  translatedOptions?: boolean;
}

/** Pestaña del perfil (la cantidad sale de `tabCount()`). */
interface DetailTabOption {
  id: ConsultaDetailTab;
  labelKey: string;
}

/** Listas del perfil que pueden tener elementos inactivos. */
type ListWithInactive = Exclude<ConsultaDetailTab, 'general' | 'related'>;

/** Páginas que se piden juntas al exportar todas las ocupaciones de la consulta (máximo que acepta el backend). */
const EXPORT_PAGE_SIZE = 100;

/** Roles que ven lo inactivo de una ocupación (fecha de registro y funciones o denominaciones dadas de baja), como en el front original. */
const ROLES_SEEING_INACTIVE = [ADMIN_ROLE, ROLE_LABELS['ANALISTA']];

/**
 * Pantalla común de Consulta > CNO y Consulta > CUOC (la de `features/cno` y
 * `features/cuoc` del front original): tarjeta «Filtros de búsqueda» (el texto
 * busca mientras se escribe; los selectores se aplican con «Aplicar
 * filtros»), resultados ordenables y paginados por el servidor, perfil de la
 * ocupación elegida, guía de uso y exportación a Excel con las columnas
 * elegidas.
 *
 * Es la base de `CnoComponent` y `CuocComponent`, que solo dicen qué
 * clasificación consultan y con qué servicio; las dos usan la plantilla y los
 * estilos de esta carpeta. CNO filtra por nivel de cualificación (y lo muestra
 * por su código, «Nivel 1 (A)»), área de desempeño y función; CUOC por nivel de
 * competencia, gran grupo, área, grupo primario y función.
 */
@Directive()
export abstract class ConsultaOcupacionesComponent implements OnInit {
  /** Clasificación consultada: prefijo de los textos (`cno.*` / `cuoc.*`). */
  abstract readonly classification: ConsultaClassification;
  /** Servicio de la clasificación (`CnoService` o `CuocService`). */
  protected abstract readonly source: ConsultaSource;

  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);
  private readonly session = inject(SESSION);

  /** Filtros aplicados (el texto buscado se aplica al escribir; los selectores, con «Aplicar filtros»). */
  filters: ConsultaFilters = createEmptyFilters();
  /** Lo elegido en los selectores y todavía no aplicado. */
  draft: ConsultaFilters = createEmptyFilters();
  private options: Partial<ConsultaFilterOptions> = {};
  /** Selectores de la tarjeta, ya con sus opciones. */
  filterFields: FilterField[] = [];

  /** Ocupaciones de la página en pantalla; `null` mientras no se ha buscado nada (se muestra la invitación a buscar). */
  results: ConsultaOccupation[] | null = null;
  /** Total de ocupaciones que cumplen la consulta (en todas las páginas). */
  total = 0;
  page = 1;
  pageSize = PAGE_SIZES[0];
  /** Texto con el que se obtuvieron los resultados que están en pantalla. */
  searchedQuery = '';
  loading = false;
  exporting = false;
  guideOpen = false;

  sortColumn: ConsultaSortColumn = 'code';
  sortAscending = true;

  /** Ocupación abierta desde los resultados; `null` mientras se ve la tabla. */
  selected: ConsultaDetail | null = null;
  activeTab: ConsultaDetailTab = 'general';
  readonly detailTabs: DetailTabOption[] = [
    { id: 'general', labelKey: 'tabGeneral' },
    { id: 'functions', labelKey: 'functions' },
    { id: 'denominations', labelKey: 'denominations' },
    { id: 'skills', labelKey: 'skills' },
    { id: 'knowledge', labelKey: 'knowledge' },
    { id: 'related', labelKey: 'related' }
  ];
  /** Tarjetas del perfil (cada una abre su pestaña), en el orden del front original. */
  readonly statTabs: ConsultaDetailTab[] = ['denominations', 'functions', 'skills', 'knowledge'];
  readonly pageSizes = PAGE_SIZES;
  /** Página de la lista de la pestaña abierta. */
  tabPage = 1;
  tabPageSize = PAGE_SIZES[0];
  /** Desplegables de funciones y denominaciones inactivas abiertos. */
  inactiveOpen: Record<ListWithInactive, boolean> = { functions: false, denominations: false, skills: false, knowledge: false };

  /** Modal «Exportar a Excel» y las columnas marcadas. */
  exportOpen = false;
  readonly exportColumns = EXPORT_COLUMNS;
  chosenColumns = new Set<ExportColumn['key']>(EXPORT_COLUMNS.map((column) => column.key));

  /** Cada valor es la espera (ms) antes de consultar: 0 para clics, el debounce al escribir. */
  private readonly reload = new Subject<number>();

  constructor() {
    this.reload
      .pipe(
        switchMap((delay) => {
          const filters = { ...this.filters };
          const query = { ...filters, page: this.page, pageSize: this.pageSize, sort: this.sortColumn, ascending: this.sortAscending };
          return timer(delay).pipe(
            switchMap(() =>
              hasActiveFilters(filters)
                ? this.source.search(query).pipe(
                    catchError(() => {
                      this.toastService.error(this.translationService.translate('common.errorGeneric'));
                      return of({ items: [], total: 0 });
                    })
                  )
                : of(null)
            ),
            switchMap((page) => {
              this.searchedQuery = filters.query.trim();
              return of(page);
            })
          );
        }),
        takeUntilDestroyed()
      )
      .subscribe((page) => {
        this.results = page ? page.items : null;
        this.total = page ? page.total : 0;
        this.loading = false;
      });
  }

  /** Arma la tarjeta de filtros y pide sus opciones (catálogos, funciones y, en CUOC, la jerarquía). */
  ngOnInit(): void {
    this.filterFields = this.buildFilterFields();
    this.source.filterOptions().subscribe({
      next: (options) => {
        this.options = options;
        this.filterFields = this.buildFilterFields();
      },
      error: () => this.toastService.error(this.translationService.translate('common.errorGeneric'))
    });
  }

  /** Clave de traducción de la clasificación: `k('title')` es `cno.title` o `cuoc.title`. */
  k(key: string): string {
    return `${this.classification}.${key}`;
  }

  /** Pasos de la "Guía de uso" (`GuideDialogComponent`); la exportación solo se explica en CNO. */
  get guideSteps(): GuideStep[] {
    const steps = ['guideSearch', 'guideView', ...(this.hasLevel ? ['guideExport'] : [])];
    return steps.map((step) => ({ titleKey: this.k(`${step}Title`), textKey: this.k(`${step}Text`) }));
  }

  /** CNO muestra, ordena y describe el nivel de cualificación en la tabla y el perfil; CUOC no. */
  get hasLevel(): boolean {
    return this.classification === 'cno';
  }

  /** Administrador y Analista ven la fecha de registro y lo inactivo; los demás roles, solo lo activo. */
  get seesInactive(): boolean {
    return ROLES_SEEING_INACTIVE.includes(this.session.role);
  }

  get hasFilters(): boolean {
    return hasActiveFilters(this.filters);
  }

  get pageCount(): number {
    return pageCountOf(this.total, this.pageSize);
  }

  /** Ocupaciones inactivas de la página en pantalla («N inactivos visibles»). */
  get inactiveVisible(): number {
    return (this.results ?? []).filter((occupation) => occupation.status === 'Inactivo').length;
  }

  /* ---------- Filtros ---------- */

  /** Selectores de la clasificación, en el orden del front original. */
  private buildFilterFields(): FilterField[] {
    const options = this.options;
    const status: FilterOption[] = [
      { value: 'Activo', label: this.k('statusActive') },
      { value: 'Inactivo', label: this.k('statusInactive') }
    ];
    const level: FilterField = { key: 'level', labelKey: 'level', allKey: 'allLevels', icon: 'level', options: options.levels ?? [] };
    const area: FilterField = { key: 'area', labelKey: 'areaFilter', allKey: 'allAreas', icon: 'area', options: options.areas ?? [] };
    const fn: FilterField = { key: 'function', labelKey: 'functionFilter', allKey: 'allFunctions', icon: 'function', options: options.functions ?? [] };
    const state: FilterField = { key: 'status', labelKey: 'status', allKey: 'allStatuses', icon: 'status', options: status, translatedOptions: true };
    if (this.classification === 'cno') {
      return [level, area, fn, state];
    }
    return [
      level,
      { key: 'majorGroup', labelKey: 'majorGroup', allKey: 'allGroups', icon: 'group', options: options.majorGroups ?? [] },
      area,
      { key: 'primaryGroup', labelKey: 'primaryGroup', allKey: 'allGroups', icon: 'folder', options: options.primaryGroups ?? [], dependsOn: 'majorGroup' },
      fn,
      state
    ];
  }

  trackField(_index: number, field: FilterField): string {
    return field.key;
  }

  /** Opciones de un selector con el texto ya traducido (el estado). */
  comboOptionsOf(field: FilterField): FilterOption[] {
    const options = this.optionsOf(field);
    return field.translatedOptions ? options.map((option) => ({ ...option, label: this.translationService.translate(option.label) })) : options;
  }

  /** Los listados largos (funciones, grupos) llevan buscador dentro de la lista. */
  isLongList(field: FilterField): boolean {
    return this.optionsOf(field).length > LONG_LIST_MIN;
  }

  /** Opciones de un selector; si depende de otro, solo las de lo elegido allí. */
  optionsOf(field: FilterField): FilterOption[] {
    const parent = field.dependsOn ? this.draft[field.dependsOn] : '';
    return parent ? field.options.filter((option) => option.parent === parent) : field.options;
  }

  /** Cambia un selector (queda pendiente de «Aplicar filtros»); un hijo que ya no pertenece al padre elegido se limpia. */
  setDraft(key: ConsultaFilterKey, value: string): void {
    this.draft = { ...this.draft, [key]: value };
    for (const field of this.filterFields) {
      if (field.dependsOn === key && value && this.draft[field.key]) {
        const child = field.options.find((option) => option.value === this.draft[field.key]);
        if (child && child.parent !== value) {
          this.draft = { ...this.draft, [field.key]: '' };
        }
      }
    }
  }

  /** Hay selecciones sin aplicar. */
  get pendingChanges(): boolean {
    return this.filterFields.some((field) => (this.draft[field.key] ?? '') !== (this.filters[field.key] ?? ''));
  }

  /** «Limpiar filtros» se habilita si hay algo aplicado, texto buscado o una selección sin aplicar. */
  get canClear(): boolean {
    return this.hasFilters || this.pendingChanges;
  }

  /** «Aplicar filtros»: todos los selectores de una vez; cierra el perfil abierto y vuelve a la primera página. */
  applyFilters(): void {
    const applied = { ...this.filters };
    for (const field of this.filterFields) {
      Object.assign(applied, { [field.key]: this.draft[field.key] });
    }
    this.filters = applied;
    this.restart(0);
  }

  /** El texto buscado se aplica mientras se escribe (con una pausa). */
  onQueryChange(): void {
    this.restart(SEARCH_DEBOUNCE_MS);
  }

  clearQuery(): void {
    this.filters.query = '';
    this.onQueryChange();
  }

  /** «Limpiar filtros»: texto y selectores, aplicados o no. */
  clearFilters(): void {
    this.filters = createEmptyFilters();
    this.draft = createEmptyFilters();
    this.restart(0);
  }

  /** Cambiar la consulta cierra el perfil abierto y vuelve a la primera página. */
  private restart(delay: number): void {
    this.selected = null;
    this.page = 1;
    this.load(delay);
  }

  /* ---------- Resultados ---------- */

  /** Ordena por la columna (lo hace el servidor); si ya era la elegida, invierte el sentido. */
  sortBy(column: ConsultaSortColumn): void {
    this.sortAscending = this.sortColumn === column ? !this.sortAscending : true;
    this.sortColumn = column;
    this.page = 1;
    this.load();
  }

  ariaSort(column: ConsultaSortColumn): 'ascending' | 'descending' | 'none' {
    return this.sortColumn !== column ? 'none' : this.sortAscending ? 'ascending' : 'descending';
  }

  /** Pide al servidor la página elegida. */
  goToPage(page: number): void {
    if (page < 1 || page > this.pageCount || page === this.page) {
      return;
    }
    this.page = page;
    this.load();
  }

  onPageSizeChange(): void {
    this.page = 1;
    this.load();
  }

  /* ---------- Perfil ---------- */

  /** Abre el perfil completo de una ocupación (desde la tabla o desde una ocupación relacionada). */
  openDetail(code: string): void {
    this.source.detail(code).subscribe({
      next: (detail) => {
        this.selected = detail;
        this.inactiveOpen = { functions: false, denominations: false, skills: false, knowledge: false };
        this.selectTab('general');
      },
      error: () => this.toastService.error(this.translationService.translate(this.k('detailError')))
    });
  }

  /** "Volver a resultados" y "Quitar selección": cierra el perfil y deja la tabla como estaba. */
  closeDetail(): void {
    this.selected = null;
  }

  selectTab(tab: ConsultaDetailTab): void {
    this.activeTab = tab;
    this.tabPage = 1;
  }

  /** Lista completa de una pestaña. */
  private listOf(tab: ConsultaDetailTab): ConsultaItem[] {
    const detail = this.selected;
    switch (tab) {
      case 'functions':
        return detail?.functions ?? [];
      case 'denominations':
        return detail?.denominations ?? [];
      case 'skills':
        return detail?.skills ?? [];
      case 'knowledge':
        return detail?.knowledge ?? [];
      default:
        return [];
    }
  }

  /** Lo activo de una lista (lo que ven todos los roles). */
  activeOf(tab: ConsultaDetailTab): ConsultaItem[] {
    return this.listOf(tab).filter((item) => item.active);
  }

  /** Lo inactivo de una lista: solo lo ven Administrador y Analista, en un desplegable aparte. */
  inactiveOf(tab: ConsultaDetailTab): ConsultaItem[] {
    return this.seesInactive ? this.listOf(tab).filter((item) => !item.active) : [];
  }

  /** Cantidad que acompaña a la pestaña o a la tarjeta (las ocupaciones relacionadas cuentan todas). */
  tabCount(tab: ConsultaDetailTab): number | null {
    if (tab === 'general') {
      return null;
    }
    return tab === 'related' ? this.selected?.related.length ?? 0 : this.activeOf(tab).length;
  }

  /** Página en pantalla de la lista activa de la pestaña. */
  get tabItems(): ConsultaItem[] {
    const start = (this.tabPage - 1) * this.tabPageSize;
    return this.activeOf(this.activeTab).slice(start, start + this.tabPageSize);
  }

  /** Ocupaciones relacionadas de la página en pantalla. */
  get relatedItems(): ConsultaDetail['related'] {
    const start = (this.tabPage - 1) * this.tabPageSize;
    return (this.selected?.related ?? []).slice(start, start + this.tabPageSize);
  }

  /** Total de la lista que se pagina en la pestaña abierta. */
  get tabTotal(): number {
    return this.tabCount(this.activeTab) ?? 0;
  }

  onTabPageSizeChange(size: number): void {
    this.tabPageSize = size;
    this.tabPage = 1;
  }

  /** Pestaña abierta cuando es una lista (con su desplegable de inactivos). */
  get activeList(): ListWithInactive {
    return this.activeTab as ListWithInactive;
  }

  toggleInactive(list: ListWithInactive): void {
    this.inactiveOpen = { ...this.inactiveOpen, [list]: !this.inactiveOpen[list] };
  }

  /* ---------- Exportar ---------- */

  /** Abre «Exportar a Excel» con todas las columnas marcadas. */
  openExport(): void {
    if (!this.results?.length) {
      return;
    }
    this.chosenColumns = new Set(EXPORT_COLUMNS.map((column) => column.key));
    this.exportOpen = true;
  }

  toggleColumn(key: ExportColumn['key']): void {
    const next = new Set(this.chosenColumns);
    if (!next.delete(key)) {
      next.add(key);
    }
    this.chosenColumns = next;
  }

  closeExport(): void {
    if (!this.exporting) {
      this.exportOpen = false;
    }
  }

  /**
   * «Descargar Excel»: todas las ocupaciones de la consulta (no solo la página
   * en pantalla), con los filtros aplicados y las columnas marcadas. Las pide al
   * servidor de a 100 y arma el libro en el navegador (la librería `xlsx` se
   * carga aparte, solo al exportar).
   */
  confirmExport(): void {
    if (this.exporting || !this.chosenColumns.size) {
      return;
    }
    this.exporting = true;
    const columns = EXPORT_COLUMNS.filter((column) => this.chosenColumns.has(column.key));
    this.allResults()
      .pipe(
        catchError(() => {
          this.exporting = false;
          this.toastService.error(this.translationService.translate('common.errorGeneric'));
          return EMPTY;
        })
      )
      .subscribe(async (occupations) => {
        try {
          const XLSX = await import('xlsx');
          const rows = occupations.map((occupation) =>
            Object.fromEntries(columns.map((column) => [this.translationService.translate(this.k(column.labelKey)), occupation[column.key]]))
          );
          const book = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), this.translationService.translate(this.k('exportSheet')));
          XLSX.writeFile(book, this.translationService.translate(this.k('exportFile')));
          this.exportOpen = false;
        } catch {
          this.toastService.error(this.translationService.translate('common.errorGeneric'));
        } finally {
          this.exporting = false;
        }
      });
  }

  /** Todas las páginas de la consulta en pantalla, una tras otra. */
  private allResults(): Observable<ConsultaOccupation[]> {
    const query = { ...this.filters, pageSize: EXPORT_PAGE_SIZE, sort: this.sortColumn, ascending: this.sortAscending };
    return this.source.search({ ...query, page: 1 }).pipe(
      expand((page, index) => ((index + 1) * EXPORT_PAGE_SIZE < page.total ? this.source.search({ ...query, page: index + 2 }) : EMPTY)),
      reduce((all: ConsultaOccupation[], page) => all.concat(page.items), [])
    );
  }

  private load(delay = 0): void {
    this.loading = hasActiveFilters(this.filters);
    this.reload.next(delay);
  }
}

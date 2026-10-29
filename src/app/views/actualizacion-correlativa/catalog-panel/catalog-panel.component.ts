import { CommonModule } from '@angular/common';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { ComboOption, FilterComboboxComponent, comboOptions } from '../../../shared/ui/filter-combobox.component';
import { CatalogCriteria, CatalogPage, CatalogRow, CorrelativeItem } from '../actualizacion-correlativa.model';
import { PAGE_SIZES, pageCountOf } from '../../../shared/ui/list';
import { PaginationComponent } from '../../../shared/ui/pagination.component';

/**
 * Estado de UN panel (CNO o CUOC): búsqueda, filtros, paginación y selección. Vive fuera del
 * componente porque la pantalla crea los dos, conecta cada uno con su catálogo y lee la selección
 * de ambos al armar la relación (como `PanelCatalogo` del front original).
 */
export class CatalogPanel {
  /**
   * Con tope 1 la lista se comporta como una elección única (elegir otra reemplaza la anterior);
   * con un tope mayor, al llegar al máximo se avisa en vez de seguir agregando.
   */
  constructor(readonly maxSelection: number) {}

  /** Cuántas ocupaciones traía la relación que se está editando (0 si no se edita ninguna). */
  private readonly editedCount = signal(0);

  /**
   * Tope vigente: el del panel o, si la relación que se edita ya trae más (cargada por Excel), las
   * que trae, para no obligar a borrar ninguna. Se puede cambiar unas por otras, no agregar más.
   */
  get limit(): number {
    return Math.max(this.maxSelection, this.editedCount());
  }

  /** Lo que se escribe en el buscador; la pantalla lo pasa a `query` tras una pausa. */
  readonly searchText = signal('');
  readonly query = signal('');
  readonly area = signal('');
  readonly status = signal<CatalogCriteria['status']>('');
  readonly filtersOpen = signal(false);
  readonly areas = signal<string[]>([]);
  readonly page = signal(1);
  readonly pageSize = signal<number>(PAGE_SIZES[0]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  /** Se enciende al intentar pasar del tope; se apaga al liberar un hueco. */
  readonly limitWarning = signal(false);

  /** código → nombre: la selección sobrevive a paginar, buscar o filtrar. */
  readonly selection = signal<Map<string, string>>(new Map());
  private readonly result = signal<CatalogPage>({ items: [], total: 0 });

  readonly criteria = computed<CatalogCriteria>(() => ({
    query: this.query(),
    area: this.area(),
    status: this.status(),
    page: this.page(),
    pageSize: this.pageSize()
  }));

  /**
   * Filas a pintar: la página del servidor y, en la página 1, lo ya seleccionado que no venga en
   * ella fijado arriba. Así al editar una relación se ven marcadas sus ocupaciones sin buscarlas.
   */
  readonly rows = computed<CatalogRow[]>(() => {
    const items = this.result().items;
    const selection = this.selection();
    if (this.page() !== 1 || selection.size === 0) {
      return items;
    }
    const inPage = new Set(items.map((row) => row.code));
    const pinned = [...selection].filter(([code]) => !inPage.has(code)).map(([code, name]) => ({ code, name }));
    return pinned.length ? [...pinned, ...items] : items;
  });

  readonly total = computed(() => this.result().total);
  readonly pageCount = computed(() => pageCountOf(this.total(), this.pageSize()));

  readonly selectedCount = computed(() => this.selection().size);
  /** La selección pasa del tope del panel: solo ocurre al editar una relación que ya venía así. */
  readonly overLimit = computed(() => this.selection().size > this.maxSelection);
  readonly codes = computed(() => [...this.selection().keys()]);
  readonly items = computed<CorrelativeItem[]>(() => [...this.selection()].map(([code, name]) => ({ code, name })));
  readonly activeFilters = computed(() => [this.area(), this.status()].filter(Boolean).length);
  readonly allVisibleSelected = computed(() => {
    const rows = this.rows();
    const selection = this.selection();
    return rows.length > 0 && rows.every((row) => selection.has(row.code));
  });

  applyResult(page: CatalogPage): void {
    this.result.set(page);
    this.loading.set(false);
    this.loadError.set(false);
  }

  failLoad(): void {
    this.result.set({ items: [], total: 0 });
    this.loading.set(false);
    this.loadError.set(true);
  }

  isSelected(code: string): boolean {
    return this.selection().has(code);
  }

  /** Marca o desmarca una ocupación. En CNO se elige una sola (otra la reemplaza); en CUOC hasta el tope, y avisa al llegar. */
  toggle(row: CatalogRow): void {
    const current = this.selection();
    if (current.has(row.code)) {
      const next = new Map(current);
      next.delete(row.code);
      this.selection.set(next);
      this.limitWarning.set(false);
      return;
    }
    if (this.limit === 1) {
      this.selection.set(new Map([[row.code, row.name]]));
      this.limitWarning.set(false);
      return;
    }
    if (current.size >= this.limit) {
      this.limitWarning.set(true);
      return;
    }
    this.selection.set(new Map(current).set(row.code, row.name));
  }

  /** Casilla del encabezado: marca o desmarca las filas visibles, sin pasar del tope. */
  toggleVisible(): void {
    const mark = !this.allVisibleSelected();
    const next = new Map(this.selection());
    let reachedLimit = false;
    for (const row of this.rows()) {
      if (!mark) {
        next.delete(row.code);
      } else if (!next.has(row.code)) {
        if (next.size >= this.limit) {
          reachedLimit = true;
          break;
        }
        next.set(row.code, row.name);
      }
    }
    this.selection.set(next);
    this.limitWarning.set(reachedLimit);
  }

  /**
   * Deja marcada una relación existente, completa, y vuelve a la página 1, donde se ve fijada. No
   * se recorta al tope: guardar reemplaza todas las CUOC de la CNO y las que sobraran se borrarían.
   */
  select(items: ReadonlyArray<CorrelativeItem>): void {
    this.editedCount.set(items.length);
    this.selection.set(new Map(items.map((item) => [item.code, item.name])));
    this.limitWarning.set(false);
    this.page.set(1);
  }

  clearSelection(): void {
    this.editedCount.set(0);
    this.selection.set(new Map());
    this.limitWarning.set(false);
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  setArea(area: string): void {
    this.area.set(area);
    this.page.set(1);
  }

  setStatus(status: CatalogCriteria['status']): void {
    this.status.set(status);
    this.page.set(1);
  }

  /** Quita búsqueda y filtros y vuelve a la primera página. */
  clearFilters(): void {
    this.area.set('');
    this.status.set('');
    this.searchText.set('');
    this.query.set('');
    this.page.set(1);
  }
}

/** Panel de un catálogo (CNO o CUOC): encabezado, buscador, filtros, lista con casillas y paginación. */
@Component({
  selector: 'app-catalog-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, PaginationComponent, FilterComboboxComponent],
  templateUrl: './catalog-panel.component.html',
  styleUrl: './catalog-panel.component.css'
})
export class CatalogPanelComponent {
  private readonly translation = inject(TranslationService);

  @Input({ required: true }) panel!: CatalogPanel;
  @Input({ required: true }) side!: 'cno' | 'cuoc';

  readonly statuses = ['Activo', 'Inactivo'] as const;
  readonly skeleton = Array.from({ length: 6 });

  areaOptions(): ComboOption[] {
    return comboOptions(this.panel.areas(), (area) => area);
  }

  /** «Activo» e «Inactivo» se filtran por su valor; el texto va en el idioma guardado. */
  statusOptions(): ComboOption[] {
    return comboOptions(this.statuses, (status) => status, (status) => this.translation.translate(`actualizacionCorrelativa.status.${status}`));
  }

  chooseStatus(status: string): void {
    this.panel.setStatus(status as CatalogCriteria['status']);
  }

  /** Miles con punto, como el resto del sistema. */
  format(value: number): string {
    return value.toLocaleString('es-CO');
  }

  clearSearch(): void {
    this.panel.searchText.set('');
  }
}

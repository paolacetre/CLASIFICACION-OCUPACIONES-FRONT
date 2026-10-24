import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../shared/dialog/dialog.directive';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { PROJECT_STORAGE_PREFIX } from '../../proyecto/config';
import {
  CATALOG_LIMITS,
  CODE_PATTERN,
  CatalogDraft,
  CatalogItem,
  CatalogKind,
  CatalogSort,
  DESCRIPTION_FILTERS,
  DescriptionFilter,
  STATUS_FILTERS,
  StatusFilter,
  UPDATE_TABS,
  UpdateTab,
  compareCodes,
  dateKey,
  descriptionMax,
  hasDescription,
  nameMax,
  requiresCode,
  showsStatus
} from './actualizacion-cno.model';
import { ActualizacionCnoService, CATALOG_CONFLICT, CATALOG_NOT_FOUND, CatalogError } from './actualizacion-cno.service';
import { CargaCnoComponent } from './carga-cno/carga-cno.component';
import { EditarOcupacionComponent } from './editar-ocupacion/editar-ocupacion.component';
import { Classification, ClassificationContext, ClassTranslatePipe, classKey } from './clasificacion';
import { OcupacionWizardComponent } from './ocupacion-wizard/ocupacion-wizard.component';
import { PAGE_SIZES, normalizeText, pageCountOf } from '../../shared/ui/list';
import { PaginationComponent } from '../../shared/ui/pagination.component';

export * from './actualizacion-cno.model';

/** Formulario de agregar o editar un registro de catálogo. */
interface Editor {
  kind: CatalogKind;
  /** El registro que se edita; `null` al agregar. */
  item: CatalogItem | null;
  draft: CatalogDraft;
  /** Ya se intentó guardar: desde ahí se muestran los errores de todos los campos. */
  submitted: boolean;
}

/** Íconos (trazos SVG) de las pestañas, como en la versión desplegada. */
const TAB_ICONS: Record<UpdateTab, string> = {
  level: 'm12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5',
  area: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  skill: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z',
  knowledge: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4ZM5 17a3 3 0 0 1 3-3h11',
  occupation: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6'
};

/** Clave de sessionStorage con la pestaña abierta de cada clasificación: al recargar la página se vuelve a ella. */
export function tabStorageKey(classification: Classification): string {
  return `${PROJECT_STORAGE_PREFIX}_actualizacion_${classification}_tab`;
}

/** Clave de sessionStorage con la pestaña abierta de Actualización > CNO. */
export const CNO_TAB_STORAGE_KEY = tabStorageKey('cno');

/** La pestaña guardada, si sigue existiendo. */
function storedTab(classification: Classification): UpdateTab {
  try {
    const tab = sessionStorage.getItem(tabStorageKey(classification)) as UpdateTab | null;
    return tab && UPDATE_TABS.includes(tab) ? tab : 'level';
  } catch {
    return 'level';
  }
}


/**
 * "Actualización > CNO" y "Actualización > CUOC" (`classification`): administra los
 * catálogos oficiales (nivel, área, habilidades o destrezas y conocimientos) y lista
 * las ocupaciones. Copia la pantalla de la versión desplegada, que también es una
 * sola para las dos; lo que se guarda aquí cambia el catálogo oficial. Todas las
 * pestañas se piden completas y la búsqueda, los filtros, el orden y las páginas
 * se resuelven aquí. Provee la clasificación (`ClassificationContext`) al asistente
 * y a la carga de Excel, y sus textos salen de `actualizacionCuoc.*` cuando los hay.
 */
@Component({
  selector: 'app-actualizacion-cno',
  standalone: true,
  imports: [CommonModule, FormsModule, ClassTranslatePipe, DialogDirective, ConfirmDialogComponent, OcupacionWizardComponent, CargaCnoComponent, EditarOcupacionComponent, PaginationComponent],
  templateUrl: './actualizacion-cno.component.html',
  styleUrl: './actualizacion-cno.component.css',
  providers: [ClassificationContext]
})
export class ActualizacionCnoComponent implements OnInit {
  private readonly service = inject(ActualizacionCnoService);
  private readonly context = inject(ClassificationContext);
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs = UPDATE_TABS;
  readonly tabIcons = TAB_ICONS;
  readonly limits = CATALOG_LIMITS;
  readonly statusFilters = STATUS_FILTERS;
  readonly descriptionFilters = DESCRIPTION_FILTERS;

  /** CNO o CUOC. */
  @Input() set classification(value: Classification) {
    this.context.value = value;
  }

  get classification(): Classification {
    return this.context.value;
  }

  tab: UpdateTab = 'level';

  /** Registros de cada pestaña; `undefined` mientras no se han pedido. */
  lists: Partial<Record<UpdateTab, CatalogItem[]>> = {};
  loading = false;
  loadError = false;

  search = '';
  /** Filtros aplicados y los que se están eligiendo en el panel "Filtros". */
  statusFilter: StatusFilter = 'all';
  descriptionFilter: DescriptionFilter = 'all';
  pendingStatus: StatusFilter = 'all';
  pendingDescription: DescriptionFilter = 'all';
  filtersOpen = false;

  /** `null`: el orden en que llegan (por código). */
  sort: CatalogSort | null = null;
  ascending = true;
  page = 1;
  pageSize = PAGE_SIZES[0];

  /** Filas marcadas con su casilla (por código); se olvidan al cambiar de pestaña. */
  selected = new Set<string>();

  editor: Editor | null = null;
  saving = false;

  /** Asistente "Registrar nueva ocupación" abierto. */
  wizardOpen = false;

  pendingDelete: { kind: UpdateTab; item: CatalogItem } | null = null;
  deleting = false;

  ngOnInit(): void {
    this.tab = storedTab(this.classification);
    this.load(this.tab);
  }

  // ---------- Pestañas ----------

  /** La pestaña abierta muestra la columna Estado. */
  get showStatus(): boolean {
    return showsStatus(this.tab);
  }

  get catalogKind(): CatalogKind | null {
    return this.tab === 'occupation' ? null : this.tab;
  }

  /** Cambia de pestaña, la recuerda para la próxima recarga y limpia búsqueda, filtros, página y selección (son de la pestaña anterior). */
  setTab(tab: UpdateTab): void {
    if (tab === this.tab) {
      return;
    }
    this.tab = tab;
    try {
      sessionStorage.setItem(tabStorageKey(this.classification), tab);
    } catch {
      // Sin almacenamiento solo se pierde recordar la pestaña al recargar.
    }
    this.search = '';
    this.statusFilter = this.pendingStatus = 'all';
    this.descriptionFilter = this.pendingDescription = 'all';
    this.filtersOpen = false;
    this.sort = null;
    this.ascending = true;
    this.page = 1;
    this.selected = new Set();
    if (!this.lists[tab]) {
      this.load(tab);
    }
  }

  // ---------- Carga ----------

  retry(): void {
    this.load(this.tab);
  }

  /** Pide la lista completa de la pestaña (catálogo u ocupaciones); se filtra, ordena y pagina en el navegador. */
  private load(tab: UpdateTab): void {
    this.loading = true;
    this.loadError = false;
    const request = tab === 'occupation' ? this.service.occupations(this.classification) : this.service.list(tab, this.classification);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        this.lists[tab] = items;
        if (tab === this.tab) {
          this.loading = false;
          this.clampPage();
        }
      },
      error: () => {
        if (tab === this.tab) {
          this.loading = false;
          this.loadError = true;
        }
      }
    });
  }

  // ---------- Búsqueda, filtros, orden y páginas ----------

  /** Registros de la pestaña abierta que cumplen la búsqueda y los filtros, en el orden elegido. */
  get filtered(): CatalogItem[] {
    const query = normalizeText(this.search);
    const rows = (this.lists[this.tab] ?? []).filter(
      (item) =>
        (this.statusFilter === 'all' || item.active === (this.statusFilter === 'active')) &&
        (this.descriptionFilter === 'all' || !!item.description === (this.descriptionFilter === 'with')) &&
        (!query || normalizeText(`${item.code} ${item.name} ${item.description}`).includes(query))
    );
    const column = this.sort;
    if (!column) {
      return rows;
    }
    const direction = this.ascending ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (column) {
        case 'code':
          return direction * compareCodes(a.code, b.code);
        case 'status':
          return direction * (Number(b.active) - Number(a.active));
        case 'date':
          return direction * (dateKey(a.registeredAt) - dateKey(b.registeredAt));
        default:
          return direction * a[column].localeCompare(b[column], 'es', { sensitivity: 'base' });
      }
    });
  }

  get total(): number {
    return this.filtered.length;
  }

  /** Inactivos de la pestaña abierta (los catálogos no tienen estado en el backend: siempre 0). */
  get inactiveCount(): number {
    return (this.lists[this.tab] ?? []).filter((item) => !item.active).length;
  }

  get pageItems(): CatalogItem[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  get pageCount(): number {
    return pageCountOf(this.total, this.pageSize);
  }

  get activeFilterCount(): number {
    return (this.statusFilter !== 'all' ? 1 : 0) + (this.descriptionFilter !== 'all' ? 1 : 0);
  }

  onSearchChange(): void {
    this.page = 1;
  }

  toggleFilters(): void {
    this.pendingStatus = this.statusFilter;
    this.pendingDescription = this.descriptionFilter;
    this.filtersOpen = !this.filtersOpen;
  }

  /** Aplica lo elegido en el panel "Filtros" (que se edita en borrador) y vuelve a la primera página. */
  applyFilters(): void {
    this.statusFilter = this.pendingStatus;
    this.descriptionFilter = this.pendingDescription;
    this.filtersOpen = false;
    this.page = 1;
  }

  clearFilters(): void {
    this.pendingStatus = 'all';
    this.pendingDescription = 'all';
    this.applyFilters();
  }

  /** "Limpiar" del estado vacío: quita la búsqueda y los filtros. */
  resetSearch(): void {
    this.search = '';
    this.clearFilters();
  }

  sortBy(column: CatalogSort): void {
    this.ascending = this.sort === column ? !this.ascending : true;
    this.sort = column;
    this.page = 1;
  }

  ariaSort(column: CatalogSort): 'ascending' | 'descending' | null {
    return this.sort === column ? (this.ascending ? 'ascending' : 'descending') : null;
  }

  goToPage(page: number): void {
    this.page = Math.min(Math.max(1, page), this.pageCount);
  }

  onPageSizeChange(): void {
    this.page = 1;
  }

  private clampPage(): void {
    this.page = Math.min(this.page, this.pageCount);
  }

  trackByCode(_index: number, item: CatalogItem): string {
    return item.code;
  }

  // ---------- Casillas ----------

  isSelected(item: CatalogItem): boolean {
    return this.selected.has(item.code);
  }

  /** Marca o desmarca una fila. Las casillas solo marcan, como en la versión desplegada: no hay acciones en lote. */
  toggleSelection(item: CatalogItem): void {
    const next = new Set(this.selected);
    if (!next.delete(item.code)) {
      next.add(item.code);
    }
    this.selected = next;
  }

  /** Todas las filas de la página están marcadas. */
  get pageSelected(): boolean {
    const rows = this.pageItems;
    return rows.length > 0 && rows.every((item) => this.selected.has(item.code));
  }

  /** La casilla del encabezado marca o desmarca todas las filas de la página visible. */
  togglePageSelection(): void {
    const next = new Set(this.selected);
    const select = !this.pageSelected;
    this.pageItems.forEach((item) => (select ? next.add(item.code) : next.delete(item.code)));
    this.selected = next;
  }

  // ---------- Agregar y editar ----------

  /** Abre el modal para agregar un registro al catálogo de la pestaña (en Ocupación se usa el asistente). */
  openCreate(): void {
    const kind = this.catalogKind;
    if (kind) {
      this.editor = { kind, item: null, draft: { code: '', name: '', description: '' }, submitted: false };
    }
  }

  /** Editar: en Ocupación abre la pantalla completa de edición; en los catálogos, el modal con los datos del registro. */
  openEdit(item: CatalogItem): void {
    if (this.tab === 'occupation') {
      this.editingCode = item.code;
      return;
    }
    const kind = this.catalogKind;
    if (kind) {
      this.editor = { kind, item, draft: { code: item.code, name: item.name, description: item.description }, submitted: false };
    }
  }

  closeEditor(): void {
    if (!this.saving) {
      this.editor = null;
    }
  }

  /** El código se escribe solo al agregar un nivel o un área. */
  codeEditable(editor: Editor): boolean {
    return !editor.item && requiresCode(editor.kind);
  }

  descriptionMax(kind: CatalogKind): number {
    return descriptionMax(kind);
  }

  nameMax(kind: CatalogKind): number {
    return nameMax(kind);
  }

  /** Las áreas de cualificación de CUOC no tienen descripción. */
  hasDescription(kind: CatalogKind): boolean {
    return hasDescription(this.classification, kind);
  }

  /** Clave de traducción del error del código, o `null` si está bien. */
  codeError(editor: Editor): string | null {
    if (!this.codeEditable(editor)) {
      return null;
    }
    const code = editor.draft.code.trim();
    if (!code) {
      return 'actualizacionCno.errorCodeRequired';
    }
    if (code.length > CATALOG_LIMITS.codeMax || !CODE_PATTERN.test(code)) {
      return 'actualizacionCno.errorCodeFormat';
    }
    return (this.lists[editor.kind] ?? []).some((item) => item.code.toLowerCase() === code.toLowerCase()) ? 'actualizacionCno.errorCodeTaken' : null;
  }

  /**
   * Error del nombre (clave de traducción) o `null`: obligatorio, entre el mínimo y el máximo del catálogo y sin repetir otro nombre de
   * la misma lista.
   */
  nameError(editor: Editor): string | null {
    const name = editor.draft.name.trim();
    if (!name) {
      return 'actualizacionCno.errorNameRequired';
    }
    if (name.length < CATALOG_LIMITS.nameMin) {
      return 'actualizacionCno.errorNameShort';
    }
    if (name.length > nameMax(editor.kind)) {
      return 'actualizacionCno.errorNameLong';
    }
    const own = editor.item ? normalizeText(editor.item.name) : null;
    const repeated = (this.lists[editor.kind] ?? []).some((item) => normalizeText(item.name) === normalizeText(name) && normalizeText(item.name) !== own);
    return repeated ? 'actualizacionCno.errorNameTaken' : null;
  }

  descriptionError(editor: Editor): string | null {
    return hasDescription(this.classification, editor.kind) && editor.draft.description.length > descriptionMax(editor.kind) ? 'actualizacionCno.errorDescriptionLong' : null;
  }

  /** Crea o actualiza el registro del modal. Si el servidor lo rechaza (nombre o código repetido), muestra su mensaje en el modal. */
  save(): void {
    const editor = this.editor;
    if (!editor || this.saving) {
      return;
    }
    editor.submitted = true;
    if (this.codeError(editor) || this.nameError(editor) || this.descriptionError(editor)) {
      return;
    }
    this.saving = true;
    const request = editor.item
      ? this.service.update(editor.kind, editor.item.code, editor.draft, this.classification)
      : this.service.create(editor.kind, editor.draft, this.classification);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        const items = this.lists[editor.kind] ?? [];
        this.lists[editor.kind] = editor.item
          ? items.map((item) => (item.code === editor.item!.code ? saved : item))
          : [...items, saved].sort((a, b) => compareCodes(a.code, b.code));
        // Las ocupaciones muestran el nombre del nivel y del área: la próxima vez se vuelven a pedir.
        this.service.refreshOccupations(this.classification);
        delete this.lists.occupation;
        this.saving = false;
        this.editor = null;
        this.toastService.success(this.t(editor.item ? 'actualizacionCno.updated' : 'actualizacionCno.created', { entity: this.t(`actualizacionCno.entity.${editor.kind}`), code: saved.code }));
      },
      error: (error: unknown) => {
        this.saving = false;
        this.toastService.error(this.errorMessage(error, 'actualizacionCno.saveError'));
      }
    });
  }

  // ---------- Cargar información desde Excel ----------

  /** Modal "Cargar información" abierto. */
  uploadOpen = false;

  /** Se cargó un archivo: todas las listas pueden haber cambiado, así que se vuelven a pedir. */
  onUploaded(): void {
    this.lists = {};
    this.selected = new Set();
    this.load(this.tab);
  }

  // ---------- Editar una ocupación ----------

  /** Código de la ocupación que se está editando (la pantalla de edición reemplaza la lista). */
  editingCode: string | null = null;

  /** Se guardó la ocupación: se vuelve a la lista, que se pide de nuevo. */
  onOccupationSaved(code: string): void {
    this.editingCode = null;
    delete this.lists.occupation;
    if (this.tab === 'occupation') {
      this.load('occupation');
    }
    this.toastService.success(this.t('actualizacionCno.updated', { entity: this.t('actualizacionCno.entity.occupation'), code }));
  }

  // ---------- Registrar una ocupación ----------

  openWizard(): void {
    this.wizardOpen = true;
  }

  /** La ocupación quedó registrada: se cierra el asistente y se vuelve a pedir la lista de ocupaciones. */
  onOccupationCreated(code: string): void {
    this.wizardOpen = false;
    delete this.lists.occupation;
    if (this.tab === 'occupation') {
      this.load('occupation');
    }
    this.toastService.success(this.t('actualizacionCno.created', { entity: this.t('actualizacionCno.entity.occupation'), code }));
  }

  // ---------- Eliminar ----------

  requestDelete(item: CatalogItem): void {
    this.pendingDelete = { kind: this.tab, item };
  }

  cancelDelete(): void {
    if (!this.deleting) {
      this.pendingDelete = null;
    }
  }

  /** Elimina lo confirmado. El servidor responde 409 si alguna ocupación usa el registro; ese mensaje se muestra tal cual. */
  confirmDelete(): void {
    const pending = this.pendingDelete;
    if (!pending || this.deleting) {
      return;
    }
    this.deleting = true;
    const request =
      pending.kind === 'occupation'
        ? this.service.removeOccupation(pending.item.code, this.classification)
        : this.service.remove(pending.kind, pending.item.code, this.classification);
    request
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.lists[pending.kind] = (this.lists[pending.kind] ?? []).filter((item) => item.code !== pending.item.code);
          this.selected.delete(pending.item.code);
          this.deleting = false;
          this.pendingDelete = null;
          this.clampPage();
          this.toastService.success(this.t('actualizacionCno.deleted', { entity: this.t(`actualizacionCno.entity.${pending.kind}`), code: pending.item.code }));
        },
        error: (error: unknown) => {
          this.deleting = false;
          this.pendingDelete = null;
          if (error instanceof CatalogError && error.message === CATALOG_NOT_FOUND) {
            this.load(pending.kind);
          }
          this.toastService.error(this.errorMessage(error, 'actualizacionCno.deleteError'));
        }
      });
  }

  /** El servidor explica sus rechazos (p. ej. "No se puede eliminar: 12 ocupación(es) usan el nivel…"): se muestra tal cual. */
  private errorMessage(error: unknown, fallbackKey: string): string {
    if (error instanceof CatalogError) {
      if (error.serverMessage) {
        return error.serverMessage;
      }
      if (error.message === CATALOG_NOT_FOUND) {
        return this.t('actualizacionCno.notFound');
      }
      if (error.message === CATALOG_CONFLICT) {
        return this.t('actualizacionCno.conflict');
      }
    }
    return this.t(fallbackKey);
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translationService.translate(classKey(this.classification, key), params);
  }
}

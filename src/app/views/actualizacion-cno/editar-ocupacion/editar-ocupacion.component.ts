import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog.component';
import { ComboOption, FilterComboboxComponent, comboOptions } from '../../../shared/ui/filter-combobox.component';
import { CatalogItem, OCCUPATION_TEXT_PATTERN, PickOption, occupationLimits } from '../actualizacion-cno.model';
import { ActualizacionCnoService, CATALOG_NOT_FOUND, CatalogError, nextRowKey } from '../actualizacion-cno.service';
import { CatalogSelectorComponent } from '../catalog-selector/catalog-selector.component';
import { Classification, ClassificationContext, ClassTranslatePipe, classKey } from '../clasificacion';
import { EDIT_TABS, EditTab, EditableOccupation, EditableRow, LinkedList } from './editar-ocupacion.model';
import { normalizeText } from '../../../shared/ui/list';

/** Catálogos que se usan para editar. */
interface EditCatalogs {
  areas: CatalogItem[];
  levels: CatalogItem[];
  skills: PickOption[];
  knowledge: PickOption[];
  occupations: PickOption[];
}

const toOptions = (items: CatalogItem[]): PickOption[] => items.map((item) => ({ code: item.code, label: item.name }));

/**
 * "Ocupación (Editar)" de Actualización: copia de la pantalla de la versión
 * desplegada. Seis pestañas (información básica, denominaciones, funciones,
 * habilidades o destrezas, conocimientos y relacionadas) y el resumen de la
 * ocupación al lado. Guarda sobre la ocupación ORIGINAL del catálogo con
 * `ActualizacionCnoService.saveOccupation()`.
 */
@Component({
  selector: 'app-editar-ocupacion',
  standalone: true,
  imports: [CommonModule, FormsModule, ClassTranslatePipe, ConfirmDialogComponent, CatalogSelectorComponent, FilterComboboxComponent],
  templateUrl: './editar-ocupacion.component.html',
  styleUrl: './editar-ocupacion.component.css'
})
export class EditarOcupacionComponent implements OnInit {
  private readonly service = inject(ActualizacionCnoService);
  private readonly translationService = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);
  /** CNO o CUOC: la de la vista que abre el editor (sin vista, CNO). */
  readonly classification: Classification = inject(ClassificationContext, { optional: true })?.value ?? 'cno';
  readonly limits = occupationLimits(this.classification);

  /** Código de la ocupación que se edita. */
  @Input({ required: true }) code = '';
  /** Se guardó: emite el código. */
  @Output() readonly saved = new EventEmitter<string>();
  @Output() readonly closed = new EventEmitter<void>();

  readonly tabs = EDIT_TABS;
  tab: EditTab = 'basic';

  occupation: EditableOccupation | null = null;
  /** Lo que llegó del servidor, para saber si hay cambios sin guardar. */
  private original = '';
  catalogs: EditCatalogs | null = null;
  loading = true;
  loadError = '';

  submitted = false;
  saving = false;
  saveError = '';
  discardOpen = false;

  /** Búsqueda dentro de la lista abierta. */
  listSearch = '';
  /** Funciones desplegadas para editar su texto. */
  openFunctions = new Set<number>();
  /** Lista para la que está abierto el selector del catálogo. */
  selector: LinkedList | null = null;
  descriptionExpanded = false;

  ngOnInit(): void {
    this.load();
  }

  /** Pide la ocupación completa y, a la vez, las listas para elegir área, nivel, habilidades, conocimientos y relacionadas. */
  load(): void {
    this.loading = true;
    this.loadError = '';
    const c = this.classification;
    forkJoin({
      occupation: this.service.occupationDetail(this.code, c),
      areas: this.service.list('area', c),
      levels: this.service.list('level', c),
      skills: this.service.list('skill', c),
      knowledge: this.service.list('knowledge', c),
      occupations: this.service.occupations(c)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.occupation = result.occupation;
          this.original = JSON.stringify(result.occupation);
          this.catalogs = {
            areas: result.areas,
            levels: result.levels,
            skills: toOptions(result.skills),
            knowledge: toOptions(result.knowledge),
            occupations: toOptions(result.occupations).filter((item) => item.code !== this.code)
          };
          this.loading = false;
        },
        error: (error: unknown) => {
          this.loading = false;
          this.loadError = this.t(error instanceof CatalogError && error.message === CATALOG_NOT_FOUND ? 'editarOcupacion.notFound' : 'editarOcupacion.loadError');
        }
      });
  }

  // ---------- Pestañas ----------

  get tabIndex(): number {
    return EDIT_TABS.indexOf(this.tab);
  }

  setTab(tab: EditTab): void {
    this.tab = tab;
    this.listSearch = '';
  }

  next(): void {
    if (this.tabIndex < EDIT_TABS.length - 1) this.setTab(EDIT_TABS[this.tabIndex + 1]);
  }

  previous(): void {
    if (this.tabIndex > 0) this.setTab(EDIT_TABS[this.tabIndex - 1]);
  }

  /** Cantidad de cada lista (la pestaña la muestra junto al nombre). */
  count(tab: EditTab): number | null {
    const occupation = this.occupation;
    if (!occupation || tab === 'basic') return null;
    return occupation[tab].length;
  }

  /** La pestaña tiene un error que impide guardar. */
  tabHasError(tab: EditTab): boolean {
    if (!this.submitted) return false;
    if (tab === 'basic') return !!(this.fieldError('name') || this.fieldError('area') || this.fieldError('level') || this.fieldError('description') || this.fieldError('traceability'));
    if (tab === 'denominations' || tab === 'functions') return !!this.listError(tab);
    return false;
  }

  // ---------- Información básica ----------

  /** Error del campo de Información básica (clave de traducción) o `null`; mismas reglas que el asistente de creación. */
  fieldError(field: 'name' | 'area' | 'level' | 'description' | 'traceability'): string | null {
    const occupation = this.occupation;
    if (!occupation) return null;
    switch (field) {
      case 'name': {
        const name = occupation.name.trim();
        if (!name) return 'ocupacionWizard.errorNameRequired';
        if (name.length < this.limits.nameMin) return 'ocupacionWizard.errorMin';
        if (name.length > this.limits.nameMax) return 'ocupacionWizard.errorMax';
        return OCCUPATION_TEXT_PATTERN.test(name) ? null : 'ocupacionWizard.errorPattern';
      }
      case 'area':
        return occupation.areaCode ? null : 'ocupacionWizard.errorArea';
      case 'level':
        return occupation.levelCode ? null : 'ocupacionWizard.errorLevel';
      case 'description':
        return occupation.description.length > this.limits.descriptionMax ? 'ocupacionWizard.errorMax' : null;
      case 'traceability':
        return occupation.traceability.length > this.limits.traceabilityMax ? 'ocupacionWizard.errorMax' : null;
    }
  }

  /** Áreas y niveles del catálogo para los desplegables (se guarda el código y se ve el nombre). */
  catalogOptions(list: 'areas' | 'levels'): ComboOption[] {
    return comboOptions(this.catalogs?.[list], (item) => item.code, (item) => item.name);
  }

  areaName(): string {
    return this.catalogs?.areas.find((item) => item.code === this.occupation?.areaCode)?.name ?? '';
  }

  levelName(): string {
    return this.catalogs?.levels.find((item) => item.code === this.occupation?.levelCode)?.name ?? '';
  }

  // ---------- Denominaciones y funciones ----------

  /** Filas de la lista que cumplen la búsqueda (las nuevas siempre se ven). */
  rows(list: 'denominations' | 'functions'): EditableRow[] {
    const query = normalizeText(this.listSearch);
    return (this.occupation?.[list] ?? []).filter((row) => !query || !row.code || normalizeText(`${row.code} ${row.text}`).includes(query));
  }

  /** Error de la lista: hay filas vacías o repetidas. */
  listError(list: 'denominations' | 'functions'): string | null {
    const rows = this.occupation?.[list] ?? [];
    if (rows.some((row) => !row.text.trim())) return list === 'denominations' ? 'editarOcupacion.emptyDenomination' : 'editarOcupacion.emptyFunction';
    if (list === 'denominations') {
      if (rows.some((row) => row.text.trim().length > this.limits.denominationMax)) return 'editarOcupacion.denominationTooLong';
      if (rows.some((row) => !OCCUPATION_TEXT_PATTERN.test(row.text.trim()))) return 'ocupacionWizard.errorPattern';
    }
    const seen = new Set<string>();
    for (const row of rows) {
      const key = normalizeText(row.text);
      if (seen.has(key)) return list === 'denominations' ? 'editarOcupacion.repeatedDenomination' : 'editarOcupacion.repeatedFunction';
      seen.add(key);
    }
    return null;
  }

  /** Agrega una denominación o función nueva (sin código: el backend la crea al guardar). */
  addRow(list: 'denominations' | 'functions'): void {
    const occupation = this.occupation;
    if (!occupation) return;
    const row: EditableRow = { key: nextRowKey(), code: '', text: '', active: null, registeredAt: '' };
    occupation[list] = [...occupation[list], row];
    this.listSearch = '';
    if (list === 'functions') this.openFunctions.add(row.key);
  }

  /** Quita una fila; si ya existía, el backend la inactiva al guardar. */
  removeRow(list: 'denominations' | 'functions', row: EditableRow): void {
    const occupation = this.occupation;
    if (!occupation) return;
    occupation[list] = occupation[list].filter((item) => item !== row);
    this.openFunctions.delete(row.key);
  }

  toggleFunction(row: EditableRow): void {
    if (!this.openFunctions.delete(row.key)) this.openFunctions.add(row.key);
  }

  /** "Activa" / "Inactiva" / "Nueva" (vacío si el backend no informa el estado). */
  rowState(row: EditableRow): string {
    if (!row.code) return 'editarOcupacion.stateNew';
    if (row.active === null) return '';
    return row.active ? 'editarOcupacion.stateActive' : 'editarOcupacion.stateInactive';
  }

  trackByKey(_index: number, row: EditableRow): number {
    return row.key;
  }

  // ---------- Habilidades/destrezas, conocimientos y relacionadas ----------

  linkedRows(list: LinkedList): PickOption[] {
    const query = normalizeText(this.listSearch);
    return (this.occupation?.[list] ?? []).filter((item) => !query || normalizeText(`${item.code} ${item.label}`).includes(query));
  }

  linkedCodes(list: LinkedList): string[] {
    return (this.occupation?.[list] ?? []).map((item) => item.code);
  }

  selectorOptions(list: LinkedList): PickOption[] {
    if (!this.catalogs) return [];
    return list === 'skills' ? this.catalogs.skills : list === 'knowledge' ? this.catalogs.knowledge : this.catalogs.occupations;
  }

  /** Agrega lo elegido en el selector del catálogo, sin repetir lo que ya tiene. */
  addLinked(list: LinkedList, options: PickOption[]): void {
    const occupation = this.occupation;
    if (!occupation) return;
    const codes = new Set(occupation[list].map((item) => item.code));
    occupation[list] = [...occupation[list], ...options.filter((option) => !codes.has(option.code))];
    this.selector = null;
  }

  removeLinked(list: LinkedList, item: PickOption): void {
    const occupation = this.occupation;
    if (!occupation) return;
    occupation[list] = occupation[list].filter((entry) => entry.code !== item.code);
  }

  isLinkedTab(tab: EditTab): tab is LinkedList {
    return tab === 'skills' || tab === 'knowledge' || tab === 'related';
  }

  // ---------- Guardar y cerrar ----------

  get dirty(): boolean {
    return !!this.occupation && JSON.stringify(this.occupation) !== this.original;
  }

  /** Guarda la ocupación. Si una pestaña tiene errores, la abre en lugar de enviar. */
  save(): void {
    const occupation = this.occupation;
    if (!occupation || this.saving) return;
    this.submitted = true;
    this.saveError = '';
    const failing = EDIT_TABS.find((tab) => this.tabHasError(tab));
    if (failing) {
      this.setTab(failing);
      return;
    }
    this.saving = true;
    this.service
      .saveOccupation(occupation, this.areaName(), this.levelName(), this.classification)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (code) => {
          this.saving = false;
          this.original = JSON.stringify(occupation);
          this.saved.emit(code);
        },
        error: (error: unknown) => {
          this.saving = false;
          const message = error instanceof CatalogError ? error.serverMessage : '';
          this.saveError = message ? `${message} ${this.t('editarOcupacion.changesKept')}` : this.t('editarOcupacion.saveError');
        }
      });
  }

  /** "Cancelar" o "Volver a la lista": con cambios sin guardar pide confirmación. */
  requestClose(): void {
    if (this.saving) return;
    if (this.dirty) {
      this.discardOpen = true;
    } else {
      this.closed.emit();
    }
  }

  confirmDiscard(): void {
    this.discardOpen = false;
    this.closed.emit();
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translationService.translate(classKey(this.classification, key), params);
  }
}

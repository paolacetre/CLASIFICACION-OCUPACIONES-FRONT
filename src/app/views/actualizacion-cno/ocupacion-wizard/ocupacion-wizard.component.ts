import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { DialogDirective } from '../../../shared/dialog/dialog.directive';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog.component';
import { ComboOption, FilterComboboxComponent, comboOptions } from '../../../shared/ui/filter-combobox.component';
import {
  CatalogItem,
  DraftFunction,
  OCCUPATION_TEXT_PATTERN,
  OccupationDraft,
  PickOption,
  WIZARD_STEPS,
  WizardStep,
  createEmptyOccupation,
  occupationCodePattern,
  occupationLimits,
  registrationDate
} from '../actualizacion-cno.model';
import { ActualizacionCnoService, CatalogError, INVALID_CATALOG_ITEM, OCCUPATION_CODE_TAKEN } from '../actualizacion-cno.service';
import { Classification, ClassificationContext, ClassTranslatePipe, classKey } from '../clasificacion';
import { OptionPickerComponent } from '../option-picker/option-picker.component';
import { normalizeText } from '../../../shared/ui/list';

/** Campos obligatorios del primer paso, en el orden del formulario. */
type BasicField = 'code' | 'name' | 'area' | 'level' | 'traceability' | 'description';

const BASIC_FIELDS: readonly BasicField[] = ['code', 'name', 'area', 'level', 'traceability', 'description'];

/** Catálogos que usa el asistente. */
interface WizardCatalogs {
  areas: CatalogItem[];
  levels: CatalogItem[];
  functions: PickOption[];
  skills: PickOption[];
  knowledge: PickOption[];
  occupations: PickOption[];
}

const toOptions = (items: CatalogItem[]): PickOption[] => items.map((item) => ({ code: item.code, label: item.name }));

/**
 * "Registrar nueva ocupación CNO": asistente de cinco pasos (información
 * básica, denominaciones, funciones, competencias y resumen), copia del de la
 * versión desplegada, que registra la ocupación con `POST /api/cno/ocupaciones`.
 * Solo deja avanzar cuando el paso está completo; al guardar emite el código.
 */
@Component({
  selector: 'app-ocupacion-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, ClassTranslatePipe, DialogDirective, ConfirmDialogComponent, OptionPickerComponent, FilterComboboxComponent],
  templateUrl: './ocupacion-wizard.component.html',
  styleUrl: './ocupacion-wizard.component.css'
})
export class OcupacionWizardComponent implements OnInit {
  private readonly service = inject(ActualizacionCnoService);
  private readonly translationService = inject(TranslationService);
  /** CNO o CUOC: la de la vista que abre el asistente (sin vista, CNO). */
  readonly classification: Classification = inject(ClassificationContext, { optional: true })?.value ?? 'cno';
  private readonly destroyRef = inject(DestroyRef);

  /** Emite el código de la ocupación registrada. */
  @Output() readonly created = new EventEmitter<string>();
  @Output() readonly closed = new EventEmitter<void>();
  /** Solo para pruebas: abre en este paso. */
  @Input() startStep: WizardStep = 'basic';

  readonly steps = WIZARD_STEPS;
  readonly limits = occupationLimits(this.classification);
  /** CUOC no tiene ocupaciones relacionadas. */
  readonly hasRelated = this.classification === 'cno';

  step: WizardStep = 'basic';
  /** Pasos a los que ya se llegó: se puede volver a ellos desde la barra de pasos. */
  private reached = new Set<WizardStep>(['basic']);

  draft: OccupationDraft = createEmptyOccupation();
  /** Ya se intentó avanzar desde el primer paso: desde ahí se muestran sus errores. */
  basicSubmitted = false;
  /** El servidor dijo que el código ya existe. */
  private takenCode = '';

  catalogs: WizardCatalogs | null = null;
  loadingCatalogs = false;
  catalogsError = false;

  newDenomination = '';
  denominationError = '';
  /** Denominación que se está editando (índice) y su texto. */
  editingDenomination: number | null = null;
  editingText = '';

  newFunction = '';
  functionError = '';

  saving = false;
  /** Lo que el servidor no aceptó, para mostrarlo en el resumen. */
  saveErrors: string[] = [];

  discardOpen = false;

  ngOnInit(): void {
    this.step = this.startStep;
    WIZARD_STEPS.slice(0, WIZARD_STEPS.indexOf(this.startStep) + 1).forEach((step) => this.reached.add(step));
    this.loadCatalogs();
  }

  // ---------- Catálogos ----------

  /** Pide a la vez todas las listas que usan los pasos (áreas, niveles, funciones, habilidades, conocimientos y ocupaciones). */
  loadCatalogs(): void {
    this.loadingCatalogs = true;
    this.catalogsError = false;
    forkJoin({
      areas: this.service.list('area', this.classification),
      levels: this.service.list('level', this.classification),
      functions: this.service.functions(this.classification),
      skills: this.service.list('skill', this.classification),
      knowledge: this.service.list('knowledge', this.classification),
      occupations: this.service.occupations(this.classification)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          const byName = (a: PickOption, b: PickOption) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
          this.catalogs = {
            areas: result.areas,
            levels: result.levels,
            functions: result.functions,
            skills: toOptions(result.skills).sort(byName),
            knowledge: toOptions(result.knowledge).sort(byName),
            occupations: toOptions(result.occupations)
          };
          this.loadingCatalogs = false;
        },
        error: () => {
          this.loadingCatalogs = false;
          this.catalogsError = true;
        }
      });
  }

  // ---------- Pasos ----------

  get stepIndex(): number {
    return WIZARD_STEPS.indexOf(this.step);
  }

  isDone(step: WizardStep): boolean {
    return step !== this.step && step !== 'summary' && this.reached.has(step) && this.stepComplete(step);
  }

  canOpen(step: WizardStep): boolean {
    return this.reached.has(step) && !this.saving;
  }

  goTo(step: WizardStep): void {
    if (this.canOpen(step)) {
      this.step = step;
    }
  }

  /** Un paso está completo cuando tiene lo mínimo que exige el servidor para crear la ocupación. */
  stepComplete(step: WizardStep): boolean {
    switch (step) {
      case 'basic':
        return this.missingBasic === 0;
      case 'denominations':
        return this.draft.denominations.length > 0;
      case 'functions':
        return this.draft.functions.length > 0;
      case 'competences':
        return this.draft.skills.length > 0 && this.draft.knowledge.length > 0;
      default:
        return true;
    }
  }

  /** Texto junto a "Siguiente" cuando falta algo; vacío si el paso está completo. */
  get pendingHint(): string {
    switch (this.step) {
      case 'basic': {
        const missing = this.missingBasic;
        return missing ? this.t(missing === 1 ? 'ocupacionWizard.missingOne' : 'ocupacionWizard.missingMany', { count: missing }) : '';
      }
      case 'denominations':
        return this.draft.denominations.length ? '' : this.t('ocupacionWizard.needDenomination');
      case 'functions':
        return this.draft.functions.length ? '' : this.t('ocupacionWizard.needFunction');
      case 'competences': {
        const skills = this.draft.skills.length > 0;
        const knowledge = this.draft.knowledge.length > 0;
        return skills && knowledge ? '' : this.t(!skills && !knowledge ? 'ocupacionWizard.needBoth' : !skills ? 'ocupacionWizard.needSkill' : 'ocupacionWizard.needKnowledge');
      }
      default:
        return '';
    }
  }

  /** "Siguiente": avanza solo si el paso actual está completo; si no, deja ver sus errores. */
  next(): void {
    if (this.step === 'basic') {
      this.basicSubmitted = true;
    }
    if (!this.stepComplete(this.step) || this.stepIndex === WIZARD_STEPS.length - 1) {
      return;
    }
    this.step = WIZARD_STEPS[this.stepIndex + 1];
    this.reached.add(this.step);
  }

  previous(): void {
    if (this.stepIndex > 0) {
      this.step = WIZARD_STEPS[this.stepIndex - 1];
    }
  }

  // ---------- Paso 1: información básica ----------

  /** Clave del error de un campo del primer paso, o `null` si está bien. */
  fieldError(field: BasicField): string | null {
    const value = (field === 'area' ? this.draft.areaCode : field === 'level' ? this.draft.levelCode : this.draft[field]).trim();
    switch (field) {
      case 'code':
        if (!value) return 'ocupacionWizard.errorCodeRequired';
        if (!occupationCodePattern(this.classification).test(value)) return 'ocupacionWizard.errorCodeFormat';
        return value === this.takenCode || this.catalogs?.occupations.some((item) => item.code === value) ? 'ocupacionWizard.errorCodeTaken' : null;
      case 'name':
        if (!value) return 'ocupacionWizard.errorNameRequired';
        if (value.length < this.limits.nameMin) return 'ocupacionWizard.errorMin';
        if (value.length > this.limits.nameMax) return 'ocupacionWizard.errorMax';
        return OCCUPATION_TEXT_PATTERN.test(value) ? null : 'ocupacionWizard.errorPattern';
      case 'area':
        return value ? null : 'ocupacionWizard.errorArea';
      case 'level':
        return value ? null : 'ocupacionWizard.errorLevel';
      case 'traceability':
        if (!value) return 'ocupacionWizard.errorTraceability';
        return value.length > this.limits.traceabilityMax ? 'ocupacionWizard.errorMax' : null;
      case 'description':
        if (!value) return 'ocupacionWizard.errorDescription';
        return value.length > this.limits.descriptionMax ? 'ocupacionWizard.errorMax' : null;
    }
  }

  /** Máximo de caracteres de un campo, para el texto de su error. */
  fieldMax(field: BasicField): number {
    return field === 'traceability' ? this.limits.traceabilityMax : field === 'description' ? this.limits.descriptionMax : this.limits.nameMax;
  }

  get missingBasic(): number {
    return BASIC_FIELDS.filter((field) => this.fieldError(field)).length;
  }

  get registeredOnLabel(): string {
    return registrationDate(this.draft.registeredOn);
  }

  /** Áreas y niveles para los desplegables: se guarda el código y se ve «código · nombre». */
  catalogOptions(list: 'areas' | 'levels'): ComboOption[] {
    return comboOptions(this.catalogs?.[list], (item) => item.code, (item) => `${item.code} · ${item.name}`);
  }

  areaName(): string {
    return this.catalogs?.areas.find((item) => item.code === this.draft.areaCode)?.name ?? '';
  }

  levelName(): string {
    return this.catalogs?.levels.find((item) => item.code === this.draft.levelCode)?.name ?? '';
  }

  // ---------- Paso 2: denominaciones ----------

  /**
   * Error de una denominación (clave de traducción) o vacío. `ignore` es la posición que se está editando, para no compararla consigo
   * misma.
   */
  private denominationProblem(text: string, ignore: number | null): string {
    const value = text.trim();
    if (!value) return 'ocupacionWizard.errorDenominationRequired';
    if (value.length > this.limits.denominationMax) return 'ocupacionWizard.errorDenominationMax';
    if (!OCCUPATION_TEXT_PATTERN.test(value)) return 'ocupacionWizard.errorPattern';
    const repeated = this.draft.denominations.some((item, index) => index !== ignore && normalizeText(item) === normalizeText(value));
    return repeated ? 'ocupacionWizard.errorDenominationRepeated' : '';
  }

  /** Agrega la denominación escrita si es válida; la primera de la lista es la principal. */
  addDenomination(): void {
    this.denominationError = this.denominationProblem(this.newDenomination, null);
    if (!this.denominationError) {
      this.draft.denominations = [...this.draft.denominations, this.newDenomination.trim()];
      this.newDenomination = '';
    }
  }

  startEditDenomination(index: number): void {
    this.editingDenomination = index;
    this.editingText = this.draft.denominations[index];
    this.denominationError = '';
  }

  /** Guarda la edición en línea de una denominación. */
  saveDenomination(): void {
    const index = this.editingDenomination;
    if (index === null) return;
    this.denominationError = this.denominationProblem(this.editingText, index);
    if (!this.denominationError) {
      this.draft.denominations = this.draft.denominations.map((item, position) => (position === index ? this.editingText.trim() : item));
      this.editingDenomination = null;
    }
  }

  cancelEditDenomination(): void {
    this.editingDenomination = null;
    this.denominationError = '';
  }

  /** Quita una denominación y cancela la edición en curso (las posiciones cambian). */
  removeDenomination(index: number): void {
    this.draft.denominations = this.draft.denominations.filter((_, position) => position !== index);
    if (this.editingDenomination !== null) {
      this.cancelEditDenomination();
    }
  }

  // ---------- Paso 3: funciones ----------

  get functionCodes(): string[] {
    return this.draft.functions.filter((item) => item.code).map((item) => item.code!);
  }

  pickFunction(option: PickOption): void {
    this.draft.functions = [...this.draft.functions, { code: option.code, text: option.label }];
  }

  /** Agrega una función nueva escrita a mano (la crea el servidor al guardar la ocupación); no puede repetir otra ya elegida. */
  createFunction(): void {
    const value = this.newFunction.trim();
    if (!value) {
      this.functionError = 'ocupacionWizard.errorFunctionRequired';
      return;
    }
    if (this.draft.functions.some((item) => normalizeText(item.text) === normalizeText(value))) {
      this.functionError = 'ocupacionWizard.errorFunctionRepeated';
      return;
    }
    this.functionError = '';
    this.draft.functions = [...this.draft.functions, { code: null, text: value }];
    this.newFunction = '';
  }

  removeFunction(item: DraftFunction): void {
    this.draft.functions = this.draft.functions.filter((entry) => entry !== item);
  }

  // ---------- Paso 4: competencias ----------

  codes(items: PickOption[]): string[] {
    return items.map((item) => item.code);
  }

  add(list: 'skills' | 'knowledge' | 'related', option: PickOption): void {
    this.draft[list] = [...this.draft[list], option];
  }

  remove(list: 'skills' | 'knowledge' | 'related', option: PickOption): void {
    this.draft[list] = this.draft[list].filter((item) => item.code !== option.code);
  }

  // ---------- Guardar y cerrar ----------

  /**
   * Crea la ocupación. Si falta algo lleva al primer paso incompleto; un código repetido (409) vuelve al primer paso con el error en el
   * código.
   */
  save(): void {
    if (this.saving) return;
    const incomplete = WIZARD_STEPS.find((step) => !this.stepComplete(step));
    if (incomplete) {
      this.basicSubmitted = true;
      this.step = incomplete;
      return;
    }
    this.saving = true;
    this.saveErrors = [];
    this.service
      .createOccupation(this.draft, this.classification, this.levelName())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (code) => {
          this.saving = false;
          this.created.emit(code);
        },
        error: (error: unknown) => {
          this.saving = false;
          if (error instanceof CatalogError && error.message === OCCUPATION_CODE_TAKEN) {
            // Como la versión desplegada: vuelve al primer paso con el error en el código.
            this.takenCode = this.draft.code.trim();
            this.basicSubmitted = true;
            this.step = 'basic';
            return;
          }
          if (error instanceof CatalogError && error.message === INVALID_CATALOG_ITEM && error.serverMessage) {
            this.saveErrors = [error.serverMessage];
          } else {
            this.saveErrors = [this.t('ocupacionWizard.saveError')];
          }
        }
      });
  }

  /** Hay algo escrito: cerrar pide confirmación para no perderlo. */
  get dirty(): boolean {
    const empty = createEmptyOccupation();
    return JSON.stringify({ ...this.draft, registeredOn: '' }) !== JSON.stringify({ ...empty, registeredOn: '' });
  }

  /** Cerrar con datos escritos pide confirmación para no perderlos. */
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

  trackByIndex(index: number): number {
    return index;
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translationService.translate(classKey(this.classification, key), params);
  }
}

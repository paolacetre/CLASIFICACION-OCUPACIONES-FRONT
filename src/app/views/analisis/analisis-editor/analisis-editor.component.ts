import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { FilterComboboxComponent } from '../../consulta-ocupaciones/filter-combobox/filter-combobox.component';
import { FilterOption } from '../../consulta-ocupaciones/consulta-ocupaciones.model';
import {
  AnalysisItem,
  AnalysisLevelDraft,
  AnalysisListKey,
  AnalysisOccupation,
  AnalysisOptions,
  LEVEL_DESCRIPTION_MAX,
  itemCode
} from '../analisis.model';
import { AnalisisService, LEVEL_NAME_TAKEN } from '../analisis.service';

/** Campos de texto largo que "Ampliar" abre en un cuadro grande. */
type LongField = 'description' | 'traceability';

/** Pestañas de la copia editable de una ocupación. */
export type EditorTab = 'general' | AnalysisListKey;

interface EditorTabOption {
  id: EditorTab;
  /** Texto corto de la pestaña y su nombre completo (título al pasar el cursor). */
  labelKey: string;
  titleKey: string;
}

/**
 * Copia editable de una ocupación del análisis ("N. Ocupación (Editar)"):
 * nombre, nivel, área, descripción y sus componentes. Edita directamente la
 * copia que recibe; la ocupación original no cambia.
 */
@Component({
  selector: 'app-analisis-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, DialogDirective, FilterComboboxComponent],
  templateUrl: './analisis-editor.component.html',
  styleUrl: './analisis-editor.component.css'
})
export class AnalisisEditorComponent {
  private readonly analisisService = inject(AnalisisService);
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);

  /** La copia que se edita. */
  @Input({ required: true }) occupation!: AnalysisOccupation;
  /** Niveles y áreas del catálogo de la ocupación. */
  @Input() options: AnalysisOptions = { levels: [], areas: [] };
  /** Espacio del análisis (1 a 3): distingue los ids de los campos de cada copia. */
  @Input() position = 1;
  /** Marca los campos obligatorios vacíos (tras intentar guardar). */
  @Input() showErrors = false;
  @Input() disabled = false;

  @Output() readonly remove = new EventEmitter<void>();
  /** Se creó un nivel para Análisis: quien muestra la copia debe recargar las opciones del catálogo. */
  @Output() readonly levelCreated = new EventEmitter<void>();

  readonly tabs: EditorTabOption[] = [
    { id: 'general', labelKey: 'analisis.tabGeneral', titleKey: 'analisis.tabGeneral' },
    { id: 'functions', labelKey: 'analisis.functions', titleKey: 'analisis.functions' },
    { id: 'skills', labelKey: 'analisis.skills', titleKey: 'analisis.skills' },
    { id: 'knowledge', labelKey: 'analisis.knowledge', titleKey: 'analisis.knowledge' },
    { id: 'denominations', labelKey: 'analisis.tabDenominations', titleKey: 'analisis.denominations' },
    { id: 'related', labelKey: 'analisis.tabRelated', titleKey: 'analisis.related' }
  ];
  activeTab: EditorTab = 'general';

  /** Código del componente desplegado para editar su texto. */
  expandedItem: string | null = null;
  /** "Ampliar": el campo de texto largo que está abierto en un cuadro grande. */
  expandedField: LongField | null = null;

  /** "+ Nuevo nivel para Análisis": diálogo para crear un nivel que solo se usa en Análisis. */
  newLevel: AnalysisLevelDraft | null = null;
  /** Tras intentar guardar el nivel: marca el nombre vacío o repetido. */
  newLevelError: 'required' | 'taken' | null = null;
  savingLevel = false;
  readonly levelDescriptionMax = LEVEL_DESCRIPTION_MAX;

  /** Niveles elegibles: los del catálogo, los creados para Análisis y el que ya trae la ocupación. */
  get levelOptions(): string[] {
    return this.withCurrent(this.options.levels, this.occupation.level);
  }

  /** Niveles y áreas como opciones del selector con buscador (el valor es el nombre, que es lo que entiende el backend). */
  get levelChoices(): FilterOption[] {
    return this.levelOptions.map((value) => ({ value, label: this.levelLabel(value) }));
  }

  get areaChoices(): FilterOption[] {
    return this.areaOptions.map((value) => ({ value, label: value }));
  }

  levelLabel(name: string): string {
    return this.options.levelLabels?.[name] ?? name;
  }

  get areaOptions(): string[] {
    return this.withCurrent(this.options.areas, this.occupation.area);
  }

  /** Componentes de la pestaña abierta (las pestañas que son una lista editable). */
  get listKey(): AnalysisListKey | null {
    return this.activeTab === 'general' ? null : this.activeTab;
  }

  /** Nombre completo de la pestaña abierta (título de su lista). */
  get activeTitleKey(): string {
    return this.tabs.find((tab) => tab.id === this.activeTab)!.titleKey;
  }

  get items(): AnalysisItem[] {
    return this.listKey ? this.occupation[this.listKey] : [];
  }

  /** Prefijo de los ids de los campos de esta copia. */
  id(field: string): string {
    return `analisis-${this.position}-${field}`;
  }

  missing(field: 'name' | 'level' | 'area' | 'description'): boolean {
    return this.showErrors && !this.occupation[field].trim();
  }

  openNewLevel(): void {
    this.newLevel = { name: '', description: '' };
    this.newLevelError = null;
  }

  closeNewLevel(): void {
    if (!this.savingLevel) {
      this.newLevel = null;
    }
  }

  /** Guarda el nivel y lo deja elegido en la copia. */
  saveLevel(): void {
    const draft = this.newLevel;
    if (!draft || this.savingLevel) {
      return;
    }
    if (!draft.name.trim()) {
      this.newLevelError = 'required';
      return;
    }
    this.savingLevel = true;
    this.analisisService.createLevel(this.occupation.catalog, draft).subscribe({
      next: (level) => {
        this.savingLevel = false;
        this.newLevel = null;
        this.occupation.level = level.name;
        this.levelCreated.emit();
        this.toastService.success(this.translationService.translate('analisis.toastLevelSaved', { code: level.code }));
      },
      error: (error: unknown) => {
        this.savingLevel = false;
        if (error instanceof Error && error.message === LEVEL_NAME_TAKEN) {
          this.newLevelError = 'taken';
          return;
        }
        this.toastService.error(this.translationService.translate('analisis.toastLevelError'));
      }
    });
  }

  toggleItem(code: string): void {
    this.expandedItem = this.expandedItem === code ? null : code;
  }

  /** Agrega un componente vacío al final de la lista y lo deja listo para escribir. */
  addItem(): void {
    const list = this.listKey;
    if (!list) {
      return;
    }
    // El número sigue al mayor ya usado, para no repetir el código de uno eliminado. En
    // Relac. solo cuentan los agregados a mano: los demás llevan el código de su ocupación.
    const numbered = list === 'related' ? this.occupation[list].filter((item) => item.code.startsWith('R-')) : this.occupation[list];
    const last = Math.max(0, ...numbered.map((item) => Number(item.code.split('.').pop()) || 0));
    const item = { code: itemCode(list, this.occupation.code, last + 1), text: '' };
    this.occupation[list].push(item);
    this.expandedItem = item.code;
  }

  removeItem(index: number): void {
    if (this.listKey) {
      this.occupation[this.listKey].splice(index, 1);
    }
  }

  private withCurrent(options: string[], current: string): string[] {
    return current && !options.includes(current) ? [...options, current] : options;
  }
}

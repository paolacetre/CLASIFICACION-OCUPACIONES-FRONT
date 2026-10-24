import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, catchError, debounceTime, of, switchMap } from 'rxjs';
import { DialogDirective } from '../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import { AnalisisEditorComponent } from './analisis-editor/analisis-editor.component';
import {
  AnalysisCatalog,
  AnalysisOptions,
  AnalysisSearchResult,
  AnalysisSlot,
  MAX_OCCUPATIONS,
  MIN_OCCUPATIONS,
  levelText,
  missingFields
} from './analisis.model';
import { AnalisisService, ANALYSIS_REJECTED, SAVED_NOT_SENT } from './analisis.service';
import { SEARCH_DEBOUNCE_MS } from '../../shared/ui/list';
import { GuideDialogComponent, GuideStep } from '../../shared/ui/guide-dialog.component';
import { FilterOption } from '../consulta-ocupaciones/consulta-ocupaciones.model';
import { FilterComboboxComponent } from '../consulta-ocupaciones/filter-combobox/filter-combobox.component';

export * from './analisis.model';

/**
 * Vista "Análisis" del proyecto (Diligenciamiento): se eligen 2 o 3
 * ocupaciones de la CNO o la CUOC, se edita una copia de cada una y se guardan
 * para revisarlas en Comparativa o se envían a Instrumento 2.
 */
@Component({
  selector: 'app-analisis',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, DialogDirective, AnalisisEditorComponent, GuideDialogComponent, FilterComboboxComponent],
  templateUrl: './analisis.component.html',
  styleUrl: './analisis.component.css'
})
export class AnalisisComponent implements OnInit {
  private readonly analisisService = inject(AnalisisService);
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  readonly catalogs: AnalysisCatalog[] = ['CNO', 'CUOC'];
  readonly catalogChoices: FilterOption[] = this.catalogs.map((value) => ({ value, label: value }));
  readonly maxOccupations = MAX_OCCUPATIONS;

  catalog: AnalysisCatalog = 'CNO';
  searchText = '';
  /** Ocupaciones encontradas; `null` mientras no se ha buscado nada. */
  searchResults: AnalysisSearchResult[] | null = null;
  /** Niveles y áreas de cada catálogo, para los desplegables de las copias. */
  options: Record<AnalysisCatalog, AnalysisOptions> = { CNO: { levels: [], areas: [] }, CUOC: { levels: [], areas: [] } };

  /** Ocupaciones del análisis, en el orden en que se agregaron. */
  slots: AnalysisSlot[] = [];
  /** Posición de la ocupación cuyo detalle completo está abierto ("Ver más detalles"); `null` si está cerrado. */
  detailIndex: number | null = null;
  /** Tras intentar guardar: las copias marcan sus campos obligatorios vacíos. */
  showErrors = false;
  saving = false;
  guideOpen = false;
  /** Pasos de la "Guía de uso" (`GuideDialogComponent`). */
  readonly guideSteps: GuideStep[] = [
    { titleKey: 'analisis.guideSearchTitle', textKey: 'analisis.guideSearchText' },
    { titleKey: 'analisis.guideEditTitle', textKey: 'analisis.guideEditText' },
    { titleKey: 'analisis.guideSaveTitle', textKey: 'analisis.guideSaveText' }
  ];

  private readonly searchChanged = new Subject<void>();

  constructor() {
    this.searchChanged
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap(() => {
          const text = this.searchText.trim();
          return text
            ? this.analisisService.search(this.catalog, text).pipe(
                catchError(() => {
                  this.toastService.error(this.translationService.translate('common.errorGeneric'));
                  return of<AnalysisSearchResult[]>([]);
                })
              )
            : of(null);
        }),
        takeUntilDestroyed()
      )
      .subscribe((results) => (this.searchResults = results));
  }

  ngOnInit(): void {
    this.catalogs.forEach((catalog) => this.loadOptions(catalog));
  }

  /** Niveles y áreas del catálogo (se vuelven a pedir cuando una copia crea un nivel para Análisis). */
  loadOptions(catalog: AnalysisCatalog): void {
    this.analisisService.options(catalog).subscribe((options) => (this.options[catalog] = options));
  }

  /** Columnas visibles: siempre dos; la tercera aparece cuando se agrega la tercera ocupación. */
  /** Nivel completo para la ficha (en la CNO, con su código). */
  readonly levelText = levelText;

  get columns(): number[] {
    return Array.from({ length: Math.max(MIN_OCCUPATIONS, this.slots.length) }, (_, index) => index);
  }

  get isFull(): boolean {
    return this.slots.length >= MAX_OCCUPATIONS;
  }

  /** Hay suficientes ocupaciones para guardar o enviar. */
  get isComplete(): boolean {
    return this.slots.length >= MIN_OCCUPATIONS;
  }

  /** Mensaje del pie según cuántas ocupaciones hay. */
  get statusKey(): string {
    return !this.slots.length ? 'analisis.statusEmpty' : this.isComplete ? 'analisis.statusReady' : 'analisis.statusOneMore';
  }

  /** Busca a medida que se escribe o al cambiar de catálogo. */
  onCatalogChange(value: string): void {
    this.catalog = value as AnalysisCatalog;
    this.onSearchChange();
  }

  onSearchChange(): void {
    this.searchChanged.next();
  }

  isSelected(result: AnalysisSearchResult): boolean {
    return this.slots.some((slot) => slot.original.catalog === result.catalog && slot.original.code === result.code);
  }

  /** Agrega la ocupación al primer espacio libre: la ficha muestra la original y la copia queda lista para editar. */
  add(result: AnalysisSearchResult): void {
    if (this.isFull || this.isSelected(result)) {
      return;
    }
    this.analisisService.occupation(result.catalog, result.code).subscribe({
      next: (occupation) => {
        if (this.isFull || this.isSelected(result)) {
          return;
        }
        this.slots.push({ original: occupation, draft: structuredClone(occupation) });
        this.searchText = '';
        this.searchResults = null;
      },
      error: () => this.toastService.error(this.translationService.translate('analisis.toastAddError'))
    });
  }

  /** Enter en el buscador: agrega la primera ocupación de la lista que aún no esté en el análisis. */
  addFirstResult(): void {
    const first = this.searchResults?.find((result) => !this.isSelected(result));
    if (first) {
      this.add(first);
    }
  }

  /** Quita una ocupación del análisis. */
  remove(index: number): void {
    this.slots.splice(index, 1);
    if (!this.slots.length) {
      this.showErrors = false;
    }
  }

  /** "Agregar ocupación" / "Buscar ocupación": lleva al buscador. */
  focusSearch(): void {
    this.searchInput?.nativeElement.focus();
    this.searchInput?.nativeElement.scrollIntoView({ block: 'center' });
  }

  /** "Editar" de una ficha: lleva a su copia editable. */
  edit(index: number): void {
    const name = document.getElementById(`analisis-${index + 1}-name`);
    name?.scrollIntoView({ block: 'center' });
    name?.focus();
  }

  /** Guarda las copias: quedan disponibles en Comparativa y el análisis se limpia para empezar otro. */
  save(): void {
    this.store((occupations) => this.analisisService.save(occupations), 'analisis.toastSaved');
  }

  /** Además de guardarlas, las deja listas para validación experta en Instrumento 2. */
  sendToInstrument2(): void {
    this.store((occupations) => this.analisisService.sendToInstrument2(occupations), 'analisis.toastSent');
  }

  /** Descarga las ocupaciones del análisis tal como están en pantalla (las copias). */
  download(): void {
    if (!this.slots.length) {
      return;
    }
    this.analisisService.export(this.slots.map((slot) => slot.draft)).subscribe({
      next: ({ blob, fileName }) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toastService.error(this.translationService.translate('common.errorGeneric'))
    });
  }

  /** Guarda el análisis (o lo guarda y envía a Instrumento 2) si todas las ocupaciones tienen sus campos obligatorios. */
  private store(request: (occupations: AnalysisSlot['draft'][]) => Observable<unknown>, successKey: string): void {
    if (this.saving || !this.isComplete) {
      return;
    }
    this.showErrors = true;
    if (this.slots.some((slot) => missingFields(slot.draft).length)) {
      this.toastService.warning(this.translationService.translate('analisis.toastMissing'));
      return;
    }
    this.saving = true;
    request(this.slots.map((slot) => slot.draft)).subscribe({
      next: () => {
        this.saving = false;
        this.slots = [];
        this.showErrors = false;
        this.toastService.success(this.translationService.translate(successKey));
      },
      error: (error: unknown) => {
        this.saving = false;
        const code = error instanceof Error ? error.message : '';
        if (code === SAVED_NOT_SENT) {
          // El análisis ya quedó en Comparativa: se limpia igual que al guardar y se avisa qué faltó.
          this.slots = [];
          this.showErrors = false;
          this.toastService.warning(this.translationService.translate('analisis.toastSavedNotSent'));
          return;
        }
        const key = code === ANALYSIS_REJECTED ? 'analisis.toastRejected' : 'analisis.toastSaveError';
        this.toastService.error(this.translationService.translate(key));
      }
    });
  }
}

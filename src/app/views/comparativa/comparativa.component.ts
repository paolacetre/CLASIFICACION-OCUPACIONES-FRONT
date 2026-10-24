import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, catchError, map, of, switchMap, timer } from 'rxjs';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import { AnalysisCatalog, AnalysisItem, AnalysisListKey, AnalysisOccupation, AnalysisOptions } from '../analisis/analisis.model';
import { AnalisisService } from '../analisis/analisis.service';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { PickOption } from '../actualizacion-cno/actualizacion-cno.model';
import { ActualizacionCnoService } from '../actualizacion-cno/actualizacion-cno.service';
import { OptionPickerComponent } from '../actualizacion-cno/option-picker/option-picker.component';
import {
  COMPARISON_ASPECTS,
  COMPARISON_STATUSES,
  Comparison,
  ComparisonAspect,
  ComparisonPage,
  ComparisonQuery,
  ComparisonStatus,
  ComparisonSummary,
  OccupationChange,
  OccupationDraft,
  aspectMatches,
  createEmptyQuery,
  draftChanged,
  isEditable,
  toDraft
} from './comparativa.model';
import { COMPARISON_INCOMPLETE, COMPARISON_LOCKED, ComparativaService } from './comparativa.service';
import { SEARCH_DEBOUNCE_MS, pageCountOf } from '../../shared/ui/list';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { GuideDialogComponent, GuideStep } from '../../shared/ui/guide-dialog.component';

export * from './comparativa.model';

/** Pestañas de una comparativa abierta: Información y una por lista de componentes. */
export type ComparisonTab = 'info' | AnalysisListKey;

interface StatusCard {
  status: ComparisonStatus;
  labelKey: string;
  hintKey: string;
  /** Clase `ui-badge-*` del distintivo de ese estado en la tabla y el detalle. */
  badge: string;
}

interface TabOption {
  id: ComparisonTab;
  labelKey: string;
}

interface AspectChip {
  aspect: ComparisonAspect;
  labelKey: string;
  matches: boolean;
  /** Es un aspecto de la pestaña abierta: se resalta en la barra. */
  current: boolean;
}

/**
 * Vista "Comparativa" del proyecto (Diligenciamiento): lista las comparativas
 * que llegan de Análisis y, al abrir una, muestra sus ocupaciones lado a lado,
 * en qué coinciden, y permite anotar observaciones y enviarla a Instrumento 2.
 */
@Component({
  selector: 'app-comparativa',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, PaginationComponent, ConfirmDialogComponent, OptionPickerComponent, GuideDialogComponent],
  templateUrl: './comparativa.component.html',
  styleUrl: './comparativa.component.css'
})
export class ComparativaComponent implements OnInit {
  private readonly comparativaService = inject(ComparativaService);
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);
  private readonly analisisService = inject(AnalisisService);
  private readonly catalogService = inject(ActualizacionCnoService);

  /**
   * Incrustada en otra vista (Instrumento 2 → "Comparación"): abre directamente
   * esa comparativa, sin la lista, y "Volver" avisa con `closed`.
   */
  @Input() embeddedId: number | null = null;
  /** Solo consulta: sin modo edición ni acciones de guardar o enviar. */
  @Input() readOnly = false;
  /**
   * Abierta con "Editar" desde Instrumento 2: el pie dice "Editando desde Instrumento 2" y su único botón es
   * "Guardar en Instrumento 2", que guarda, la vuelve a dejar en Instrumento 2 y regresa a la bandeja.
   */
  @Input() fromInstrument2 = false;
  @Output() readonly closed = new EventEmitter<void>();

  readonly statusCards: StatusCard[] = [
    { status: 'Recibido', labelKey: 'comparativa.statusReceived', hintKey: 'comparativa.statusReceivedHint', badge: 'ui-badge-warn' },
    { status: 'Editado', labelKey: 'comparativa.statusEdited', hintKey: 'comparativa.statusEditedHint', badge: 'ui-badge-error' },
    { status: 'En Instrumento 2', labelKey: 'comparativa.statusInstrument', hintKey: 'comparativa.statusInstrumentHint', badge: 'ui-badge-info' },
    { status: 'Diligenciado', labelKey: 'comparativa.statusCompleted', hintKey: 'comparativa.statusCompletedHint', badge: 'ui-badge-neutral' },
    { status: 'Enviado', labelKey: 'comparativa.statusSent', hintKey: 'comparativa.statusSentHint', badge: 'ui-badge-ok' }
  ];
  readonly tabs: TabOption[] = [
    { id: 'info', labelKey: 'comparativa.tabInfo' },
    { id: 'functions', labelKey: 'comparativa.functions' },
    { id: 'denominations', labelKey: 'comparativa.denominations' },
    { id: 'skills', labelKey: 'comparativa.skills' },
    { id: 'knowledge', labelKey: 'comparativa.knowledge' },
    { id: 'related', labelKey: 'comparativa.related' }
  ];

  /* ---------- Lista ---------- */
  summary: ComparisonSummary = Object.fromEntries(COMPARISON_STATUSES.map((status) => [status, 0])) as ComparisonSummary;
  query: ComparisonQuery = createEmptyQuery();
  result: ComparisonPage = { items: [], total: 0 };
  loading = true;
  guideOpen = false;
  /** Pasos de la "Guía de uso" (`GuideDialogComponent`). */
  readonly guideSteps: GuideStep[] = [
    { titleKey: 'comparativa.guideAnalysisTitle', textKey: 'comparativa.guideAnalysisText' },
    { titleKey: 'comparativa.guideComparisonTitle', textKey: 'comparativa.guideComparisonText' },
    { titleKey: 'comparativa.guideInstrumentTitle', textKey: 'comparativa.guideInstrumentText' },
    { titleKey: 'comparativa.guideExpertTitle', textKey: 'comparativa.guideExpertText' }
  ];

  /* ---------- Comparativa abierta ---------- */
  selected: Comparison | null = null;
  activeTab: ComparisonTab = 'info';
  /** Modo edición: los datos de cada ocupación y la observación pasan a ser campos. */
  editing = false;
  /** Tarjeta que se está editando (se resalta); `null` si se entró con el "Editar" general. */
  focusedColumn: number | null = null;
  /** Borrador de cada ocupación, en el orden de `selected.occupations`. */
  drafts: OccupationDraft[] = [];
  /** Observación de la comparativa (una sola) mientras se edita. */
  observation = '';
  /** Niveles y áreas de cada clasificación para los desplegables; se piden al entrar en modo edición. */
  options: Partial<Record<AnalysisCatalog, AnalysisOptions>> = {};
  /** Tarjeta con el buscador de "+ Agregar" abierto (en la pestaña de una lista); `null` si no hay ninguno. */
  pickerColumn: number | null = null;
  /** Opciones del buscador por clasificación y lista (`CNO|functions`…), pedidas la primera vez que se abre. */
  pickerOptions: Record<string, PickOption[]> = {};
  /** Confirmación abierta: descartar cambios o enviar a Instrumento 2. */
  pendingConfirm: 'discard' | 'send' | null = null;
  saving = false;

  /** Qué hacer después de descartar: salir del modo edición o volver a la lista. */
  private afterDiscard: 'view' | 'back' = 'view';

  /** Cada valor es la espera (ms) antes de consultar: 0 para clics, el debounce al escribir. */
  private readonly reload = new Subject<number>();

  constructor() {
    this.reload
      .pipe(
        switchMap((delay) => {
          const query = { ...this.query };
          return timer(delay).pipe(
            switchMap(() => this.comparativaService.list(query)),
            catchError(() => {
              this.toastService.error(this.translationService.translate('common.errorGeneric'));
              return of<ComparisonPage>({ items: [], total: 0 });
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

  /** Sola, la vista carga la lista; incrustada en Instrumento 2, abre directamente la comparativa pedida. */
  ngOnInit(): void {
    if (this.embeddedId === null) {
      this.refresh();
    } else {
      this.open(this.embeddedId);
    }
  }

  /* ---------- Lista ---------- */

  get hasFilters(): boolean {
    return !!this.query.text.trim();
  }

  get pageCount(): number {
    return pageCountOf(this.result.total, this.query.pageSize);
  }

  card(status: ComparisonStatus): StatusCard {
    return this.statusCards.find((item) => item.status === status)!;
  }

  onTextChange(): void {
    this.query.page = 1;
    this.load(SEARCH_DEBOUNCE_MS);
  }

  onFiltersChange(): void {
    this.query.page = 1;
    this.load();
  }

  clearFilters(): void {
    this.query.text = '';
    this.onFiltersChange();
  }

  /** Pide al servicio la página elegida. */
  goToPage(page: number): void {
    if (page < 1 || page > this.pageCount || page === this.query.page) {
      return;
    }
    this.query.page = page;
    this.load();
  }

  /* ---------- Comparativa abierta ---------- */

  /** Se puede cambiar: aún no está en manos del experto ni se abrió solo para consultar. */
  get editable(): boolean {
    return !!this.selected && !this.readOnly && isEditable(this.selected.status);
  }

  /** Hay algo escrito que aún no se guardó (datos de alguna ocupación o la observación). */
  get dirty(): boolean {
    const comparison = this.selected;
    if (!comparison || !this.editing) {
      return false;
    }
    return this.changes().length > 0 || comparison.observation !== this.observation.trim();
  }

  /** "Enviar a Instrumento 2" no hace falta si ya está allí y no hay cambios. */
  get canSend(): boolean {
    return this.editable && (this.dirty || this.selected?.status !== 'En Instrumento 2');
  }

  /** Texto de la barra del pie según de dónde se abrió, si admite cambios y si hay algo sin guardar. */
  get footerNoteKey(): string {
    if (this.readOnly) return 'comparativa.readOnlyNote';
    if (!this.editable) return 'comparativa.lockedSent';
    if (this.fromInstrument2) return this.dirty ? 'comparativa.unsavedFromInstrument' : 'comparativa.editingFromInstrument';
    return this.dirty ? 'comparativa.unsaved' : 'comparativa.allSaved';
  }

  /** En qué coinciden las ocupaciones (la columna "Comparación"). */
  get aspects(): AspectChip[] {
    const occupations = this.selected?.occupations ?? [];
    return COMPARISON_ASPECTS.map((aspect) => ({
      aspect,
      labelKey: `comparativa.aspect.${aspect}`,
      matches: aspectMatches(occupations, aspect),
      // Información muestra catálogo, nivel y área; cada una de las demás pestañas, su propio aspecto.
      current: this.activeTab === 'info' ? aspect === 'catalog' || aspect === 'level' || aspect === 'area' : aspect === this.activeTab
    }));
  }

  get matchCount(): number {
    return this.aspects.filter((chip) => chip.matches).length;
  }

  /** Clic en un aspecto de la columna: abre la pestaña donde se ve (catálogo, nivel y área están en Información). */
  showAspect(aspect: ComparisonAspect): void {
    this.selectTab(aspect === 'catalog' || aspect === 'level' || aspect === 'area' ? 'info' : aspect);
  }

  /** Cambia de pestaña y cierra el buscador de "+ Agregar" (es de la lista anterior). */
  selectTab(tab: ComparisonTab): void {
    this.activeTab = tab;
    this.pickerColumn = null;
  }

  /** Texto de la pestaña abierta (título de la sección de la lista en cada tarjeta). */
  get tabLabelKey(): string {
    return this.tabs.find((tab) => tab.id === this.activeTab)?.labelKey ?? '';
  }

  /** Lista de la pestaña abierta para una ocupación, desde su borrador (igual a lo guardado mientras no se edita). */
  listItems(index: number): AnalysisItem[] {
    return this.activeTab === 'info' ? [] : (this.drafts[index]?.[this.activeTab] ?? []);
  }

  /** Cantidad que acompaña a cada pestaña: ocupaciones en Información, total de componentes en las demás. */
  tabCount(tab: ComparisonTab): number {
    if (tab === 'info') {
      return this.selected?.occupations.length ?? 0;
    }
    return this.drafts.reduce((total, draft) => total + draft[tab].length, 0);
  }

  /**
   * "+ Agregar" en una lista: las denominaciones no tienen catálogo y suman una fila en blanco ("Nueva"); las demás
   * abren el buscador del catálogo de la clasificación de esa ocupación (se pide la primera vez).
   */
  addItem(index: number): void {
    const list = this.activeTab;
    const occupation = this.selected?.occupations[index];
    if (list === 'info' || !occupation || !this.editing) {
      return;
    }
    if (list === 'denominations') {
      this.drafts[index].denominations = [{ code: '', text: '' }, ...this.drafts[index].denominations];
      return;
    }
    this.pickerColumn = this.pickerColumn === index ? null : index;
    const key = this.pickerKey(occupation.catalog, list);
    if (this.pickerColumn !== null && !this.pickerOptions[key]) {
      this.catalogOptions(occupation.catalog, list).subscribe({
        next: (options) => (this.pickerOptions = { ...this.pickerOptions, [key]: options }),
        error: () => this.toastService.error(this.translationService.translate('common.errorGeneric'))
      });
    }
  }

  /** Opciones del buscador abierto en una tarjeta (vacío mientras llegan). */
  pickerOptionsOf(index: number): PickOption[] {
    const occupation = this.selected?.occupations[index];
    return occupation && this.activeTab !== 'info' ? (this.pickerOptions[this.pickerKey(occupation.catalog, this.activeTab)] ?? []) : [];
  }

  /** Códigos ya en la lista: el buscador no los vuelve a ofrecer. */
  listCodes(index: number): string[] {
    return this.listItems(index).map((item) => item.code).filter(Boolean);
  }

  /** Elegido en el buscador: entra al principio de la lista, con su código y su texto del catálogo. */
  addPicked(index: number, option: PickOption): void {
    const list = this.activeTab;
    if (list === 'info') {
      return;
    }
    this.drafts[index][list] = [{ code: option.code, text: option.label }, ...this.drafts[index][list]];
    this.pickerColumn = null;
  }

  /** Quita un elemento de la lista de la pestaña abierta. */
  removeItem(index: number, position: number): void {
    const list = this.activeTab;
    if (list !== 'info') {
      this.drafts[index][list] = this.drafts[index][list].filter((_, at) => at !== position);
    }
  }

  /**
   * "Editar" (el general o el de una tarjeta): pasa a modo edición y pide los niveles y áreas de cada
   * clasificación para los desplegables. El de una tarjeta la deja resaltada.
   */
  startEditing(column: number | null = null): void {
    const comparison = this.selected;
    if (!comparison || !this.editable) {
      return;
    }
    this.editing = true;
    this.focusedColumn = column;
    for (const catalog of new Set(comparison.occupations.map((occupation) => occupation.catalog))) {
      if (!this.options[catalog]) {
        this.analisisService.options(catalog).subscribe({
          next: (options) => (this.options = { ...this.options, [catalog]: options }),
          error: () => this.toastService.error(this.translationService.translate('common.errorGeneric'))
        });
      }
    }
  }

  /** En modo edición, la tarjeta en la que se escribe queda resaltada. */
  focusColumn(index: number): void {
    if (this.editing) {
      this.focusedColumn = index;
    }
  }

  /** Niveles para el desplegable de una ocupación; el valor actual se agrega si no está en el catálogo, para no perderlo. */
  levelOptions(index: number): string[] {
    return this.withCurrent(this.optionsOf(index)?.levels ?? [], this.drafts[index]?.level ?? '');
  }

  /** Áreas para el desplegable de una ocupación (con el valor actual, como los niveles). */
  areaOptions(index: number): string[] {
    return this.withCurrent(this.optionsOf(index)?.areas ?? [], this.drafts[index]?.area ?? '');
  }

  /** Abre el detalle de una comparativa. Si falla estando incrustada, se cierra. */
  open(id: number): void {
    this.comparativaService.get(id).subscribe({
      next: (comparison) => this.show(comparison),
      error: () => {
        this.toastService.error(this.translationService.translate('comparativa.toastOpenError'));
        if (this.embeddedId !== null) {
          // Fuera del ciclo de pintado: quien la incrustó cambia su vista al recibirlo.
          setTimeout(() => this.closed.emit());
        }
      }
    });
  }

  /** "Volver" del encabezado: con cambios sin guardar pide confirmación antes de salir. */
  requestBack(): void {
    if (this.dirty) {
      this.afterDiscard = 'back';
      this.pendingConfirm = 'discard';
      return;
    }
    this.back();
  }

  /** "Cancelar" (en modo edición) o "Volver" del pie: con cambios sin guardar pide confirmación. */
  cancel(): void {
    if (this.dirty) {
      this.afterDiscard = this.editing ? 'view' : 'back';
      this.pendingConfirm = 'discard';
      return;
    }
    if (this.editing) {
      this.stopEditing();
    } else {
      this.back();
    }
  }

  /** Confirmó descartar: vuelve a lo guardado y sale del modo edición (o de la comparativa, si venía de "Volver"). */
  discard(): void {
    this.pendingConfirm = null;
    if (this.selected) {
      this.show(this.selected, this.activeTab);
    }
    if (this.afterDiscard === 'back') {
      this.back();
    }
  }

  /** "Volver": cierra la comparativa y actualiza la lista y el resumen (o avisa a Instrumento 2 si está incrustada). */
  back(): void {
    if (this.embeddedId !== null) {
      this.closed.emit();
      return;
    }
    this.selected = null;
    this.refresh();
  }

  /**
   * "Guardar cambios": guarda las ocupaciones cambiadas y la observación. Desde Instrumento 2 ("Guardar en
   * Instrumento 2") además la vuelve a dejar allí —guardar la pasa a "Editado"— y regresa a la bandeja.
   */
  save(): void {
    const comparison = this.selected;
    if (!comparison || !this.dirty) {
      return;
    }
    if (this.drafts.some((draft) => !draft.name.trim())) {
      this.toastService.warning(this.translationService.translate('comparativa.nameRequired'));
      return;
    }
    const observation = comparison.observation !== this.observation.trim() ? this.observation : null;
    let request = this.comparativaService.saveChanges(comparison.id, this.changes(), observation);
    if (this.fromInstrument2) {
      request = request.pipe(switchMap(() => this.comparativaService.sendToInstrument2(comparison.id)));
    }
    this.write(request, this.fromInstrument2 ? 'comparativa.toastSavedInstrument' : 'comparativa.toastSaved', (saved) => {
      if (this.fromInstrument2) {
        this.closed.emit();
      } else {
        this.show(saved, this.activeTab);
      }
    });
  }

  /** "Enviar a Instrumento 2": primero hay que guardar lo escrito; luego pide confirmación. */
  requestSend(): void {
    if (this.dirty) {
      this.toastService.warning(this.translationService.translate('comparativa.saveBeforeSend'));
      return;
    }
    this.pendingConfirm = 'send';
  }

  /** Envío confirmado: la deja "En Instrumento 2" (lista para el experto) y vuelve a la lista. */
  confirmSend(): void {
    const comparison = this.selected;
    if (!comparison) {
      return;
    }
    this.write(this.comparativaService.sendToInstrument2(comparison.id), 'comparativa.toastSent', () => {
      this.pendingConfirm = null;
      this.back();
    });
  }

  /** Muestra la comparativa en modo vista, con los borradores iguales a lo guardado. */
  private show(comparison: Comparison, tab: ComparisonTab = 'info'): void {
    this.selected = comparison;
    this.drafts = comparison.occupations.map(toDraft);
    this.observation = comparison.observation;
    this.activeTab = tab;
    this.stopEditing();
  }

  private stopEditing(): void {
    this.editing = false;
    this.focusedColumn = null;
    this.pickerColumn = null;
    if (this.selected) {
      this.drafts = this.selected.occupations.map(toDraft);
      this.observation = this.selected.observation;
    }
  }

  /** Ocupaciones cuyo borrador difiere de lo guardado, con el código de su copia. */
  private changes(): OccupationChange[] {
    const occupations = this.selected?.occupations ?? [];
    return occupations
      .map((occupation, index) => ({ occupation, draft: this.drafts[index] }))
      .filter(({ occupation, draft }) => !!draft && draftChanged(occupation, draft))
      .map(({ occupation, draft }) => ({ ...draft, copyCode: occupation.copyCode ?? occupation.code }));
  }

  private pickerKey(catalog: AnalysisCatalog, list: AnalysisListKey): string {
    return `${catalog}|${list}`;
  }

  /** Catálogo de una lista para el buscador: funciones, habilidades, conocimientos u ocupaciones de la clasificación. */
  private catalogOptions(catalog: AnalysisCatalog, list: AnalysisListKey): Observable<PickOption[]> {
    const classification = catalog === 'CUOC' ? 'cuoc' : 'cno';
    if (list === 'functions') {
      return this.catalogService.functions(classification);
    }
    const items =
      list === 'related'
        ? this.catalogService.occupations(classification)
        : this.catalogService.list(list === 'skills' ? 'skill' : 'knowledge', classification);
    return items.pipe(map((rows) => rows.map((row) => ({ code: row.code, label: row.name }))));
  }

  private optionsOf(index: number): AnalysisOptions | undefined {
    const occupation = this.selected?.occupations[index];
    return occupation ? this.options[occupation.catalog] : undefined;
  }

  private withCurrent(options: string[], current: string): string[] {
    const value = current.trim();
    return !value || options.includes(value) ? options : [value, ...options];
  }

  /** Ejecuta una escritura y explica el error si el servidor la rechaza (ya con el experto, o incompleta para enviar). */
  private write(request: Observable<Comparison>, successKey: string, done: (comparison: Comparison) => void): void {
    if (this.saving || !this.editable) {
      return;
    }
    this.saving = true;
    request.subscribe({
      next: (comparison) => {
        this.saving = false;
        this.toastService.success(this.translationService.translate(successKey));
        done(comparison);
      },
      error: (error: unknown) => {
        this.saving = false;
        this.pendingConfirm = null;
        const key =
          error instanceof Error && error.message === COMPARISON_LOCKED
            ? 'comparativa.lockedSent'
            : error instanceof Error && error.message === COMPARISON_INCOMPLETE
              ? 'comparativa.incomplete'
              : 'common.errorGeneric';
        this.toastService.error(this.translationService.translate(key));
      }
    });
  }


  private refresh(): void {
    this.comparativaService.summary().subscribe((summary) => (this.summary = summary));
    this.load();
  }

  private load(delay = 0): void {
    this.loading = true;
    this.reload.next(delay);
  }
}

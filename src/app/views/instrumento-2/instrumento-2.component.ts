import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { concatMap, from, toArray } from 'rxjs';
import { DialogDirective } from '../../shared/dialog/dialog.directive';
import { initialsFrom } from '../../shared/format/initials';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import { AnalysisItem, AnalysisListKey, AnalysisOccupation } from '../analisis/analisis.model';
import { ComparativaComponent } from '../comparativa/comparativa.component';
import { Expert, ExpertSelection, Instrument2Detail, Instrument2Item, Instrument2State, Instrument2Tab, belongsToTab, canSendToExpert } from './instrumento-2.model';
import { INSTRUMENT_NOT_READY, Instrumento2Service } from './instrumento-2.service';
import { PAGE_SIZES, normalizeText, pageCountOf } from '../../shared/ui/list';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { GuideDialogComponent, GuideStep } from '../../shared/ui/guide-dialog.component';

export * from './instrumento-2.model';

/** Estado del modal "Enviar a validación experta". */
interface SendModal {
  /** Comparativas que se envían (una, o las marcadas con "Enviar seleccionadas"). */
  items: Instrument2Item[];
  /** Expertos a los que se puede enviar; `null` si el servidor no permite elegirlos (se envía todo, como antes). */
  experts: Expert[] | null;
  loading: boolean;
  loadError: boolean;
  /** Ocupaciones marcadas (`occupationKey()`). */
  chosenOccupations: Set<string>;
  /** `id` de los expertos marcados. */
  chosenExperts: Set<number>;
  /** Lo que falta, explicado al pulsar "Enviar" (clave del texto). */
  error: string;
}

/** Secciones del detalle de una ocupación. */
export type DetailSection = 'general' | 'description' | AnalysisListKey | 'traceability';

interface TabOption {
  id: Instrument2Tab;
  labelKey: string;
  hintKey: string;
  /** Trazos del ícono del indicador. */
  icon: string;
}

interface SectionOption {
  id: DetailSection;
  labelKey: string;
}

/** Texto y color de cada estado en la tabla y el detalle. */
const STATE_VIEW: Record<string, { labelKey: string; badge: string }> = {
  GUARDADO: { labelKey: 'instrumento2.stateSaved', badge: 'ui-badge-warn' },
  ENVIADO_EXPERTO: { labelKey: 'instrumento2.stateExpert', badge: 'ui-badge-ok' },
  AJUSTES_SOLICITADOS: { labelKey: 'instrumento2.stateAdjustments', badge: 'ui-badge-error' },
  VALIDADO: { labelKey: 'instrumento2.stateValidated', badge: 'ui-badge-info' },
  APROBADO_FINAL: { labelKey: 'instrumento2.stateApproved', badge: 'ui-badge-info' }
};

/**
 * Vista "Instrumento 2" del proyecto (Diligenciamiento): bandeja de las
 * comparativas que ya se enviaron desde Análisis o Comparativa. Aquí no se
 * edita: se revisan, se envían a validación experta y se les hace seguimiento.
 */
@Component({
  selector: 'app-instrumento-2',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, DialogDirective, ComparativaComponent, PaginationComponent, GuideDialogComponent],
  templateUrl: './instrumento-2.component.html',
  styleUrl: './instrumento-2.component.css'
})
export class Instrumento2Component implements OnInit {
  private readonly instrumento2Service = inject(Instrumento2Service);
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);

  /** Pestañas e indicadores: son lo mismo, pulsar un indicador abre su pestaña. */
  readonly tabs: TabOption[] = [
    { id: 'pending', labelKey: 'instrumento2.tabPending', hintKey: 'instrumento2.tabPendingHint', icon: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z' },
    { id: 'validation', labelKey: 'instrumento2.tabValidation', hintKey: 'instrumento2.tabValidationHint', icon: 'M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6l-7-3Zm-3 9 2 2 4-4' },
    { id: 'adjustments', labelKey: 'instrumento2.tabAdjustments', hintKey: 'instrumento2.tabAdjustmentsHint', icon: 'M14.7 6.3a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3l8.7-8.7Z' },
    { id: 'sent', labelKey: 'instrumento2.tabSent', hintKey: 'instrumento2.tabSentHint', icon: 'M21.8 10A10 10 0 1 1 17 3.3M9 11l3 3L22 4' },
    { id: 'all', labelKey: 'instrumento2.tabAll', hintKey: 'instrumento2.tabAllHint', icon: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5' }
  ];
  readonly sections: SectionOption[] = [
    { id: 'general', labelKey: 'instrumento2.sectionGeneral' },
    { id: 'description', labelKey: 'instrumento2.sectionDescription' },
    { id: 'functions', labelKey: 'instrumento2.sectionFunctions' },
    { id: 'denominations', labelKey: 'instrumento2.sectionDenominations' },
    { id: 'skills', labelKey: 'instrumento2.sectionSkills' },
    { id: 'knowledge', labelKey: 'instrumento2.sectionKnowledge' },
    { id: 'related', labelKey: 'instrumento2.sectionRelated' },
    { id: 'traceability', labelKey: 'instrumento2.sectionTraceability' }
  ];

  /* ---------- Bandeja ---------- */
  items: Instrument2Item[] = [];
  loading = true;
  tab: Instrument2Tab = 'pending';
  search = '';
  page = 1;
  pageSize = PAGE_SIZES[0];
  /** Filas marcadas para enviarlas juntas. */
  selectedIds = new Set<number>();
  guideOpen = false;
  /** Pasos de la "Guía de uso" (`GuideDialogComponent`). */
  readonly guideSteps: GuideStep[] = [
    { titleKey: 'instrumento2.guidePendingTitle', textKey: 'instrumento2.guidePendingText' },
    { titleKey: 'instrumento2.guideReviewTitle', textKey: 'instrumento2.guideReviewText' },
    { titleKey: 'instrumento2.guideEditTitle', textKey: 'instrumento2.guideEditText' },
    { titleKey: 'instrumento2.guideSendTitle', textKey: 'instrumento2.guideSendText' },
    { titleKey: 'instrumento2.guideFollowTitle', textKey: 'instrumento2.guideFollowText' }
  ];

  /* ---------- Detalle (solo lectura) ---------- */
  detail: Instrument2Detail | null = null;
  /** Id del instrumento cuyo detalle se pidió (queda marcado en la tabla mientras carga). */
  openId: number | null = null;
  loadingDetail = false;
  /** Cuál de las ocupaciones del instrumento se está viendo. */
  activeOccupation = 0;
  section: DetailSection = 'general';

  /* ---------- Envío al experto ---------- */
  /** Modal "Enviar a validación experta" abierto; `null` si no hay ninguno. */
  sendModal: SendModal | null = null;
  sending = false;
  /** Instrumentos que se están enviando (su botón muestra "Enviando…"). */
  sendingIds = new Set<number>();

  /** Comparativa abierta en solo lectura ("Comparación"); la bandeja se oculta mientras tanto. */
  comparisonId: number | null = null;
  /** La comparativa abierta se puede editar (está pendiente de envío): se abre en modo "desde Instrumento 2". */
  comparisonEditable = false;

  ngOnInit(): void {
    this.refresh();
  }

  /* ---------- Bandeja ---------- */

  /** "Actualizar": vuelve a pedir la bandeja. */
  refresh(): void {
    this.loading = true;
    this.instrumento2Service.list().subscribe({
      next: (items) => {
        this.items = items;
        this.loading = false;
        // Lo marcado que ya no existe o ya no se puede enviar deja de contar.
        this.selectedIds = new Set(items.filter((item) => this.selectedIds.has(item.id) && canSendToExpert(item.state)).map((item) => item.id));
        this.page = Math.min(this.page, this.pageCount);
      },
      error: () => {
        this.loading = false;
        this.toastService.error(this.translationService.translate('common.errorGeneric'));
      }
    });
  }

  count(tab: Instrument2Tab): number {
    return this.items.filter((item) => belongsToTab(item.state, tab)).length;
  }

  /** Lo de la pestaña abierta que coincide con el buscador (código o nombre de ocupación). */
  get filtered(): Instrument2Item[] {
    const term = normalizeText(this.search);
    return this.items.filter(
      (item) =>
        belongsToTab(item.state, this.tab) &&
        (!term || item.occupations.some((occupation) => normalizeText(occupation.code).includes(term) || normalizeText(occupation.name).includes(term)))
    );
  }

  get pageCount(): number {
    return pageCountOf(this.filtered.length, this.pageSize);
  }

  get pageItems(): Instrument2Item[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  /** Cambia de pestaña, vuelve a la primera página y cierra el detalle abierto. */
  setTab(tab: Instrument2Tab): void {
    if (this.tab !== tab) {
      this.tab = tab;
      this.page = 1;
      this.closeDetail();
    }
  }

  onSearchChange(): void {
    this.page = 1;
  }

  clearSearch(): void {
    this.search = '';
    this.page = 1;
  }

  onPageSizeChange(): void {
    this.page = 1;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.pageCount) {
      this.page = page;
    }
  }

  stateView(state: Instrument2State): { labelKey: string; badge: string } {
    return STATE_VIEW[state] ?? { labelKey: state, badge: 'ui-badge-neutral' };
  }

  canSend(item: Pick<Instrument2Item, 'state'>): boolean {
    return canSendToExpert(item.state);
  }

  initials(analyst: string): string {
    return initialsFrom(analyst).slice(0, 1) || '—';
  }

  trackById(_index: number, item: Instrument2Item): number {
    return item.id;
  }

  /* ---------- Selección para enviar varias ---------- */

  isSelected(id: number): boolean {
    return this.selectedIds.has(id);
  }

  /** Marca o desmarca una fila para enviarla al experto; solo se pueden marcar las que están "Pendientes de envío". */
  toggleSelection(item: Instrument2Item): void {
    const selected = new Set(this.selectedIds);
    if (!selected.delete(item.id) && this.canSend(item)) {
      selected.add(item.id);
    }
    this.selectedIds = selected;
  }

  /** Las de esta página que se pueden enviar. */
  private get sendableOnPage(): Instrument2Item[] {
    return this.pageItems.filter((item) => this.canSend(item));
  }

  get hasSendableOnPage(): boolean {
    return this.sendableOnPage.length > 0;
  }

  get pageSelected(): boolean {
    return this.hasSendableOnPage && this.sendableOnPage.every((item) => this.selectedIds.has(item.id));
  }

  /** Marca o desmarca todas las filas enviables de la página. */
  togglePageSelection(): void {
    const selected = new Set(this.selectedIds);
    const all = this.pageSelected;
    this.sendableOnPage.forEach((item) => (all ? selected.delete(item.id) : selected.add(item.id)));
    this.selectedIds = selected;
  }

  /* ---------- Detalle ---------- */

  /**
   * Enter o Espacio sobre la fila hacen lo mismo que el clic. Solo cuenta si el foco está en la fila,
   * no en su casilla ni en su botón "Comparación", que tienen su propia acción.
   */
  onRowKey(event: Event, id: number): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    this.toggleDetail(id);
  }

  /** Clic en una fila: abre su detalle debajo de la tabla; otro clic en la misma lo cierra. */
  toggleDetail(id: number): void {
    if (this.openId === id) {
      this.closeDetail();
      return;
    }
    this.openId = id;
    this.detail = null;
    this.loadingDetail = true;
    this.activeOccupation = 0;
    this.section = 'general';
    this.loadDetail(id);
  }

  closeDetail(): void {
    this.openId = null;
    this.detail = null;
    this.loadingDetail = false;
  }

  /** La ocupación del instrumento que se está viendo. */
  get occupation(): AnalysisOccupation | null {
    return this.detail?.occupations[this.activeOccupation] ?? null;
  }

  showOccupation(index: number): void {
    this.activeOccupation = index;
    // Los contadores de cada sección cambian entre ocupaciones: se vuelve a la general.
    this.section = 'general';
  }

  /** Componentes de la sección abierta, si es una lista. */
  sectionItems(occupation: AnalysisOccupation): AnalysisItem[] | null {
    const section = this.section;
    return section === 'general' || section === 'description' || section === 'traceability' ? null : occupation[section];
  }

  /** Cantidad que acompaña a una sección de lista; `null` en las que no son listas. */
  sectionCount(occupation: AnalysisOccupation, section: DetailSection): number | null {
    return section === 'general' || section === 'description' || section === 'traceability' ? null : occupation[section].length;
  }

  /* ---------- Comparación (la misma pantalla de Comparativa, en solo lectura) ---------- */

  /** "Editar" (pendiente de envío: se puede cambiar y se guarda en Instrumento 2) o "Comparación" (solo lectura). */
  openComparison(item: Pick<Instrument2Item, 'id' | 'state'>): void {
    this.comparisonEditable = this.canSend(item);
    this.comparisonId = item.id;
  }

  /** Al volver de la comparativa se recarga la bandeja: pudo haberse guardado algo. */
  closeComparison(): void {
    this.comparisonId = null;
    this.comparisonEditable = false;
    this.refresh();
  }

  /* ---------- Envío al experto ---------- */

  /**
   * "Enviar a experto" (o "Enviar seleccionadas"): abre el modal "Enviar a validación experta" y pide los expertos.
   * Como la versión desplegada, las ocupaciones empiezan sin marcar. Si el servidor no permite elegir (`experts()`
   * da `null`), quedan todas marcadas y fijas: se envía la comparativa completa, como antes.
   */
  requestSend(ids: number[]): void {
    const items = this.items.filter((item) => ids.includes(item.id) && canSendToExpert(item.state));
    if (!items.length || this.sending) {
      return;
    }
    const modal: SendModal = { items, experts: [], loading: true, loadError: false, chosenOccupations: new Set(), chosenExperts: new Set(), error: '' };
    this.sendModal = modal;
    this.instrumento2Service.experts().subscribe({
      next: (experts) => {
        modal.loading = false;
        modal.experts = experts;
        if (experts === null) {
          items.forEach((item) => item.occupations.forEach((occupation) => modal.chosenOccupations.add(this.occupationKey(item, occupation))));
        }
      },
      error: () => {
        modal.loading = false;
        modal.loadError = true;
      }
    });
  }

  requestSendSelected(): void {
    this.requestSend([...this.selectedIds]);
  }

  /** Cerrar el modal sin enviar (no mientras se envía). */
  cancelSend(): void {
    if (!this.sending) {
      this.sendModal = null;
    }
  }

  /** Clave de una ocupación de un instrumento en la selección: el código de su copia (lo que viaja al servidor). */
  occupationKey(item: Instrument2Item, occupation: AnalysisOccupation): string {
    return `${item.id}|${occupation.copyCode || occupation.code}`;
  }

  isOccupationChosen(item: Instrument2Item, occupation: AnalysisOccupation): boolean {
    return !!this.sendModal?.chosenOccupations.has(this.occupationKey(item, occupation));
  }

  toggleOccupation(item: Instrument2Item, occupation: AnalysisOccupation): void {
    const modal = this.sendModal;
    if (!modal || modal.experts === null) {
      return;
    }
    const key = this.occupationKey(item, occupation);
    if (!modal.chosenOccupations.delete(key)) {
      modal.chosenOccupations.add(key);
    }
    modal.error = '';
  }

  /** Total de ocupaciones del envío y cuántas están marcadas (el contador "0 de 2 seleccionada(s)"). */
  get occupationTotals(): { chosen: number; total: number } {
    const modal = this.sendModal;
    const total = modal?.items.reduce((sum, item) => sum + item.occupations.length, 0) ?? 0;
    return { chosen: modal?.chosenOccupations.size ?? 0, total };
  }

  isExpertChosen(id: number): boolean {
    return !!this.sendModal?.chosenExperts.has(id);
  }

  toggleExpert(id: number): void {
    const modal = this.sendModal;
    if (modal && !modal.chosenExperts.delete(id)) {
      modal.chosenExperts.add(id);
    }
    if (modal) {
      modal.error = '';
    }
  }

  /** "Seleccionar todos": marcados todos los expertos. */
  get allExpertsChosen(): boolean {
    const experts = this.sendModal?.experts ?? [];
    return experts.length > 0 && experts.every((expert) => this.isExpertChosen(expert.id));
  }

  toggleAllExperts(): void {
    const modal = this.sendModal;
    if (!modal?.experts) {
      return;
    }
    modal.chosenExperts = this.allExpertsChosen ? new Set() : new Set(modal.experts.map((expert) => expert.id));
    modal.error = '';
  }

  /**
   * Lo que falta para poder enviar (clave del texto), o vacío: al menos una ocupación de cada comparativa y al
   * menos un experto. "Enviar" se ve atenuado mientras falta algo y, al pulsarlo, lo explica.
   */
  get sendIssue(): string {
    const modal = this.sendModal;
    if (!modal || modal.loading) {
      return 'instrumento2.sendModal.loadingExperts';
    }
    if (modal.loadError) {
      return 'instrumento2.sendModal.expertsError';
    }
    if (modal.experts === null) {
      return '';
    }
    if (modal.experts.length === 0) {
      return 'instrumento2.sendModal.noExperts';
    }
    const empty = modal.items.some((item) => !item.occupations.some((occupation) => this.isOccupationChosen(item, occupation)));
    if (empty) {
      return modal.items.length === 1 ? 'instrumento2.sendModal.needOccupation' : 'instrumento2.sendModal.needOccupationEach';
    }
    return modal.chosenExperts.size ? '' : 'instrumento2.sendModal.needExpert';
  }

  /** "Enviar": envía cada comparativa, una tras otra, con sus ocupaciones marcadas a los expertos elegidos. */
  confirmSend(): void {
    const modal = this.sendModal;
    if (!modal || this.sending) {
      return;
    }
    const issue = this.sendIssue;
    if (issue) {
      modal.error = issue;
      return;
    }
    const withSelection = modal.experts !== null;
    const experts = [...modal.chosenExperts];
    const selectionOf = (item: Instrument2Item): ExpertSelection | undefined =>
      withSelection
        ? {
            occupations: item.occupations.filter((occupation) => this.isOccupationChosen(item, occupation)).map((occupation) => occupation.copyCode || occupation.code),
            experts
          }
        : undefined;
    const chosenOccupations = modal.chosenOccupations.size;
    const ids = modal.items.map((item) => item.id);
    this.sending = true;
    this.sendingIds = new Set(ids);
    const results = from(modal.items).pipe(
      concatMap((item) =>
        new Promise<{ id: number; sent: boolean; notReady: boolean }>((resolve) =>
          this.instrumento2Service.sendToExpert(item.id, selectionOf(item)).subscribe({
            next: () => resolve({ id: item.id, sent: true, notReady: false }),
            error: (error: unknown) => {
              resolve({ id: item.id, sent: false, notReady: error instanceof Error && error.message === INSTRUMENT_NOT_READY });
            }
          })
        )
      ),
      toArray()
    );
    results.subscribe((outcome) => {
      this.sending = false;
      this.sendingIds = new Set();
      this.sendModal = null;
      const sent = outcome.filter((item) => item.sent);
      const failed = outcome.length - sent.length;
      this.selectedIds = new Set([...this.selectedIds].filter((id) => !sent.some((item) => item.id === id)));
      if (sent.length) {
        const message = withSelection && !failed
          ? this.translationService.translate('instrumento2.sendModal.sent', { occupations: chosenOccupations, experts: experts.length })
          : this.translationService.translate(sent.length === 1 ? 'instrumento2.toastSent' : 'instrumento2.toastSentMany', { count: sent.length });
        this.toastService.success(message);
      }
      if (failed) {
        const key = outcome.some((item) => item.notReady) ? 'instrumento2.toastNotReady' : 'instrumento2.toastSendError';
        this.toastService.error(this.translationService.translate(key, { count: failed }));
      }
      this.refresh();
      // El detalle abierto se vuelve a pedir para que muestre su nuevo estado.
      if (this.openId !== null && outcome.some((item) => item.id === this.openId)) {
        this.loadDetail(this.openId, this.activeOccupation);
      }
    });
  }

  isSending(id: number): boolean {
    return this.sendingIds.has(id);
  }

  /** Pide el detalle de la fila abierta; `keepOccupation` conserva la ocupación que se estaba viendo al recargar. */
  private loadDetail(id: number, keepOccupation = 0): void {
    this.instrumento2Service.detail(id).subscribe({
      next: (detail) => {
        // Si mientras tanto se abrió otra fila o se cerró, esta respuesta ya no interesa.
        if (this.openId === id) {
          this.detail = detail;
          this.loadingDetail = false;
          this.activeOccupation = Math.min(keepOccupation, detail.occupations.length - 1);
        }
      },
      error: () => {
        if (this.openId === id) {
          this.closeDetail();
          this.toastService.error(this.translationService.translate('instrumento2.toastOpenError'));
        }
      }
    });
  }
}

import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { SESSION } from '../../../shared/session';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog.component';
import { ComboOption, ComboTone, FilterComboboxComponent, comboOptions } from '../../../shared/ui/filter-combobox.component';
import { PROJECT_STORAGE_PREFIX } from '../../../proyecto/config';
import type { SelectOption } from '../../instrumento-3/instrumento-3.model';
import {
  GRADES,
  Grade,
  Informant,
  ItemGrade,
  OccupationAdjustment,
  OccupationProposal,
  REQUIRED_INFORMANT_FIELDS,
  Review,
  ReviewItem,
  ReviewOccupation,
  ReviewRecord,
  SECTIONS,
  SectionId,
  TEXT_MAX_LENGTH,
  Verdict,
  derivedVerdict,
  detailRequired,
  displayDate,
  isEditable
} from '../validaciones.model';
import { REVIEW_FORBIDDEN, REVIEW_INVALID, REVIEW_NOT_SENT, ReviewError, ValidacionesService } from '../validaciones.service';

/** Campos de Datos generales que se escriben (los dos desplegables van aparte). */
const TEXT_FIELDS: ReadonlyArray<keyof Informant> = ['fullName', 'email', 'phone'];
const EXTRA_FIELDS: ReadonlyArray<keyof Informant> = ['company', 'position', 'profession'];

/** Ítems de una sección de lista bajo un mismo encabezado («5. Funciones»). */
interface ItemGroup {
  title: string;
  items: ReviewItem[];
}

/** Color de cada calificación en el desplegable «Opción» (el mismo de su fila). */
const GRADE_TONES: Record<Exclude<Grade, ''>, ComboTone> = { aplica: 'ok', no_aplica: 'error', requiere_ajuste: 'warn', propuesta_mejora: 'info' };

/** Pausa sin cambios tras la que el guardado automático guarda el avance. */
export const AUTO_SAVE_DELAY_MS = 4000;

/**
 * Respaldo, en este navegador, de los comentarios escritos en ítems que aún no tienen «Opción»: el servidor solo
 * recibe ítems calificados, así que sin esto se perderían al cerrar. Uno por instrumento y por quien revisa.
 */
function notesStorageKey(record: ReviewRecord, email: string): string {
  return `${PROJECT_STORAGE_PREFIX}_validacion_notas_${record.kind}-${record.id}_${email}`;
}


/**
 * Editor de una validación experta (el modal «Revisar» de la versión desplegada): a la izquierda
 * las ocupaciones del instrumento con su avance y las siete secciones; a la derecha la sección
 * elegida, con «Datos generales» (los del informante, que es quien revisa) y las observaciones
 * generales, o los ítems a calificar: Aplica, No aplica, Requiere ajuste (pide el ajuste) o
 * Propuesta de mejora (pide la propuesta). En Instrumento 2 cada ocupación admite además una
 * propuesta de área y descripción. El avance se guarda solo (guardado automático) y también con
 * «Guardar cambios», que dice si queda algo pendiente; «Enviar definitivamente»
 * exige todo calificado (y en Instrumento 2 los datos del informante) y deriva el veredicto.
 */
@Component({
  selector: 'app-validacion-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, DialogDirective, ConfirmDialogComponent, FilterComboboxComponent],
  templateUrl: './validacion-editor.component.html',
  styleUrl: './validacion-editor.component.css'
})
export class ValidacionEditorComponent implements OnInit {
  private readonly service = inject(ValidacionesService);
  private readonly translation = inject(TranslationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly session = inject(SESSION);

  @Input({ required: true }) record!: ReviewRecord;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  readonly sections = SECTIONS;
  readonly grades = GRADES;
  readonly textMax = TEXT_MAX_LENGTH;
  readonly textFields = TEXT_FIELDS;
  readonly extraFields = EXTRA_FIELDS;

  review: Review | null = null;
  loading = true;
  loadError = '';

  occupationIndex = 0;
  section: SectionId = 'general';
  gradesById: Record<string, ItemGrade> = {};
  informant!: Informant;
  observations = '';
  /** Área y descripción que propone el experto, por copia de la ocupación (solo las de Instrumento 2). */
  adjustments: Record<string, OccupationAdjustment> = {};
  editable = false;

  saving = false;
  feedback = '';
  /** Se intentó enviar: se marcan los detalles obligatorios que faltan. */
  submitAttempted = false;
  confirmSendOpen = false;
  confirmCloseOpen = false;
  private dirty = false;
  /** Cambia con cada edición: si se editó mientras se guardaba, lo nuevo sigue pendiente. */
  private revision = 0;

  /** Guardado automático: el avance se guarda al cambiar de sección u ocupación, tras una pausa sin cambios y al cerrar. */
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Ya hubo un guardado en esta visita (o la validación ya existía en el servidor). */
  private everSaved = false;
  /** Al cerrar no se pudo guardar: el siguiente «Cerrar» pide confirmación para salir sin guardar. */
  private closeSaveFailed = false;

  departments: SelectOption[] = [];
  private municipalitiesByDepartment: Record<string, SelectOption[]> = {};

  /** Carga el catálogo de departamentos y municipios aparte y pide la revisión (ítems, informante y lo ya calificado). */
  ngOnInit(): void {
    this.editable = isEditable(this.record.state);
    this.destroyRef.onDestroy(() => this.cancelAutoSave());
    // El catálogo de departamentos y municipios pesa 40 kB: se carga aparte. Si no llega, los
    // desplegables muestran solo lo ya guardado y el resto de la revisión sigue funcionando.
    import('../../instrumento-3/geografia').then(
      ({ DEPARTAMENTOS, MUNICIPIOS_POR_DEPARTAMENTO }) => {
        this.departments = DEPARTAMENTOS;
        this.municipalitiesByDepartment = MUNICIPIOS_POR_DEPARTAMENTO;
      },
      () => undefined
    );
    this.service
      .review(this.record)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (review) => {
          this.review = review;
          this.gradesById = Object.fromEntries(Object.entries(review.grades).map(([id, value]) => [id, { ...value }]));
          this.restoreNotes();
          this.informant = { ...review.informant };
          this.observations = review.observations;
          // Cada ocupación empieza con la propuesta ya guardada o, si no hay, con lo que envió el analista.
          this.adjustments = Object.fromEntries(
            review.occupations
              .filter((item) => item.adjustable)
              .map((item) => {
                const saved = review.proposals[item.copyCode] ?? {};
                return [item.copyCode, { area: saved.area ?? item.area, description: saved.description ?? item.description }];
              })
          );
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.loadError = this.t('validaciones.editor.loadError');
        }
      });
  }

  /* ---------- Navegación ---------- */

  get occupation(): ReviewOccupation | null {
    return this.review?.occupations[this.occupationIndex] ?? null;
  }

  /** Propuesta de área y descripción de la ocupación elegida (el formulario la edita en su lugar). */
  get adjustment(): OccupationAdjustment {
    return this.adjustments[this.occupation?.copyCode ?? ''] ?? { area: '', description: '' };
  }

  /** Ítems de la sección abierta en la ocupación elegida. */
  get sectionItems(): ReviewItem[] {
    return this.occupation?.items.filter((item) => item.section === this.section) ?? [];
  }

  itemsOf(section: SectionId, occupation: ReviewOccupation | null = this.occupation): ReviewItem[] {
    return occupation?.items.filter((item) => item.section === section) ?? [];
  }

  /** Cambiar de ocupación o de sección guarda lo hecho hasta ahí (guardado automático). */
  selectOccupation(index: number): void {
    this.occupationIndex = index;
    this.scrollContentTop();
    this.autoSaveNow();
  }

  selectSection(section: SectionId, autoSave = true): void {
    this.section = section;
    this.scrollContentTop();
    if (autoSave) {
      this.autoSaveNow();
    }
  }

  /** Anterior / Siguiente: recorre las secciones y, al terminar una ocupación, pasa a la siguiente. */
  get canGoBack(): boolean {
    return this.occupationIndex > 0 || SECTIONS.indexOf(this.section) > 0;
  }

  get canGoForward(): boolean {
    return !!this.review && (this.occupationIndex < this.review.occupations.length - 1 || SECTIONS.indexOf(this.section) < SECTIONS.length - 1);
  }

  /** Sección anterior; desde la primera, salta a la última sección de la ocupación anterior. */
  previous(): void {
    const index = SECTIONS.indexOf(this.section);
    if (index > 0) {
      this.selectSection(SECTIONS[index - 1]);
    } else if (this.occupationIndex > 0) {
      this.occupationIndex--;
      this.selectSection(SECTIONS[SECTIONS.length - 1]);
    }
  }

  /** Sección siguiente; desde la última, salta a la primera sección con ítems de la ocupación siguiente. */
  next(): void {
    const index = SECTIONS.indexOf(this.section);
    if (index < SECTIONS.length - 1) {
      this.selectSection(SECTIONS[index + 1]);
    } else if (this.review && this.occupationIndex < this.review.occupations.length - 1) {
      this.occupationIndex++;
      this.selectSection(SECTIONS[1]);
    }
  }

  /* ---------- Avance ---------- */

  gradeOf(item: ReviewItem): ItemGrade {
    return this.gradesById[item.id] ?? { grade: '', detail: '' };
  }

  /** Ítems calificados de una ocupación (con el detalle obligatorio, si lo pide). */
  doneOf(occupation: ReviewOccupation): number {
    return occupation.items.filter((item) => this.isComplete(item)).length;
  }

  /** Una sección cuenta como lista cuando todos sus ítems están calificados (Datos generales siempre). */
  sectionDone(section: SectionId): boolean {
    const items = this.itemsOf(section);
    return section === 'general' || (items.length > 0 && items.every((item) => this.isComplete(item)));
  }

  get sectionsDone(): number {
    return SECTIONS.filter((section) => this.sectionDone(section)).length;
  }

  get allItems(): ReviewItem[] {
    return this.review?.occupations.flatMap((occupation) => occupation.items) ?? [];
  }

  get pending(): number {
    return this.allItems.filter((item) => !this.gradeOf(item).grade).length;
  }

  private isComplete(item: ReviewItem): boolean {
    const value = this.gradeOf(item);
    return !!value.grade && (!detailRequired(value.grade) || !!value.detail.trim());
  }

  /** Ítems calificados de la sección abierta. */
  get sectionGraded(): number {
    return this.sectionItems.filter((item) => this.isComplete(item)).length;
  }

  /** «1. NOMBRE DE LA OCUPACIÓN» o, en las listas, «5. FUNCIONES 1» (el número es el del criterio). */
  itemTitle(item: ReviewItem): string {
    const label = this.translation.translate(item.labelKey);
    return item.n ? `${item.criterion}. ${label} ${item.n}` : `${item.criterion}. ${label}`;
  }

  /**
   * Ítems de una sección de lista agrupados por criterio, para pintarlos bajo un solo encabezado («5. Funciones»);
   * en Habilidades y Conocimientos, las «otras» que escribió el analista forman su propio grupo.
   */
  get sectionGroups(): ItemGroup[] {
    const groups: ItemGroup[] = [];
    for (const item of this.sectionItems) {
      const title = `${item.criterion}. ${this.translation.translate(item.labelKey)}`;
      const last = groups[groups.length - 1];
      if (last?.title === title) {
        last.items.push(item);
      } else {
        groups.push({ title, items: [item] });
      }
    }
    return groups;
  }

  trackGroup(_index: number, group: ItemGroup): string {
    return group.title;
  }

  /* ---------- Calificar ---------- */

  /** Opción elegida en el desplegable («-- Seleccione» la deja sin calificar). */
  setGrade(item: ReviewItem, grade: Grade): void {
    if (!this.editable) {
      return;
    }
    this.gradesById = { ...this.gradesById, [item.id]: { grade, detail: this.gradeOf(item).detail } };
    this.storeNotes();
    this.markDirty();
  }

  /** «Requiere ajuste» y «Con propuesta de mejora» exigen el comentario. */
  detailRequiredFor(item: ReviewItem): boolean {
    return detailRequired(this.gradeOf(item).grade);
  }

  setDetail(item: ReviewItem, detail: string): void {
    this.gradesById = { ...this.gradesById, [item.id]: { ...this.gradeOf(item), detail } };
    this.storeNotes();
    this.markDirty();
  }

  showDetailError(item: ReviewItem): boolean {
    const value = this.gradeOf(item);
    return this.submitAttempted && detailRequired(value.grade) && !value.detail.trim();
  }

  markDirty(): void {
    this.dirty = true;
    this.revision++;
    this.feedback = '';
    this.scheduleAutoSave();
  }

  /* ---------- Guardado automático ---------- */

  /** El botón dice «Cambios guardados»: no queda nada sin guardar de lo que ya está en el servidor. */
  get upToDate(): boolean {
    return !this.dirty && (this.everSaved || !!this.review?.hasSavedValidation);
  }

  private scheduleAutoSave(): void {
    if (!this.editable) {
      return;
    }
    this.cancelAutoSave();
    this.autoSaveTimer = setTimeout(() => this.autoSaveNow(), AUTO_SAVE_DELAY_MS);
  }

  private cancelAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /** Guarda el avance ya, si hay cambios; si otro guardado está en curso, lo intenta después. */
  private autoSaveNow(): void {
    this.cancelAutoSave();
    if (!this.editable || !this.dirty || !this.review) {
      return;
    }
    if (this.saving) {
      this.scheduleAutoSave();
      return;
    }
    this.persist(
      'en_revision',
      this.gradedItems,
      () => (this.feedback = this.t('validaciones.editor.autoSaved', { time: new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) })),
      true
    );
  }

  /** Guarda en este navegador los comentarios de ítems sin calificar (el servidor no los recibe). */
  private storeNotes(): void {
    const notes = Object.fromEntries(
      Object.entries(this.gradesById).filter(([, value]) => !value.grade && value.detail.trim()).map(([id, value]) => [id, value.detail])
    );
    try {
      const key = notesStorageKey(this.record, this.session.email);
      if (Object.keys(notes).length) {
        localStorage.setItem(key, JSON.stringify(notes));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // Sin almacenamiento, esos comentarios solo duran mientras el editor esté abierto.
    }
  }

  /** Al abrir, devuelve los comentarios respaldados a los ítems que siguen sin calificar en el servidor. */
  private restoreNotes(): void {
    let notes: Record<string, string> = {};
    try {
      notes = JSON.parse(localStorage.getItem(notesStorageKey(this.record, this.session.email)) ?? '{}') as Record<string, string>;
    } catch {
      return;
    }
    const known = new Set(this.allItems.map((item) => item.id));
    for (const [id, detail] of Object.entries(notes)) {
      if (known.has(id) && typeof detail === 'string' && !this.gradesById[id]?.grade) {
        this.gradesById[id] = { grade: '', detail };
      }
    }
  }

  private clearNotes(): void {
    try {
      localStorage.removeItem(notesStorageKey(this.record, this.session.email));
    } catch {
      // Nada que borrar.
    }
  }

  /* ---------- Datos generales ---------- */

  get municipalities(): SelectOption[] {
    const department = this.departments.find((item) => item.label === this.informant?.department);
    return department ? this.municipalitiesByDepartment[department.value] ?? [] : [];
  }

  onDepartmentChange(): void {
    this.informant.municipality = '';
    this.markDirty();
  }

  /** Departamentos y municipios se guardan por nombre; mientras carga el catálogo se ofrece el que ya traía la validación. */
  placeOptions(field: 'department' | 'municipality'): ComboOption[] {
    const items = field === 'department' ? this.departments : this.municipalities;
    const saved = this.informant?.[field] ?? '';
    const names = items.length ? items.map((item) => item.label) : saved ? [saved] : [];
    return comboOptions(names, (name) => name);
  }

  /**
   * Las calificaciones con su color: Aplica verde, No aplica rojo y Propuesta de mejora azul. Un ítem guardado antes
   * con «Requiere ajuste» (naranja) la conserva entre sus opciones, para que se vea y se pueda cambiar.
   */
  gradeOptions(item: ReviewItem): ComboOption[] {
    const current = this.gradeOf(item).grade;
    const grades = current && !this.grades.includes(current) ? [...this.grades, current] : this.grades;
    return comboOptions(grades, (grade) => grade, (grade) => this.t(`validaciones.grade.${grade}`)).map((option) => ({
      ...option,
      tone: GRADE_TONES[option.value as Exclude<Grade, ''>]
    }));
  }

  get today(): string {
    return displayDate(new Date().toISOString());
  }

  /* ---------- Guardar ---------- */

  /** «Guardar cambios»: el avance, con lo calificado hasta ahora; el instrumento sigue «Recibido». */
  saveProgress(): void {
    if (!this.editable || this.saving) {
      return;
    }
    this.cancelAutoSave();
    const items = this.gradedItems;
    this.persist('en_revision', items, () => {
      this.feedback = this.t('validaciones.editor.progressSaved', { done: items.length, total: this.allItems.length });
      this.toast.success(this.t('validaciones.editor.toastProgress'));
    });
  }

  /** Lo que el servidor recibe: los ítems con «Opción». */
  private get gradedItems(): ReviewItem[] {
    return this.allItems.filter((item) => this.gradeOf(item).grade);
  }

  /** «Enviar definitivamente»: todo calificado y con su detalle; si falta algo, lleva al primero. */
  requestSend(): void {
    if (!this.editable || this.saving) {
      return;
    }
    this.cancelAutoSave();
    this.submitAttempted = true;
    // El servidor exige los datos del informante para cerrar un Instrumento 2: se avisa antes.
    if (this.record.kind === 'I2' && REQUIRED_INFORMANT_FIELDS.some((field) => !this.informant[field].trim())) {
      this.feedback = this.t('validaciones.editor.informantMissing');
      this.selectSection('general', false);
      this.toast.warning(this.feedback);
      return;
    }
    const missing = this.firstIncomplete();
    if (missing) {
      const pending = this.pending;
      this.feedback = pending
        ? this.t(pending === 1 ? 'validaciones.editor.pendingOne' : 'validaciones.editor.pendingMany', { count: pending })
        : this.t('validaciones.editor.detailMissing');
      this.goTo(missing);
      this.toast.warning(this.feedback);
      return;
    }
    this.confirmSendOpen = true;
  }

  /** Veredicto que resultará al enviar (para explicarlo en la confirmación). */
  get verdict(): Exclude<Verdict, 'en_revision'> {
    return derivedVerdict(this.allItems.map((item) => this.gradeOf(item)));
  }

  /** Envío definitivo ya confirmado: guarda con el veredicto calculado y cierra el editor. */
  confirmSend(): void {
    if (this.saving) {
      return;
    }
    this.cancelAutoSave();
    this.confirmSendOpen = false;
    const verdict = this.verdict;
    this.persist(verdict, this.allItems, () => {
      this.clearNotes();
      this.toast.success(this.t(verdict === 'aprobada' ? 'validaciones.editor.toastApproved' : 'validaciones.editor.toastAdjustments'));
      this.closed.emit();
    });
  }

  /**
   * Guarda la validación (avance o definitiva) con el informante, las observaciones, las calificaciones y las propuestas de área y
   * descripción. Lo que está en pantalla no se toca: si se editó mientras se guardaba, queda pendiente para el siguiente
   * guardado. `quiet` (guardado automático) no avisa a la bandeja ni muestra el aviso de éxito.
   */
  private persist(verdict: Verdict, items: ReviewItem[], done: () => void, quiet = false, failed: () => void = () => undefined): void {
    const revision = this.revision;
    this.saving = true;
    this.feedback = '';
    this.service
      .save(this.record, {
        verdict,
        informant: this.informant,
        observations: this.observations,
        items: items.map((item) => ({ ...item, ...this.gradeOf(item) })),
        proposals: this.proposals()
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.everSaved = true;
          this.closeSaveFailed = false;
          this.dirty = this.revision !== revision;
          if (!quiet) {
            this.saved.emit();
          }
          done();
          if (this.dirty) {
            this.scheduleAutoSave();
          }
        },
        error: (error: unknown) => {
          this.saving = false;
          this.feedback = this.errorMessage(error);
          this.toast.error(this.feedback);
          failed();
        }
      });
  }

  /**
   * Propuestas que viajan: el área o la descripción de cada ocupación que difieren de lo que envió el
   * analista. Van todas cada vez, porque guardar reemplaza lo que este experto tenía guardado.
   */
  private proposals(): OccupationProposal[] {
    return (this.review?.occupations ?? [])
      .filter((occupation) => occupation.adjustable)
      .map((occupation) => {
        const edited = this.adjustments[occupation.copyCode];
        const proposal: OccupationProposal = { occupationCode: occupation.copyCode };
        if (edited && edited.area.trim() !== occupation.area) {
          proposal.area = edited.area.trim();
        }
        if (edited && edited.description.trim() !== occupation.description) {
          proposal.description = edited.description.trim();
        }
        return proposal;
      })
      .filter((proposal) => proposal.area !== undefined || proposal.description !== undefined);
  }

  /** Texto para el error de guardado: el mensaje del servidor si lo dio, o la explicación del código de error. */
  private errorMessage(error: unknown): string {
    if (error instanceof ReviewError) {
      if (error.message === REVIEW_INVALID && error.serverMessage) {
        return error.serverMessage;
      }
      if (error.message === REVIEW_NOT_SENT) {
        return this.t('validaciones.editor.notSent');
      }
      if (error.message === REVIEW_FORBIDDEN) {
        return this.t('validaciones.editor.forbidden');
      }
    }
    return this.t('validaciones.editor.saveError');
  }

  /** Primer ítem sin calificar o sin su detalle obligatorio, en el orden de la pantalla. */
  private firstIncomplete(): { occupation: number; item: ReviewItem } | null {
    const occupations = this.review?.occupations ?? [];
    for (let index = 0; index < occupations.length; index++) {
      for (const section of SECTIONS) {
        const item = occupations[index].items.find((candidate) => candidate.section === section && !this.isComplete(candidate));
        if (item) {
          return { occupation: index, item };
        }
      }
    }
    return null;
  }

  private goTo(target: { occupation: number; item: ReviewItem }): void {
    this.occupationIndex = target.occupation;
    this.section = target.item.section;
    setTimeout(() => this.host.nativeElement.querySelector(`[data-item="${CSS.escape(target.item.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  private scrollContentTop(): void {
    setTimeout(() => this.host.nativeElement.querySelector('.vx-content')?.scrollTo({ top: 0 }));
  }

  /* ---------- Cerrar ---------- */

  /**
   * Cerrar con cambios sin guardar los guarda y cierra. Si no se pueden guardar (p. ej. sin conexión), se queda abierto,
   * explica el error y la siguiente vez pide confirmación para cerrar sin guardar.
   */
  requestClose(): void {
    if (this.saving) {
      return;
    }
    if (this.dirty && this.editable && !this.closeSaveFailed) {
      this.cancelAutoSave();
      this.persist('en_revision', this.gradedItems, () => this.closed.emit(), true, () => (this.closeSaveFailed = true));
      return;
    }
    if (this.dirty && this.editable) {
      this.confirmCloseOpen = true;
      return;
    }
    this.closed.emit();
  }

  confirmClose(): void {
    this.confirmCloseOpen = false;
    this.closed.emit();
  }

  /** Título de la ventana: «Validación de 2 ocupaciones» o el nombre de la única ocupación. */
  get title(): string {
    const count = this.review?.occupations.length ?? this.record.occupations.length;
    return count > 1 ? this.t('validaciones.editor.titleMany', { count }) : this.t('validaciones.editor.titleOne');
  }

  trackItem(_index: number, item: ReviewItem): string {
    return item.id;
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }
}

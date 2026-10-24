import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, EventEmitter, Output, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DialogDirective } from '../../../shared/dialog/dialog.directive';
import { TranslationService } from '../../../shared/i18n/translation.service';
import {
  FileColumn,
  FileReview,
  MAX_ERROR_ROWS,
  MAX_RESULT_LINES,
  SheetOutcome,
  TemplateType,
  TypeStatus,
  UPLOAD_EXTENSIONS,
  UPLOAD_ICONS,
  UPLOAD_MAX_MB,
  UploadResult,
  UploadType,
  Verdict,
  fileSize,
  isExcelName,
  reviewBlocks,
  sumResults,
  uploadOrder,
  verdictOf
} from './carga-cno.model';
import { ActualizacionCnoService, serverErrorText } from '../actualizacion-cno.service';
import { Classification, ClassificationContext, ClassTranslatePipe, classKey } from '../clasificacion';

/** Pantallas del modal: el formulario, la carga en curso, el resultado y el error. */
type Screen = 'form' | 'loading' | 'done' | 'error';

/**
 * "Cargar información CNO": copia del modal de la versión desplegada. A la
 * izquierda se elige qué cargar (todo el archivo o un tipo), se descarga la
 * plantilla oficial y se adjunta el Excel; a la derecha se ve la revisión del
 * servidor (`/validar`, no guarda nada) con sus columnas, vista previa y
 * errores. "Cargar información" sube el archivo; "Todo el archivo" carga los
 * cinco tipos uno tras otro contra el mismo Excel.
 */
@Component({
  selector: 'app-carga-cno',
  standalone: true,
  imports: [CommonModule, FormsModule, ClassTranslatePipe, DialogDirective],
  templateUrl: './carga-cno.component.html',
  styleUrl: './carga-cno.component.css'
})
export class CargaCnoComponent {
  private readonly service = inject(ActualizacionCnoService);
  private readonly translationService = inject(TranslationService);
  /** CNO o CUOC: la de la vista que abre la carga (sin vista, CNO). */
  readonly classification: Classification = inject(ClassificationContext, { optional: true })?.value ?? 'cno';
  private readonly destroyRef = inject(DestroyRef);

  /** Se cargó algo (aunque sea en parte): la vista vuelve a pedir sus listas. */
  @Output() readonly loaded = new EventEmitter<void>();
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  readonly types = uploadOrder(this.classification);
  readonly icons = UPLOAD_ICONS;
  readonly extensions = UPLOAD_EXTENSIONS.join(', ');
  readonly maxMb = UPLOAD_MAX_MB;
  readonly maxErrorRows = MAX_ERROR_ROWS;
  readonly maxResultLines = MAX_RESULT_LINES;

  screen: Screen = 'form';

  /** `null` con "Todo el archivo" o sin elegir. */
  type: UploadType | null = null;
  wholeFile = false;
  file: File | null = null;
  fileError = '';
  dragging = false;

  review: FileReview | null = null;
  reviewing = false;
  private reviewRequest?: Subscription;

  /** Correcciones de «Configurar»: encabezado del archivo → campo del sistema. */
  mapping: Record<string, string> = {};
  /** Columna que se está configurando y el campo elegido. */
  configuring: string | null = null;
  configuringField = '';

  showColumns = false;
  showPreview = false;
  showErrors = false;

  downloadingTemplate = false;
  templateError = '';

  progress = 0;
  progressKey = '';
  loadError = '';
  result: UploadResult | null = null;
  statuses: TypeStatus[] = [];
  /** Hoja del resultado que está desplegada. */
  openSheet: number | null = null;

  // ---------- Elegir qué cargar ----------

  get chosen(): boolean {
    return this.wholeFile || this.type !== null;
  }

  /** "Todo el archivo": carga los cinco tipos con el mismo Excel, así que no hay revisión previa por tipo. */
  chooseWhole(): void {
    if (this.wholeFile) return;
    this.wholeFile = true;
    this.type = null;
    this.resetReview();
  }

  /** Elige un solo tipo; si ya hay un Excel válido, el servidor lo vuelve a revisar para ese tipo. */
  chooseType(type: UploadType): void {
    if (this.type === type) return;
    this.wholeFile = false;
    this.type = type;
    this.resetReview();
    if (this.file && !this.fileError) {
      this.runReview();
    }
  }

  typeLabel(type: UploadType): string {
    return this.t(`cargaCno.type.${type}`);
  }

  /** Columnas obligatorias del tipo elegido (para la caja de la plantilla). */
  get requiredColumns(): string {
    return this.type ? this.t(`cargaCno.required.${this.type}`) : '';
  }

  // ---------- Plantilla ----------

  get templateType(): TemplateType | null {
    return this.wholeFile ? 'completa' : this.type;
  }

  get templateLabel(): string {
    if (this.wholeFile) return this.t('cargaCno.downloadWhole');
    return this.type ? this.t('cargaCno.downloadType', { type: this.typeLabel(this.type) }) : this.t('cargaCno.download');
  }

  /** Descarga la plantilla oficial del tipo elegido (del servidor o, si no la tiene, la guardada en assets). */
  downloadTemplate(): void {
    const type = this.templateType;
    if (!type || this.downloadingTemplate) return;
    this.downloadingTemplate = true;
    this.templateError = '';
    this.service
      .template(type, this.classification)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingTemplate = false;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Plantilla_${this.classification.toUpperCase()}_${type}.xlsx`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url));
        },
        error: () => {
          this.downloadingTemplate = false;
          this.templateError = this.t('cargaCno.templateError');
        }
      });
  }

  // ---------- Archivo ----------

  openPicker(): void {
    this.fileInput?.nativeElement.click();
  }

  /** Archivo elegido con "Buscar". Se limpia el input para poder volver a elegir el mismo archivo. */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) this.receive(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
  }

  /** Archivo soltado sobre la zona de arrastre. */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.receive(file);
  }

  removeFile(): void {
    this.file = null;
    this.fileError = '';
    this.resetReview();
  }

  get fileSizeLabel(): string {
    return this.file ? fileSize(this.file.size) : '';
  }

  /** Revisa el nombre y el tamaño y, si ya se eligió un tipo, pide la revisión al servidor. */
  receive(file: File): void {
    this.resetReview();
    this.file = file;
    if (!isExcelName(file.name)) {
      this.fileError = this.t('cargaCno.errorNotExcel', { extensions: this.extensions });
      return;
    }
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
      this.fileError = this.t('cargaCno.errorTooBig', { size: fileSize(file.size), max: UPLOAD_MAX_MB });
      return;
    }
    this.fileError = '';
    if (this.type) {
      this.runReview();
    }
  }

  // ---------- Revisión (no guarda nada) ----------

  /** Descarta la revisión anterior (y la petición en curso) al cambiar de tipo o de archivo. */
  private resetReview(): void {
    this.reviewRequest?.unsubscribe();
    this.review = null;
    this.reviewing = false;
    this.mapping = {};
    this.configuring = null;
    this.showColumns = this.showPreview = this.showErrors = false;
    if (this.file && isExcelName(this.file.name) && this.file.size <= UPLOAD_MAX_MB * 1024 * 1024) {
      this.fileError = '';
    }
  }

  /** Pide al servidor que revise el Excel sin guardar nada: columnas, vista previa y filas con error. */
  private runReview(): void {
    const type = this.type;
    const file = this.file;
    if (!type || !file) return;
    this.reviewRequest?.unsubscribe();
    this.reviewing = true;
    this.review = null;
    this.reviewRequest = this.service
      .reviewUpload(type, file, this.mapping, this.classification)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (review) => {
          this.reviewing = false;
          this.review = review;
          // Las correcciones de columnas que ya no existen en el archivo se olvidan.
          const headers = new Set(review.allColumns.map((column) => column.header));
          this.mapping = Object.fromEntries(Object.entries(this.mapping).filter(([header]) => headers.has(header)));
        },
        error: (error: unknown) => {
          this.reviewing = false;
          this.fileError = serverErrorText(error) || this.t('cargaCno.reviewError');
        }
      });
  }

  /** "ok", "aviso" (hay filas con error) o "error" (no se puede cargar). */
  get reviewState(): 'ok' | 'warning' | 'error' {
    if (this.fileError || !this.review) return 'error';
    if (reviewBlocks(this.review)) return 'error';
    return this.review.invalidRecords > 0 ? 'warning' : 'ok';
  }

  /** Mensaje de la revisión: por qué no se puede cargar, o el que dio el servidor. */
  get reviewMessage(): string {
    const review = this.review;
    if (!review) return '';
    if (review.missingColumns.length) {
      const parts = [this.t('cargaCno.notThisType', { type: this.type ? this.typeLabel(this.type) : '' }), this.t('cargaCno.missing', { columns: review.missingColumns.join(', ') })];
      if (review.looksLike) parts.push(this.t('cargaCno.looksLike', { type: this.typeLabel(review.looksLike) }));
      return parts.join(' ');
    }
    if (review.totalRecords === 0) return review.message || this.t('cargaCno.noRows');
    return review.invalidRecords > 0 ? review.message : this.t('cargaCno.reviewOk', { count: review.totalRecords });
  }

  get unmappedColumns(): FileColumn[] {
    return this.review?.allColumns.filter((column) => !column.mapped) ?? [];
  }

  get mappedCount(): number {
    return this.review?.allColumns.filter((column) => column.mapped).length ?? 0;
  }

  /** Campos del sistema a los que se puede asignar una columna que no corresponde. */
  get assignableFields(): { key: string; name: string }[] {
    const review = this.review;
    if (!review) return [];
    const taken = new Set(review.allColumns.filter((column) => column.mapped).map((column) => column.mappedTo));
    return review.columns.filter((column) => !taken.has(column.key)).map((column) => ({ key: column.key, name: column.name }));
  }

  /** La asignación de esa columna la hizo quien carga (en «Configurar»). */
  isManual(column: FileColumn): boolean {
    return column.header in this.mapping;
  }

  toggleConfigure(header: string): void {
    this.configuring = this.configuring === header ? null : header;
    this.configuringField = '';
  }

  /** "Configurar": asigna a mano una columna del Excel al campo elegido y vuelve a revisar con ese mapeo. */
  assign(header: string): void {
    if (!this.configuringField) return;
    this.mapping = { ...this.mapping, [header]: this.configuringField };
    this.configuring = null;
    this.runReview();
  }

  unassign(header: string): void {
    const { [header]: _removed, ...rest } = this.mapping;
    this.mapping = rest;
    this.runReview();
  }

  get shownErrors(): FileReview['errors'] {
    return this.review?.errors.slice(0, MAX_ERROR_ROWS) ?? [];
  }

  // ---------- Cargar ----------

  get canLoad(): boolean {
    if (!this.file || this.fileError || this.reviewing || this.screen === 'loading') return false;
    if (this.wholeFile) return true;
    return !!this.type && !!this.review && !reviewBlocks(this.review);
  }

  /** Lo que falta para poder cargar, debajo del archivo. */
  get pendingHint(): string {
    if (!this.chosen) return this.t('cargaCno.chooseFirst');
    if (!this.file) return this.t('cargaCno.attachFile');
    return '';
  }

  /** Carga el Excel. Con "Todo el archivo" recorre los cinco tipos en orden y sigue aunque uno falle. */
  load(): void {
    if (!this.canLoad || !this.file) return;
    if (this.wholeFile) {
      this.statuses = this.types.map((type) => ({ type, state: 'pending' }));
      this.startLoading();
      this.loadNext(this.file, 0);
      return;
    }
    const type = this.type!;
    this.statuses = [];
    this.startLoading();
    this.service
      .upload(type, this.file, this.mapping, this.classification)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (step) => {
          this.progress = step.progress;
          this.progressKey = step.messageKey;
          if (step.done && step.result) {
            this.result = step.result;
            this.screen = 'done';
            this.loaded.emit();
          }
        },
        error: (error: unknown) => {
          this.loadError = this.errorText(error);
          this.screen = 'error';
        }
      });
  }

  /** Pasa a la pantalla de avance y limpia el resultado de una carga anterior. */
  private startLoading(): void {
    this.screen = 'loading';
    this.progress = 0;
    this.progressKey = 'cargaCno.progressPreparing';
    this.loadError = '';
    this.result = null;
    this.openSheet = null;
  }

  /** "Todo el archivo": carga los cinco tipos en orden; si uno falla, sigue con los demás. */
  private loadNext(file: File, index: number): void {
    if (index >= this.types.length) {
      const results = this.statuses.filter((status) => status.result).map((status) => status.result!);
      this.result = sumResults(results);
      this.screen = 'done';
      if (results.length) this.loaded.emit();
      return;
    }
    const type = this.types[index];
    this.setStatus(type, { state: 'loading' });
    this.currentType = type;
    this.service
      .upload(type, file, {}, this.classification)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (step) => {
          this.progress = Math.round(((index + step.progress / 100) / this.types.length) * 100);
          this.progressKey = step.messageKey;
          if (step.done) {
            this.setStatus(type, step.result ? { state: 'ok', result: step.result } : { state: 'error', error: this.t('cargaCno.loadError') });
            this.loadNext(file, index + 1);
          }
        },
        error: (error: unknown) => {
          this.setStatus(type, { state: 'error', error: this.errorText(error) });
          this.loadNext(file, index + 1);
        }
      });
  }

  /** Tipo que se está cargando con "Todo el archivo" (para el mensaje de avance). */
  currentType: UploadType | null = null;

  private setStatus(type: UploadType, change: Partial<TypeStatus>): void {
    this.statuses = this.statuses.map((status) => (status.type === type ? { ...status, ...change } : status));
  }

  get verdict(): Verdict | null {
    return this.result ? verdictOf(this.result) : null;
  }

  /** Detalle por hoja: solo las que tienen algo que contar. */
  get sheets(): SheetOutcome[] {
    return this.result?.sheets.filter((sheet) => sheet.errors.length || sheet.warnings.length || sheet.skippedDetails.length || sheet.unreadable) ?? [];
  }

  toggleSheet(index: number): void {
    this.openSheet = this.openSheet === index ? null : index;
  }

  retry(): void {
    this.screen = 'form';
    this.loadError = '';
    this.progress = 0;
  }

  close(): void {
    if (this.screen !== 'loading') {
      this.closed.emit();
    }
  }

  formatNumber(value: number): string {
    return value.toLocaleString('es-CO');
  }

  private errorText(error: unknown): string {
    return serverErrorText(error) || this.t('cargaCno.loadError');
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translationService.translate(classKey(this.classification, key), params);
  }
}

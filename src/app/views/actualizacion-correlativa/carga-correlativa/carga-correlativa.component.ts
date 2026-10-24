import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, EventEmitter, Output, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { DialogDirective } from '../../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { CORRELATIVE_UPLOAD_TYPES, CorrelativeUploadResult, CorrelativeUploadType } from '../actualizacion-correlativa.model';
import { ActualizacionCorrelativaService, CorrelativeError, UPLOAD_REJECTED } from '../actualizacion-correlativa.service';
import { FileAnalysis, SheetRows, analyzeSheets, readSheets } from './carga-correlativa.excel';

/** Tamaño máximo que acepta el servidor (50 MB). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Íconos de cada tipo (trazos SVG). */
const TYPE_ICONS: Record<CorrelativeUploadType, string> = {
  denominacion: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8',
  ocupacion: 'M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  conocimiento: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'
};

/**
 * Pasos: elegir tipo, elegir el archivo (explorador abierto), leerlo, revisarlo (vista previa) o
 * rechazarlo por no corresponder al tipo, cargar y ver el resultado.
 */
type Step = 'type' | 'file' | 'reading' | 'invalid' | 'confirm' | 'loading' | 'result';

/**
 * «Cargar Excel» de la correlativa (copia del modal de la versión desplegada): «¿Qué deseas
 * cargar?» con Denominación, Ocupación y Conocimiento, y la plantilla oficial de cada uno. Al elegir
 * el tipo se abre el explorador; el Excel se lee en el navegador (`carga-correlativa.excel.ts`):
 * registros encontrados y hoja, columnas que no se cargarán y vista previa, o el aviso de que no
 * corresponde (con «Cargar como …» si parece de otro tipo). El servidor vuelve a validar al
 * recibirlo y REEMPLAZA toda la tabla de ese tipo, por eso se avisa antes de cargar.
 */
@Component({
  selector: 'app-carga-correlativa',
  standalone: true,
  imports: [CommonModule, TranslatePipe, DialogDirective],
  templateUrl: './carga-correlativa.component.html',
  styleUrl: './carga-correlativa.component.css'
})
export class CargaCorrelativaComponent {
  private readonly service = inject(ActualizacionCorrelativaService);
  private readonly translation = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  @Output() closed = new EventEmitter<void>();
  /** Se cargó un archivo: la pantalla vuelve a pedir las relaciones. */
  @Output() uploaded = new EventEmitter<CorrelativeUploadType>();

  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  readonly types = CORRELATIVE_UPLOAD_TYPES;
  readonly icons = TYPE_ICONS;

  step: Step = 'type';
  type: CorrelativeUploadType | null = null;
  file: File | null = null;
  fileError = '';
  uploadError = '';
  progress = 0;
  progressKey = '';
  result: CorrelativeUploadResult | null = null;
  showDetail = false;
  downloadingTemplate: CorrelativeUploadType | null = null;
  templateError = '';
  /** Revisión del archivo en el navegador; null mientras no se ha leído o si no se pudo leer. */
  analysis: FileAnalysis | null = null;
  /** El archivo no se pudo leer como Excel. */
  readError = false;
  private sheets: SheetRows = [];
  private upload?: Subscription;

  /** Se puede cargar si están las columnas obligatorias y hay al menos una fila con datos. */
  get canUpload(): boolean {
    return !!this.analysis?.ok && this.analysis.totalRows > 0;
  }

  /** Elegir el tipo abre el explorador de archivos (desde el mismo clic, como pide el navegador). */
  chooseType(type: CorrelativeUploadType): void {
    this.type = type;
    this.fileError = '';
    this.step = 'file';
    this.fileInput?.nativeElement.click();
  }

  /** Revisa el Excel en el navegador (tipo, tamaño, encabezados y filas) antes de dejarlo cargar. */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file || !this.type) {
      return;
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      this.fileError = this.t('actualizacionCorrelativa.fileNotExcel');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.fileError = this.t('actualizacionCorrelativa.fileTooLarge');
      return;
    }
    this.file = file;
    this.fileError = '';
    this.uploadError = '';
    this.readError = false;
    this.analysis = null;
    this.step = 'reading';
    try {
      this.sheets = await readSheets(file);
      this.review(this.type);
    } catch {
      this.sheets = [];
      this.readError = true;
      this.step = 'invalid';
    }
  }

  /** Revisa las hojas ya leídas contra un tipo y pasa a la vista previa o al aviso de archivo no válido. */
  private review(type: CorrelativeUploadType): void {
    this.type = type;
    this.analysis = analyzeSheets(this.sheets, type);
    this.step = this.analysis.ok ? 'confirm' : 'invalid';
  }

  /** «Cargar como …»: el archivo cumple las columnas de otro tipo. */
  useSuggestedType(): void {
    const suggested = this.analysis?.looksLike;
    if (suggested) {
      this.uploadError = '';
      this.review(suggested);
    }
  }

  changeFile(): void {
    this.fileInput?.nativeElement.click();
  }

  /** Vuelve al paso "¿Qué deseas cargar?" y olvida el archivo elegido. */
  changeType(): void {
    this.step = 'type';
    this.type = null;
    this.file = null;
    this.analysis = null;
    this.sheets = [];
    this.readError = false;
    this.fileError = '';
    this.uploadError = '';
  }

  /** Sube el Excel. Reemplaza toda la correlativa de ese tipo, por eso se avisa antes. */
  start(): void {
    const { type, file } = this;
    if (!type || !file || this.step !== 'confirm' || !this.canUpload) {
      return;
    }
    this.step = 'loading';
    this.progress = 0;
    this.progressKey = 'actualizacionCorrelativa.progressUploading';
    this.uploadError = '';
    this.upload = this.service
      .upload(type, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => {
          this.progress = state.progress;
          this.progressKey = state.messageKey;
          if (state.done && state.result) {
            this.result = state.result;
            this.step = 'result';
            this.uploaded.emit(type);
          }
        },
        error: (error: unknown) => {
          this.step = 'confirm';
          this.uploadError =
            error instanceof CorrelativeError && error.message === UPLOAD_REJECTED && error.serverMessage
              ? error.serverMessage
              : this.t('actualizacionCorrelativa.uploadFailed');
        }
      });
  }

  /** Descarga la plantilla del tipo (del servidor o, si no la tiene, la guardada en assets). */
  downloadTemplate(type: CorrelativeUploadType): void {
    if (this.downloadingTemplate) {
      return;
    }
    this.downloadingTemplate = type;
    this.templateError = '';
    this.service
      .template(type)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadingTemplate = null;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Plantilla_Correlativa_${type}.xlsx`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url));
        },
        error: () => {
          this.downloadingTemplate = null;
          this.templateError = this.t('actualizacionCorrelativa.templateError');
        }
      });
  }

  /** Una carga en curso no se abandona. */
  close(): void {
    if (this.step === 'loading' || this.step === 'reading') {
      return;
    }
    this.upload?.unsubscribe();
    this.closed.emit();
  }

  /** Títulos de las columnas obligatorias que faltan, separados por comas. */
  missingLabels(): string {
    return (this.analysis?.missing ?? []).map((column) => this.t(column.labelKey)).join(', ');
  }

  format(value: number): string {
    return value.toLocaleString('es-CO');
  }

  get hasDetail(): boolean {
    return !!this.result && this.result.errors.length + this.result.skippedDetails.length + this.result.warnings.length > 0;
  }

  private t(key: string): string {
    return this.translation.translate(key);
  }
}

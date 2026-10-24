import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { DialogDirective } from '../../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { criterionTitle } from '../reportes.export';
import { ReportCriterion, ReportOccupation, ReportRecord, dateTime } from '../reportes.model';

/**
 * Detalle de un envío del Resumen (clic en una fila de «Reporte completo»; copia de la desplegada):
 * «Instrumento 2 · Agrupación N», las ocupaciones validadas juntas como pestañas y, de la elegida,
 * una tabla de una fila con los datos del envío, del informante, de la ocupación y una columna por
 * criterio con su calificación, el valor validado y el comentario del experto.
 */
@Component({
  selector: 'app-reporte-detalle',
  standalone: true,
  imports: [CommonModule, TranslatePipe, DialogDirective],
  templateUrl: './reporte-detalle.component.html',
  styleUrl: './reporte-detalle.component.css'
})
export class ReporteDetalleComponent implements OnInit, AfterViewInit {
  private readonly translation = inject(TranslationService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  @Input({ required: true }) record!: ReportRecord;
  /** Criterio al que hay que llevar (clic en un cuadro del mapa de Fichas): abre su ocupación y resalta su columna. */
  @Input() focusCriterion: string | null = null;
  @Output() closed = new EventEmitter<void>();

  readonly dateTime = dateTime;
  occupationIndex = 0;

  /** Si se llegó desde un cuadro del mapa de Fichas, abre la ocupación de ese criterio. */
  ngOnInit(): void {
    if (this.focusCriterion) {
      const index = this.record.occupations.findIndex((occupation) => occupation.criteria.some((criterion) => criterion.id === this.focusCriterion));
      this.occupationIndex = Math.max(0, index);
    }
  }

  /** Desplaza la tabla hasta la columna del criterio elegido para que se vea centrada. */
  ngAfterViewInit(): void {
    if (!this.focusCriterion) {
      return;
    }
    setTimeout(() => {
      const cell = this.host.nativeElement.querySelector<HTMLElement>(`th[data-criterion="${CSS.escape(this.focusCriterion ?? '')}"]`);
      cell?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
  }

  isFocused(criterion: ReportCriterion): boolean {
    return criterion.id === this.focusCriterion;
  }

  get occupation(): ReportOccupation | null {
    return this.record.occupations[this.occupationIndex] ?? null;
  }

  /** Datos del envío y del informante, en el orden de la desplegada. */
  get fixedCells(): Array<{ key: string; value: string }> {
    const record = this.record;
    return [
      { key: 'kind', value: this.translation.translate(`reportes.kind.${record.kind}`) },
      { key: 'startedAt', value: dateTime(record.startedAt) },
      { key: 'finishedAt', value: dateTime(record.finishedAt) },
      { key: 'date', value: dateTime(record.date) },
      { key: 'fullName', value: record.fullName },
      { key: 'email', value: record.email },
      { key: 'phone', value: record.phone },
      { key: 'department', value: record.department },
      { key: 'city', value: record.city },
      { key: 'company', value: record.company },
      { key: 'position', value: record.position },
      { key: 'profession', value: record.profession },
      { key: 'sector', value: record.sector }
    ];
  }

  title(criterion: ReportCriterion): string {
    return criterionTitle(criterion, (key) => this.translation.translate(key));
  }

  trackCriterion(_index: number, criterion: ReportCriterion): string {
    return criterion.id;
  }
}

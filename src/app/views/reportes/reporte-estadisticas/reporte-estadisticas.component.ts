import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { exportRecords } from '../reportes.export';
import { BASE_THRESHOLD, CriterionFamily, CriterionState, ReportRecord, allCriteria } from '../reportes.model';

/** Componentes que se analizan, en el orden de la versión desplegada. */
const COMPONENTS: readonly CriterionFamily[] = ['description', 'functions', 'denominations', 'related', 'skills', 'knowledge'];

/** Leyenda del componente: calificación, color (los tres estados del sistema más azul y gris). */
const LEGEND: ReadonlyArray<{ state: CriterionState; color: string }> = [
  { state: 'aplica', color: 'var(--state-ok-fg)' },
  { state: 'parcial', color: 'var(--state-warn-accent)' },
  { state: 'requiere_ajuste', color: 'var(--state-warn-fg)' },
  { state: 'no_aplica', color: 'var(--state-error-fg)' },
  { state: 'sin_dato', color: 'var(--neutral-400)' }
];

/** Circunferencia del anillo (r = 15.915 → 100), para dibujar porcentajes con `stroke-dasharray`. */
const RING = 100;

/**
 * «Estadísticas & Gráficas de Evaluación» del Resumen (copia de la desplegada): total evaluado, tasa
 * de aprobación y coincidencia con el umbral base del 60 %; por componente (Descripción, Funciones,
 * Denominaciones…), un anillo con la distribución de sus calificaciones y el cumplimiento base de
 * cada uno; y la descarga a Excel de los registros que alcanzan el umbral. La desplegada buscaba
 * cada componente por una clave que los criterios no tienen (siempre salía «Sin dato»): aquí se
 * cuentan los criterios reales de cada familia.
 */
@Component({
  selector: 'app-reporte-estadisticas',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, DialogDirective],
  templateUrl: './reporte-estadisticas.component.html',
  styleUrl: './reporte-estadisticas.component.css'
})
export class ReporteEstadisticasComponent {
  private readonly translation = inject(TranslationService);
  private readonly toast = inject(ToastService);

  @Input({ required: true }) records: ReportRecord[] = [];
  @Output() closed = new EventEmitter<void>();

  readonly components = COMPONENTS;
  readonly threshold = BASE_THRESHOLD;
  component: CriterionFamily = 'description';
  exporting = false;

  get total(): number {
    return this.records.length;
  }

  /** Aprobados: «Aprobado» o «Con mejoras», o con coincidencia de al menos el 60 % (regla de la desplegada). */
  get approved(): number {
    return this.records.filter((record) => record.evaluation === 'aprobado' || record.evaluation === 'con_mejoras' || record.score >= BASE_THRESHOLD).length;
  }

  get inThreshold(): number {
    return this.records.filter((record) => record.score >= BASE_THRESHOLD).length;
  }

  percent(part: number, whole = this.total): number {
    return whole ? Math.round((part / whole) * 100) : 0;
  }

  /** Distribución de las calificaciones de un componente, contando sus criterios en todos los registros. */
  distribution(family: CriterionFamily): Array<{ state: CriterionState; color: string; count: number; percent: number }> {
    const criteria = this.records.flatMap((record) => allCriteria(record).filter((item) => item.family === family));
    return LEGEND.map(({ state, color }) => {
      const count = criteria.filter((item) => item.state === state).length;
      return { state, color, count, percent: this.percent(count, criteria.length) };
    });
  }

  get legend() {
    return this.distribution(this.component);
  }

  /** Segmentos del anillo: cada calificación con su porción y su desplazamiento. */
  get segments(): Array<{ color: string; dash: string; offset: number }> {
    let start = 0;
    return this.legend
      .filter((item) => item.percent > 0)
      .map((item) => {
        const segment = { color: item.color, dash: `${item.percent} ${RING - item.percent}`, offset: 25 - start };
        start += item.percent;
        return segment;
      });
  }

  /** Cumplimiento base de un componente: sus criterios en «Aplica» o «Parcial». */
  compliance(family: CriterionFamily): number {
    const parts = this.distribution(family);
    const criteria = parts.reduce((sum, item) => sum + item.count, 0);
    const passing = parts.filter((item) => item.state === 'aplica' || item.state === 'parcial').reduce((sum, item) => sum + item.count, 0);
    return this.percent(passing, criteria);
  }

  /** Descarga en Excel los envíos con coincidencia de al menos el umbral base (60 %). */
  async exportThreshold(): Promise<void> {
    const rows = this.records.filter((record) => record.score >= BASE_THRESHOLD);
    if (!rows.length) {
      this.toast.warning(this.translation.translate('reportes.stats.exportEmpty'));
      return;
    }
    this.exporting = true;
    try {
      await exportRecords(rows, (key, params) => this.translation.translate(key, params), `Resumen_umbral_${BASE_THRESHOLD}_${new Date().toISOString().slice(0, 10)}`, true);
    } catch {
      this.toast.error(this.translation.translate('reportes.exportError'));
    } finally {
      this.exporting = false;
    }
  }
}

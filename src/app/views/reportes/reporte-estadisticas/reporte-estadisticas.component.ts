import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { ComboOption, FilterComboboxComponent, comboOptions } from '../../../shared/ui/filter-combobox.component';
import { exportRecords } from '../reportes.export';
import { BASE_THRESHOLD, CriterionFamily, CriterionState, ReportRecord, allCriteria } from '../reportes.model';

/** Componentes que se analizan, en el orden de la versión desplegada. */
const COMPONENTS: readonly CriterionFamily[] = ['description', 'functions', 'denominations', 'related', 'skills', 'knowledge'];

/**
 * Leyenda del componente: las tres calificaciones (Aplica verde, Con propuesta de mejora azul como en Validación experta,
 * No aplica rojo) y, solo si aparecen, «Requiere ajuste» (validaciones guardadas antes) y «Sin dato».
 */
const LEGEND: ReadonlyArray<{ state: CriterionState; color: string; always: boolean }> = [
  { state: 'aplica', color: 'var(--state-ok-fg)', always: true },
  { state: 'propuesta_mejora', color: '#0c7fb0', always: true },
  { state: 'no_aplica', color: 'var(--state-error-fg)', always: true },
  { state: 'requiere_ajuste', color: 'var(--state-warn-fg)', always: false },
  { state: 'sin_dato', color: 'var(--neutral-400)', always: false }
];

/** Lo que se elige en «Seleccionar componente»: uno de ellos o todos juntos. */
export type ComponentChoice = CriterionFamily | 'all';

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
  imports: [CommonModule, FormsModule, TranslatePipe, DialogDirective, FilterComboboxComponent],
  templateUrl: './reporte-estadisticas.component.html',
  styleUrl: './reporte-estadisticas.component.css'
})
export class ReporteEstadisticasComponent {
  private readonly translation = inject(TranslationService);
  private readonly toast = inject(ToastService);

  @Input({ required: true }) records: ReportRecord[] = [];
  @Output() closed = new EventEmitter<void>();

  readonly components = COMPONENTS;
  /** Tarjetas del resumen por componente: «Todos» primero. */
  readonly summaryItems: readonly ComponentChoice[] = ['all', ...COMPONENTS];
  readonly threshold = BASE_THRESHOLD;
  component: ComponentChoice = 'all';
  exporting = false;

  /** «Todos» y cada componente. */
  componentOptions(): ComboOption[] {
    return comboOptions(this.summaryItems, (item) => item, (item) => this.translation.translate(`reportes.component.${item}`));
  }

  private familiesOf(choice: ComponentChoice): readonly CriterionFamily[] {
    return choice === 'all' ? this.components : [choice];
  }

  get total(): number {
    return this.records.length;
  }

  /** Aprobados: resultado «Aplica» o «Con propuesta de mejora» (ningún No aplica), o coincidencia de al menos el 60 % (regla de la desplegada). */
  get approved(): number {
    return this.records.filter((record) => record.evaluation === 'aplica' || record.evaluation === 'propuesta_mejora' || record.score >= BASE_THRESHOLD).length;
  }

  get inThreshold(): number {
    return this.records.filter((record) => record.score >= BASE_THRESHOLD).length;
  }

  percent(part: number, whole = this.total): number {
    return whole ? Math.round((part / whole) * 100) : 0;
  }

  /** Distribución de las calificaciones de un componente (o de todos juntos), contando sus criterios en todos los registros. */
  distribution(choice: ComponentChoice): Array<{ state: CriterionState; color: string; count: number; percent: number }> {
    const families = this.familiesOf(choice);
    const criteria = this.records.flatMap((record) => allCriteria(record).filter((item) => families.includes(item.family)));
    return LEGEND.map(({ state, color, always }) => {
      const count = criteria.filter((item) => item.state === state).length;
      return { state, color, always, count, percent: this.percent(count, criteria.length) };
    }).filter((item) => item.always || item.count > 0);
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

  /** Cumplimiento base de un componente (o de todos): sus criterios en «Aplica» o «Con propuesta de mejora». */
  compliance(choice: ComponentChoice): number {
    const parts = this.distribution(choice);
    const criteria = parts.reduce((sum, item) => sum + item.count, 0);
    const passing = parts.filter((item) => item.state === 'aplica' || item.state === 'propuesta_mejora').reduce((sum, item) => sum + item.count, 0);
    return this.percent(passing, criteria);
  }

  /**
   * Hoja «Estadísticas» del Excel, con los mismos porcentajes de la pantalla: total, tasa de aprobación y coincidencia, y por
   * componente cuántos criterios hay en cada calificación, su porcentaje y el cumplimiento base. Con «Todos», una fila por
   * componente y el total; con uno, solo ese.
   */
  statisticsRows(): Array<Array<string | number>> {
    const t = (key: string, params?: Record<string, string | number>) => this.translation.translate(key, params);
    const choices: ComponentChoice[] = this.component === 'all' ? [...this.components, 'all'] : [this.component];
    const states = LEGEND.filter(({ state, always }) => always || this.distribution('all').some((item) => item.state === state)).map(({ state }) => state);
    const header = [
      t('reportes.stats.componentColumn'),
      t('reportes.stats.criteriaColumn'),
      ...states.flatMap((state) => [t('reportes.state.' + state), `${t('reportes.state.' + state)} (%)`]),
      t('reportes.stats.complianceColumn')
    ];
    const rows = choices.map((choice) => {
      const parts = this.distribution(choice);
      const criteria = parts.reduce((sum, item) => sum + item.count, 0);
      return [
        t('reportes.component.' + choice),
        criteria,
        ...states.flatMap((state) => {
          const part = parts.find((item) => item.state === state);
          return [part?.count ?? 0, `${part?.percent ?? 0} %`];
        }),
        `${this.compliance(choice)} %`
      ];
    });
    return [
      [t('reportes.stats.title')],
      [t('reportes.stats.pickComponent'), t('reportes.component.' + this.component)],
      [t('reportes.stats.total'), this.total],
      [t('reportes.stats.approvalRate'), `${this.percent(this.approved)} %`],
      [t('reportes.stats.coincidence', { threshold: this.threshold }), `${this.percent(this.inThreshold)} %`],
      [],
      header,
      ...rows
    ];
  }

  /**
   * Descarga en Excel, con el componente elegido (o «Todos»): primero la hoja «Estadísticas» con sus porcentajes y después
   * los envíos con coincidencia de al menos el umbral base (60 %).
   */
  async exportThreshold(): Promise<void> {
    if (!this.records.length) {
      this.toast.warning(this.translation.translate('reportes.stats.exportNoRecords'));
      return;
    }
    const rows = this.records.filter((record) => record.score >= BASE_THRESHOLD);
    this.exporting = true;
    try {
      const sheet = { name: this.translation.translate('reportes.stats.sheetName'), rows: this.statisticsRows() };
      const component = this.component === 'all' ? 'todos' : this.component;
      await exportRecords(rows, (key, params) => this.translation.translate(key, params), `Estadisticas_${component}_${new Date().toISOString().slice(0, 10)}`, true, [sheet]);
    } catch {
      this.toast.error(this.translation.translate('reportes.exportError'));
    } finally {
      this.exporting = false;
    }
  }
}

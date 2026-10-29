import { NgFor } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '../i18n/translate.pipe';
import { TranslationService } from '../i18n/translation.service';
import { ComboOption, FilterComboboxComponent } from './filter-combobox.component';
import { PAGE_SIZES, pageCountOf, visiblePages } from './list';

/**
 * Paginación común de todas las listas: a la izquierda "Mostrando X a Y de N
 * <cosas>" y a la derecha anterior, números de página, siguiente y "N por
 * página". Se usa sobre un `<nav>` para que los lectores de pantalla la
 * anuncien como navegación:
 *
 *   <nav app-pagination [page]="page" [pageSize]="pageSize" [total]="total"
 *        summaryKey="cno.showing" sizeLabelKey="cno.pageSizeAria"
 *        (pageChange)="goToPage($event)" (pageSizeChange)="setPageSize($event)"></nav>
 *
 * No guarda estado: la vista decide qué hacer al cambiar de página o de tamaño
 * (pedir otra página al servidor o recortar la lista que ya tiene).
 */
@Component({
  selector: 'nav[app-pagination]',
  standalone: true,
  imports: [NgFor, TranslatePipe, FilterComboboxComponent],
  host: { class: 'ui-pagination', '[attr.aria-label]': 'label()' },
  template: `
    <span>{{ summaryKey() | translate: { from: rangeStart(), to: rangeEnd(), total: totalLabel() } }}</span>
    <div class="ui-pagination-controls">
      <button type="button" class="ui-page-btn" [disabled]="page() <= 1" [title]="'common.previous' | translate"
              [attr.aria-label]="'common.previous' | translate" (click)="go(page() - 1)">
        <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>
      </button>
      <button *ngFor="let number of pages()" type="button" class="ui-page-btn" [class.active]="number === page()"
              [attr.aria-current]="number === page() ? 'page' : null" (click)="go(number)">{{ number }}</button>
      <button type="button" class="ui-page-btn" [disabled]="page() >= pageCount()" [title]="'common.next' | translate"
              [attr.aria-label]="'common.next' | translate" (click)="go(page() + 1)">
        <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>
      <app-filter-combobox class="ui-page-size" [options]="sizeOptions()" [value]="'' + pageSize()" [showAll]="false"
                           [ariaLabel]="sizeLabelKey() | translate" (valueChange)="pageSizeChange.emit(+$event)"></app-filter-combobox>
    </div>
  `
})
export class PaginationComponent {
  private readonly translation = inject(TranslationService);

  /** Página actual (empieza en 1). */
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  /** Total de elementos de la lista completa (no solo los de la página). */
  readonly total = input.required<number>();
  /** Clave del texto "Mostrando {{from}} a {{to}} de {{total}} …" de la vista. */
  readonly summaryKey = input.required<string>();
  /** Clave del nombre accesible del selector de tamaño ("Registros por página"…). */
  readonly sizeLabelKey = input.required<string>();
  readonly pageSizes = input<number[]>(PAGE_SIZES);
  /** Escribe el total con separador de miles (para catálogos grandes, p. ej. "6.048"). */
  readonly groupThousands = input(false);

  /** Página pedida, ya dentro del rango válido y distinta de la actual. */
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly pageCount = computed(() => pageCountOf(this.total(), this.pageSize()));
  readonly pages = computed(() => visiblePages(this.page(), this.pageCount()));
  readonly rangeStart = computed(() => (this.total() ? (this.page() - 1) * this.pageSize() + 1 : 0));
  readonly rangeEnd = computed(() => Math.min(this.page() * this.pageSize(), this.total()));
  readonly totalLabel = computed(() => (this.groupThousands() ? this.total().toLocaleString('es-CO') : this.total()));

  /** Nombre accesible del `<nav>` (los host bindings no admiten pipes). */
  label(): string {
    return this.translation.translate('common.pagination');
  }

  go(page: number): void {
    const target = Math.min(Math.max(1, page), this.pageCount());
    if (target !== this.page()) this.pageChange.emit(target);
  }

  /** «8 por página», «16 por página»…, en el idioma guardado. */
  sizeOptions(): ComboOption[] {
    return this.pageSizes().map((size) => ({ value: String(size), label: this.translation.translate('common.perPage', { count: size }) }));
  }
}

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/dialog/dialog.directive';
import { PickOption } from '../actualizacion-cno.model';
import { ClassTranslatePipe } from '../clasificacion';
import { normalizeText } from '../../../shared/ui/list';

/** Cuántas opciones se pintan a la vez. */
const MAX_VISIBLE = 200;

/**
 * Selector de un catálogo para el editor de ocupaciones (copia del de la
 * versión desplegada): busca, marca varias opciones y las agrega de una vez.
 * Lo que la ocupación ya tiene aparece marcado y no se puede volver a agregar.
 */
@Component({
  selector: 'app-catalog-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogDirective, ClassTranslatePipe],
  template: `
    <div class="ui-modal-backdrop" (click)="cancel.emit()">
      <section class="ui-modal ui-modal-wide ui-modal-fixed cs-modal" role="dialog" aria-modal="true" aria-labelledby="cs-title" tabindex="-1"
               appDialog (dialogEscape)="cancel.emit()" (click)="$event.stopPropagation()">
        <header class="cs-header">
          <h2 id="cs-title">{{ title }}</h2>
          <p class="ui-hint">{{ 'editarOcupacion.selectorHint' | ctranslate: { source: source } }}</p>
        </header>
        <div class="cs-tools">
          <div class="ui-input-icon cs-search">
            <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
            <input class="ui-input" type="text" name="cs-search" autocomplete="off" [placeholder]="searchPlaceholder" [attr.aria-label]="searchPlaceholder" [(ngModel)]="query">
          </div>
          <label class="cs-check-label">
            <input type="checkbox" name="cs-hide" [(ngModel)]="hideLinked"> {{ 'editarOcupacion.hideLinked' | ctranslate }}
          </label>
          <button type="button" class="ui-btn ui-btn-ghost ui-btn-sm" [disabled]="!visibleAvailable.length" (click)="selectVisible()">{{ 'editarOcupacion.selectVisible' | ctranslate }}</button>
        </div>
        <ul class="cs-list" role="listbox" aria-multiselectable="true" [attr.aria-labelledby]="'cs-title'">
          <li *ngFor="let option of visible; trackBy: trackByCode" role="option" [attr.aria-selected]="isChecked(option)" [class.linked]="isLinked(option)">
            <label>
              <input type="checkbox" [name]="'cs-' + option.code" [checked]="isChecked(option)" [disabled]="isLinked(option)" (change)="toggle(option)">
              <span class="cs-code">{{ option.code }}</span>
              <span class="cs-label">{{ option.label }}</span>
              <span *ngIf="isLinked(option)" class="ui-badge ui-badge-neutral">{{ 'editarOcupacion.alreadyLinked' | ctranslate }}</span>
            </label>
          </li>
          <li *ngIf="!visible.length" class="cs-empty">{{ 'editarOcupacion.noMatches' | ctranslate: { query: query } }}</li>
          <li *ngIf="hiddenCount > 0" class="cs-empty">{{ 'editarOcupacion.typeMore' | ctranslate: { count: hiddenCount } }}</li>
        </ul>
        <footer class="cs-footer">
          <span class="ui-hint">{{ 'editarOcupacion.selectedCount' | ctranslate: { count: checked.size } }}</span>
          <button type="button" class="ui-btn ui-btn-secondary" (click)="cancel.emit()">{{ 'common.cancel' | ctranslate }}</button>
          <button type="button" class="ui-btn ui-btn-primary" [disabled]="!checked.size" (click)="add()">
            {{ 'editarOcupacion.add' | ctranslate }}{{ checked.size ? ' (' + checked.size + ')' : '' }}
          </button>
        </footer>
      </section>
    </div>
  `,
  styles: [
    `
      .cs-modal {
        max-width: 720px;
        padding: 0;
      }
      .cs-header {
        padding: 20px 24px 8px;
      }
      .cs-header h2 {
        margin: 0 0 4px;
      }
      .cs-tools {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        padding: 8px 24px 12px;
        border-bottom: 1px solid var(--neutral-100);
      }
      .cs-search {
        flex: 1 1 260px;
      }
      .cs-check-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: calc(14px * var(--type-scale));
        cursor: pointer;
      }
      .cs-list {
        flex: 1;
        min-height: 200px;
        margin: 0;
        padding: 8px 16px;
        overflow-y: auto;
        scrollbar-width: thin;
        list-style: none;
      }
      .cs-list label {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px;
        border-radius: 8px;
        font-size: calc(14px * var(--type-scale));
        cursor: pointer;
      }
      .cs-list label:hover {
        background: var(--neutral-50);
      }
      .cs-list .linked label {
        color: var(--neutral-500);
        cursor: default;
      }
      .cs-list input {
        accent-color: var(--primary-color);
      }
      .cs-code {
        min-width: 48px;
        color: var(--neutral-500);
        font-size: calc(13px * var(--type-scale));
      }
      .cs-label {
        flex: 1;
      }
      .cs-empty {
        padding: 12px 8px;
        color: var(--neutral-500);
        font-size: calc(14px * var(--type-scale));
      }
      .cs-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        padding: 14px 24px;
        border-top: 1px solid var(--neutral-100);
      }
      .cs-footer .ui-hint {
        margin-right: auto;
      }
      :host-context(.shell.dark-mode) .cs-tools,
      :host-context(.shell.dark-mode) .cs-footer {
        border-color: #525252;
      }
      :host-context(.shell.dark-mode) .cs-list label:hover {
        background: rgba(255, 255, 255, 0.06);
      }
    `
  ]
})
export class CatalogSelectorComponent {
  @Input() title = '';
  /** Nombre del catálogo para el texto de ayuda ("catálogo de destrezas CUOC"). */
  @Input() source = '';
  @Input() searchPlaceholder = '';
  @Input() options: PickOption[] = [];
  /** Códigos que la ocupación ya tiene. */
  @Input() linked: readonly string[] = [];
  @Output() readonly added = new EventEmitter<PickOption[]>();
  @Output() readonly cancel = new EventEmitter<void>();

  query = '';
  hideLinked = false;
  checked = new Set<string>();

  /** Opciones que coinciden con lo escrito (por código o nombre), sin las ya agregadas si se pidió ocultarlas. */
  private get matches(): PickOption[] {
    const query = normalizeText(this.query);
    const linked = new Set(this.linked);
    return this.options.filter(
      (option) => (!this.hideLinked || !linked.has(option.code)) && (!query || normalizeText(`${option.code} ${option.label}`).includes(query))
    );
  }

  get visible(): PickOption[] {
    return this.matches.slice(0, MAX_VISIBLE);
  }

  get hiddenCount(): number {
    return Math.max(0, this.matches.length - MAX_VISIBLE);
  }

  /** Visibles que todavía se pueden marcar. */
  get visibleAvailable(): PickOption[] {
    return this.visible.filter((option) => !this.isLinked(option));
  }

  isLinked(option: PickOption): boolean {
    return this.linked.includes(option.code);
  }

  isChecked(option: PickOption): boolean {
    return this.isLinked(option) || this.checked.has(option.code);
  }

  toggle(option: PickOption): void {
    const next = new Set(this.checked);
    if (!next.delete(option.code)) next.add(option.code);
    this.checked = next;
  }

  selectVisible(): void {
    this.checked = new Set([...this.checked, ...this.visibleAvailable.map((option) => option.code)]);
  }

  add(): void {
    this.added.emit(this.options.filter((option) => this.checked.has(option.code)));
  }

  trackByCode(_index: number, option: PickOption): string {
    return option.code;
  }
}

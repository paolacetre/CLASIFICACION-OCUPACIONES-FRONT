import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PickOption } from '../actualizacion-cno.model';
import { normalizeText } from '../../../shared/ui/list';

/** Cuántas opciones se pintan a la vez (el catálogo de funciones tiene miles). */
const MAX_VISIBLE = 50;

let nextId = 0;

/**
 * Buscador con lista desplegable del asistente de ocupaciones: al enfocarlo
 * muestra las opciones que coinciden con lo escrito (sin las ya elegidas) y
 * al elegir una la emite y limpia el campo. Se maneja con el teclado (flechas,
 * Enter y Esc) siguiendo el patrón combobox.
 */
@Component({
  selector: 'app-option-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="picker">
      <div class="ui-input-icon">
        <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input class="ui-input" type="text" role="combobox" autocomplete="off" [id]="inputId" [name]="inputId" [placeholder]="placeholder"
               [attr.aria-label]="placeholder" aria-autocomplete="list" [attr.aria-expanded]="open" [attr.aria-controls]="listId"
               [attr.aria-activedescendant]="open && matches.length ? listId + '-' + active : null"
               [(ngModel)]="query" (ngModelChange)="open = true; active = 0" (focus)="open = true" (blur)="open = false" (keydown)="onKeydown($event)">
      </div>
      <ul *ngIf="open" class="picker-list" role="listbox" [id]="listId">
        <li *ngFor="let option of matches; let index = index" role="option" class="picker-option" [id]="listId + '-' + index"
            [class.active]="index === active" [attr.aria-selected]="index === active" (mousedown)="$event.preventDefault()" (click)="pick(option)"
            (mouseenter)="active = index">
          <span class="picker-label">{{ option.label || option.code }}</span>
          <small *ngIf="showCode" class="picker-code">{{ option.code }}</small>
        </li>
        <li *ngIf="!matches.length" class="picker-empty">{{ emptyText }}</li>
        <li *ngIf="hidden > 0" class="picker-empty">{{ moreText }}</li>
      </ul>
    </div>
  `,
  styles: [
    `
      .picker {
        position: relative;
      }
      .picker-list {
        position: absolute;
        z-index: 30;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        max-height: 240px;
        margin: 0;
        padding: 6px;
        overflow-y: auto;
        list-style: none;
        border: 1px solid var(--neutral-100);
        border-radius: var(--border-radius);
        background: #fff;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
      }
      .picker-option {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        font-size: calc(14px * var(--type-scale));
      }
      .picker-option.active {
        background: var(--neutral-50);
      }
      .picker-code {
        color: var(--neutral-500);
        font-size: calc(13px * var(--type-scale));
      }
      .picker-empty {
        padding: 8px 10px;
        color: var(--neutral-500);
        font-size: calc(13px * var(--type-scale));
      }
      :host-context(.shell.dark-mode) .picker-list {
        border-color: #525252;
        background: var(--dark-surface);
        color: #f1f1f1;
      }
      :host-context(.shell.dark-mode) .picker-option.active {
        background: rgba(255, 255, 255, 0.08);
      }
    `
  ]
})
export class OptionPickerComponent {
  @Input() options: PickOption[] = [];
  /** Códigos ya elegidos: no se ofrecen otra vez. */
  @Input() selected: readonly string[] = [];
  @Input() placeholder = '';
  /** Muestra el código debajo del nombre (ocupaciones relacionadas). */
  @Input() showCode = false;
  /** Busca también en el código (funciones y ocupaciones). */
  @Input() searchCode = false;
  @Input() emptyText = '';
  @Input() moreText = '';
  @Output() readonly picked = new EventEmitter<PickOption>();

  readonly inputId = `option-picker-${nextId++}`;
  readonly listId = `${this.inputId}-list`;

  query = '';
  open = false;
  active = 0;

  /** Opciones que coinciden con lo escrito, sin las ya elegidas. */
  private get allMatches(): PickOption[] {
    const query = normalizeText(this.query);
    const taken = new Set(this.selected);
    return this.options.filter(
      (option) => !taken.has(option.code) && (!query || normalizeText(this.searchCode ? `${option.code} ${option.label}` : option.label).includes(query))
    );
  }

  get matches(): PickOption[] {
    return this.allMatches.slice(0, MAX_VISIBLE);
  }

  /** Opciones que coinciden pero no se pintan: hay que escribir más para verlas. */
  get hidden(): number {
    return Math.max(0, this.allMatches.length - MAX_VISIBLE);
  }

  pick(option: PickOption): void {
    this.picked.emit(option);
    this.query = '';
    this.active = 0;
  }

  /** Teclado del buscador: flechas para moverse por la lista, Enter para elegir y Esc para cerrarla. */
  onKeydown(event: KeyboardEvent): void {
    const count = this.matches.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open = true;
      this.active = count ? (this.active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.open && count) {
        this.pick(this.matches[Math.min(this.active, count - 1)]);
      }
    } else if (event.key === 'Escape' && this.open) {
      // Cierra solo la lista, no el diálogo.
      event.stopPropagation();
      this.open = false;
    }
  }
}

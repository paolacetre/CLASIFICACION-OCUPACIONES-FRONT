import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { normalizeText } from '../../../shared/ui/list';
import { FilterOption } from '../consulta-ocupaciones.model';

let nextId = 0;
const PANEL_MAX_WIDTH = 420;

/**
 * Selector con buscador para filtros de listas muy largas (funciones). Reemplaza al `<select>` nativo, cuyo
 * desplegable no se puede acotar y se sale de la pantalla con textos largos: aquí la lista queda dentro de la
 * ventana, con el texto en varias líneas.
 */
@Component({
  selector: 'app-filter-combobox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fc">
      <button type="button" class="ui-select fc-trigger" [id]="inputId" aria-haspopup="listbox" [attr.aria-expanded]="open" [attr.aria-controls]="listId"
              (click)="toggle()" (keydown.escape)="close()">
        <span class="fc-value">{{ selectedLabel }}</span>
        <svg class="ui-icon fc-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div *ngIf="open" class="fc-panel" [class.fc-panel-end]="anchorEnd">
        <input *ngIf="searchable" #search class="ui-input fc-search" type="search" autocomplete="off" [placeholder]="searchPlaceholder" [attr.aria-label]="searchPlaceholder"
               [(ngModel)]="query" [ngModelOptions]="{ standalone: true }" (ngModelChange)="active = 0" (keydown)="onKeydown($event)">
        <ul class="fc-list" role="listbox" [id]="listId">
          <li *ngIf="showAll" role="option" class="fc-option" [class.selected]="!value" (mousedown)="$event.preventDefault()" (click)="pick('')">{{ allLabel }}</li>
          <li *ngFor="let option of matches; let index = index; trackBy: trackOption" role="option" class="fc-option" [class.active]="index === active"
              [class.selected]="option.value === value" [attr.aria-selected]="option.value === value" (mousedown)="$event.preventDefault()"
              (click)="pick(option.value)" (mouseenter)="active = index">{{ option.label }}</li>
          <li *ngIf="!matches.length" class="fc-empty">{{ emptyText }}</li>
        </ul>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .fc {
        position: relative;
      }
      .fc-trigger {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        text-align: left;
        cursor: pointer;
        background-image: none;
      }
      .fc-caret {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      .fc-search {
        background: #fff;
      }
      .fc-value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* Nunca más ancho que la ventana; los últimos campos de la fila se anclan a su borde derecho para no salirse por ese lado. */
      .fc-panel {
        position: absolute;
        z-index: 30;
        top: calc(100% + 4px);
        left: 0;
        width: max-content;
        min-width: 100%;
        max-width: min(420px, calc(100vw - 40px));
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        border: 1px solid var(--neutral-100);
        border-radius: var(--border-radius);
        background: #fff;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
      }
      .fc-panel-end {
        left: auto;
        right: 0;
      }
      .fc-list {
        margin: 0;
        padding: 0;
        max-height: 260px;
        overflow-y: auto;
        list-style: none;
      }
      .fc-option {
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        overflow-wrap: anywhere;
        font-size: calc(14px * var(--type-scale));
      }
      .fc-option.active {
        background: var(--neutral-50);
      }
      .fc-option.selected {
        font-weight: var(--fw-semibold);
      }
      .fc-empty {
        padding: 8px 10px;
        color: var(--neutral-500);
        font-size: calc(13px * var(--type-scale));
      }
      :host-context(.shell.dark-mode) .fc-panel {
        border-color: #525252;
        background: var(--dark-surface);
        color: #f1f1f1;
      }
      :host-context(.shell.dark-mode) .fc-option.active {
        background: rgba(255, 255, 255, 0.08);
      }
    `
  ]
})
export class FilterComboboxComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() options: readonly FilterOption[] = [];
  @Input() value = '';
  /** Texto de la opción vacía («Todas»). */
  @Input() allLabel = '';
  @Input() searchPlaceholder = '';
  @Input() emptyText = '';
  /** Muestra el buscador dentro de la lista (para listados largos). */
  @Input() searchable = false;
  /** Muestra la opción vacía; se oculta cuando siempre debe haber un valor elegido. */
  @Input() showAll = true;
  @Output() readonly valueChange = new EventEmitter<string>();
  @ViewChild('search') private searchInput?: ElementRef<HTMLInputElement>;

  @Input() inputId = `filter-combobox-${nextId++}`;
  get listId(): string {
    return `${this.inputId}-list`;
  }

  open = false;
  anchorEnd = false;
  query = '';
  active = 0;

  get selectedLabel(): string {
    return this.options.find((option) => option.value === this.value)?.label ?? this.allLabel;
  }

  /** Todas las coincidencias: el filtro no recorta la lista (el buscador sirve para acotarla). */
  get matches(): FilterOption[] {
    const query = normalizeText(this.query);
    return query ? this.options.filter((option) => normalizeText(option.label).includes(query)) : [...this.options];
  }

  trackOption(_index: number, option: FilterOption): string {
    return option.value;
  }

  toggle(): void {
    if (this.open) {
      this.close();
      return;
    }
    // Se ancla a la derecha solo si a la izquierda cabe el panel y a la derecha no (así nunca tapa el menú lateral).
    const rect = (this.host.nativeElement as HTMLElement).getBoundingClientRect();
    const panelWidth = Math.min(PANEL_MAX_WIDTH, window.innerWidth - 40);
    this.anchorEnd = rect.left + panelWidth > window.innerWidth - 20 && rect.right - panelWidth >= 0;
    this.open = true;
    this.query = '';
    this.active = 0;
    setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  close(): void {
    this.open = false;
  }

  pick(value: string): void {
    this.valueChange.emit(value);
    this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.matches.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.active = count ? (this.active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0;
    } else if (event.key === 'Enter') {
      // Evita enviar el formulario de filtros.
      event.preventDefault();
      if (count) {
        this.pick(this.matches[Math.min(this.active, count - 1)].value);
      }
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    }
  }

  /** Un clic fuera cierra la lista. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}

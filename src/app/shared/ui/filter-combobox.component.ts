import { NgClass, NgFor, NgIf } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Injector,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  afterNextRender,
  forwardRef,
  inject
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslatePipe } from '../i18n/translate.pipe';
import { normalizeText } from './list';

/** Color de una opción (y del campo mientras está elegida): los tres estados del sistema visual y el azul de información. */
export type ComboTone = 'ok' | 'error' | 'warn' | 'info';

/** Una opción del desplegable: lo que se guarda (`value`) y lo que se lee (`label`). */
export interface ComboOption {
  value: string;
  label: string;
  tone?: ComboTone;
}

/** Opciones a partir de una lista cualquiera (p. ej. `comboOptions(areas, (area) => area.code, (area) => area.name)`). */
export function comboOptions<T>(items: readonly T[] | null | undefined, value: (item: T) => string, label: (item: T) => string = value): ComboOption[] {
  return (items ?? []).map((item) => ({ value: value(item), label: label(item) }));
}

let nextId = 0;
/** Desde cuántas opciones aparece el buscador si la vista no lo decide. */
const SEARCH_FROM = 8;
const PANEL_MAX_WIDTH = 420;
/** Separación entre el campo y la lista, y margen mínimo con el borde de la ventana. */
const GAP = 4;
const MARGIN = 8;
const MIN_PANEL_HEIGHT = 120;

/**
 * El desplegable de toda la app (el de los filtros de Consulta CNO), en lugar del `<select>` nativo: su lista
 * se ve igual en todos los navegadores, con el texto en varias líneas y, en las listas largas, un buscador que
 * no distingue tildes. Se usa con `[(ngModel)]` (o `formControlName`) o con `[value]` + `(valueChange)`.
 *
 * La lista se abre en la capa superior de la página (`popover`), con posición fija junto al campo: así no la
 * recortan los modales ni los recuadros con desplazamiento, y se abre hacia arriba si abajo no cabe. Con el
 * teclado: flechas para moverse, Enter para elegir y Esc para cerrar (también sin buscador).
 */
@Component({
  selector: 'app-filter-combobox',
  standalone: true,
  imports: [NgClass, NgFor, NgIf, FormsModule, TranslatePipe],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FilterComboboxComponent), multi: true }],
  template: `
    <div class="fc">
      <button #trigger type="button" class="ui-select fc-trigger" [ngClass]="selectedTone ? 'fc-tone-' + selectedTone : ''" [id]="inputId"
              aria-haspopup="listbox" [attr.aria-expanded]="open" [attr.aria-controls]="listId" [attr.aria-label]="ariaLabel || null"
              [attr.aria-describedby]="describedBy || null" [attr.aria-invalid]="invalid || null"
              [attr.aria-activedescendant]="open && !showSearch && matches.length ? activeId : null"
              [disabled]="isDisabled" [class.invalid]="invalid" (click)="toggle()" (keydown)="onTriggerKeydown($event)" (blur)="onTouched()">
        <span class="fc-value">{{ selectedLabel }}</span>
        <svg class="ui-icon fc-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div #panel *ngIf="open" popover="manual" class="fc-panel">
        <input *ngIf="showSearch" #search class="ui-input fc-search" type="search" autocomplete="off"
               [placeholder]="searchPlaceholder || ('common.optionSearch' | translate)" [attr.aria-label]="searchPlaceholder || ('common.optionSearch' | translate)"
               [attr.aria-controls]="listId" [attr.aria-activedescendant]="matches.length ? activeId : null"
               [(ngModel)]="query" [ngModelOptions]="{ standalone: true }" (ngModelChange)="active = 0" (keydown)="onKeydown($event)">
        <ul class="fc-list" role="listbox" [id]="listId" [attr.aria-label]="ariaLabel || null">
          <li *ngIf="showAll" role="option" class="fc-option fc-option-all" data-value="" [class.selected]="!value" [attr.aria-selected]="!value"
              (mousedown)="$event.preventDefault()" (click)="pick('')">{{ allLabel }}</li>
          <li *ngFor="let option of matches; let index = index; trackBy: trackOption" role="option" class="fc-option" [id]="listId + '-' + index" [attr.data-value]="option.value"
              [ngClass]="option.tone ? 'fc-tone-' + option.tone : ''" [class.active]="index === active" [class.selected]="option.value === value"
              [attr.aria-selected]="option.value === value" (mousedown)="$event.preventDefault()" (click)="pick(option.value)"
              (mouseenter)="active = index">{{ option.label }}</li>
          <li *ngIf="!matches.length" class="fc-empty">{{ emptyText || ('common.optionEmpty' | translate) }}</li>
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
      .fc-trigger {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        text-align: left;
        font: inherit;
        cursor: pointer;
        background-image: none;
      }
      .fc-trigger:disabled {
        cursor: not-allowed;
      }
      .fc-trigger.invalid {
        border-color: var(--state-error-fg);
        box-shadow: 0 0 0 3px rgba(232, 28, 28, 0.12);
      }
      .fc-caret {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      .fc-value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* En la capa superior, con posición fija (la calcula place()); el ancho mínimo es el del campo. */
      .fc-panel {
        position: fixed;
        inset: auto;
        z-index: 1000;
        box-sizing: border-box;
        width: max-content;
        max-width: min(420px, calc(100vw - 16px));
        margin: 0;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow: hidden;
        border: 1px solid var(--neutral-100);
        border-radius: var(--border-radius);
        background: #fff;
        color: var(--ui-text);
        font: inherit;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
      }
      .fc-search {
        flex-shrink: 0;
        background: #fff;
      }
      .fc-list {
        flex: 0 1 auto;
        min-height: 0;
        max-height: 260px;
        margin: 0;
        padding: 0;
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
      /* Opciones con color (p. ej. Aplica / No aplica en Validación experta); el campo toma el de la elegida. */
      .fc-tone-ok {
        --fc-tone: var(--state-ok-fg);
        --fc-tone-bg: var(--state-ok-bg);
      }
      .fc-tone-error {
        --fc-tone: var(--state-error-fg);
        --fc-tone-bg: var(--state-error-bg);
      }
      .fc-tone-warn {
        --fc-tone: var(--state-warn-fg);
        --fc-tone-bg: var(--state-warn-bg);
      }
      .fc-tone-info {
        --fc-tone: #0c7fb0;
        --fc-tone-bg: color-mix(in srgb, var(--brand-blue) 12%, #fff);
      }
      .fc-option[class*='fc-tone-'] {
        color: var(--fc-tone);
        font-weight: var(--fw-semibold);
      }
      .fc-trigger[class*='fc-tone-']:not(:disabled) {
        border-color: var(--fc-tone);
        background-color: var(--fc-tone-bg);
        color: var(--fc-tone);
        font-weight: var(--fw-semibold);
      }
      :host-context(.shell.dark-mode) .fc-panel {
        border-color: #525252;
        background: var(--dark-surface);
        color: #f1f1f1;
      }
      :host-context(.shell.dark-mode) .fc-search {
        background: var(--dark-recessed);
      }
      :host-context(.shell.dark-mode) .fc-option.active {
        background: rgba(255, 255, 255, 0.08);
      }
      :host-context(.shell.dark-mode) .fc-tone-info {
        --fc-tone: #7fd3f5;
      }
      :host-context(.shell.dark-mode) .fc-trigger[class*='fc-tone-']:not(:disabled) {
        background-color: color-mix(in srgb, var(--fc-tone) 14%, transparent);
      }
    `
  ]
})
export class FilterComboboxComponent implements ControlValueAccessor, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  @Input() options: readonly ComboOption[] = [];
  @Input() value = '';
  /** Texto del campo sin elegir y de la opción vacía («Todas», «Seleccione»). */
  @Input() allLabel = '';
  /** Por defecto «Buscar...» y «Sin resultados». */
  @Input() searchPlaceholder = '';
  @Input() emptyText = '';
  /** Buscador dentro de la lista; sin decirlo, aparece en las listas de más de ocho opciones. */
  @Input() searchable: boolean | null = null;
  /** Muestra la opción vacía; se oculta cuando siempre debe haber un valor elegido. */
  @Input() showAll = true;
  /** No deja abrir la lista (p. ej. mientras se guarda o si aún no hay opciones). */
  @Input() disabled = false;
  /** Marca el campo en rojo (y `aria-invalid`) cuando un formulario lo exige y está vacío. */
  @Input() invalid = false;
  /** Nombre accesible cuando no hay un `<label for>` (p. ej. «Registros por página»). */
  @Input() ariaLabel = '';
  @Input() describedBy = '';
  @Output() readonly valueChange = new EventEmitter<string>();
  @ViewChild('search') private searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('trigger') private triggerButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('panel') private panel?: ElementRef<HTMLElement>;

  @Input() inputId = `filter-combobox-${nextId++}`;
  get listId(): string {
    return `${this.inputId}-list`;
  }

  open = false;
  query = '';
  active = 0;

  /** Con `ngModel` o `formControlName`: el formulario recibe cada elección y puede desactivar el campo. */
  private onChange: (value: string) => void = () => undefined;
  onTouched: () => void = () => undefined;
  private formControlled = false;
  private formDisabled = false;
  private readonly follow = (event: Event) => this.onViewportChange(event);

  get isDisabled(): boolean {
    return this.disabled || this.formDisabled;
  }

  get showSearch(): boolean {
    return this.searchable ?? this.options.length > SEARCH_FROM;
  }

  private get selected(): ComboOption | undefined {
    return this.options.find((option) => option.value === this.value);
  }

  get selectedLabel(): string {
    return this.selected?.label ?? this.allLabel;
  }

  get selectedTone(): ComboTone | undefined {
    return this.selected?.tone;
  }

  get activeId(): string {
    return `${this.listId}-${this.active}`;
  }

  /** Todas las coincidencias: el filtro no recorta la lista (el buscador sirve para acotarla). */
  get matches(): ComboOption[] {
    const query = normalizeText(this.query);
    return query ? this.options.filter((option) => normalizeText(option.label).includes(query)) : [...this.options];
  }

  trackOption(_index: number, option: ComboOption): string {
    return option.value;
  }

  writeValue(value: unknown): void {
    this.value = value === null || value === undefined ? '' : String(value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
    this.formControlled = true;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled = disabled;
    if (disabled) {
      this.close();
    }
  }

  toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.show();
    }
  }

  /**
   * Abre la lista con la opción elegida resaltada. Cuando Angular la pinta, la pasa a la capa superior, la ubica
   * junto al campo y pone el cursor en el buscador; mientras está abierta, la sigue al desplazar o cambiar el tamaño.
   */
  private show(): void {
    if (this.isDisabled) {
      return;
    }
    this.open = true;
    this.query = '';
    this.active = Math.max(0, this.options.findIndex((option) => option.value === this.value));
    window.addEventListener('scroll', this.follow, { capture: true, passive: true });
    window.addEventListener('resize', this.follow);
    afterNextRender(
      () => {
        const panel = this.panel?.nativeElement;
        if (!panel) {
          return;
        }
        panel.showPopover?.();
        this.place();
        this.searchInput?.nativeElement.focus();
        this.revealActive();
      },
      { injector: this.injector }
    );
  }

  close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    window.removeEventListener('scroll', this.follow, { capture: true });
    window.removeEventListener('resize', this.follow);
  }

  /**
   * Elige y devuelve el foco al campo (el buscador desaparece): con el teclado se sigue desde el mismo lugar. Como
   * el `<select>` nativo, volver a elegir la opción que ya estaba no avisa ningún cambio.
   */
  pick(value: string): void {
    if (value !== this.value) {
      if (this.formControlled) {
        this.value = value;
        this.onChange(value);
      }
      this.valueChange.emit(value);
    }
    this.close();
    this.triggerButton?.nativeElement.focus();
  }

  /** Con la lista cerrada, las flechas la abren; abierta, el campo responde igual que el buscador. */
  onTriggerKeydown(event: KeyboardEvent): void {
    if (this.open) {
      this.onKeydown(event);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.show();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.matches.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.active = count ? (this.active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0;
      this.revealActive();
    } else if (event.key === 'Enter') {
      // Ni envía el formulario ni vuelve a pulsar el botón.
      event.preventDefault();
      if (count) {
        this.pick(this.matches[Math.min(this.active, count - 1)].value);
      }
    } else if (event.key === 'Escape') {
      // Cierra solo la lista, no el modal que la contiene.
      event.preventDefault();
      event.stopPropagation();
      this.close();
      this.triggerButton?.nativeElement.focus();
    } else if (event.key === 'Tab') {
      this.close();
    }
  }

  /** Un clic fuera cierra la lista (la lista está en la capa superior, pero sigue siendo parte de este componente). */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  ngOnDestroy(): void {
    this.close();
  }

  private onViewportChange(event: Event): void {
    // Desplazar la propia lista no mueve el campo.
    if (event.type === 'scroll' && this.panel?.nativeElement.contains(event.target as Node)) {
      return;
    }
    this.place(true);
  }

  /**
   * Ubica la lista bajo el campo, del ancho del campo como mínimo y sin salirse de la ventana: si abajo no cabe y
   * arriba hay más espacio, la abre hacia arriba; si no cabe en ninguno de los dos, la acorta. Al desplazar, se
   * cierra si el campo salió de la vista.
   */
  private place(closeIfHidden = false): void {
    const panel = this.panel?.nativeElement;
    const trigger = this.triggerButton?.nativeElement;
    if (!panel || !trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    if (closeIfHidden && (rect.bottom < 0 || rect.top > viewportHeight)) {
      this.close();
      return;
    }
    panel.style.minWidth = `${Math.min(rect.width, viewportWidth - 2 * MARGIN)}px`;
    panel.style.maxWidth = `${Math.max(Math.min(rect.width, viewportWidth - 2 * MARGIN), Math.min(PANEL_MAX_WIDTH, viewportWidth - 2 * MARGIN))}px`;
    panel.style.maxHeight = '';
    const natural = panel.offsetHeight;
    const below = viewportHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    const upwards = natural > below && above > below;
    const room = upwards ? above : below;
    if (natural > room) {
      panel.style.maxHeight = `${Math.max(room, MIN_PANEL_HEIGHT)}px`;
    }
    const height = panel.offsetHeight;
    panel.style.top = `${upwards ? rect.top - GAP - height : rect.bottom + GAP}px`;
    panel.style.left = `${Math.max(MARGIN, Math.min(rect.left, viewportWidth - panel.offsetWidth - MARGIN))}px`;
  }

  /** Mantiene a la vista la opción resaltada al moverse con las flechas. */
  private revealActive(): void {
    document.getElementById(this.activeId)?.scrollIntoView({ block: 'nearest' });
  }
}

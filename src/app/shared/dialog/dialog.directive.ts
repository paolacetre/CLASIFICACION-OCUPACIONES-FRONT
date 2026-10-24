import { AfterViewInit, Directive, ElementRef, EventEmitter, OnDestroy, Output, inject } from '@angular/core';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Comportamiento común de los `<section role="dialog">` de la app, sin tocar
 * su marcado ni sus estilos:
 * - Esc dentro del diálogo emite `dialogEscape` y NO se propaga: así un
 *   diálogo anidado (p. ej. "Guardar" dentro de Configuración) se cierra solo
 *   él, sin que el Esc llegue al diálogo o al documento de más afuera.
 * - Tab / Shift+Tab quedan atrapados dentro del diálogo.
 * - Si al abrirse el foco no quedó dentro (el componente no lo movió), lo
 *   mueve al primer control; al cerrarse, si el foco se perdió, lo devuelve
 *   al elemento que lo tenía antes de abrir.
 */
@Directive({
  selector: '[appDialog]',
  standalone: true,
  host: {
    '(keydown)': 'onKeydown($event)'
  }
})
export class DialogDirective implements AfterViewInit, OnDestroy {
  @Output() readonly dialogEscape = new EventEmitter<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly previouslyFocused = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

  /** Al abrir, lleva el foco al primer control del diálogo (si no lo tiene ya). */
  ngAfterViewInit(): void {
    setTimeout(() => {
      const element = this.host.nativeElement;
      if (!element.isConnected || element.contains(document.activeElement)) {
        return;
      }
      (this.focusableElements()[0] ?? element).focus();
    });
  }

  /** Al cerrar, devuelve el foco a donde estaba antes de abrir, si se perdió. */
  ngOnDestroy(): void {
    const previous = this.previouslyFocused;
    setTimeout(() => {
      const active = document.activeElement;
      const focusLost = !active || active === document.body || !active.isConnected;
      if (focusLost && previous?.isConnected) {
        previous.focus();
      }
    });
  }

  /** Esc cierra solo este diálogo (no se propaga a uno de fondo) y Tab no deja salir el foco. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dialogEscape.emit();
      return;
    }

    if (event.key === 'Tab') {
      this.trapTab(event);
    }
  }

  /** Mantiene el foco dentro del diálogo: de el último control pasa al primero y al revés. */
  private trapTab(event: KeyboardEvent): void {
    const focusable = this.focusableElements();
    if (!focusable.length) {
      event.preventDefault();
      this.host.nativeElement.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === this.host.nativeElement)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Controles enfocables y visibles del diálogo (excluye los de diálogos anidados). */
  private focusableElements(): HTMLElement[] {
    const element = this.host.nativeElement;
    return Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (candidate) =>
        candidate.closest('[appDialog], [role="dialog"]') === element &&
        candidate.tabIndex >= 0 &&
        candidate.getClientRects().length > 0
    );
  }
}

import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DialogDirective } from '../dialog/dialog.directive';

/** Color del botón Confirmar: principal, peligro (borrar, desactivar) o advertencia. */
export type ConfirmVariant = 'primary' | 'danger' | 'warn';

/**
 * Confirmación reutilizable (Cancelar / Confirmar) con el mismo aspecto que
 * los diálogos de Gestión de usuarios, armada con las clases `ui-modal-*` de
 * src/styles/ui.css. Quien la usa solo pasa textos y variante; el foco, Tab y
 * Esc los maneja `appDialog`. Se muestra con *ngIf desde la vista.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, DialogDirective],
  template: `
    <div class="ui-modal-backdrop" (click)="onCancel()">
      <section class="ui-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message"
               tabindex="-1" appDialog (dialogEscape)="onCancel()" (click)="$event.stopPropagation()">
        <div class="ui-modal-header">
          <div class="ui-modal-icon" [class.danger]="variant === 'danger'" [class.warn]="variant === 'warn'" aria-hidden="true">
            <svg *ngIf="variant === 'danger'" class="ui-icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
            <svg *ngIf="icon === 'logout'" class="ui-icon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            <svg *ngIf="variant === 'warn' && icon !== 'logout'" class="ui-icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 1 3 6.7M3 12v6h6"/></svg>
            <svg *ngIf="variant === 'primary'" class="ui-icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
          </div>
          <div>
            <h2 id="confirm-dialog-title">{{ title }}</h2>
            <p id="confirm-dialog-message">{{ message }}</p>
          </div>
        </div>
        <div class="ui-modal-actions">
          <button type="button" class="ui-btn ui-btn-secondary" [disabled]="busy" (click)="onCancel()">{{ cancelLabel }}</button>
          <button type="button" class="ui-btn" [class.ui-btn-primary]="variant !== 'danger'" [class.ui-btn-danger]="variant === 'danger'"
                  [disabled]="busy || confirmDisabled" (click)="confirm.emit()">{{ confirmLabel }}</button>
        </div>
      </section>
    </div>
  `
})
export class ConfirmDialogComponent {
  @Input() title = '';
  @Input() message = '';
  @Input() confirmLabel = '';
  @Input() cancelLabel = '';
  @Input() variant: ConfirmVariant = 'primary';
  /** Ícono distinto al de la variante (p. ej. 'logout' para cerrar sesión). */
  @Input() icon: 'logout' | null = null;
  @Input() busy = false;
  /** Deshabilita solo "Confirmar" (p. ej. mientras falta algo para poder confirmar). */
  @Input() confirmDisabled = false;

  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly cancel = new EventEmitter<void>();

  onCancel(): void {
    if (!this.busy) {
      this.cancel.emit();
    }
  }
}

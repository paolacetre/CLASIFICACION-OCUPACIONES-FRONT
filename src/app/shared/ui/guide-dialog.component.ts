import { NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DialogDirective } from '../dialog/dialog.directive';
import { TranslatePipe } from '../i18n/translate.pipe';

/** Un paso de la guía: claves de traducción de su título y su explicación. */
export interface GuideStep {
  titleKey: string;
  textKey: string;
}

/**
 * Modal "Guía de uso" común a las vistas (Consulta, Análisis, Comparativa, Instrumento 2…): los pasos numerados
 * en tarjetas —en dos columnas cuando son tres o más, para que quepa sin desplazarse— y una nota al final.
 * Encabezado y pie quedan fijos: si una pantalla muy baja no alcanza, solo el cuerpo se desplaza por dentro.
 *
 *   <app-guide-dialog *ngIf="guideOpen" titleKey="x.guideTitle" [steps]="guideSteps" noteTitleKey="x.guideNoteTitle"
 *                     noteTextKey="x.guideNoteText" closeKey="x.guideClose" (closed)="guideOpen = false"></app-guide-dialog>
 */
@Component({
  selector: 'app-guide-dialog',
  standalone: true,
  imports: [NgFor, NgIf, TranslatePipe, DialogDirective],
  template: `
    <div class="ui-modal-backdrop" (click)="closed.emit()">
      <section class="ui-modal ui-modal-fixed guide-modal" [class.guide-wide]="steps.length > 2" role="dialog" aria-modal="true"
               aria-labelledby="guide-dialog-title" tabindex="-1" appDialog (dialogEscape)="closed.emit()" (click)="$event.stopPropagation()">
        <header class="ui-modal-header guide-header">
          <span class="guide-icon" aria-hidden="true">
            <svg class="ui-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
          </span>
          <h2 id="guide-dialog-title">{{ titleKey | translate }}</h2>
        </header>

        <div class="ui-modal-body guide-body">
          <ol class="guide-steps">
            <li *ngFor="let step of steps; let index = index" class="guide-step">
              <span class="guide-number" aria-hidden="true">{{ index + 1 }}</span>
              <div class="guide-step-text">
                <h3>{{ step.titleKey | translate }}</h3>
                <p>{{ step.textKey | translate }}</p>
              </div>
            </li>
          </ol>
          <p *ngIf="noteTextKey" class="guide-note">
            <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z"/></svg>
            <span><b>{{ noteTitleKey | translate }}</b> — {{ noteTextKey | translate }}</span>
          </p>
        </div>

        <footer class="ui-modal-actions">
          <button type="button" class="ui-btn ui-btn-primary" (click)="closed.emit()">{{ closeKey | translate }}</button>
        </footer>
      </section>
    </div>
  `,
  styles: `
    /* Más compacta que un modal común: la guía debe caber en la ventana sin desplazarse. */
    .guide-modal {
      max-width: 580px;
      padding: 20px 24px 18px;
    }

    /* Con tres pasos o más, dos columnas: la guía queda a la mitad de alto. */
    .guide-modal.guide-wide {
      max-width: 860px;
    }

    .guide-header {
      align-items: center;
      gap: 12px;
    }

    .guide-icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--state-ok-bg);
      color: var(--accent-color-hover);
    }

    .guide-header h2 {
      margin: 0;
      font-size: var(--fs-subtitle) !important;
    }

    .guide-body {
      flex: 1;
      min-height: 0;
      margin-top: 14px;
      overflow-y: auto;
      scrollbar-width: thin;
      gap: 10px;
    }

    .guide-steps {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .guide-wide .guide-steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .guide-step {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 14px;
      border: 1px solid var(--neutral-100);
      border-radius: var(--border-radius);
    }

    .guide-number {
      flex: none;
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--accent-color-hover);
      color: #fff;
      font-size: calc(14px * var(--type-scale));
      font-weight: var(--fw-semibold);
    }

    .guide-step-text h3 {
      margin: 1px 0 2px;
      font-size: var(--fs-body) !important;
      font-weight: var(--fw-semibold);
    }

    .guide-step-text p {
      margin: 0;
      color: var(--neutral-700);
      font-size: calc(14px * var(--type-scale));
      line-height: 1.45;
    }

    .guide-note {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 0;
      padding: 10px 14px;
      border-radius: var(--border-radius);
      background: var(--state-ok-bg);
      font-size: calc(14px * var(--type-scale));
      line-height: 1.45;
    }

    .guide-note .ui-icon {
      flex: none;
      width: 18px;
      height: 18px;
      color: var(--accent-color-hover);
    }

    .guide-modal .ui-modal-actions {
      margin-top: 14px;
    }

    .guide-note b {
      font-weight: var(--fw-semibold);
    }

    /* En pantallas angostas los pasos vuelven a una sola columna. */
    @media (max-width: 720px) {
      .guide-wide .guide-steps {
        grid-template-columns: 1fr;
      }
    }

    :host-context(.shell.dark-mode) .guide-step {
      border-color: #3d5470;
    }

    :host-context(.shell.dark-mode) .guide-step-text p {
      color: #d4d4d4;
    }

    :host-context(.shell.dark-mode) .guide-note,
    :host-context(.shell.dark-mode) .guide-icon {
      background: rgba(125, 183, 40, 0.14);
    }
  `
})
export class GuideDialogComponent {
  @Input({ required: true }) titleKey = '';
  @Input({ required: true }) steps: GuideStep[] = [];
  @Input() noteTitleKey = '';
  @Input() noteTextKey = '';
  @Input({ required: true }) closeKey = '';
  @Output() readonly closed = new EventEmitter<void>();
}

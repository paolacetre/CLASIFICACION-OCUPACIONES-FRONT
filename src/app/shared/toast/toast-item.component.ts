import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { ToastMessage } from './toast.model';
import { TranslatePipe } from '../i18n/translate.pipe';

/** Duración de la animación de salida (fade-out), debe calzar con el SCSS. */
const EXIT_ANIMATION_MS = 220;

/** Un aviso del contenedor de toasts: se cierra solo después de un tiempo o con su botón, con animación de salida. */
@Component({
  selector: 'app-toast-item',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './toast-item.component.html',
  styleUrl: './toast-item.component.scss'
})
export class ToastItemComponent implements OnInit, OnDestroy {
  @Input({ required: true }) toast!: ToastMessage;
  @Output() closed = new EventEmitter<void>();

  closing = false;

  private autoCloseTimer?: ReturnType<typeof setTimeout>;
  private exitTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.autoCloseTimer = setTimeout(() => this.close(), this.toast.duration);
  }

  ngOnDestroy(): void {
    clearTimeout(this.autoCloseTimer);
    clearTimeout(this.exitTimer);
  }

  /** Cierra el aviso después de su animación de salida. */
  close(): void {
    if (this.closing) {
      return;
    }
    this.closing = true;
    clearTimeout(this.autoCloseTimer);
    this.exitTimer = setTimeout(() => this.closed.emit(), EXIT_ANIMATION_MS);
  }
}

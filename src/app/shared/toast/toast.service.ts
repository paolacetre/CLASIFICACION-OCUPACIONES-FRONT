import { Injectable, signal } from '@angular/core';
import { ToastMessage, ToastType } from './toast.model';

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3600,
  warning: 3800,
  error: 4200
};

/**
 * Cola de toasts de la aplicación. Varios toasts disparados seguidos se
 * apilan (no se reemplazan): cada uno vive en el arreglo hasta que expira su
 * duración o el usuario lo cierra manualmente (ver ToastItemComponent).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSignal = signal<ToastMessage[]>([]);
  private nextId = 0;

  readonly toasts = this.toastsSignal.asReadonly();

  success(message: string, duration = DEFAULT_DURATION.success): void {
    this.push('success', message, duration);
  }

  error(message: string, duration = DEFAULT_DURATION.error): void {
    this.push('error', message, duration);
  }

  warning(message: string, duration = DEFAULT_DURATION.warning): void {
    this.push('warning', message, duration);
  }

  dismiss(id: number): void {
    this.toastsSignal.update((list) => list.filter((toast) => toast.id !== id));
  }

  private push(type: ToastType, message: string, duration: number): void {
    const toast: ToastMessage = { id: this.nextId++, type, message, duration };
    this.toastsSignal.update((list) => [...list, toast]);
  }
}

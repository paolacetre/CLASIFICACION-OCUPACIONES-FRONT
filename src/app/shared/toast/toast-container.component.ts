import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { ToastItemComponent } from './toast-item.component';
import { ToastMessage } from './toast.model';

/**
 * Punto único de renderizado de los toasts de toda la app. Se monta una sola
 * vez (en AppComponent, fuera de `.shell`) y lee `ToastService.toasts` — así
 * cualquier feature puede disparar un toast inyectando el servicio, sin
 * necesidad de pasar eventos hacia arriba por @Output().
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, ToastItemComponent],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss'
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);

  readonly toasts = this.toastService.toasts;

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }

  trackByToastId(_index: number, toast: ToastMessage): number {
    return toast.id;
  }
}

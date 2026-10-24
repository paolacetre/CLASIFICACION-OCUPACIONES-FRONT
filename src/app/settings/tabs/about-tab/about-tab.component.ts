import { Component, inject, signal } from '@angular/core';
import { ApiStatusService } from '../../../shared/api/api-status.service';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';

/** Estado de la API que muestra la pestaña: comprobando, en línea o sin conexión. */
export type ApiState = 'checking' | 'online' | 'offline';

/**
 * Pestaña "Acerca de" de Configuración (solo lectura): nombre, descripción y
 * versión del sistema, y los datos del servidor. El estado de la API se
 * consulta de verdad al abrir la pestaña (`ApiStatusService`).
 */
@Component({
  selector: 'app-about-tab',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './about-tab.component.html',
  styleUrl: './about-tab.component.scss'
})
export class AboutTabComponent {
  private readonly apiStatus = inject(ApiStatusService);

  readonly version = 'v1.0.0';
  readonly apiState = signal<ApiState>('checking');

  constructor() {
    this.apiStatus.check().subscribe((online) => this.apiState.set(online ? 'online' : 'offline'));
  }
}

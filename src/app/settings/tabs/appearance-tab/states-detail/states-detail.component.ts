import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { TranslatePipe } from '../../../../shared/i18n/translate.pipe';

interface StateCardItem {
  key: 'approved' | 'rejected' | 'warning';
  cls: 'ok' | 'error' | 'warn';
}

/**
 * Detalle informativo de "Estados y mensajes": documenta los 3 únicos estados
 * del sistema (Aprobado/Rechazado/Advertencia), qué color usa cada uno, para
 * qué se usa y cuándo aparece. Se despliega hacia abajo dentro de la misma
 * card de Apariencia (antes era un modal sobre el modal de Configuración).
 * No hay nada que editar ni guardar: solo se cierra, con la "X" o con Esc
 * (Esc no se propaga, así no cierra también Configuración).
 */
@Component({
  selector: 'app-states-detail',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './states-detail.component.html',
  styleUrl: './states-detail.component.scss'
})
export class StatesDetailComponent {
  @Output() readonly closeEvent = new EventEmitter<void>();

  readonly stateItems: StateCardItem[] = [
    { key: 'approved', cls: 'ok' },
    { key: 'rejected', cls: 'error' },
    { key: 'warning', cls: 'warn' }
  ];

  close(): void {
    this.closeEvent.emit();
  }

  onEscape(event: Event): void {
    event.stopPropagation();
    this.close();
  }
}

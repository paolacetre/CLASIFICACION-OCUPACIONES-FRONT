import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { AuthService } from '../../shared/auth/auth.service';
import { ActivityEntry, Indicator, createIndicators } from './inicio.model';
import { InicioService } from './inicio.service';

export * from './inicio.model';

/** Vista "Inicio" del proyecto: saludo, indicadores y bitácora de trazabilidad. */
@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.css'
})
export class InicioComponent implements OnInit {
  private readonly inicioService = inject(InicioService);
  private readonly authService = inject(AuthService);

  /** Las tarjetas se pintan de una vez; su valor llega con la consulta. */
  indicators: Indicator[] = createIndicators();
  /** Bitácora de trazabilidad: lo último que hizo quien tiene la sesión. */
  activity: ActivityEntry[] = [];
  /** Nombre de quien inició sesión, para el saludo. */
  readonly userName = this.authService.user()?.name ?? '';

  ngOnInit(): void {
    this.inicioService.listIndicators().subscribe((indicators) => (this.indicators = indicators));
    // Si la bitácora no responde, la tarjeta queda con su aviso de "sin registros".
    this.inicioService.listActivity().subscribe({ next: (activity) => (this.activity = activity), error: () => undefined });
  }
}

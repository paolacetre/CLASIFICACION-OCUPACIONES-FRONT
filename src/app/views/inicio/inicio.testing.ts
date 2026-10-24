import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { clone, mockResponse } from '../../shared/api/mock-api';
import { ActivityEntry, Indicator, createIndicators } from './inicio.model';
import { InicioService } from './inicio.service';

/** Totales de prueba de las tarjetas, en el orden de `createIndicators()`. */
export const TEST_TOTALS = [611, 680, 8872, 26];

export function createTestActivity(): ActivityEntry[] {
  return [
    { id: 2, type: 'cuoc', title: 'Cargaste el catálogo CUOC', detail: 'Carga masiva CUOC completada con éxito.', date: '2026-10-09T14:31:28.943Z' },
    { id: 1, type: 'cno', title: 'Cargaste el catálogo CNO', detail: '', date: '2026-10-09T14:31:10.479Z' }
  ];
}

/** Solo para pruebas: doble de `InicioService` con totales y bitácora fijos. */
@Injectable()
export class FakeInicioService implements Pick<InicioService, keyof InicioService> {
  private readonly activity = createTestActivity();

  listIndicators(): Observable<Indicator[]> {
    return mockResponse(() => createIndicators().map((indicator, index) => ({ ...indicator, value: TEST_TOTALS[index] })));
  }

  listActivity(): Observable<ActivityEntry[]> {
    return mockResponse(() => clone(this.activity));
  }
}

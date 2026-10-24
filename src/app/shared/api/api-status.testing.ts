import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ApiStatusService } from './api-status.service';

/** Doble de `ApiStatusService` para las pruebas: la API siempre responde, salvo que la prueba cambie `online`. */
@Injectable()
export class FakeApiStatusService implements Pick<ApiStatusService, keyof ApiStatusService> {
  online = true;

  check(): Observable<boolean> {
    return of(this.online);
  }
}

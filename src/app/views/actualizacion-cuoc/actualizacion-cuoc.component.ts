import { Component } from '@angular/core';
import { ActualizacionCnoComponent } from '../actualizacion-cno/actualizacion-cno.component';

/**
 * Vista "Actualización > CUOC": la misma pantalla de Actualización CNO en modo
 * CUOC (como la versión desplegada, que usa un solo componente para las dos):
 * nivel de competencia, área de cualificación, destrezas, conocimientos y
 * ocupaciones CUOC, con su carga de Excel y su asistente de ocupaciones.
 */
@Component({
  selector: 'app-actualizacion-cuoc',
  standalone: true,
  imports: [ActualizacionCnoComponent],
  template: `<app-actualizacion-cno [classification]="'cuoc'"></app-actualizacion-cno>`
})
export class ActualizacionCuocComponent {}

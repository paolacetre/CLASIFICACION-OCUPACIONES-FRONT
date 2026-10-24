import { Component, inject } from '@angular/core';
import { CONSULTA_IMPORTS, ConsultaOcupacionesComponent } from '../consulta-ocupaciones/consulta-ocupaciones.component';
import { CuocService } from './cuoc.service';

export * from './cuoc.model';

/**
 * Vista "CUOC" del proyecto (Consulta): la pantalla común de consulta de
 * ocupaciones (`ConsultaOcupacionesComponent`) sobre la Clasificación Única de
 * Ocupaciones para Colombia (sin filtro ni columna de nivel).
 */
@Component({
  selector: 'app-cuoc',
  standalone: true,
  imports: CONSULTA_IMPORTS,
  templateUrl: '../consulta-ocupaciones/consulta-ocupaciones.component.html',
  styleUrl: '../consulta-ocupaciones/consulta-ocupaciones.component.css'
})
export class CuocComponent extends ConsultaOcupacionesComponent {
  readonly classification = 'cuoc';
  protected readonly source = inject(CuocService);
}

import { Component, inject } from '@angular/core';
import { CONSULTA_IMPORTS, ConsultaOcupacionesComponent } from '../consulta-ocupaciones/consulta-ocupaciones.component';
import { CnoService } from './cno.service';

export * from './cno.model';

/**
 * Vista "CNO" del proyecto (Consulta): la pantalla común de consulta de
 * ocupaciones (`ConsultaOcupacionesComponent`) sobre la Clasificación Nacional
 * de Ocupaciones, con filtro y columna de nivel.
 */
@Component({
  selector: 'app-cno',
  standalone: true,
  imports: CONSULTA_IMPORTS,
  templateUrl: '../consulta-ocupaciones/consulta-ocupaciones.component.html',
  styleUrl: '../consulta-ocupaciones/consulta-ocupaciones.component.css'
})
export class CnoComponent extends ConsultaOcupacionesComponent {
  readonly classification = 'cno';
  protected readonly source = inject(CnoService);
}

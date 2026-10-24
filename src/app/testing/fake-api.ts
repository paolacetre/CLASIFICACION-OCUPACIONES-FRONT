import { Provider } from '@angular/core';
import { ApiStatusService } from '../shared/api/api-status.service';
import { FakeApiStatusService } from '../shared/api/api-status.testing';
import { AuthService } from '../shared/auth/auth.service';
import { ActualizacionCnoService } from '../views/actualizacion-cno/actualizacion-cno.service';
import { FakeActualizacionCnoService } from '../views/actualizacion-cno/actualizacion-cno.testing';
import { ActualizacionCorrelativaService } from '../views/actualizacion-correlativa/actualizacion-correlativa.service';
import { FakeActualizacionCorrelativaService } from '../views/actualizacion-correlativa/actualizacion-correlativa.testing';
import { AnalisisService } from '../views/analisis/analisis.service';
import { FakeAnalisisService } from '../views/analisis/analisis.testing';
import { ComparativaService } from '../views/comparativa/comparativa.service';
import { FakeComparativaService } from '../views/comparativa/comparativa.testing';
import { FakeAuthService } from '../shared/auth/auth.testing';
import { CnoService } from '../views/cno/cno.service';
import { FakeCnoService } from '../views/cno/cno.testing';
import { CorrelativaService } from '../views/correlativa/correlativa.service';
import { FakeCorrelativaService } from '../views/correlativa/correlativa.testing';
import { CuocService } from '../views/cuoc/cuoc.service';
import { FakeCuocService } from '../views/cuoc/cuoc.testing';
import { InicioService } from '../views/inicio/inicio.service';
import { Instrumento2Service } from '../views/instrumento-2/instrumento-2.service';
import { FakeInstrumento2Service } from '../views/instrumento-2/instrumento-2.testing';
import { Instrumento3Service } from '../views/instrumento-3/instrumento-3.service';
import { FakeInstrumento3Service } from '../views/instrumento-3/instrumento-3.testing';
import { PerfilService } from '../views/perfil/perfil.service';
import { ReportesService } from '../views/reportes/reportes.service';
import { FakeReportesService } from '../views/reportes/reportes.testing';
import { FakePerfilService } from '../views/perfil/perfil.testing';
import { FakeInicioService } from '../views/inicio/inicio.testing';
import { UsuariosService } from '../views/usuarios/usuarios.service';
import { FakeUsuariosService } from '../views/usuarios/usuarios.testing';
import { ValidacionesService } from '../views/validaciones/validaciones.service';
import { FakeValidacionesService } from '../views/validaciones/validaciones.testing';

/**
 * Solo para pruebas. Los servicios de la app llaman al backend con HttpClient;
 * en las pruebas de componentes cada uno se reemplaza por su doble en memoria
 * (`Fake…Service`, en el archivo `*.testing.ts` de su carpeta), que tiene la
 * misma interfaz y datos de ejemplo fijos. Se registran aquí una sola vez y
 * `src/test.ts` los aplica a todas las pruebas.
 *
 * La prueba del servicio real (`*.service.spec.ts`) vuelve a poner la clase
 * verdadera con `{ provide: X, useClass: X }` y usa `HttpTestingController`.
 */
export const FAKE_API_PROVIDERS: Provider[] = [
  { provide: ApiStatusService, useClass: FakeApiStatusService },
  { provide: AuthService, useClass: FakeAuthService },
  { provide: ActualizacionCnoService, useClass: FakeActualizacionCnoService },
  { provide: ActualizacionCorrelativaService, useClass: FakeActualizacionCorrelativaService },
  { provide: AnalisisService, useClass: FakeAnalisisService },
  { provide: ComparativaService, useClass: FakeComparativaService },
  { provide: CnoService, useClass: FakeCnoService },
  { provide: CorrelativaService, useClass: FakeCorrelativaService },
  { provide: CuocService, useClass: FakeCuocService },
  { provide: InicioService, useClass: FakeInicioService },
  { provide: Instrumento2Service, useClass: FakeInstrumento2Service },
  { provide: Instrumento3Service, useClass: FakeInstrumento3Service },
  { provide: PerfilService, useClass: FakePerfilService },
  { provide: ReportesService, useClass: FakeReportesService },
  { provide: UsuariosService, useClass: FakeUsuariosService },
  { provide: ValidacionesService, useClass: FakeValidacionesService }
];

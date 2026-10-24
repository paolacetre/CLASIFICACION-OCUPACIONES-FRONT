import type { MenuItem, PageView } from '../app.menu';
import { InicioComponent } from '../views/inicio/inicio.component';
import { CnoComponent } from '../views/cno/cno.component';
import { CuocComponent } from '../views/cuoc/cuoc.component';
import { CorrelativaComponent } from '../views/correlativa/correlativa.component';
import { AnalisisComponent } from '../views/analisis/analisis.component';
import { ComparativaComponent } from '../views/comparativa/comparativa.component';
import { Instrumento2Component } from '../views/instrumento-2/instrumento-2.component';
import { Instrumento3Component } from '../views/instrumento-3/instrumento-3.component';
import { ActualizacionCnoComponent } from '../views/actualizacion-cno/actualizacion-cno.component';
import { ActualizacionCuocComponent } from '../views/actualizacion-cuoc/actualizacion-cuoc.component';
import { ActualizacionCorrelativaComponent } from '../views/actualizacion-correlativa/actualizacion-correlativa.component';
import { ValidacionesComponent } from '../views/validaciones/validaciones.component';
import { ReportesComponent } from '../views/reportes/reportes.component';

const ICON_CNO = ['M8 8h12v12H8z', 'M16 4H4v12'];
const ICON_CUOC = ['M4 4v16', 'M8 8v12', 'M12 6v14', 'm16 6 4 14'];
const ICON_CORRELATIVA = ['M6 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4z', 'M18 17a2 2 0 1 0 0 4a2 2 0 1 0 0-4z', 'M6 7v8a4 4 0 0 0 4 4h2', 'm10 17 2 2-2 2', 'M18 17V9a4 4 0 0 0-4-4h-2', 'm14 7-2-2 2-2'];
const ICON_PORTAPAPELES = ['M9 3h6v3H9z', 'M15 4h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3'];

/**
 * Opciones propias del proyecto en el menú lateral, en el orden en que se
 * muestran (antes de "Gestión de usuarios", que es común). Una opción abre una
 * vista:
 *
 *   {
 *     id: 'reportes',                       // identificador único
 *     labelKey: 'nav.reportes',             // texto (en proyecto/translations.ts)
 *     icon: ['M3 3h18v18H3z'],              // trazos SVG del ícono (caja 24×24)
 *     component: ReportesComponent          // la vista (src/app/views/reportes/)
 *   }
 *
 * o es un grupo desplegable, con `children` en lugar de `component`.
 */
export const PROJECT_MENU: MenuItem[] = [
  {
    id: 'inicio',
    labelKey: 'nav.inicio',
    icon: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
    component: InicioComponent
  },
  {
    id: 'consulta',
    labelKey: 'nav.consulta',
    icon: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'm20 20-4-4'],
    children: [
      { id: 'cno', labelKey: 'nav.cno', icon: ICON_CNO, component: CnoComponent },
      { id: 'cuoc', labelKey: 'nav.cuoc', icon: ICON_CUOC, component: CuocComponent },
      { id: 'correlativa', labelKey: 'nav.correlativa', icon: ICON_CORRELATIVA, component: CorrelativaComponent }
    ]
  },
  {
    id: 'diligenciamiento',
    labelKey: 'nav.diligenciamiento',
    icon: ['M3 8h18v12H3z', 'M9 8V5h6v3', 'M3 13h18', 'M11 13h2'],
    children: [
      {
        id: 'analisis',
        labelKey: 'nav.analisis',
        icon: ['M3 3v18h18', 'M8 17v-5', 'M13 17V7', 'M18 17v-8'],
        component: AnalisisComponent
      },
      {
        id: 'comparativa',
        labelKey: 'nav.comparativa',
        icon: ['M12 3v18', 'M4 7h5v10H4z', 'M15 7h5v10h-5z'],
        component: ComparativaComponent
      },
      {
        id: 'instrumento-2',
        labelKey: 'nav.instrumento2',
        icon: [...ICON_PORTAPAPELES, 'M9 11h6', 'M9 15h6'],
        component: Instrumento2Component
      },
      {
        id: 'instrumento-3',
        labelKey: 'nav.instrumento3',
        icon: [...ICON_PORTAPAPELES, 'm9 14 2 2 4-4'],
        component: Instrumento3Component
      },
      {
        id: 'actualizacion',
        labelKey: 'nav.actualizacion',
        icon: ICON_CNO,
        children: [
          { id: 'actualizacion-cno', labelKey: 'nav.cno', icon: ICON_CNO, component: ActualizacionCnoComponent },
          { id: 'actualizacion-cuoc', labelKey: 'nav.cuoc', icon: ICON_CUOC, component: ActualizacionCuocComponent },
          { id: 'actualizacion-correlativa', labelKey: 'nav.correlativa', icon: ICON_CORRELATIVA, component: ActualizacionCorrelativaComponent }
        ]
      }
    ]
  },
  {
    id: 'estadisticas',
    labelKey: 'nav.estadisticas',
    icon: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5', 'M9 17v-2', 'M12 17v-5', 'M15 17v-3'],
    children: [
      {
        id: 'validaciones',
        labelKey: 'nav.validaciones',
        icon: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'm8.5 12 2.5 2.5 4.5-5'],
        component: ValidacionesComponent
      },
      {
        id: 'reportes',
        labelKey: 'nav.reportes',
        icon: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
        component: ReportesComponent
      }
    ]
  }
];

/** Vista con la que abre la aplicación (el id de una opción del menú). */
export const DEFAULT_VIEW: PageView = 'inicio';

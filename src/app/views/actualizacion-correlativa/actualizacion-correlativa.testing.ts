import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { clone, mockResponse } from '../../shared/api/mock-api';
import {
  CatalogCriteria,
  CatalogPage,
  CatalogRow,
  CorrelativeItem,
  CorrelativeRelation,
  CorrelativeUploadProgress,
  CorrelativeUploadType,
  groupRelations
} from './actualizacion-correlativa.model';
import { ActualizacionCorrelativaService } from './actualizacion-correlativa.service';

/* ---------- Datos de prueba (una muestra, no los catálogos reales) ---------- */

export const TEST_CNO_ROWS: CatalogRow[] = [
  { code: '0011', name: 'Miembros del poder ejecutivo y legislativo' },
  { code: '0012', name: 'Personal directivo de la administración pública' },
  { code: '0013', name: 'Directores y gerentes generales de producción de bienes' },
  { code: '0014', name: 'Directores y gerentes generales de servicios' },
  { code: '0122', name: 'Gerentes de banca, crédito e inversiones' }
];

export const TEST_CUOC_ROWS: CatalogRow[] = [
  { code: '01100', name: 'Oficiales de las Fuerzas Militares' },
  { code: '02100', name: 'Suboficiales de las Fuerzas Militares' },
  { code: '11110', name: 'Directores formuladores y ejecutores de políticas y normas' },
  { code: '11120', name: 'Directores del gobierno' },
  { code: '11130', name: 'Jefes de comunidades étnicas' },
  { code: '11140', name: 'Dirigentes de organizaciones con un interés específico' },
  { code: '11200', name: 'Directores y gerentes generales' },
  { code: '12111', name: 'Directores y gerentes financieros' },
  { code: '12112', name: 'Directores y gerentes de recursos humanos' },
  { code: '12113', name: 'Directores y gerentes de políticas y planeación' },
  { code: '12114', name: 'Directores y gerentes administrativos' }
];

export function createTestRelations(): CorrelativeRelation[] {
  const pair = (cno: string, cuoc: string) => {
    const cnoRow = TEST_CNO_ROWS.find((row) => row.code === cno)!;
    const cuocRow = TEST_CUOC_ROWS.find((row) => row.code === cuoc)!;
    return { cnoCode: cno, cnoName: cnoRow.name, cuocCode: cuoc, cuocName: cuocRow.name };
  };
  return groupRelations([
    pair('0011', '11110'),
    pair('0012', '11120'),
    pair('0012', '11130'),
    pair('0013', '11200'),
    pair('0013', '12111'),
    pair('0014', '11140')
  ]);
}

function search(rows: CatalogRow[], criteria: CatalogCriteria): CatalogPage {
  const needle = criteria.query.trim().toLowerCase();
  const matches = rows.filter((row) => !needle || row.code.includes(needle) || row.name.toLowerCase().includes(needle));
  const start = (criteria.page - 1) * criteria.pageSize;
  return { items: clone(matches.slice(start, start + criteria.pageSize)), total: matches.length };
}

/**
 * Doble en memoria de `ActualizacionCorrelativaService` para las pruebas de componentes. Guardar
 * reemplaza las CUOC de la CNO, igual que el backend; la carga solo responde un resultado fijo.
 */
@Injectable()
export class FakeActualizacionCorrelativaService implements Pick<ActualizacionCorrelativaService, keyof ActualizacionCorrelativaService> {
  relationsData = createTestRelations();

  searchCno(criteria: CatalogCriteria): Observable<CatalogPage> {
    return mockResponse(() => search(TEST_CNO_ROWS, criteria));
  }

  searchCuoc(criteria: CatalogCriteria): Observable<CatalogPage> {
    return mockResponse(() => search(TEST_CUOC_ROWS, criteria));
  }

  cnoAreas(): Observable<string[]> {
    return mockResponse(() => ['Dirección y gerencia', 'Finanzas y administración']);
  }

  cuocAreas(): Observable<string[]> {
    return mockResponse(() => ['Administración', 'Fuerzas militares']);
  }

  relations(): Observable<CorrelativeRelation[]> {
    return mockResponse(() => clone(this.relationsData));
  }

  save(cno: CorrelativeItem, cuoc: CorrelativeItem[]): Observable<void> {
    return mockResponse(() => {
      const others = this.relationsData.filter((relation) => relation.cno.code !== cno.code);
      this.relationsData = [...others, { cno: clone(cno), cuoc: clone(cuoc) }].sort((a, b) => a.cno.code.localeCompare(b.cno.code));
    });
  }

  upload(type: CorrelativeUploadType, _file: File): Observable<CorrelativeUploadProgress> {
    return mockResponse(() => ({
      progress: 100,
      messageKey: 'actualizacionCorrelativa.progressDone',
      done: true,
      result: { message: `Se importaron 3 registros de ${type}.`, inserted: 3, skipped: 0, errors: [], skippedDetails: [], warnings: [] }
    }));
  }

  template(_type: CorrelativeUploadType): Observable<Blob> {
    return mockResponse(() => new Blob(['plantilla']));
  }
}

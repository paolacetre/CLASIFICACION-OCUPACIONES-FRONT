import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { clone, mockResponse } from '../../shared/api/mock-api';
import {
  CorrelationRow,
  CorrelationStatus,
  CorrelativaExport,
  CorrelativaKind,
  CorrelativaPage,
  CorrelativaQuery,
  DenominationCorrelation,
  KnowledgeCorrelation,
  OccupationCorrelation
} from './correlativa.model';
import { filterRows, pageOf, toCsv } from './correlativa.rows';
import { CorrelativaService } from './correlativa.service';

/* ---------- Datos de prueba (una muestra, no las tablas reales) ---------- */

export function createTestDenominations(): DenominationCorrelation[] {
  const rows: [string, string, string, string, CorrelationStatus, string][] = [
    ['0011', 'Alcalde', '11110', 'Alcalde', 'Activo', ''],
    ['0011', 'Canciller', '11110', 'Canciller', 'Activo', ''],
    ['0011', 'Concejal', '11110', 'Concejal', 'Activo', ''],
    ['0011', 'Diputado', '11110', 'Diputado', 'Activo', ''],
    ['0011', 'Edil', '11110', 'Edil', 'Activo', ''],
    ['0011', 'Gobernador', '11110', 'Gobernador', 'Activo', ''],
    ['0011', 'Jefe de estado', '11110', 'Jefe de estado', 'Activo', ''],
    ['0011', 'Miembro del poder ejecutivo y legislativo', '11110', 'Miembro del poder ejecutivo y legislativo', 'Activo', ''],
    // Con la palabra más larga de la tabla real, para que la prueba de diseño mida el peor caso.
    ['0012', 'Director de relaciones intergubernamentales', '11120', 'Director de relaciones intergubernamentales', 'Activo', ''],
    ['0012', 'Secretario de despacho', '11120', 'Secretario de despacho', 'Activo', ''],
    ['0012', 'Gobernador indígena', '11130', 'Gobernador indígena', 'Activo', ''],
    ['0013', 'Gerente general de banco', '12113', 'Gerente de banco', 'Inactivo', 'Denominación en revisión']
  ];
  const perOccupation = new Map<string, number>();
  const perCuoc = new Map<string, number>();
  return rows.map(([cnoOccupationCode, denominationDescription, cuocOccupationCode, description, status, observation], index) => {
    const order = (perOccupation.get(cnoOccupationCode) ?? 0) + 1;
    perOccupation.set(cnoOccupationCode, order);
    const cuocOrder = (perCuoc.get(cuocOccupationCode) ?? 0) + 1;
    perCuoc.set(cuocOccupationCode, cuocOrder);
    return {
      id: index + 1,
      cnoOccupationCode,
      cnoDenominationCode: `D-${cnoOccupationCode}.${String(order).padStart(3, '0')}`,
      denominationDescription,
      cuocOccupationCode,
      cuocDenominationCode: `${cuocOccupationCode}.${String(cuocOrder).padStart(3, '0')}`,
      description,
      status,
      observation
    };
  });
}

export function createTestOccupationCorrelations(): OccupationCorrelation[] {
  const publicManagers = 'Personal directivo de la administración pública';
  const serviceManagers = 'Directores y gerentes generales de servicios financieros, de telecomunicaciones y otros servicios a las empresas';
  const rows: [string, string, string, string][] = [
    ['0011', 'Miembros del poder ejecutivo y legislativo', '11110', 'Directores formuladores y ejecutores de políticas y normas'],
    ['0012', publicManagers, '11120', 'Directores del gobierno'],
    ['0012', publicManagers, '11130', 'Jefes de comunidades étnicas'],
    ['0012', publicManagers, '11140', 'Dirigentes de organizaciones con un interés específico (partidos políticos, sindicatos y organizaciones sociales)'],
    ['0012', publicManagers, '11200', 'Directores y gerentes generales'],
    ['0013', serviceManagers, '11200', 'Directores y gerentes generales'],
    ['0013', serviceManagers, '12111', 'Directores y gerentes financieros'],
    ['0013', serviceManagers, '12113', 'Directores y gerentes de banca, crédito e inversiones'],
    ['0014', 'Directores y gerentes generales de salud, educación, servicios social y comunitario', '11200', 'Directores y gerentes generales'],
    ['0015', 'Directores y gerentes generales de comercio, medios de comunicación y otros servicios', '11200', 'Directores y gerentes generales']
  ];
  const descriptions: Record<string, string> = {
    '0011': 'Formulan, aprueban, modifican y derogan leyes y políticas públicas, y representan al Estado en el país y en el exterior.',
    '11110': 'Formulan y asesoran sobre las políticas de los gobiernos y dirigen su ejecución.',
    // Con la palabra compuesta más larga de la tabla real.
    '0014': 'Dirigen servicios de salud, educación y atención pedagógico-terapéuticas-reeducativas a la comunidad.'
  };
  return rows.map(([cnoOccupationCode, name, cuocOccupationCode, cuocName], index) => ({
    id: index + 1,
    cnoOccupationCode,
    name,
    cnoDescription: descriptions[cnoOccupationCode] ?? '',
    cuocOccupationCode,
    cuocName,
    cuocDescription: descriptions[cuocOccupationCode] ?? '',
    observation: cnoOccupationCode === '0015' ? 'Revisar con la mesa sectorial' : ''
  }));
}

export function createTestKnowledgeCorrelations(): KnowledgeCorrelation[] {
  const rows: [string, string, boolean][] = [
    ['Administración y gerencia', 'Gerencia y administración', true],
    ['Servicios de oficina y administrativos', 'Servicios de oficina y administrativos', true],
    ['Economía y contabilidad', 'Economía', true],
    ['Mercadotecnia y ventas', 'Mercadotecnia y publicidad', true],
    ['Servicio al cliente', 'Servicio al cliente', true],
    ['Recursos humanos y de personal', 'Recursos humanos y de personal', true],
    ['Producción y procesamiento', 'Producción y procesamiento', true],
    ['Producción de alimentos', 'Procesamiento de alimentos', true],
    ['Computadores y electrónica', 'Informática y electrónica', true],
    ['Ingeniería y tecnología', 'Ingeniería y tecnología', false]
  ];
  return rows.map(([cnoKnowledgeName, cuocKnowledgeName, applied], index) => ({
    id: index + 1,
    cnoKnowledgeCode: String(index + 1),
    cnoKnowledgeName,
    cuocKnowledgeCode: String(index + 1),
    cuocKnowledgeName,
    applied
  }));
}

/** Solo para pruebas: doble de `CorrelativaService` que responde desde memoria con los datos de arriba. */
@Injectable()
export class FakeCorrelativaService implements Pick<CorrelativaService, keyof CorrelativaService> {
  private readonly data: Record<CorrelativaKind, CorrelationRow[]> = {
    denominacion: createTestDenominations(),
    ocupacion: createTestOccupationCorrelations(),
    conocimiento: createTestKnowledgeCorrelations()
  };

  search(kind: CorrelativaKind, query: CorrelativaQuery): Observable<CorrelativaPage> {
    return mockResponse(() => clone(pageOf(kind, this.data[kind], query)));
  }

  export(kind: CorrelativaKind, query: CorrelativaQuery): Observable<CorrelativaExport> {
    return mockResponse(() => ({ blob: toCsv([[kind, filterRows(kind, this.data[kind], query)]]), fileName: `correlativa-${kind}.csv` }));
  }

  /** El backend entrega su Excel completo; el doble arma un CSV con las tres tablas para poder leerlo en la prueba. */
  exportAll(): Observable<CorrelativaExport> {
    return mockResponse(() => ({
      blob: toCsv((Object.keys(this.data) as CorrelativaKind[]).map((kind) => [kind, this.data[kind]])),
      fileName: 'correlativa-cno-cuoc.csv'
    }));
  }
}

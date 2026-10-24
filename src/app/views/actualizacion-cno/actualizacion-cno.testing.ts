import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { MOCK_LATENCY_MS, clone, mockResponse } from '../../shared/api/mock-api';
import { EditableOccupation } from './editar-ocupacion/editar-ocupacion.model';
import { FileReview, TemplateType, UploadProgress, UploadResult, UploadType } from './carga-cno/carga-cno.model';
import { CatalogDraft, CatalogItem, CatalogKind, OccupationDraft, PickOption, compareCodes, registrationDate, requiresCode } from './actualizacion-cno.model';
import { ActualizacionCnoService, CATALOG_CONFLICT, CATALOG_NOT_FOUND, CatalogError, OCCUPATION_CODE_TAKEN } from './actualizacion-cno.service';
import { normalizeText } from '../../shared/ui/list';

function item(code: string, name: string, description: string, active = true, registeredAt = ''): CatalogItem {
  return { code, name, description, registeredAt, active };
}

/** Catálogos de prueba (una muestra, no el catálogo real de la CNO). */
export function createTestCatalogs(): Record<CatalogKind, CatalogItem[]> {
  return {
    level: [
      item('0', 'Dirección y Gerencia', ''),
      item('1', 'Nivel 1 (A) - Profesionales', 'Nivel 1 (A): las funciones de estas ocupaciones suelen ser muy variadas y complejas.'),
      item('2', 'Nivel 2 (B) - Técnicos y supervisores', 'Nivel 2 (B): funciones variadas con responsabilidad de supervisión.'),
      item('3', 'Nivel 3 (C) - Auxiliares y operativos', 'Nivel 3,4 (C): actividades físicas e intelectuales.'),
      item('4', 'Nivel 4 (C) - Auxiliares y operativos', 'Nivel 3,4 (C): actividades físicas e intelectuales.'),
      item('6', 'Nivel 6 (D) - Obreros y ayudantes', 'Nivel 6 (D): funciones sencillas y repetitivas.')
    ],
    area: [
      item('0', 'Dirección y Gerencia', 'Ocupaciones de alta dirección y gerencia media.'),
      item('1', 'Finanzas y Administración', ''),
      item('3', 'Salud', 'Ocupaciones de servicios de salud.')
    ],
    skill: [
      item('17', 'Análisis de necesidades', ''),
      item('22', 'Análisis de control de calidad', '')
    ],
    knowledge: [
      item('1', 'Administración y gerencia', 'Principios de negocios y de administración.'),
      item('40', 'Anatomía', 'Estructura del cuerpo humano.')
    ]
  };
}

/** Ocupaciones de prueba: una inactiva y una sin descripción. */
export function createTestOccupations(): CatalogItem[] {
  return [
    item('0011', 'Miembros del poder ejecutivo y legislativo', 'Definen, formulan y orientan la política del poder público.', true, '05/03/2024'),
    item('1111', 'Auxiliares contables', ''),
    item('3311', 'Auxiliares de enfermería', 'Prestan cuidados básicos de salud.', false)
  ];
}

/** La ocupación de prueba completa para editar: dos denominaciones (una inactiva), una función y sus listas. */
export function createTestEditable(occupation: CatalogItem): EditableOccupation {
  return {
    code: occupation.code,
    name: occupation.name,
    description: occupation.description,
    areaCode: '1',
    levelCode: '2',
    active: occupation.active,
    registeredAt: occupation.registeredAt,
    inactiveAt: '',
    previousCode: '',
    traceability: '',
    primaryGroup: '',
    denominations: [
      { key: 1, code: `D-${occupation.code}.001`, text: 'Auxiliar contable', active: true, registeredAt: '' },
      { key: 2, code: `D-${occupation.code}.002`, text: 'Asistente contable', active: false, registeredAt: '05/03/2024' }
    ],
    functions: [{ key: 3, code: `F-${occupation.code}.01`, text: 'Registrar las transacciones financieras.', active: true, registeredAt: '' }],
    skills: [{ code: '17', label: 'Análisis de necesidades' }],
    knowledge: [{ code: '1', label: 'Administración y gerencia' }],
    related: [{ code: '3311', label: 'Auxiliares de enfermería' }]
  };
}

/** Funciones de prueba del catálogo. */
export function createTestFunctions(): PickOption[] {
  return [
    { code: 'F-1001', label: 'Planear y organizar las actividades del área contable.' },
    { code: 'F-1002', label: 'Registrar las transacciones financieras.' },
    { code: 'F-3311', label: 'Prestar cuidados básicos de enfermería.' }
  ];
}

/** Revisión de prueba de un archivo (ver `FakeActualizacionCnoService.reviewUpload`). */
export function createTestReview(type: UploadType, fileName: string, mapping: Record<string, string> = {}): FileReview {
  const empty = fileName.includes('vacio');
  const otherType = fileName.includes('otro');
  const extraMapped = mapping['columna_extra'] === 'descripcion';
  return {
    valid: !empty && !otherType,
    sheet: otherType ? null : 'nivel_cualificacion',
    totalRecords: empty ? 0 : 3,
    validRecords: empty ? 0 : 2,
    invalidRecords: empty ? 0 : 1,
    columns: [
      { key: 'codigo', name: 'Código de cualificación', header: otherType ? null : 'cod_cualificacion_cno', found: !otherType, required: true },
      { key: 'nombre', name: 'Nivel de cualificación', header: otherType ? null : 'niveles_cualificacion_cno', found: !otherType, required: true },
      { key: 'descripcion', name: 'Descripción', header: extraMapped ? 'columna_extra' : null, found: extraMapped, required: false }
    ],
    missingColumns: otherType ? ['Código de cualificación', 'Nivel de cualificación'] : [],
    allColumns: [
      { header: 'cod_cualificacion_cno', mapped: true, mappedTo: 'codigo', mappedLabel: 'Código de cualificación' },
      { header: 'niveles_cualificacion_cno', mapped: true, mappedTo: 'nombre', mappedLabel: 'Nivel de cualificación' },
      { header: 'columna_extra', mapped: extraMapped, mappedTo: extraMapped ? 'descripcion' : null, mappedLabel: extraMapped ? 'Descripción' : null }
    ],
    totalColumns: 3,
    preview: empty ? { headers: [], rows: [] } : { headers: ['cod_cualificacion_cno', 'niveles_cualificacion_cno', 'columna_extra'], rows: [['7', 'Nivel 7', 'x'], ['', 'Sin código', ''], ['8', 'Nivel 8', '']] },
    errors: empty ? [] : [{ row: 3, field: 'Código de cualificación', value: '', message: 'Campo obligatorio vacío.', suggestion: 'Completa «Código de cualificación» en esta fila o elimínala del archivo.' }],
    looksLike: otherType ? (type === 'nivel' ? 'area' : 'nivel') : null,
    message: empty ? 'La hoja se reconoció pero no tiene filas con datos.' : otherType ? 'No se encontró en el archivo ninguna hoja con las columnas.' : 'Se encontraron 1 registro(s) con inconsistencias de 3.'
  };
}

/** Resultado de prueba de una carga: crea 2 registros y una fila falla. */
export function createTestResult(type: UploadType): UploadResult {
  return {
    message: `Carga de «${type}» finalizada con 1 error(es).`,
    inserted: 2,
    updated: 0,
    skipped: 0,
    unreadable: 0,
    errors: 1,
    warnings: 0,
    sheets: [{ sheet: type, message: '', inserted: 2, updated: 0, skipped: 0, unreadable: 0, errors: ['Fila 3: código vacío.'], warnings: [], skippedDetails: [] }]
  };
}

/** Códigos que "usa alguna ocupación" en los datos de prueba: el servidor no deja borrarlos. */
const IN_USE: Record<CatalogKind, string[]> = { level: ['1'], area: ['0'], skill: [], knowledge: [] };

/**
 * Solo para pruebas: doble de `ActualizacionCnoService` en memoria, con las
 * reglas del backend (código y nombre del nivel únicos, código asignado en
 * habilidades y conocimientos, no se borra lo que está en uso).
 */
@Injectable()
export class FakeActualizacionCnoService implements Pick<ActualizacionCnoService, keyof ActualizacionCnoService> {

  private readonly catalogs = createTestCatalogs();

  list(kind: CatalogKind): Observable<CatalogItem[]> {
    return mockResponse(() => clone(this.catalogs[kind]).sort((a, b) => compareCodes(a.code, b.code)));
  }

  private occupationList = createTestOccupations();

  occupations(): Observable<CatalogItem[]> {
    return mockResponse(() => clone(this.occupationList));
  }

  /** Lo último que se registró con `createOccupation` (para revisar lo que envió el asistente). */
  lastCreated: OccupationDraft | null = null;

  functions(): Observable<PickOption[]> {
    return mockResponse(() => clone(createTestFunctions()));
  }

  createOccupation(draft: OccupationDraft): Observable<string> {
    return mockResponse(() => {
      const code = draft.code.trim();
      if (this.occupationList.some((entry) => entry.code === code)) {
        throw new CatalogError(OCCUPATION_CODE_TAKEN, `Ya existe una ocupación CNO con código ${code}`);
      }
      this.lastCreated = clone(draft);
      this.occupationList = [...this.occupationList, item(code, draft.name.trim(), draft.description.trim(), draft.active, registrationDate(draft.registeredOn))].sort((a, b) =>
        compareCodes(a.code, b.code)
      );
      return code;
    }, MOCK_LATENCY_MS);
  }

  /** Lo último que se cargó con `upload` (tipo y correcciones de columnas). */
  uploads: { type: UploadType; mapping: Record<string, string> }[] = [];

  /**
   * Revisión de prueba: un archivo cuyo nombre contiene "vacio" no tiene filas, uno con "otro" parece de otro
   * tipo, y lo demás trae 3 registros (uno con error) y una columna que no corresponde, salvo que se asigne.
   */
  reviewUpload(type: UploadType, file: File, mapping: Record<string, string> = {}): Observable<FileReview> {
    return mockResponse(() => createTestReview(type, file.name, mapping), MOCK_LATENCY_MS);
  }

  upload(type: UploadType, _file: File, mapping: Record<string, string> = {}): Observable<UploadProgress> {
    return mockResponse((): UploadProgress => {
      this.uploads.push({ type, mapping: { ...mapping } });
      return { progress: 100, messageKey: 'cargaCno.progressDone', done: true, result: createTestResult(type) };
    }, MOCK_LATENCY_MS);
  }

  template(type: TemplateType): Observable<Blob> {
    return mockResponse(() => new Blob([`Plantilla ${type}`]));
  }

  /** Lo último que se guardó con `saveOccupation` (ocupación, área y nivel por nombre). */
  lastSaved: { occupation: EditableOccupation; areaName: string; levelName: string } | null = null;

  occupationDetail(code: string): Observable<EditableOccupation> {
    return mockResponse(() => {
      const found = this.occupationList.find((entry) => entry.code === code);
      if (!found) {
        throw new CatalogError(CATALOG_NOT_FOUND, '');
      }
      return createTestEditable(found);
    });
  }

  saveOccupation(occupation: EditableOccupation, areaName: string, levelName: string): Observable<string> {
    return mockResponse(() => {
      this.lastSaved = clone({ occupation, areaName, levelName });
      this.occupationList = this.occupationList.map((entry) =>
        entry.code === occupation.code ? { ...entry, name: occupation.name.trim(), description: occupation.description.trim(), active: occupation.active } : entry
      );
      return occupation.code;
    }, MOCK_LATENCY_MS);
  }

  removeOccupation(code: string): Observable<void> {
    return mockResponse(() => {
      if (!this.occupationList.some((entry) => entry.code === code)) {
        throw new CatalogError(CATALOG_NOT_FOUND, '');
      }
      this.occupationList = this.occupationList.filter((entry) => entry.code !== code);
    }, MOCK_LATENCY_MS);
  }

  refreshOccupations(): void {
    // La lista en memoria ya está al día.
  }

  create(kind: CatalogKind, draft: CatalogDraft): Observable<CatalogItem> {
    return mockResponse(() => {
      const items = this.catalogs[kind];
      const code = requiresCode(kind) ? draft.code.trim() : String(Math.max(0, ...items.map((entry) => Number(entry.code) || 0)) + 1);
      if (items.some((entry) => entry.code === code)) {
        throw new CatalogError(CATALOG_CONFLICT, `Ya existe un registro con el código ${code}.`);
      }
      this.assertFreeName(kind, draft.name, null);
      const created = item(code, draft.name.trim(), draft.description.trim());
      items.push(created);
      return clone(created);
    }, MOCK_LATENCY_MS);
  }

  update(kind: CatalogKind, code: string, draft: CatalogDraft): Observable<CatalogItem> {
    return mockResponse(() => {
      const found = this.find(kind, code);
      this.assertFreeName(kind, draft.name, code);
      found.name = draft.name.trim();
      found.description = draft.description.trim();
      return clone(found);
    }, MOCK_LATENCY_MS);
  }

  remove(kind: CatalogKind, code: string): Observable<void> {
    return mockResponse(() => {
      const found = this.find(kind, code);
      if (IN_USE[kind].includes(code)) {
        throw new CatalogError(CATALOG_CONFLICT, `No se puede eliminar: 12 ocupación(es) usan "${found.name}".`);
      }
      this.catalogs[kind] = this.catalogs[kind].filter((entry) => entry.code !== code);
    }, MOCK_LATENCY_MS);
  }

  private find(kind: CatalogKind, code: string): CatalogItem {
    const found = this.catalogs[kind].find((entry) => entry.code === code);
    if (!found) {
      throw new CatalogError(CATALOG_NOT_FOUND, '');
    }
    return found;
  }

  /** El backend exige nombres de nivel distintos (Análisis identifica los niveles por su nombre). */
  private assertFreeName(kind: CatalogKind, name: string, ownCode: string | null): void {
    if (kind === 'level' && this.catalogs.level.some((entry) => entry.code !== ownCode && normalizeText(entry.name) === normalizeText(name))) {
      throw new CatalogError(CATALOG_CONFLICT, `Ya existe un nivel llamado "${name.trim()}".`);
    }
  }
}

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { clone, mockResponse } from '../../shared/api/mock-api';
import { Review, ReviewItem, ReviewOccupation, ReviewRecord, ReviewSave, ReviewState, emptyInformant } from './validaciones.model';
import { ValidacionesService } from './validaciones.service';

/* ---------- Datos de prueba (una muestra, no la bandeja real) ---------- */

const iso = (daysAgo: number, hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 14, 0, 0);
  return date.toISOString();
};

export function createTestRecords(): ReviewRecord[] {
  return [
    { id: 6, kind: 'I2', state: 'edited', occupations: [{ code: '2126', name: 'Agroecólogos' }, { code: '21321', name: 'Agrónomos' }], analyst: 'admin@sena.edu.co', date: iso(1, 15) },
    { id: 4, kind: 'I2', state: 'received', occupations: [{ code: '7334', name: 'Trabajadores del campo' }, { code: '6111', name: 'Agricultores' }], analyst: 'admin@sena.edu.co', date: iso(14, 11) },
    { id: 9, kind: 'I3', state: 'received', occupations: [{ code: '2512', name: 'Desarrolladores de software' }], analyst: 'analista@sena.edu.co', date: iso(20, 9) },
    { id: 2, kind: 'I2', state: 'sent', occupations: [{ code: '0211', name: 'Gerentes de ingeniería' }], analyst: 'analista@sena.edu.co', date: iso(28, 16) }
  ];
}

/** Ítem como lo arma el servicio desde el snapshot: `<copia>::<campo>` («funcion_2» si el campo se repite). */
const item = (occupation: string, section: ReviewItem['section'], n: number, key: string, value: string, numberedItem = true, criterion = 5): ReviewItem => {
  const field = numberedItem ? `${key}_${n}` : key;
  return {
    id: `${occupation}::${field}`,
    field,
    occupationCode: occupation,
    section,
    labelKey: `validaciones.item.${key}`,
    n: numberedItem ? n : undefined,
    criterion,
    value,
    inactive: false
  };
};

export function createTestOccupations(): ReviewOccupation[] {
  return [
    {
      code: '2126',
      copyCode: '2126',
      name: 'Agroecólogos',
      level: 'Nivel 1',
      area: 'Ciencias Naturales',
      description: 'Estudian los agroecosistemas.',
      adjustable: true,
      items: [
        item('2126', 'info', 1, 'name', 'Agroecólogos', false, 1),
        item('2126', 'info', 2, 'description', 'Estudian los agroecosistemas.', false, 4),
        item('2126', 'functions', 1, 'function', 'Diseñar sistemas de producción sostenibles.'),
        item('2126', 'functions', 2, 'function', 'Asesorar a productores.'),
        item('2126', 'skills', 1, 'skill', 'Pensamiento crítico.')
      ]
    },
    {
      code: '21321',
      copyCode: '21321',
      name: 'Agrónomos',
      level: 'Nivel 1',
      area: 'Ciencias Naturales',
      description: '',
      adjustable: false,
      items: [item('21321', 'info', 1, 'name', 'Agrónomos', false, 1), item('21321', 'denominations', 1, 'denomination', 'Ingeniero agrónomo', true, 6)]
    }
  ];
}

const STATE_AFTER: Record<ReviewSave['verdict'], ReviewState> = { en_revision: 'received', aprobada: 'sent', ajustes_solicitados: 'edited' };

/**
 * Doble en memoria de `ValidacionesService` para las pruebas de componentes. Guardar cambia el
 * estado de la fila igual que el backend y recuerda lo último que se guardó.
 */
@Injectable()
export class FakeValidacionesService implements Pick<ValidacionesService, keyof ValidacionesService> {
  records = createTestRecords();
  lastSave: ReviewSave | null = null;

  list(): Observable<ReviewRecord[]> {
    return mockResponse(() => clone(this.records));
  }

  review(record: ReviewRecord): Observable<Review> {
    return mockResponse(() => ({
      record: clone(record),
      occupations: createTestOccupations(),
      grades: {},
      informant: { ...emptyInformant(), fullName: 'SENA Admin', email: 'admin@sena.edu.co' },
      observations: '',
      proposals: {},
      hasSavedValidation: false
    }));
  }

  save(record: ReviewRecord, data: ReviewSave): Observable<void> {
    return mockResponse(() => {
      this.lastSave = clone(data);
      const row = this.records.find((candidate) => candidate.id === record.id);
      if (row) {
        row.state = STATE_AFTER[data.verdict];
      }
    });
  }
}

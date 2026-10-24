import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { MOCK_LATENCY_MS, clone, mockResponse } from '../../shared/api/mock-api';
import { AnalysisOccupation } from '../analisis/analisis.model';
import { Expert, ExpertSelection, Instrument2Detail, Instrument2Item, canSendToExpert } from './instrumento-2.model';
import { INSTRUMENT_NOT_FOUND, INSTRUMENT_NOT_READY, Instrumento2Service } from './instrumento-2.service';

function occupation(catalog: 'CNO' | 'CUOC', code: string, name: string, level: string, area: string, functions: string[] = []): AnalysisOccupation {
  return {
    catalog,
    code,
    status: '',
    name,
    level,
    area,
    description: `Descripción de ${name}.`,
    functions: functions.map((text, index) => ({ code: `F-${code}.0${index + 1}`, text })),
    skills: [],
    knowledge: [{ code: '79', text: 'Administración' }],
    denominations: [{ code: `D-${code}.001`, text: `${name} sénior` }],
    related: [],
    registeredAt: '22/09/2026',
    traceability: catalog === 'CNO' ? 'CIUO 1120' : ''
  };
}

const ARMED_FORCES = occupation('CUOC', '03100', 'Otros miembros de las Fuerzas Militares', 'Nivel 1', 'Seguridad');

/** Instrumentos de prueba: uno por estado de la bandeja, del más antiguo al más reciente. */
export function createTestInstruments(): Instrument2Detail[] {
  const base = { analyst: 'analista@sena.edu.co', day: '22 sep 2026', observation: '' };
  return [
    {
      ...base,
      id: 1,
      state: 'VALIDADO',
      time: '04:12 p. m.',
      occupations: [occupation('CNO', '0211-1', 'Gerentes de ingeniería', 'Nivel 0', 'Dirección y Gerencia'), occupation('CUOC', '01100', 'Oficiales de las Fuerzas Militares de la orden', 'Nivel 4', 'Seguridad'), ARMED_FORCES]
    },
    {
      ...base,
      id: 2,
      state: 'AJUSTES_SOLICITADOS',
      time: '04:16 p. m.',
      occupations: [occupation('CNO', '0211', 'Gerentes de ingeniería', 'Nivel 0', 'Dirección y Gerencia'), occupation('CUOC', '01100-2', 'Oficiales de las Fuerzas Militares del orden', 'Nivel 4', 'Seguridad'), ARMED_FORCES]
    },
    {
      ...base,
      id: 3,
      state: 'ENVIADO_EXPERTO',
      analyst: 'admin@sena.edu.co',
      day: '06 oct 2026',
      time: '11:50 a. m.',
      occupations: [
        occupation('CNO', '7334', 'Trabajadores del campo', 'Nivel 3', 'Explotación primaria y extractiva', ['Preparar la tierra', 'Cosechar']),
        occupation('CUOC', '61121', 'Agricultores de plantaciones de árboles y arbustos', 'Nivel 2', 'Agropecuario'),
        occupation('CUOC', '61131', 'Agricultores de huertas, invernaderos, viveros y jardines', 'Nivel 2', 'Agropecuario')
      ]
    },
    {
      ...base,
      id: 4,
      state: 'GUARDADO',
      analyst: 'admin@sena.edu.co',
      day: '07 oct 2026',
      time: '09:05 a. m.',
      observation: 'Revisar el nivel de cualificación.',
      occupations: [occupation('CNO', '2111', 'Físicos y astrónomos', 'Nivel 1', 'Ciencias Naturales', ['Investigar', 'Publicar resultados']), occupation('CUOC', '21110', 'Físicos y astrónomos', 'Nivel 4', 'Ciencias')]
    },
    {
      ...base,
      id: 5,
      state: 'GUARDADO',
      day: '08 oct 2026',
      time: '02:30 p. m.',
      occupations: [occupation('CNO', '3111', 'Técnicos en química', 'Nivel 2', 'Ciencias Naturales', ['Preparar muestras']), occupation('CUOC', '31110', 'Técnicos en ciencias químicas', 'Nivel 3', 'Ciencias')]
    }
  ];
}

/**
 * Solo para pruebas: doble de `Instrumento2Service` en memoria, con la misma
 * regla del backend (solo lo GUARDADO se envía al experto).
 */
@Injectable()
export class FakeInstrumento2Service implements Pick<Instrumento2Service, keyof Instrumento2Service> {

  private readonly instruments = createTestInstruments();
  /** Expertos de prueba; `null` simula un servidor que no permite elegirlos (como la copia local del backend). */
  availableExperts: Expert[] | null = [
    { id: 7, name: 'Experto Sena', email: 'experto@sena.edu.co' },
    { id: 9, name: 'Experta Pecuaria', email: 'pecuaria@sena.edu.co' }
  ];
  /** Selección enviada por instrumento, para que las pruebas la revisen. */
  readonly sentSelections = new Map<number, ExpertSelection | undefined>();

  list(): Observable<Instrument2Item[]> {
    return mockResponse(() => clone(this.instruments.map(({ observation: _observation, ...item }) => item)).sort((a, b) => b.id - a.id));
  }

  detail(id: number): Observable<Instrument2Detail> {
    return mockResponse(() => clone(this.find(id)));
  }

  experts(): Observable<Expert[] | null> {
    return mockResponse(() => clone(this.availableExperts));
  }

  sendToExpert(id: number, selection?: ExpertSelection): Observable<Instrument2Item> {
    return mockResponse(() => {
      const instrument = this.find(id);
      if (!canSendToExpert(instrument.state)) {
        throw new Error(INSTRUMENT_NOT_READY);
      }
      this.sentSelections.set(id, selection);
      instrument.state = 'ENVIADO_EXPERTO';
      return clone(instrument);
    }, MOCK_LATENCY_MS);
  }

  private find(id: number): Instrument2Detail {
    const instrument = this.instruments.find((item) => item.id === id);
    if (!instrument) {
      throw new Error(INSTRUMENT_NOT_FOUND);
    }
    return instrument;
  }
}

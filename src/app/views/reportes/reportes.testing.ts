import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { clone, mockResponse } from '../../shared/api/mock-api';
import { CriterionFamily, CriterionState, ReportCriterion, ReportOccupation, ReportRecord, allCriteria, classify, coincidenceScore, evaluate } from './reportes.model';
import { ReportesService } from './reportes.service';

/* ---------- Datos de prueba (una muestra, no el resumen real) ---------- */

const criterion = (code: string, family: CriterionFamily, n: number, state: CriterionState, value: string, comment = ''): ReportCriterion => ({
  id: `${code}::${family}_${n || 1}`,
  family,
  n,
  state,
  value,
  comment
});

const occupation = (code: string, name: string, criteria: ReportCriterion[]): ReportOccupation => ({
  code,
  catalog: code.length === 5 ? 'CUOC' : 'CNO',
  name,
  level: 'Nivel 1',
  criteria,
  evaluation: evaluate(criteria)
});

function record(group: number, occupations: ReportOccupation[], extra: Partial<ReportRecord>): ReportRecord {
  const base = {
    id: 0,
    group,
    kind: 'I2' as const,
    startedAt: '2026-10-19T20:14:38.871Z',
    finishedAt: '2026-10-19T20:32:00.000Z',
    date: '2026-10-19T20:14:38.871Z',
    fullName: 'Experto Sena',
    email: 'experto@sena.edu.co',
    phone: '3000000003',
    department: 'Antioquia',
    city: 'Amalfi',
    company: 'Sena',
    position: 'Administrador',
    profession: 'Director',
    sector: '',
    occupations,
    observations: '',
    ...extra
  };
  const criteria = allCriteria(base as ReportRecord);
  return { ...base, evaluation: evaluate(criteria), classification: classify(criteria), score: coincidenceScore(criteria) } as ReportRecord;
}

export function createTestReport(): ReportRecord[] {
  return [
    record(
      6,
      [
        occupation('2126', 'Agroecólogos', [
          criterion('2126', 'name', 0, 'aplica', 'Agroecólogos'),
          criterion('2126', 'functions', 1, 'aplica', 'Planificar agroecosistemas'),
          criterion('2126', 'functions', 2, 'no_aplica', 'Proponer estrategias'),
          criterion('2126', 'knowledge', 1, 'parcial', 'Biología', 'mejorarlo')
        ]),
        occupation('21321', 'Agrónomos', [criterion('21321', 'name', 0, 'no_aplica', 'Agrónomos'), criterion('21321', 'related', 1, 'aplica', 'Expertos forestales')])
      ],
      { id: 1 }
    ),
    record(
      10,
      [occupation('1111', 'Contadores', [criterion('1111', 'name', 0, 'aplica', 'Contadores'), criterion('1111', 'description', 0, 'aplica', 'Aplican, planean…')])],
      { id: 2, department: 'Cundinamarca', city: 'Bogotá', company: 'SENA Regional', date: '2026-10-21T10:00:00.000Z' }
    )
  ];
}

/** Doble en memoria de `ReportesService` para las pruebas de componentes. */
@Injectable()
export class FakeReportesService implements Pick<ReportesService, keyof ReportesService> {
  records = createTestReport();

  list(): Observable<ReportRecord[]> {
    return mockResponse(() => clone(this.records));
  }
}

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MOCK_LATENCY_MS, clone, mockResponse } from '../../shared/api/mock-api';
import { SESSION } from '../../shared/session';
import { Informant, Instrument3Catalogs, Proposal, ProposalDraft, createEmptyDraft, isEditable, isValidEmail } from './instrumento-3.model';
import { INVALID_PROPOSAL, Instrumento3Service, PROPOSAL_LOCKED, PROPOSAL_NOT_FOUND, SavedNotSentError } from './instrumento-3.service';

/** Catálogo de prueba con el formato que arma el servicio (las diez áreas y los cuatro niveles CNO, y una muestra del resto). */
export function createTestCatalogs(): Instrument3Catalogs {
  const options = (labels: string[]) => labels.map((label) => ({ value: label, label }));
  return {
    areas: options([
      '0. Dirección y Gerencia',
      '1. Finanzas y Administración',
      '2. Ciencias Naturales, Aplicadas y Relacionadas',
      '3. Salud',
      '4. Ciencias Sociales, Educación, Gobierno y Religión',
      '5. Arte, Cultura, Esparcimiento y Deporte',
      '6. Ventas y Servicios',
      '7. Explotación primaria y extractiva',
      '8. Operación de Equipos, Transporte y Oficios',
      '9. Procesamiento, Fabricación y Ensamble'
    ]),
    levels: options([
      'Nivel 1 (A) - Profesionales, Dirección y Gerencia',
      'Nivel 2 (B) - Tecnicos y supervisores',
      'Nivel 3,4 (C) - Auxiliares y operativos',
      'Nivel 6 (D) - Obreros y ayudantes'
    ]),
    skills: ['Comunicación asertiva', 'Liderazgo', 'Orientación al Servicio', 'Pensamiento crítico', 'Trabajo en equipo'],
    knowledge: ['Administración y gerencia', 'Matemáticas', 'Primeros auxilios básicos', 'Servicio al cliente']
  };
}

/** Propuestas de prueba: un borrador, una guardada y una que ya tiene el experto. */
export function createTestProposals(): Proposal[] {
  const base: ProposalDraft = {
    ...createEmptyDraft({ name: 'Analista TDO', email: 'analista@sena.edu.co' }),
    date: '2026-10-06',
    phone: '3001234567',
    department: 'antioquia',
    municipality: '05001',
    organization: 'SENA',
    position: 'Analista',
    sector: 'salud',
    area: '3. Salud',
    level: 'Nivel 2 (B) - Tecnicos y supervisores',
    description: 'Apoya la atención de pacientes en servicios de salud.',
    functions: ['Recibir a los pacientes', 'Registrar la atención'],
    denominations: ['Auxiliar de atención en salud'],
    relatedOccupations: ['3311 - Auxiliares de enfermería'],
    skills: ['Trabajo en equipo', 'Orientación al Servicio'],
    knowledge: ['Servicio al cliente'],
    otherKnowledge: ['Primeros auxilios']
  };
  return [
    { ...base, id: 1, state: 'ENVIADO_EXPERTO', analyst: 'analista@sena.edu.co', occupationName: 'Gestores de telesalud' },
    { ...base, id: 2, state: 'GUARDADO', analyst: 'admin@sena.edu.co', occupationName: 'Auxiliares de atención en salud' },
    { ...base, id: 3, state: 'BORRADOR', analyst: 'admin@sena.edu.co', occupationName: 'Operadores de drones agrícolas', area: '', level: '', description: '', functions: [], skills: [], knowledge: [] }
  ];
}

/**
 * Solo para pruebas: doble de `Instrumento3Service` en memoria, con las mismas
 * reglas del backend (guardar deja BORRADOR, enviar deja ENVIADO_EXPERTO y lo
 * enviado no se edita ni se borra).
 */
@Injectable()
export class FakeInstrumento3Service implements Pick<Instrumento3Service, keyof Instrumento3Service> {
  private readonly session = inject(SESSION);

  private proposals = createTestProposals();
  /** Datos generales que "el servidor" recuerda; las pruebas los ponen con `remembered`. */
  remembered: Informant | null = null;

  informant(): Observable<Informant | null> {
    return mockResponse(() => clone(this.remembered));
  }

  /** Catálogo que "el servidor" entrega; las pruebas lo revisan. */
  readonly catalogsData = createTestCatalogs();

  catalogs(): Observable<Instrument3Catalogs> {
    return mockResponse(() => clone(this.catalogsData));
  }

  /** Lo guardado hasta ahora (solo para comprobarlo en las pruebas; el servicio real no lista). */
  stored(): Proposal[] {
    return clone(this.proposals);
  }

  save(draft: ProposalDraft, id: number | null = null): Observable<Proposal> {
    return mockResponse(() => this.store(draft, id), MOCK_LATENCY_MS);
  }

  saveAndSend(draft: ProposalDraft, id: number | null = null): Observable<Proposal> {
    return mockResponse(() => {
      const saved = this.store(draft, id);
      try {
        return this.send(saved.id);
      } catch {
        throw new SavedNotSentError(saved.id);
      }
    }, MOCK_LATENCY_MS);
  }

  private store(draft: ProposalDraft, id: number | null): Proposal {
    if (draft.email.trim() && !isValidEmail(draft.email)) {
      throw new Error(INVALID_PROPOSAL);
    }
    const filled = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
    const content: ProposalDraft = { ...clone(draft), functions: filled(draft.functions), denominations: filled(draft.denominations), relatedOccupations: filled(draft.relatedOccupations) };
    if (id === null) {
      const created: Proposal = { ...content, id: Math.max(0, ...this.proposals.map((item) => item.id)) + 1, state: 'BORRADOR', analyst: this.session.email };
      this.proposals.push(created);
      return clone(created);
    }
    const proposal = this.editable(id);
    Object.assign(proposal, content, { state: 'BORRADOR' });
    return clone(proposal);
  }

  private send(id: number): Proposal {
    const proposal = this.editable(id);
    if (!proposal.occupationName.trim()) {
      throw new Error(PROPOSAL_LOCKED);
    }
    proposal.state = 'ENVIADO_EXPERTO';
    return clone(proposal);
  }

  private editable(id: number): Proposal {
    const proposal = this.proposals.find((item) => item.id === id);
    if (!proposal) {
      throw new Error(PROPOSAL_NOT_FOUND);
    }
    if (!isEditable(proposal.state)) {
      throw new Error(PROPOSAL_LOCKED);
    }
    return proposal;
  }
}

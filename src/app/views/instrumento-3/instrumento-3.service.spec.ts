/// <reference types="jasmine" />

/*
 * Instrumento3Service real: qué pide al backend y cómo traduce sus respuestas.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION } from '../../shared/session';
import { Instrument3Catalogs, Proposal, ProposalDraft, createEmptyDraft } from './instrumento-3.model';
import { INVALID_PROPOSAL, Instrumento3Service, PROPOSAL_LOCKED, PROPOSAL_NOT_FOUND, SAVED_NOT_SENT, SavedNotSentError } from './instrumento-3.service';

describe('Instrumento3Service', () => {
  let service: Instrumento3Service;
  let backend: HttpTestingController;

  function setup(role = 'Administrador'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: Instrumento3Service, useClass: Instrumento3Service },
        { provide: SESSION, useValue: { role, email: 'admin@sena.edu.co' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(Instrumento3Service);
    backend = TestBed.inject(HttpTestingController);
  }

  // Fecha local, para que la prueba no dependa de la zona horaria del equipo.
  const savedAt = new Date(2026, 9, 6, 11, 50).toISOString();
  const dto = (id: number, estado: string) => ({
    id,
    estado,
    fecha: savedAt,
    analista: 'admin@sena.edu.co',
    nombreApellidos: 'Ana Ríos',
    email: 'ana@sena.edu.co',
    telefono: '3001234567',
    departamento: 'antioquia',
    municipio: '05001',
    empresaEntidad: 'SENA',
    cargo: 'Analista',
    sector: 'salud',
    nombreOcupacion: 'Gestores de telesalud',
    codArea: 3,
    areaDesempeno: '3. Salud',
    codNivelCualificacion: 2,
    nivelCualificacion: 'Nivel 2 (B) - Tecnicos y supervisores',
    descripcion: 'Coordinan la atención remota.',
    otrasHabilidades: null,
    otrosConocimientos: 'Primeros auxilios; Telemedicina',
    funciones: ['Agendar teleconsultas', ''],
    denominaciones: ['Gestor de telemedicina'],
    habilidades: ['Trabajo en equipo'],
    conocimientos: ['Servicio al cliente'],
    ocupacionesRelacionadas: null,
    preguntas: []
  });

  const draft: ProposalDraft = {
    ...createEmptyDraft({ name: ' Ana Ríos ', email: ' ana@sena.edu.co ' }),
    date: '2026-10-06',
    occupationName: ' Gestores de telesalud ',
    area: '3. Salud',
    level: 'Nivel 3,4 (C) - Auxiliares y operativos',
    description: ' Coordinan la atención remota. ',
    functions: [' Agendar teleconsultas ', '', '  '],
    denominations: ['Gestor de telemedicina', '', ''],
    relatedOccupations: ['', ''],
    skills: ['Trabajo en equipo'],
    otherSkills: ['', '  '],
    knowledge: ['Servicio al cliente'],
    otherKnowledge: [' Primeros auxilios ', '', 'Telemedicina']
  };

  const PROFILE_URL = '/api/mi-cuenta/perfil-analista';

  /**
   * La siguiente petición a `url`. Antes de guardar una propuesta el servicio
   * actualiza el perfil del analista: aquí se le responde para que continúe.
   */
  function next(url: string) {
    backend.match(PROFILE_URL).forEach((request) => request.flush({}));
    return backend.expectOne(url);
  }

  afterEach(() => {
    backend.verify();
  });

  it('should create a draft with only the filled boxes and the codes of the area and the level', () => {
    setup();
    let saved: Proposal | undefined;
    service.save(draft).subscribe((result) => (saved = result));
    const request = next('/api/instrumento3');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      fecha: '2026-10-06',
      nombreApellidos: 'Ana Ríos',
      email: 'ana@sena.edu.co',
      telefono: '',
      departamento: '',
      municipio: '',
      empresaEntidad: '',
      cargo: '',
      sector: '',
      nombreOcupacion: 'Gestores de telesalud',
      areaDesempeno: '3. Salud',
      codArea: 3,
      nivelCualificacion: 'Nivel 3,4 (C) - Auxiliares y operativos',
      codNivelCualificacion: 3,
      descripcion: 'Coordinan la atención remota.',
      funciones: ['Agendar teleconsultas'],
      denominaciones: ['Gestor de telemedicina'],
      ocupacionesRelacionadas: [],
      habilidades: ['Trabajo en equipo'],
      otrasHabilidades: '',
      conocimientos: ['Servicio al cliente'],
      // Un campo por cada «+ Agregar», sin los vacíos, en el único texto que guarda el backend.
      otrosConocimientos: 'Primeros auxilios; Telemedicina'
    });
    request.flush(dto(7, 'BORRADOR'));
    // La respuesta vuelve en la forma del formulario (los ítems vacíos no se muestran).
    expect(saved).toEqual({
      id: 7,
      state: 'BORRADOR',
      analyst: 'admin@sena.edu.co',
      date: '2026-10-06',
      fullName: 'Ana Ríos',
      email: 'ana@sena.edu.co',
      phone: '3001234567',
      department: 'antioquia',
      municipality: '05001',
      organization: 'SENA',
      position: 'Analista',
      sector: 'salud',
      occupationName: 'Gestores de telesalud',
      area: '3. Salud',
      level: 'Nivel 2 (B) - Tecnicos y supervisores',
      description: 'Coordinan la atención remota.',
      functions: ['Agendar teleconsultas'],
      denominations: ['Gestor de telemedicina'],
      relatedOccupations: [],
      skills: ['Trabajo en equipo'],
      otherSkills: [],
      knowledge: ['Servicio al cliente'],
      otherKnowledge: ['Primeros auxilios', 'Telemedicina']
    });

    // Sin correo, el campo no viaja (el backend lo valida aunque sea opcional); sin área ni nivel, sus códigos van en 0.
    service.save({ ...draft, email: '  ', area: '', level: '' }).subscribe();
    const empty = next('/api/instrumento3');
    expect('email' in empty.request.body).toBeFalse();
    expect(empty.request.body.fecha).toBe('2026-10-06');
    expect([empty.request.body.codArea, empty.request.body.codNivelCualificacion]).toEqual([0, 0]);
    empty.flush(dto(8, 'BORRADOR'));

    // Sin fecha tampoco viaja el campo: el servidor pone la de hoy.
    service.save({ ...draft, date: '' }).subscribe();
    const undated = next('/api/instrumento3');
    expect('fecha' in undated.request.body).toBeFalse();
    undated.flush(dto(9, 'BORRADOR'));
  });

  it('should read area, level, skills and knowledge complete from the CNO catalog of the server', () => {
    setup();
    let catalogs: Instrument3Catalogs | undefined;
    service.catalogs().subscribe((result) => (catalogs = result));
    const page = <T>(path: string, data: T[]) => {
      const request = backend.expectOne((item) => item.url === `/api/cno/catalogos/${path}`);
      expect(request.request.params.get('limit')).toBe('500');
      request.flush({ data, total: data.length, page: 1, limit: 500, totalPages: 1 });
    };
    page('areas-desempeno', [{ codDesempeno: '1', nomDesempeno: 'Finanzas y Administración' }, { codDesempeno: '0', nomDesempeno: 'Dirección y Gerencia' }]);
    // Los niveles que Análisis crea como copia no son del catálogo oficial.
    page('niveles-cualificacion', [
      { codCualificacion: 'Nivel 1 (A)', nivelesCualificacion: 'Profesionales, Dirección y Gerencia' },
      { codCualificacion: 'Nivel 1 (A)-C1', nivelesCualificacion: 'Copia de Análisis', esCopia: true }
    ]);
    page('habilidades', [{ nombHabDest: 'Liderazgo' }, { nombHabDest: 'Comunicación asertiva' }, { nombHabDest: 'Liderazgo' }]);
    page('conocimientos', [{ nombConocimiento: 'Matemáticas' }, { nombConocimiento: 'Administración y gerencia' }]);
    expect(catalogs).toEqual({
      areas: [
        { value: '0. Dirección y Gerencia', label: '0. Dirección y Gerencia' },
        { value: '1. Finanzas y Administración', label: '1. Finanzas y Administración' }
      ],
      levels: [{ value: 'Nivel 1 (A) - Profesionales, Dirección y Gerencia', label: 'Nivel 1 (A) - Profesionales, Dirección y Gerencia' }],
      skills: ['Comunicación asertiva', 'Liderazgo'],
      knowledge: ['Administración y gerencia', 'Matemáticas']
    });
  });

  it('should read the general data the server remembers, or nothing when it has none', () => {
    setup();
    const results: unknown[] = [];
    service.informant().subscribe((informant) => results.push(informant));
    const request = backend.expectOne(PROFILE_URL);
    expect(request.request.method).toBe('GET');
    request.flush({ fecha: '2026-10-01', nombreApellidos: 'Ana Ríos', email: 'ana@sena.edu.co', telefono: null, departamento: 'antioquia', municipio: '05001', empresaEntidad: 'SENA', cargo: 'Analista', profesion: 'Economista', sector: 'salud' });
    // La profesión que el servidor aún recuerde no se usa: el formulario ya no la pide.
    expect(results[0]).toEqual({ fullName: 'Ana Ríos', email: 'ana@sena.edu.co', phone: '', department: 'antioquia', municipality: '05001', organization: 'SENA', position: 'Analista', sector: 'salud' });

    // Sin perfil, con el perfil vacío o si el servidor no tiene ese servicio: nada que llenar.
    service.informant().subscribe((informant) => results.push(informant));
    backend.expectOne(PROFILE_URL).flush(null);
    service.informant().subscribe((informant) => results.push(informant));
    backend.expectOne(PROFILE_URL).flush({ nombreApellidos: '', email: '' });
    service.informant().subscribe((informant) => results.push(informant));
    backend.expectOne(PROFILE_URL).flush({ message: 'Cannot GET' }, { status: 404, statusText: 'Not Found' });
    expect(results.slice(1)).toEqual([null, null, null]);
  });

  it('should tell the server the general data before saving, and save anyway if that fails', () => {
    setup();
    let saved: Proposal | undefined;
    service.save(draft).subscribe((result) => (saved = result));
    // Primero el perfil; la propuesta todavía no viaja.
    backend.expectNone('/api/instrumento3');
    const profile = backend.expectOne(PROFILE_URL);
    expect(profile.request.method).toBe('PUT');
    expect(profile.request.body).toEqual({ fecha: '2026-10-06', nombreApellidos: 'Ana Ríos', email: 'ana@sena.edu.co', telefono: '', departamento: '', municipio: '', empresaEntidad: '', cargo: '', sector: '' });
    profile.flush({ message: 'Cannot PUT' }, { status: 404, statusText: 'Not Found' });
    backend.expectOne('/api/instrumento3').flush(dto(7, 'BORRADOR'));
    expect(saved?.id).toBe(7);
  });

  it('should update an existing proposal instead of creating another', () => {
    setup();
    service.save(draft, 7).subscribe();
    const request = next('/api/instrumento3/7');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.nombreOcupacion).toBe('Gestores de telesalud');
    request.flush(dto(7, 'BORRADOR'));
  });

  it('should save, confirm and send to the expert in that order', () => {
    setup();
    let sent: Proposal | undefined;
    service.saveAndSend(draft).subscribe((result) => (sent = result));
    next('/api/instrumento3').flush(dto(7, 'BORRADOR'));
    const confirm = next('/api/instrumento3/7/guardar');
    expect(confirm.request.method).toBe('POST');
    confirm.flush(dto(7, 'GUARDADO'));
    const send = next('/api/instrumento3/7/enviar-experto');
    expect(send.request.method).toBe('POST');
    send.flush(dto(7, 'ENVIADO_EXPERTO'));
    expect(sent?.state).toBe('ENVIADO_EXPERTO');

    // Si el guardado sale bien y el envío no, la propuesta ya existe: el error dice cuál quedó guardada.
    let error: unknown;
    service.saveAndSend(draft).subscribe({ error: (e: unknown) => (error = e) });
    next('/api/instrumento3').flush(dto(9, 'BORRADOR'));
    next('/api/instrumento3/9/guardar').flush({ message: 'No' }, { status: 409, statusText: 'Conflict' });
    expect(error instanceof SavedNotSentError).toBeTrue();
    expect((error as SavedNotSentError).message).toBe(SAVED_NOT_SENT);
    expect((error as SavedNotSentError).proposalId).toBe(9);
  });

  it('should translate the refusals of the server into stable codes', () => {
    setup();
    const answers: [number, string][] = [
      [409, PROPOSAL_LOCKED],
      [404, PROPOSAL_NOT_FOUND],
      [400, INVALID_PROPOSAL]
    ];
    for (const [status, code] of answers) {
      let error = '';
      service.save(draft, 7).subscribe({ error: (e: Error) => (error = e.message) });
      next('/api/instrumento3/7').flush({ message: { message: 'No' } }, { status, statusText: 'Error' });
      expect(error).toBe(code);
    }
  });
});

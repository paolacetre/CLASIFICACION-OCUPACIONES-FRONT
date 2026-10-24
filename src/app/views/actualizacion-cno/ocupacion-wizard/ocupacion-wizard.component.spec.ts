/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MOCK_LATENCY_MS } from '../../../shared/api/mock-api';
import { clearTestSession, startTestSession } from '../../../shared/auth/session.testing';
import { todayIso } from '../actualizacion-cno.model';
import { ActualizacionCnoService } from '../actualizacion-cno.service';
import { FakeActualizacionCnoService } from '../actualizacion-cno.testing';
import { OcupacionWizardComponent } from './ocupacion-wizard.component';

describe('OcupacionWizardComponent', () => {
  let fixture: ComponentFixture<OcupacionWizardComponent>;
  let component: OcupacionWizardComponent;
  let compiled: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [OcupacionWizardComponent] });
    startTestSession();
    fixture = TestBed.createComponent(OcupacionWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => clearTestSession());

  function refresh(wait = 0): void {
    fixture.detectChanges();
    tick(wait);
    fixture.detectChanges();
  }

  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => clean(compiled.querySelector(selector)?.textContent);
  const texts = (selector: string) => Array.from(compiled.querySelectorAll(selector)).map((item) => clean(item.textContent));
  const button = (label: string) => Array.from(compiled.querySelectorAll('button')).find((item) => clean(item.textContent) === label) as HTMLButtonElement;
  const type = (selector: string, value: string) => {
    const input = compiled.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  };
  /** Abre la lista de un buscador y elige la opción con ese texto. */
  const pick = (placeholder: string, label: string) => {
    const input = compiled.querySelector(`input[placeholder="${placeholder}"]`) as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    const option = Array.from(compiled.querySelectorAll('.picker-option')).find((item) => item.textContent?.includes(label)) as HTMLElement;
    option.click();
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  };

  function fillBasic(code = '1254'): void {
    type('#ow-code', code);
    type('#ow-name', 'Analistas de datos');
    type('#ow-area', '1');
    type('#ow-level', '2');
    type('#ow-traceability', 'Resolución 001');
    type('#ow-description', 'Analizan datos para apoyar decisiones.');
    fixture.detectChanges();
  }

  it('should open on the basic information with today\'s date and the five steps', () => {
    expect(text('#ow-title')).toBe('Registrar nueva ocupación CNO');
    expect(texts('.ow-step')).toEqual(['1 Información básica', '2 Denominaciones', '3 Funciones', '4 Competencias', '5 Resumen']);
    const [year, month, day] = todayIso().split('-');
    expect((compiled.querySelector('#ow-date') as HTMLInputElement).value).toBe(`${day}/${month}/${year}`);
    expect(text('.ow-status strong')).toBe('Activo');
    expect(text('.ow-pending')).toBe('Faltan 6 campos por completar');
    // Como la versión desplegada: "código · nombre".
    expect(texts('#ow-area option')).toEqual(['Selecciona un área', '0 · Dirección y Gerencia', '1 · Finanzas y Administración', '3 · Salud']);
    expect(texts('#ow-level option')[2]).toBe('1 · Nivel 1 (A) - Profesionales');
  });

  it('should explain what is missing and not advance until the step is complete', () => {
    button('Siguiente →').click();
    fixture.detectChanges();
    expect(component.step).toBe('basic');
    expect(texts('.ow-error')).toEqual([
      'El código de ocupación es obligatorio.',
      'El nombre es obligatorio.',
      'Selecciona un área de desempeño.',
      'Selecciona un nivel de cualificación.',
      'La trazabilidad es obligatoria.',
      'La descripción es obligatoria.'
    ]);

    fillBasic('0011');
    expect(texts('.ow-error')).toEqual(['Ya existe una ocupación registrada con este código.']);
    type('#ow-code', '12a4');
    fixture.detectChanges();
    expect(texts('.ow-error')).toEqual(['El código debe tener exactamente 4 dígitos.']);
  });

  it('should go through the five steps and register the occupation like the deployed form', fakeAsync(() => {
    const fake = TestBed.inject(ActualizacionCnoService) as unknown as FakeActualizacionCnoService;
    const created = spyOn(component.created, 'emit');
    fillBasic();
    button('Siguiente →').click();
    refresh();

    // Denominaciones: la primera es la principal; se editan y se eliminan.
    expect(text('.ow-pending')).toBe('Agrega al menos una denominación');
    type('#ow-new-den', 'Analista de datos');
    button('+ Agregar').click();
    type('#ow-new-den', 'Científico de datos');
    button('+ Agregar').click();
    type('#ow-new-den', 'analista de datos');
    button('+ Agregar').click();
    fixture.detectChanges();
    expect(text('.ow-error')).toBe('Esta denominación ya está agregada.');
    expect(texts('.ow-item > span.ow-grow')).toEqual(['Analista de datos', 'Científico de datos']);
    expect(text('.ow-item .ui-badge')).toBe('Principal');
    button('Siguiente →').click();
    refresh();

    // Funciones: una del catálogo y una nueva.
    pick('Buscar función por código o descripción', 'Registrar las transacciones');
    type('#ow-new-fun', 'Construir tableros de indicadores');
    button('+ Crear función').click();
    fixture.detectChanges();
    expect(texts('.ow-item .ui-badge')).toEqual(['Nueva']);
    button('Siguiente →').click();
    refresh();

    // Competencias.
    expect(text('.ow-pending')).toBe('Agrega al menos una habilidad y un conocimiento');
    pick('Buscar habilidad', 'Análisis de necesidades');
    expect(text('.ow-pending')).toBe('Agrega al menos un conocimiento');
    pick('Buscar conocimiento', 'Anatomía');
    pick('Buscar ocupación por código o nombre', 'Auxiliares contables');
    expect(texts('.ow-chip')).toEqual(['Análisis de necesidades ×', 'Anatomía ×', '1111 - Auxiliares contables ×']);
    button('Siguiente →').click();
    refresh();

    // Resumen y guardado.
    expect(component.step).toBe('summary');
    expect(texts('.ow-summary-card h4')).toEqual(['Datos básicos', 'Denominaciones 2', 'Funciones 2', 'Competencias']);
    button('Guardar ocupación').click();
    refresh(MOCK_LATENCY_MS);

    expect(created).toHaveBeenCalledWith('1254');
    expect(fake.lastCreated).toEqual(
      jasmine.objectContaining({
        code: '1254',
        areaCode: '1',
        levelCode: '2',
        registeredOn: todayIso(),
        active: true,
        denominations: ['Analista de datos', 'Científico de datos'],
        functions: [
          { code: 'F-1002', text: 'Registrar las transacciones financieras.' },
          { code: null, text: 'Construir tableros de indicadores' }
        ],
        skills: [{ code: '17', label: 'Análisis de necesidades' }],
        knowledge: [{ code: '40', label: 'Anatomía' }],
        related: [{ code: '1111', label: 'Auxiliares contables' }]
      })
    );
  }));

  it('should go back to the first step when the server says the code already exists', fakeAsync(() => {
    const service = TestBed.inject(ActualizacionCnoService);
    // Otra persona registró el 1254 mientras se llenaba el formulario.
    service.createOccupation({ ...component.draft, code: '1254', name: 'Otra' }).subscribe();
    tick(MOCK_LATENCY_MS);

    fillBasic();
    component.draft.denominations = ['Analista'];
    component.draft.functions = [{ code: null, text: 'Analizar' }];
    component.draft.skills = [{ code: '17', label: 'Análisis' }];
    component.draft.knowledge = [{ code: '1', label: 'Administración' }];
    component.startStep = 'summary';
    component.ngOnInit();
    refresh(MOCK_LATENCY_MS);
    button('Guardar ocupación').click();
    refresh(MOCK_LATENCY_MS);

    expect(component.step).toBe('basic');
    expect(texts('.ow-error')).toEqual(['Ya existe una ocupación registrada con este código.']);
  }));

  it('should ask before discarding what was typed', () => {
    const closed = spyOn(component.closed, 'emit');
    button('Cancelar').click();
    fixture.detectChanges();
    expect(closed).toHaveBeenCalledTimes(1);

    type('#ow-name', 'Algo');
    fixture.detectChanges();
    button('Cancelar').click();
    fixture.detectChanges();
    expect(text('#confirm-dialog-title')).toBe('¿Descartar la ocupación?');
    button('Descartar').click();
    expect(closed).toHaveBeenCalledTimes(2);
  });
});

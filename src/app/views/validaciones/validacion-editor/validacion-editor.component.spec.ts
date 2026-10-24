/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ValidacionEditorComponent } from './validacion-editor.component';
import { ValidacionesService } from '../validaciones.service';
import { FakeValidacionesService, createTestRecords } from '../validaciones.testing';

describe('ValidacionEditorComponent', () => {
  let fixture: ComponentFixture<ValidacionEditorComponent>;
  let comp: ValidacionEditorComponent;
  let el: HTMLElement;
  let fake: FakeValidacionesService;

  // El catálogo de departamentos se carga aparte: se trae antes, fuera del reloj simulado.
  beforeAll(async () => {
    await import('../../instrumento-3/geografia');
  });

  function render(): void {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }

  function open(index: number): void {
    TestBed.configureTestingModule({ imports: [ValidacionEditorComponent] });
    fake = TestBed.inject(ValidacionesService) as unknown as FakeValidacionesService;
    fixture = TestBed.createComponent(ValidacionEditorComponent);
    comp = fixture.componentInstance;
    comp.record = createTestRecords()[index];
    el = fixture.nativeElement;
    render();
    tick(10);
  }

  const gradeAll = (grade: 'aplica' | 'no_aplica') => {
    for (const item of comp.allItems) {
      comp.setGrade(item, grade);
    }
  };

  /** Datos generales completos: el servidor los exige para cerrar un Instrumento 2. */
  const fillInformant = () => {
    comp.informant = {
      fullName: 'SENA Admin',
      email: 'admin@sena.edu.co',
      phone: '3000000001',
      department: 'Antioquia',
      municipality: 'Medellín',
      company: 'SENA',
      position: 'Instructor',
      profession: 'Ingeniero'
    };
  };

  it('lists the occupations with their progress and opens on Datos generales', fakeAsync(() => {
    open(1);
    expect(el.querySelector('#vx-title')?.textContent).toContain('Validación de 2 ocupaciones');
    expect(Array.from(el.querySelectorAll('.vx-occupation .vx-progress')).map((node) => node.textContent?.trim())).toEqual(['0/5', '0/2']);
    expect((el.querySelector('#vx-fullName') as HTMLInputElement).value).toBe('SENA Admin');
    expect(el.querySelector('.vx-pending')?.textContent).toContain('7 sin calificar');
  }));

  it('shows each item as one row (title | Opción | Comentario) and asks for the comment of «Requiere ajuste»', fakeAsync(() => {
    open(1);
    comp.selectSection('functions');
    render();
    expect(Array.from(el.querySelectorAll('.vx-item-title')).map((node) => node.textContent?.trim())).toEqual(['5. Funciones 1', '5. Funciones 2']);
    expect(el.querySelector('.vx-section-panel .vx-tag')?.textContent).toContain('0 de 2 calificados');
    const options = Array.from(el.querySelectorAll('.vx-item-option select option')).slice(0, 5).map((node) => node.textContent?.trim());
    expect(options).toEqual(['-- Seleccione', 'Aplica', 'No aplica', 'Requiere ajuste', 'Con propuesta de mejora']);
    expect((el.querySelector('.vx-item-comment textarea') as HTMLTextAreaElement).placeholder).toBe('Comentario (opcional)');

    const [first] = comp.sectionItems;
    comp.setGrade(first, 'requiere_ajuste');
    fixture.detectChanges();
    expect((el.querySelector('.vx-item-comment textarea') as HTMLTextAreaElement).placeholder).toContain('Especifique los ajustes requeridos');
    expect(el.querySelector('.vx-item-comment .vx-required')).toBeTruthy();
    expect(comp.doneOf(comp.review!.occupations[0])).toBe(0);
    comp.setDetail(first, 'Precisar el alcance');
    expect(comp.doneOf(comp.review!.occupations[0])).toBe(1);
  }));

  it('saves progress with only what is graded, as «en_revision»', fakeAsync(() => {
    open(1);
    comp.setGrade(comp.review!.occupations[0].items[0], 'aplica');
    comp.saveProgress();
    tick();
    expect(fake.lastSave?.verdict).toBe('en_revision');
    expect(fake.lastSave?.items.map((item) => item.id)).toEqual(['2126::name']);
    expect(fake.lastSave?.items[0].field).toBe('name');
    expect(fake.lastSave?.proposals).toEqual([]);
  }));

  it('sends the area and description the expert proposes for an occupation, only what changed', fakeAsync(() => {
    open(1);
    comp.selectSection('info');
    render();
    expect(el.querySelector('.vx-editable')).toBeTruthy();
    comp.adjustment.description = 'Estudian y diseñan agroecosistemas.';
    comp.saveProgress();
    tick();
    expect(fake.lastSave?.proposals).toEqual([{ occupationCode: '2126', description: 'Estudian y diseñan agroecosistemas.' }]);
  }));

  it('asks for every informant field before sending an Instrument 2', fakeAsync(() => {
    open(1);
    gradeAll('aplica');
    comp.requestSend();
    tick(10);
    expect(comp.confirmSendOpen).toBeFalse();
    expect(comp.section).toBe('general');
    expect(comp.feedback).toBe('Completa todos los datos generales del informante antes de enviar.');
  }));

  it('does not send while something is pending and takes you to it', fakeAsync(() => {
    open(1);
    fillInformant();
    comp.setGrade(comp.review!.occupations[0].items[0], 'aplica');
    comp.requestSend();
    tick(10);
    expect(comp.confirmSendOpen).toBeFalse();
    expect(comp.section).toBe('info');
    expect(comp.feedback).toContain('Quedan 6 elementos sin calificar');
    expect(fake.lastSave).toBeNull();
  }));

  it('derives «ajustes_solicitados» when an item does not apply, and «aprobada» otherwise', fakeAsync(() => {
    open(1);
    fillInformant();
    gradeAll('aplica');
    comp.setGrade(comp.allItems[2], 'no_aplica');
    comp.requestSend();
    expect(comp.confirmSendOpen).toBeTrue();
    expect(comp.verdict).toBe('ajustes_solicitados');
    comp.confirmSend();
    tick();
    expect(fake.lastSave?.verdict).toBe('ajustes_solicitados');
    expect(fake.lastSave?.items.length).toBe(7);
    expect(fake.records.find((record) => record.id === 4)?.state).toBe('edited');
  }));

  it('is read-only when the analyst got the adjustments back (the server no longer takes validations)', fakeAsync(() => {
    open(0);
    expect(comp.editable).toBeFalse();
  }));

  it('is read-only once the validation was sent approved', fakeAsync(() => {
    open(3);
    expect(comp.editable).toBeFalse();
    expect(el.querySelector('.vx-footer-actions')).toBeNull();
    expect(el.querySelector('.vx-readonly')).toBeTruthy();
  }));
});

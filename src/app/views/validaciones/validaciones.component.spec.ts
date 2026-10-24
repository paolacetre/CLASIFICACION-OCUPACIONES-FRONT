/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ValidacionEditorComponent } from './validacion-editor/validacion-editor.component';
import { ValidacionesComponent } from './validaciones.component';
import { ValidacionesService } from './validaciones.service';
import { FakeValidacionesService } from './validaciones.testing';

describe('ValidacionesComponent', () => {
  let fixture: ComponentFixture<ValidacionesComponent>;
  let comp: ValidacionesComponent;
  let el: HTMLElement;

  function render(): void {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }

  beforeEach(fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [ValidacionesComponent] });
    fixture = TestBed.createComponent(ValidacionesComponent);
    comp = fixture.componentInstance;
    el = fixture.nativeElement;
    render();
  }));

  it('shows the four indicators and the inbox, most recent first', fakeAsync(() => {
    const counts = Array.from(el.querySelectorAll('.ve-kpi-count')).map((node) => node.textContent?.trim());
    expect(counts).toEqual(['2', '0', '1', '1']);
    expect(el.querySelector('.ve-received-pill')?.textContent).toContain('2 recibidos');
    expect(Array.from(el.querySelectorAll('tbody tr')).map((row) => row.querySelector('.ve-id')?.textContent?.trim())).toEqual(['6', '4', '9', '2']);
    expect(el.querySelector('tbody tr .ve-day')?.textContent).toContain('Ayer');
    expect(el.querySelector('tbody tr .ve-more')?.textContent?.trim()).toBe('+1');
  }));

  it('filters by state from the indicator and by text from the search box', fakeAsync(() => {
    (el.querySelectorAll('.ve-kpi')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(comp.filtered.map((record) => record.id)).toEqual([4, 9]);

    comp.search = 'software';
    comp.onFiltersChange();
    fixture.detectChanges();
    expect(comp.filtered.map((record) => record.id)).toEqual([9]);
    expect(el.querySelector('.ve-instrument')?.textContent).toContain('Instrumento 3');
  }));

  it('offers «Ver» instead of «Revisar» once the instrument is no longer open to validation', fakeAsync(() => {
    // Solo lo «Recibido» (enviado a expertos) admite validación; lo editado o enviado se consulta.
    const buttons = Array.from(el.querySelectorAll('.ve-col-action .ui-btn')).map((node) => node.textContent?.trim());
    expect(buttons).toEqual(['Ver', 'Revisar', 'Revisar', 'Ver']);
  }));

  it('opens the editor and reloads the inbox after saving', fakeAsync(() => {
    const fake = TestBed.inject(ValidacionesService) as unknown as FakeValidacionesService;
    (el.querySelector('tbody tr .ui-btn-primary') as HTMLButtonElement).click();
    render();
    const editor = fixture.debugElement.query((node) => node.componentInstance instanceof ValidacionEditorComponent)?.componentInstance as ValidacionEditorComponent;
    expect(editor).toBeTruthy();

    fake.records[0].state = 'sent';
    editor.saved.emit();
    render();
    expect(comp.records[0].state).toBe('sent');
  }));
});

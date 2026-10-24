/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastService } from '../../shared/toast/toast.service';
import { ActualizacionCorrelativaComponent } from './actualizacion-correlativa.component';
import { ActualizacionCorrelativaService } from './actualizacion-correlativa.service';
import { FakeActualizacionCorrelativaService } from './actualizacion-correlativa.testing';

describe('ActualizacionCorrelativaComponent', () => {
  let fixture: ComponentFixture<ActualizacionCorrelativaComponent>;
  let comp: ActualizacionCorrelativaComponent;
  let el: HTMLElement;

  function render(): void {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }

  beforeEach(fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [ActualizacionCorrelativaComponent] });
    fixture = TestBed.createComponent(ActualizacionCorrelativaComponent);
    comp = fixture.componentInstance;
    el = fixture.nativeElement;
    render();
  }));

  const rowsOf = (side: number) => Array.from(el.querySelectorAll('app-catalog-panel')[side].querySelectorAll('.cp-item')) as HTMLButtonElement[];

  it('shows both catalogs and the first four existing relations', fakeAsync(() => {
    expect(rowsOf(0).length).toBe(5);
    expect(rowsOf(1).length).toBe(8);
    expect(el.querySelectorAll('.acr-rel').length).toBe(4);
    expect(el.querySelector('.acr-rel-id')?.textContent).toContain('Correlativa 0011');
  }));

  it('keeps a single CNO and caps CUOC at ten', fakeAsync(() => {
    rowsOf(0)[0].click();
    rowsOf(0)[1].click();
    fixture.detectChanges();
    expect(comp.cno.codes()).toEqual(['0012']);

    comp.cuoc.pageSize.set(32);
    render();
    rowsOf(1).forEach((row) => row.click());
    fixture.detectChanges();
    expect(comp.cuoc.selectedCount()).toBe(10);
    expect(comp.cuoc.limitWarning()).toBeTrue();
  }));

  it('does not reuse a CNO that already has a correlative outside «Editar»', fakeAsync(() => {
    const toast = spyOn(TestBed.inject(ToastService), 'warning');
    rowsOf(0)[0].click();
    rowsOf(1)[0].click();
    fixture.detectChanges();
    comp.openConfirm();
    expect(comp.confirmOpen()).toBeFalse();
    expect(toast).toHaveBeenCalled();
  }));

  it('creates a relation for a CNO without correlative and reloads the list', fakeAsync(() => {
    const fake = TestBed.inject(ActualizacionCorrelativaService) as unknown as FakeActualizacionCorrelativaService;
    rowsOf(0)[4].click();
    rowsOf(1)[0].click();
    rowsOf(1)[1].click();
    fixture.detectChanges();
    (el.querySelector('.acr-bar .ui-btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(comp.confirmOpen()).toBeTrue();

    comp.confirmRelation();
    render();
    expect(fake.relationsData.find((relation) => relation.cno.code === '0122')?.cuoc.map((item) => item.code)).toEqual(['01100', '02100']);
    expect(comp.hasSelection()).toBeFalse();
    expect(comp.relations().length).toBe(5);
  }));

  it('opens an existing relation for editing with its occupations selected', fakeAsync(() => {
    comp.edit(comp.relations()[1]);
    render();
    expect(comp.editingCno()).toBe('0012');
    expect(comp.cno.codes()).toEqual(['0012']);
    expect(comp.cuoc.codes()).toEqual(['11120', '11130']);
    expect(el.querySelector('.acr-bar')?.textContent).toContain('Editando la correlativa de 0012');
  }));

  it('filters existing relations by code or name on either side', fakeAsync(() => {
    comp.relationSearch.set('étnicas');
    fixture.detectChanges();
    expect(comp.visibleRelations().map((relation) => relation.cno.code)).toEqual(['0012']);
  }));
});

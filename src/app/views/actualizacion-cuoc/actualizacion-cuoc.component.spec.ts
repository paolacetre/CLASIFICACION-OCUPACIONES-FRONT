/// <reference types="jasmine" />

import { TestBed } from '@angular/core/testing';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { tabStorageKey } from '../actualizacion-cno/actualizacion-cno.component';
import { ActualizacionCnoService } from '../actualizacion-cno/actualizacion-cno.service';
import { ActualizacionCuocComponent } from './actualizacion-cuoc.component';

describe('ActualizacionCuocComponent', () => {
  afterEach(() => {
    sessionStorage.removeItem(tabStorageKey('cuoc'));
    clearTestSession();
  });

  async function create() {
    TestBed.configureTestingModule({ imports: [ActualizacionCuocComponent] });
    startTestSession();
    const list = spyOn(TestBed.inject(ActualizacionCnoService), 'list').and.callThrough();
    const fixture = TestBed.createComponent(ActualizacionCuocComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
    return {
      fixture,
      list,
      text: (selector: string) => clean(compiled.querySelector(selector)?.textContent),
      texts: (selector: string) => Array.from(compiled.querySelectorAll(selector)).map((item) => clean(item.textContent)),
      button: (label: string) => Array.from(compiled.querySelectorAll('button')).find((item) => clean(item.textContent) === label) as HTMLButtonElement,
      compiled
    };
  }

  it('should be the update screen in CUOC mode, with the CUOC texts', async () => {
    const view = await create();
    expect(view.list).toHaveBeenCalledWith('level', 'cuoc');
    expect(view.text('h1')).toBe('Actualización - CUOC');
    expect(view.text('.ui-page-subtitle')).toBe('Gestiona y actualiza la clasificación única de ocupaciones para Colombia (CUOC).');
    expect(view.texts('.ui-tab')).toEqual(['Nivel de competencia', 'Área de cualificación', 'Destreza', 'Conocimientos', 'Ocupación']);
    expect(view.button('Agregar Nivel de competencia')).toBeTruthy();
  });

  it('should remember its own tab and add an area without description', async () => {
    const view = await create();
    view.button('Área de cualificación').click();
    view.fixture.detectChanges();
    expect(sessionStorage.getItem(tabStorageKey('cuoc'))).toBe('area');
    expect(sessionStorage.getItem(tabStorageKey('cno'))).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 300));
    view.fixture.detectChanges();
    view.button('Agregar Área de cualificación').click();
    view.fixture.detectChanges();
    expect(view.text('#acno-editor-title')).toBe('Agregar área de cualificación CUOC');
    expect(view.text('.acno-official')).toBe('Se guardará en el catálogo oficial CUOC.');
    expect(view.compiled.querySelector('#acno-description')).toBeNull();
  });
});

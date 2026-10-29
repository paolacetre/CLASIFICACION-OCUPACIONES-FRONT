/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MOCK_LATENCY_MS } from '../../shared/api/mock-api';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { ToastService } from '../../shared/toast/toast.service';
import { Instrumento2Component, belongsToTab, canSendToExpert } from './instrumento-2.component';
import { Instrumento2Service } from './instrumento-2.service';
import { FakeInstrumento2Service } from './instrumento-2.testing';

describe('Instrumento2Component', () => {
  let fixture: ComponentFixture<Instrumento2Component>;
  let component: Instrumento2Component;
  let compiled: HTMLElement;
  let toastService: ToastService;

  afterEach(() => {
    clearTestSession();
  });

  async function create(session?: Parameters<typeof startTestSession>[0]): Promise<void> {
    TestBed.configureTestingModule({ imports: [Instrumento2Component] });
    // Fuera de fakeAsync: allí el temporizador de vencimiento de la sesión se agotaría al terminar el bloque.
    startTestSession(session);
    fixture = TestBed.createComponent(Instrumento2Component);
    component = fixture.componentInstance;
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await create();
  });

  /** Deja pasar la consulta o escritura pendiente y repinta. */
  function refresh(wait = 0): void {
    fixture.detectChanges();
    tick(wait);
    fixture.detectChanges();
  }

  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
  const text = (selector: string, root: ParentNode = compiled) => clean(root.querySelector(selector)?.textContent);
  const texts = (selector: string, root: ParentNode = compiled) => Array.from(root.querySelectorAll(selector)).map((item) => clean(item.textContent));
  const button = (label: string, root: ParentNode = compiled) => Array.from(root.querySelectorAll('button')).find((item) => item.textContent?.includes(label)) as HTMLButtonElement;
  const rows = () => Array.from(compiled.querySelectorAll('.i2-row')) as HTMLElement[];
  const tab = (label: string) => Array.from(compiled.querySelectorAll('.i2-tabs:not(.i2-sections) .i2-tab')).find((item) => item.textContent?.includes(label)) as HTMLButtonElement;

  it('should open in "Pendientes de envío" with the same counts in the indicators and the tabs', () => {
    expect(text('h1')).toBe('Instrumento 2 — Envío a validación experta');
    expect(texts('.i2-kpi strong')).toEqual(['2', '1', '1', '3', '5']);
    expect(texts('.i2-kpi-body > span')).toEqual(['Pendientes de envío', 'En validación experta', 'En ajustes', 'Enviadas', 'Todas']);
    expect(texts('.i2-tabs:not(.i2-sections) .i2-tab .ui-badge')).toEqual(['2', '1', '1', '3', '5']);
    expect(compiled.querySelector('.i2-kpi.active')?.textContent).toContain('Pendientes de envío');

    // Lo más reciente primero; cada fila apila sus ocupaciones.
    expect(rows().length).toBe(2);
    expect(texts('.i2-codes', rows()[0])).toEqual(['311131110']);
    expect(texts('.i2-stack:not(.i2-codes):not(.i2-names) li', rows()[0])).toEqual(['CNO', 'CUOC']);
    expect(texts('.i2-names li', rows()[1])).toEqual(['Físicos y astrónomos', 'Físicos y astrónomos']);
    expect(text('.i2-analyst-name', rows()[1])).toBe('admin@sena.edu.co');
    expect(text('.i2-date', rows()[1])).toBe('07 oct 202609:05 a. m.');
    expect(text('.ui-badge', rows()[1].querySelector('td:nth-child(7)')!)).toBe('Pendiente de envío');
    expect(text('.ui-pagination > span')).toBe('Mostrando 1 a 2 de 2 comparativas');
    expect(text('.ui-page-btn.active')).toBe('1');
    expect(text('.ui-page-size .fc-value')).toBe('8 por página');
  });

  it('should change tab from an indicator or a tab, and only let send what is pending', () => {
    (compiled.querySelector('.i2-kpi-all') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.tab).toBe('all');
    expect(rows().length).toBe(5);
    expect(tab('Todas').getAttribute('aria-current')).toBe('true');
    expect(texts('td:nth-child(7) .ui-badge')).toEqual(['Pendiente de envío', 'Pendiente de envío', 'En validación experta', 'Ajustes solicitados', 'Validado']);
    // Enviar y marcar solo están disponibles en lo que está pendiente; lo ya enviado se ve con "Comparación".
    expect(rows().map((row) => button('Enviar a experto', row).disabled)).toEqual([false, false, true, true, true]);
    expect(rows().map((row) => button('Editar', row) ? 'Editar' : button('Comparación', row) ? 'Comparación' : '')).toEqual(['Editar', 'Editar', 'Comparación', 'Comparación', 'Comparación']);
    expect(rows().map((row) => (row.querySelector('.i2-check') as HTMLInputElement).disabled)).toEqual([false, false, true, true, true]);
    expect(button('Enviar a experto', rows()[2]).title).toBe('Ya no admite envío: revisa su estado actual');

    tab('En ajustes').click();
    fixture.detectChanges();
    expect(rows().length).toBe(1);
    expect(text('.i2-codes li', rows()[0])).toBe('0211');

    tab('Enviadas').click();
    fixture.detectChanges();
    expect(rows().length).toBe(3);

    expect(canSendToExpert('GUARDADO')).toBeTrue();
    expect(canSendToExpert('ENVIADO_EXPERTO')).toBeFalse();
    expect(belongsToTab('VALIDADO', 'sent')).toBeTrue();
    expect(belongsToTab('GUARDADO', 'sent')).toBeFalse();
  });

  it('should search by code or occupation name inside the open tab', () => {
    component.setTab('all');
    component.search = 'FISICOS';
    component.onSearchChange();
    fixture.detectChanges();
    expect(rows().length).toBe(1);
    component.search = '61121';
    fixture.detectChanges();
    expect(texts('.i2-codes li', rows()[0])).toEqual(['7334', '61121', '61131']);

    component.search = 'no existe';
    fixture.detectChanges();
    expect(text('.ui-empty strong')).toBe('Sin coincidencias');
    button('Limpiar búsqueda', compiled.querySelector('.ui-empty')!).click();
    fixture.detectChanges();
    expect(rows().length).toBe(5);

    // Una pestaña vacía explica cómo llegan las ocupaciones.
    component.items = [];
    fixture.detectChanges();
    expect(text('.ui-empty strong')).toBe('No hay ocupaciones en esta pestaña');
  });

  it('should unfold the read-only detail of a row, with its occupations and sections, and fold it again', fakeAsync(() => {
    rows()[1].click();
    refresh();
    expect(rows()[1].classList.contains('open')).toBeTrue();
    // Como la versión desplegada, el detalle se abre justo debajo de su fila, no al final de la tabla.
    expect(rows()[1].nextElementSibling?.classList.contains('i2-detail-row')).toBeTrue();
    expect(compiled.querySelectorAll('.i2-detail-row').length).toBe(1);
    expect(text('.i2-occupations-label')).toBe('2 ocupaciones en este instrumento:');
    expect(texts('.i2-chip-code')).toEqual(['2111', '21110']);
    expect(text('.i2-detail-name')).toBe('Físicos y astrónomos');
    expect(texts('.i2-info dd')).toEqual(['Pendiente de envío', 'admin@sena.edu.co', '22/09/2026', 'Nivel 1', 'Ciencias Naturales']);
    expect(texts('.i2-sections .i2-tab')).toEqual(['Información general', 'Funciones 2', 'Denominaciones 1', 'Habilidades 0', 'Conocimientos 1', 'Ocupaciones relacionadas 0', 'Trazabilidad']);
    // Datos básicos en dos columnas de «etiqueta … valor», con la fecha de inactividad.
    expect(texts('.i2-rows dt')).toEqual([
      'Código', 'Nombre', 'Nivel de cualificación', 'Área de desempeño', 'Fecha de registro', 'Fecha de inactividad', 'Estado', 'Analista', 'Trazabilidad'
    ]);
    expect(texts('.i2-stats li')).toEqual(['2 Funciones', '1 Denominaciones', '0 Habilidades', '1 Conocimientos']);
    // La descripción y la observación del analista van en el resumen.
    expect(text('.i2-observation .i2-text')).toBe('Revisar el nivel de cualificación.');
    expect(text('.i2-detail-head .ui-btn-outline')).toBe('Editar en Comparativa');
    expect(text('.i2-notice')).toBe('Para corregir algo usa «Editar en Comparativa»: al guardar, los cambios vuelven directamente aquí.');
    // Solo lectura: nada que escribir.
    expect(compiled.querySelector('.i2-detail input, .i2-detail textarea')).toBeNull();

    button('Funciones', compiled.querySelector('.i2-sections')!).click();
    fixture.detectChanges();
    expect(texts('.i2-items tbody tr')).toEqual(['F-2111.01Investigar', 'F-2111.02Publicar resultados']);
    button('Habilidades', compiled.querySelector('.i2-sections')!).click();
    fixture.detectChanges();
    expect(text('.i2-detail-body .ui-hint')).toBe('Sin registros en esta sección.');

    // Otra ocupación del mismo instrumento: vuelve a la sección general.
    (compiled.querySelectorAll('.i2-chip')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.section).toBe('general');
    expect(texts('.i2-info dd').slice(3)).toEqual(['Nivel 4', 'Ciencias']);

    rows()[1].click();
    refresh();
    expect(compiled.querySelector('.i2-detail')).toBeNull();
    rows()[0].click();
    refresh();
    button('Ocultar detalle').click();
    fixture.detectChanges();
    expect(component.openId).toBeNull();
  }));

  it('should open "Enviar a validación experta", explain what is missing and send the marked occupations to the chosen experts', fakeAsync(() => {
    const service = TestBed.inject(Instrumento2Service);
    const send = spyOn(service, 'sendToExpert').and.callThrough();
    spyOn(toastService, 'success');
    rows()[1].click();
    refresh();
    button('Enviar a experto', rows()[1]).click();
    refresh();
    // Abrir el detalle no se confunde con pulsar el botón de la fila.
    expect(component.openId).toBe(4);
    const modal = () => compiled.querySelector('.i2-send-modal') as HTMLElement;
    expect(text('h2', modal())).toBe('Enviar a validación experta');
    const occupations = component.items.find((item) => item.id === 4)!.occupations;
    expect(text('.i2-send-counter', modal())).toBe(`0 de ${occupations.length} seleccionada(s)`);
    expect(modal().querySelector('.i2-send-counter.empty')).toBeTruthy();
    expect(texts('.i2-send-expert-text span', modal())).toEqual(['Experto Sena', 'Experta Pecuaria']);
    expect(text('.i2-send-all', modal())).toBe('Seleccionar todos (2)');

    // "Enviar" se ve atenuado y, al pulsarlo, explica qué falta.
    const sendButton = () => button('Enviar', modal().querySelector('footer')!);
    expect(sendButton().classList).toContain('i2-send-incomplete');
    sendButton().click();
    refresh();
    expect(text('.i2-send-error', modal())).toBe('Selecciona al menos una ocupación para enviar.');
    (modal().querySelector('.i2-send-occupation input') as HTMLInputElement).click();
    refresh();
    expect(text('.i2-send-counter', modal())).toBe(`1 de ${occupations.length} seleccionada(s)`);
    sendButton().click();
    refresh();
    expect(text('.i2-send-error', modal())).toBe('Selecciona al menos un experto.');
    expect(send).not.toHaveBeenCalled();

    (modal().querySelector('.i2-send-all input') as HTMLInputElement).click();
    refresh();
    expect(component.allExpertsChosen).toBeTrue();
    sendButton().click();
    expect(component.isSending(4)).toBeTrue();
    refresh(MOCK_LATENCY_MS);
    refresh();

    expect(send).toHaveBeenCalledOnceWith(4, { occupations: [occupations[0].copyCode || occupations[0].code], experts: [7, 9] });
    expect(toastService.success).toHaveBeenCalledWith('Enviado a validación experta: 1 ocupación(es) a 2 experto(s).');
    expect(compiled.querySelector('.i2-send-modal')).toBeNull();
    expect(texts('.i2-kpi strong')).toEqual(['1', '2', '1', '4', '5']);
    expect(rows().length).toBe(1);
    // La enviada salió de «Pendientes»: su detalle, que se abre bajo su fila, se cierra con ella.
    expect(component.openId).toBeNull();
    expect(compiled.querySelector('.i2-detail')).toBeNull();
    // En «Todas» aparece con su nuevo estado y su detalle ya no deja enviar.
    component.setTab('all');
    refresh();
    const sentRow = rows().find((row) => row.textContent?.includes('En validación experta'))!;
    sentRow.click();
    refresh(MOCK_LATENCY_MS);
    expect(texts('.i2-info dd')[0]).toBe('En validación experta');
    expect(button('Enviar a experto', compiled.querySelector('.i2-detail')!).disabled).toBeTrue();
    expect(text('.i2-notice')).toContain('ya salió a validación experta');
  }));

  it('should list every expert the server returns, with name and email, and select them all at once', fakeAsync(() => {
    // Como la versión desplegada, con cinco expertos (datos de prueba).
    const service = TestBed.inject(Instrumento2Service) as unknown as FakeInstrumento2Service;
    service.availableExperts = [
      { id: 21, name: 'Ana Prueba', email: 'ana.prueba@sena.edu.co' },
      { id: 22, name: 'Beatriz Prueba', email: 'beatriz.prueba@sena.edu.co' },
      { id: 23, name: 'Carlos Prueba', email: 'carlos.prueba@sena.edu.co' },
      { id: 24, name: 'Experto Sena', email: 'experto@sena.edu.co' },
      { id: 25, name: 'Lucía Prueba', email: 'lucia.prueba@sena.edu.co' }
    ];
    component.requestSend([4]);
    refresh();
    const modal = compiled.querySelector('.i2-send-modal') as HTMLElement;
    expect(texts('.i2-send-expert-text span', modal)).toEqual(['Ana Prueba', 'Beatriz Prueba', 'Carlos Prueba', 'Experto Sena', 'Lucía Prueba']);
    expect(texts('.i2-send-expert-text small', modal)).toEqual(service.availableExperts.map((expert) => expert.email));
    expect(text('.i2-send-all', modal)).toBe('Seleccionar todos (5)');

    (modal.querySelector('.i2-send-all input') as HTMLInputElement).click();
    refresh();
    expect(component.allExpertsChosen).toBeTrue();
    expect(Array.from(modal.querySelectorAll<HTMLInputElement>('.i2-send-expert input')).every((input) => input.checked)).toBeTrue();
  }));

  it('should close the send dialog without sending', fakeAsync(() => {
    const send = spyOn(TestBed.inject(Instrumento2Service), 'sendToExpert').and.callThrough();
    component.requestSend([4]);
    refresh();
    expect(compiled.querySelector('.i2-send-modal')).toBeTruthy();
    button('Cancelar', compiled.querySelector('.i2-send-modal')!).click();
    refresh();
    expect(compiled.querySelector('.i2-send-modal')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  }));

  it('should send several checked rows whole when the server does not allow choosing, and report the ones that could not be sent', fakeAsync(() => {
    const service = TestBed.inject(Instrumento2Service) as unknown as FakeInstrumento2Service;
    service.availableExperts = null;
    spyOn(toastService, 'success');
    spyOn(toastService, 'error');
    expect(button('Enviar seleccionadas')).toBeUndefined();
    (compiled.querySelector('thead .i2-check') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(component.selectedIds.size).toBe(2);
    expect(button('Enviar seleccionadas').textContent).toContain('(2)');
    expect((compiled.querySelector('thead .i2-check') as HTMLInputElement).checked).toBeTrue();

    // Otra persona ya envió una de las dos mientras tanto.
    service.sendToExpert(5).subscribe();
    tick(MOCK_LATENCY_MS);

    button('Enviar seleccionadas').click();
    refresh();
    const modal = compiled.querySelector('.i2-send-modal') as HTMLElement;
    // Sin lista de expertos: aviso, una sección por comparativa, todas sus ocupaciones marcadas y fijas, sin paso 2.
    expect(text('.i2-send-notice', modal)).toContain('se enviará la comparativa completa');
    expect(texts('.i2-send-group-title', modal)).toEqual(['Comparativa #5', 'Comparativa #4']);
    const boxes = Array.from(modal.querySelectorAll<HTMLInputElement>('.i2-send-occupation input'));
    expect(boxes.every((box) => box.checked && box.disabled)).toBeTrue();
    expect(modal.querySelector('.i2-send-experts')).toBeNull();

    button('Enviar', modal.querySelector('footer')!).click();
    refresh(MOCK_LATENCY_MS * 2);
    refresh();

    expect(service.sentSelections.get(4)).toBeUndefined();
    expect(toastService.success).toHaveBeenCalledWith('Enviado a validación experta.');
    expect(toastService.error).toHaveBeenCalledWith('No se pudo enviar: ya no está pendiente de envío. Actualiza la bandeja para ver su estado.');
    expect(component.selectedIds.size).toBe(0);
    expect(texts('.i2-kpi strong')).toEqual(['0', '3', '1', '5', '5']);
    expect(text('.ui-empty strong')).toBe('No hay ocupaciones en esta pestaña');
  }));

  it('should open a pending comparison with "Editar" to edit it from Instrumento 2 and save it there', fakeAsync(() => {
    // La primera pestaña es "Pendientes de envío": sus filas dicen "Editar".
    expect(button('Editar', rows()[0])).toBeTruthy();
    // Se abre una comparativa que existe en los datos de prueba de Comparativa, como si estuviera pendiente de envío.
    component.openComparison({ id: 3, state: 'GUARDADO' });
    refresh();
    expect(component.comparisonEditable).toBeTrue();
    expect(text('app-comparativa .cpv-footer-note')).toBe('Editando desde Instrumento 2.');
    expect(button('Guardar en Instrumento 2').disabled).toBeTrue();
    expect(button('Enviar a Instrumento 2')).toBeUndefined();

    button('Editar').click();
    refresh();
    const name = compiled.querySelector('#cpv-name-0') as HTMLTextAreaElement;
    name.value = 'Nombre corregido';
    name.dispatchEvent(new Event('input'));
    refresh();
    expect(text('app-comparativa .cpv-footer-note')).toBe('Cambios sin guardar. Al guardar vuelven directamente a Instrumento 2.');

    // Guardar la deja otra vez en Instrumento 2 y vuelve a la bandeja.
    button('Guardar en Instrumento 2').click();
    refresh(MOCK_LATENCY_MS * 2);
    expect(component.comparisonId).toBeNull();
    expect(compiled.querySelector('.i2-card')).toBeTruthy();
  }));

  it('should open "Comparación" as the Comparativa screen in read-only mode and come back', fakeAsync(() => {
    component.setTab('all');
    fixture.detectChanges();
    button('Comparación', rows()[4]).click();
    refresh();

    expect(component.comparisonId).toBe(1);
    expect(compiled.querySelector('.i2-card')).toBeNull();
    expect(text('app-comparativa h1')).toBe('Comparativa #1');
    expect(compiled.querySelectorAll('app-comparativa .cpv-card').length).toBe(3);
    // Sin la lista de Comparativa ni nada editable.
    expect(compiled.querySelector('app-comparativa .comparativa-list')).toBeNull();
    expect(compiled.querySelector('app-comparativa textarea')).toBeNull();
    expect(button('Guardar cambios')).toBeUndefined();

    button('Volver').click();
    refresh();
    expect(component.comparisonId).toBeNull();
    expect(compiled.querySelector('app-comparativa')).toBeNull();
    expect(rows().length).toBe(5);
  }));

  it('should refresh the tray on demand and open the usage guide', fakeAsync(() => {
    const list = spyOn(TestBed.inject(Instrumento2Service), 'list').and.callThrough();
    button('Actualizar').click();
    refresh();
    expect(list).toHaveBeenCalledTimes(1);
    expect(component.loading).toBeFalse();

    button('Guía de uso').click();
    fixture.detectChanges();
    expect(text('#guide-dialog-title')).toBe('Guía de uso · Instrumento 2');
    expect(compiled.querySelectorAll('.guide-step').length).toBe(5);
    expect(text('.guide-note')).toContain('El buscador filtra');
    button('Entendido').click();
    fixture.detectChanges();
    expect(compiled.querySelector('#guide-dialog-title')).toBeNull();
  }));
});

/// <reference types="jasmine" />

// Diseño de la bandeja medido en el navegador con la fuente real (Work Sans): a cualquier ancho y tamaño de texto,
// la tabla no se desborda (o pasa a fichas), ningún botón sale de su celda, los dos botones de una fila quedan en la
// misma línea y la columna Ocupación conserva espacio para los nombres.
import { TestBed } from '@angular/core/testing';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { Instrumento2Component } from './instrumento-2.component';

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;600&display=swap';

/** Carga Work Sans como lo hace index.html; las medidas con otra fuente no sirven. `false` si no hay conexión. */
async function loadWorkSans(): Promise<boolean> {
  if (!document.querySelector(`link[href="${FONT_URL}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    document.head.appendChild(link);
    await new Promise((resolve) => {
      link.onload = resolve;
      link.onerror = resolve;
      setTimeout(resolve, 8000);
    });
  }
  try {
    await Promise.all([document.fonts.load('400 16px "Work Sans"'), document.fonts.load('600 16px "Work Sans"')]);
  } catch {
    return false;
  }
  return document.fonts.check('600 16px "Work Sans"');
}

const pause = () => new Promise((resolve) => setTimeout(resolve));

describe('Instrumento2Component — diseño de la bandeja', () => {
  afterEach(() => {
    clearTestSession();
    document.documentElement.style.removeProperty('--type-scale');
  });

  it('fits every row of every tab without horizontal scroll', async () => {
    if (!(await loadWorkSans())) {
      pending('Sin conexión para cargar Work Sans: no se puede medir con la fuente real.');
      return;
    }
    TestBed.configureTestingModule({ imports: [Instrumento2Component] });
    startTestSession();
    const fixture = TestBed.createComponent(Instrumento2Component);
    const host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await pause();
    fixture.detectChanges();

    const lines: string[] = [];
    let problems = 0;
    for (const tab of ['pending', 'all'] as const) {
      fixture.componentInstance.setTab(tab);
      for (const scale of [1, 1.125, 1.25]) {
        document.documentElement.style.setProperty('--type-scale', String(scale));
        for (const width of [1000, 1200, 1205, 1300, 1450, 1600, 1900]) {
          host.style.display = 'block';
          host.style.width = `${width}px`;
          fixture.detectChanges();
          const wrap = host.querySelector('.ui-table-wrap') as HTMLElement;
          const cards = getComputedStyle(host.querySelector('thead') as HTMLElement).position === 'absolute';
          const issues: string[] = [];
          const overflow = wrap.scrollWidth - wrap.clientWidth;
          if (overflow > 0) issues.push(`desborde ${overflow}px`);
          for (const row of Array.from(host.querySelectorAll('tbody tr'))) {
            const cell = row.querySelector('.i2-actions')!.closest('td') as HTMLElement;
            const limit = cell.getBoundingClientRect().right;
            const buttons = Array.from(cell.querySelectorAll('.ui-btn')) as HTMLElement[];
            if (buttons.some((button) => button.getBoundingClientRect().right > limit + 1)) issues.push('botón fuera de la celda');
            if (buttons.length === 2 && Math.abs(buttons[0].getBoundingClientRect().top - buttons[1].getBoundingClientRect().top) > 3) {
              issues.push('botones en dos líneas');
            }
            for (const td of Array.from(row.querySelectorAll('td'))) {
              if (!td.classList.contains('i2-col-names') && td.scrollWidth > td.clientWidth + 1) issues.push(`no cabe: ${(td.textContent ?? '').trim().slice(0, 16)}`);
            }
            const names = row.querySelector('.i2-col-names') as HTMLElement;
            if (!cards && names.getBoundingClientRect().width < 160) issues.push(`ocupación angosta (${Math.round(names.getBoundingClientRect().width)}px)`);
          }
          problems += issues.length;
          lines.push(`${tab} escala ${scale} ancho ${width} [contenedor ${wrap.clientWidth}px]: ${cards ? 'fichas' : 'tabla'} ${issues.length ? 'PROBLEMAS: ' + [...new Set(issues)].join(', ') : 'ok'}`);
        }
      }
    }
    host.remove();
    if (problems) {
      fail('\n' + lines.filter((line) => !line.endsWith('ok')).join('\n'));
    }
    expect(problems).toBe(0);
  });
});

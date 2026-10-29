/// <reference types="jasmine" />

// Diseño de la tabla medido en el navegador con la fuente real (Work Sans): en las tres pestañas, a cualquier ancho y
// tamaño de texto, ninguna palabra se parte (ni en los encabezados ni en los códigos), ningún dato sale de su celda y
// la tabla no se desborda (cuando ya no cabe pasa a fichas).
import { TestBed } from '@angular/core/testing';
import { CorrelativaComponent, CorrelativaKind } from './correlativa.component';

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

/** Palabras de `root` que el navegador partió en dos líneas (cortar una palabra compuesta en su guion sí vale). */
function brokenWords(root: Element): string[] {
  const broken: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const match of (node.textContent ?? '').matchAll(/[^\s-]+/g)) {
      const range = document.createRange();
      range.setStart(node, match.index!);
      range.setEnd(node, match.index! + match[0].length);
      if (range.getClientRects().length > 1) broken.push(match[0]);
    }
  }
  return broken;
}

describe('CorrelativaComponent — diseño de la tabla', () => {
  afterEach(() => document.documentElement.style.removeProperty('--type-scale'));

  it('never breaks a word nor overflows, in every tab, width and text size', async () => {
    if (!(await loadWorkSans())) {
      pending('Sin conexión para cargar Work Sans: no se puede medir con la fuente real.');
      return;
    }
    TestBed.configureTestingModule({ imports: [CorrelativaComponent] });
    const fixture = TestBed.createComponent(CorrelativaComponent);
    const component = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    const settle = async () => {
      fixture.detectChanges();
      await pause();
      await pause();
      fixture.detectChanges();
    };
    await settle();

    const lines: string[] = [];
    let problems = 0;
    for (const kind of ['denominacion', 'ocupacion', 'conocimiento'] as CorrelativaKind[]) {
      component.selectKind(kind);
      component.query.pageSize = 32;
      component.onFiltersChange();
      await settle();
      // Descripciones abiertas: recortadas, el navegador informa posiciones falsas para las palabras ocultas.
      component.result.items.forEach((row) => component.toggleDescription(row));
      for (const scale of [1, 1.125, 1.25]) {
        document.documentElement.style.setProperty('--type-scale', String(scale));
        for (const width of [700, 900, 1000, 1020, 1050, 1100, 1180, 1240, 1320]) {
          host.style.display = 'block';
          host.style.width = `${width}px`;
          fixture.detectChanges();
          const wrap = host.querySelector('.ui-table-wrap') as HTMLElement;
          const cards = getComputedStyle(host.querySelector('thead') as HTMLElement).position === 'absolute';
          const issues: string[] = [];
          const overflow = wrap.scrollWidth - wrap.clientWidth;
          if (overflow > 0) issues.push(`desborde ${overflow}px`);
          const cells = Array.from(host.querySelectorAll(cards ? 'td' : 'th, td')) as HTMLElement[];
          for (const cell of cells) {
            if (cell.scrollWidth > cell.clientWidth + 1) issues.push(`no cabe: ${(cell.textContent ?? '').trim().slice(0, 20)}`);
            for (const word of brokenWords(cell)) issues.push(`palabra partida: ${word}`);
          }
          problems += issues.length;
          lines.push(`${kind} escala ${scale} ancho ${width} [contenedor ${wrap.clientWidth}px]: ${cards ? 'fichas' : 'tabla'} ${issues.length ? 'PROBLEMAS: ' + [...new Set(issues)].join(', ') : 'ok'}`);
        }
      }
    }
    host.remove();
    console.log('\n' + lines.join('\n'));
    if (problems) {
      fail('\n' + lines.filter((line) => !line.endsWith('ok')).join('\n'));
    }
    expect(problems).toBe(0);
  });
});

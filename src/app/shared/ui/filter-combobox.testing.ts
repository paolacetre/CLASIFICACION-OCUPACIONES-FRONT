import { ComponentFixture } from '@angular/core/testing';

/*
 * Solo para pruebas: manejar el desplegable común (`FilterComboboxComponent`) como lo haría quien usa la
 * pantalla, buscándolo por su `inputId`.
 */

const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';

function trigger(fixture: ComponentFixture<unknown>, id: string): HTMLButtonElement {
  const button = (fixture.nativeElement as HTMLElement).querySelector(`#${CSS.escape(id)}`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`No hay un desplegable con id «${id}»`);
  }
  return button;
}

function options(fixture: ComponentFixture<unknown>, id: string): HTMLElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(`#${CSS.escape(`${id}-list`)} .fc-option`));
}

/** Abre el desplegable, lee sus opciones (la vacía incluida, si la tiene) y lo vuelve a cerrar. */
export function comboChoices(fixture: ComponentFixture<unknown>, id: string): string[] {
  const button = trigger(fixture, id);
  button.click();
  fixture.detectChanges();
  const labels = options(fixture, id).map((option) => clean(option.textContent));
  button.click();
  fixture.detectChanges();
  return labels;
}

/** Abre el desplegable y elige la opción con ese valor (`''` es la opción vacía). */
export function comboPick(fixture: ComponentFixture<unknown>, id: string, value: string): void {
  trigger(fixture, id).click();
  fixture.detectChanges();
  const all = options(fixture, id);
  const option = all.find((item) => item.dataset['value'] === value);
  if (!option) {
    throw new Error(`El desplegable «${id}» no tiene la opción «${value}» (tiene: ${all.map((item) => item.dataset['value']).join(', ') || 'ninguna'})`);
  }
  option.click();
  fixture.detectChanges();
}

/** Texto que muestra el desplegable (la opción elegida o el de la opción vacía). */
export function comboText(fixture: ComponentFixture<unknown>, id: string): string {
  return clean(trigger(fixture, id).textContent);
}

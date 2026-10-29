/// <reference types="jasmine" />

import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ComboOption, FilterComboboxComponent } from './filter-combobox.component';
import { comboChoices, comboPick, comboText } from './filter-combobox.testing';

@Component({
  standalone: true,
  imports: [FormsModule, FilterComboboxComponent],
  template: `
    <form>
      <app-filter-combobox inputId="grade" name="grade" allLabel="Seleccione" [options]="options" [disabled]="locked"
                           [(ngModel)]="grade" (ngModelChange)="changes = changes + 1"></app-filter-combobox>
    </form>
    <p class="outside">Fuera</p>
  `
})
class HostComponent {
  options: ComboOption[] = [
    { value: 'aplica', label: 'Aplica', tone: 'ok' },
    { value: 'no_aplica', label: 'No aplica', tone: 'error' },
    { value: 'otro', label: 'Otra opción' }
  ];
  grade = 'no_aplica';
  changes = 0;
  locked = false;
}

describe('FilterComboboxComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let root: HTMLElement;

  const trigger = () => root.querySelector('#grade') as HTMLButtonElement;
  const panel = () => root.querySelector('.fc-panel') as HTMLElement | null;
  const key = (target: HTMLElement, name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    root = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should work like a select with ngModel: shows the chosen option with its color and reports only real changes', () => {
    expect(comboText(fixture, 'grade')).toBe('No aplica');
    expect(trigger().classList).toContain('fc-tone-error');
    expect(comboChoices(fixture, 'grade')).toEqual(['Seleccione', 'Aplica', 'No aplica', 'Otra opción']);

    comboPick(fixture, 'grade', 'aplica');
    expect(host.grade).toBe('aplica');
    expect(host.changes).toBe(1);
    expect(trigger().classList).toContain('fc-tone-ok');
    // Volver a elegir la misma no avisa un cambio (como el <select> nativo).
    comboPick(fixture, 'grade', 'aplica');
    expect(host.changes).toBe(1);
    // La opción vacía deja el campo sin elegir y sin color.
    comboPick(fixture, 'grade', '');
    expect(host.grade).toBe('');
    expect(comboText(fixture, 'grade')).toBe('Seleccione');
    expect(trigger().className).not.toContain('fc-tone-');

    trigger().click();
    fixture.detectChanges();
    const colored = Array.from(root.querySelectorAll('.fc-option')).map((option) => option.className.match(/fc-tone-\w+/)?.[0] ?? '');
    expect(colored).toEqual(['', 'fc-tone-ok', 'fc-tone-error', '']);
    // Con pocas opciones no lleva buscador.
    expect(root.querySelector('.fc-search')).toBeNull();
  });

  it('should be used with the keyboard even without a search box, and Esc closes only the list', () => {
    const outer = jasmine.createSpy('keydown fuera');
    root.addEventListener('keydown', outer);
    trigger().focus();
    key(trigger(), 'ArrowDown');
    expect(panel()).not.toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    // Abre con la opción elegida resaltada; las flechas la mueven y Enter elige.
    expect(trigger().getAttribute('aria-activedescendant')).toBe('grade-list-1');
    key(trigger(), 'ArrowDown');
    expect(root.querySelector('.fc-option.active')?.textContent?.trim()).toBe('Otra opción');
    const enter = key(trigger(), 'Enter');
    expect(enter.defaultPrevented).toBeTrue();
    expect(host.grade).toBe('otro');
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());

    key(trigger(), 'ArrowUp');
    outer.calls.reset();
    key(trigger(), 'Escape');
    expect(panel()).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    root.removeEventListener('keydown', outer);
  });

  it('should add the search box to long lists and find without accents', () => {
    host.options = ['Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá'].map((name) => ({ value: name, label: name }));
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();
    const search = root.querySelector('.fc-search') as HTMLInputElement;
    expect(search.placeholder).toBe('Buscar...');
    search.value = 'atlantico';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(Array.from(root.querySelectorAll('#grade-list .fc-option')).map((option) => option.textContent?.trim())).toEqual(['Seleccione', 'Atlántico']);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelector('.fc-empty')?.textContent?.trim()).toBe('Sin resultados');
  });

  it('should close with a click outside and not open while disabled', async () => {
    trigger().click();
    fixture.detectChanges();
    (root.querySelector('.outside') as HTMLElement).click();
    fixture.detectChanges();
    expect(panel()).toBeNull();

    host.locked = true;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(trigger().disabled).toBeTrue();
    trigger().click();
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it('should open above the top layer and upwards when there is no room below', async () => {
    root.style.cssText = 'position: fixed; left: 8px; bottom: 8px; width: 240px';
    fixture.autoDetectChanges();
    trigger().click();
    await fixture.whenStable();
    const list = panel()!;
    expect(list.matches(':popover-open')).toBeTrue();
    const field = trigger().getBoundingClientRect();
    const box = list.getBoundingClientRect();
    expect(box.bottom).toBeLessThanOrEqual(field.top);
    expect(box.width).toBeGreaterThanOrEqual(field.width - 1);
    trigger().click();
    await fixture.whenStable();
    root.style.cssText = '';
  });
});

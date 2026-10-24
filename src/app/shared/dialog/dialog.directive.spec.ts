import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { DialogDirective } from './dialog.directive';

@Component({
  standalone: true,
  imports: [DialogDirective],
  template: `
    <button id="outside" type="button">Fuera</button>
    <section role="dialog" tabindex="-1" appDialog (dialogEscape)="escapes = escapes + 1">
      <button id="first" type="button">Primero</button>
      <button id="last" type="button">Último</button>
    </section>
  `
})
class HostComponent {
  escapes = 0;
}

describe('DialogDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
  });

  afterEach(() => el.remove());

  const tab = (target: HTMLElement, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it('should move focus into the dialog when it opens', fakeAsync(() => {
    fixture.detectChanges();
    flush();
    expect(document.activeElement?.id).toBe('first');
  }));

  it('should keep Tab and Shift+Tab inside the dialog', fakeAsync(() => {
    fixture.detectChanges();
    flush();
    const first = el.querySelector('#first') as HTMLElement;
    const last = el.querySelector('#last') as HTMLElement;

    last.focus();
    expect(tab(last).defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(first);

    expect(tab(first, true).defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(last);
  }));

  it('should emit dialogEscape and stop Escape from reaching outer listeners', fakeAsync(() => {
    fixture.detectChanges();
    flush();
    const outerListener = jasmine.createSpy('outer');
    document.addEventListener('keydown', outerListener);

    (el.querySelector('#first') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(fixture.componentInstance.escapes).toBe(1);
    expect(outerListener).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outerListener);
  }));
});

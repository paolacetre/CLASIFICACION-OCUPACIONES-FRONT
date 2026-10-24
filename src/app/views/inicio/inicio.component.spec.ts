/// <reference types="jasmine" />

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { InicioComponent, createIndicators } from './inicio.component';

describe('InicioComponent', () => {
  let fixture: ComponentFixture<InicioComponent>;
  let compiled: HTMLElement;

  afterEach(() => clearTestSession());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [InicioComponent] }).compileComponents();
    startTestSession();
    fixture = TestBed.createComponent(InicioComponent);
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  });

  it('should greet the session user', () => {
    expect(fixture.componentInstance.userName).not.toBe('');
    expect(compiled.querySelector('.inicio-welcome')?.textContent).toContain(`Bienvenido, ${fixture.componentInstance.userName}`);
  });

  it('should show one card per indicator with its label, badge and total', () => {
    const cards = Array.from(compiled.querySelectorAll('.inicio-indicator'));
    expect(cards.length).toBe(createIndicators().length);
    expect(cards[0].textContent).toContain('Ocupaciones CNO');
    expect(cards[0].querySelector('.ui-badge')?.textContent?.trim()).toBe('CNO');
    expect(cards[0].querySelector('.inicio-indicator-value')?.textContent?.trim()).toBe('611');
    expect(cards[2].querySelector('.inicio-indicator-value')?.textContent?.trim()).toBe('8,872');
  });

  it('should show the recent traceability log card', () => {
    expect(compiled.querySelector('#inicio-bitacora-title')?.textContent).toContain('Bitácora de trazabilidad reciente');
    const entries = Array.from(compiled.querySelectorAll('.inicio-activity .ui-list-item'));
    expect(entries.length).toBe(2);
    expect(entries[0].textContent).toContain('Cargaste el catálogo CUOC');
    expect(entries[0].querySelector('time')?.getAttribute('datetime')).toBe('2026-10-09T14:31:28.943Z');
  });
});

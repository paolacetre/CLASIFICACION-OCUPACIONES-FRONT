import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatesDetailComponent } from './states-detail.component';

describe('StatesDetailComponent', () => {
  let fixture: ComponentFixture<StatesDetailComponent>;
  let component: StatesDetailComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatesDetailComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(StatesDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render the three state cards (approved/rejected/warning) with their color class', () => {
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('.state-detail-row');
    expect(rows.length).toBe(3);
    expect(rows[0].classList.contains('ok')).toBeTrue();
    expect(rows[1].classList.contains('error')).toBeTrue();
    expect(rows[2].classList.contains('warn')).toBeTrue();
    expect(el.querySelectorAll('.state-detail-meta-item').length).toBe(6);
  });

  it('should be an inline panel (not a modal) with a single close button', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.querySelector('.dialog-backdrop')).toBeNull();
    expect(el.querySelectorAll('button').length).toBe(1);
    expect(el.querySelector('.states-detail-close')).not.toBeNull();
  });

  it('should emit closeEvent when the X button is clicked', () => {
    const emitSpy = spyOn(component.closeEvent, 'emit');
    ((fixture.nativeElement as HTMLElement).querySelector('.states-detail-close') as HTMLButtonElement).click();
    expect(emitSpy).toHaveBeenCalled();
  });

  it('should close on Escape without letting it reach Configuración', () => {
    const emitSpy = spyOn(component.closeEvent, 'emit');
    const outerListener = jasmine.createSpy('outerListener');
    const el = fixture.nativeElement as HTMLElement;
    el.addEventListener('keydown', outerListener);

    el.querySelector('.states-detail-close')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(emitSpy).toHaveBeenCalled();
    expect(outerListener).not.toHaveBeenCalled();
  });
});

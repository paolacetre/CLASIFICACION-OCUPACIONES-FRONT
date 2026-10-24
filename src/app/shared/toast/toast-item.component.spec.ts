import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastItemComponent } from './toast-item.component';
import { ToastMessage } from './toast.model';

describe('ToastItemComponent', () => {
  let fixture: ComponentFixture<ToastItemComponent>;
  let component: ToastItemComponent;

  const toast: ToastMessage = { id: 1, type: 'success', message: 'Guardado', duration: 1000 };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastItemComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ToastItemComponent);
    component = fixture.componentInstance;
    component.toast = { ...toast };
    // ngOnInit (que agenda el auto-cierre con setTimeout) se dispara en
    // detectChanges(); cada test lo llama dentro de su propio fakeAsync()
    // para que ese timer quede bajo el reloj virtual de tick().
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should auto-close after its duration and emit "closed" once the exit animation finishes', fakeAsync(() => {
    let closedEmitted = false;
    component.closed.subscribe(() => (closedEmitted = true));
    fixture.detectChanges();

    tick(999);
    expect(component.closing).toBeFalse();
    expect(closedEmitted).toBeFalse();

    tick(1);
    expect(component.closing).toBeTrue();
    expect(closedEmitted).toBeFalse();

    tick(220);
    expect(closedEmitted).toBeTrue();
  }));

  it('should close immediately (before the auto-timer) when the user clicks the close button', fakeAsync(() => {
    let closedEmitted = false;
    component.closed.subscribe(() => (closedEmitted = true));
    fixture.detectChanges();

    tick(100);
    component.close();
    expect(component.closing).toBeTrue();

    tick(220);
    expect(closedEmitted).toBeTrue();

    // El timer de autocierre ya no debe disparar una segunda emisión.
    tick(2000);
  }));

  it('should not schedule a second close when close() is called twice', fakeAsync(() => {
    let emitCount = 0;
    component.closed.subscribe(() => emitCount++);
    fixture.detectChanges();

    component.close();
    component.close();
    tick(220);

    expect(emitCount).toBe(1);
  }));
});

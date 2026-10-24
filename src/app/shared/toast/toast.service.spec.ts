import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should push a typed toast for each helper method', () => {
    service.success('ok');
    service.error('falló');
    service.warning('cuidado');

    const types = service.toasts().map((toast) => toast.type);
    expect(types).toEqual(['success', 'error', 'warning']);
    expect(service.toasts().map((toast) => toast.message)).toEqual(['ok', 'falló', 'cuidado']);
  });

  it('should stack several toasts instead of replacing the previous one', () => {
    service.success('primero');
    service.success('segundo');
    service.success('tercero');

    expect(service.toasts().length).toBe(3);
  });

  it('should remove only the dismissed toast, keeping the rest stacked', () => {
    service.success('uno');
    service.error('dos');
    const idToRemove = service.toasts()[0].id;

    service.dismiss(idToRemove);

    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('dos');
  });

  it('should assign each toast a longer default duration for errors than for success', () => {
    service.success('ok');
    service.error('falló');

    const [successToast, errorToast] = service.toasts();
    expect(errorToast.duration).toBeGreaterThan(successToast.duration);
  });
});

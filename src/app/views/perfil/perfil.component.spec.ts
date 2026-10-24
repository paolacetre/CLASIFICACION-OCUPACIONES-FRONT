/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MOCK_LATENCY_MS } from '../../shared/api/mock-api';
import { MockCredentialsStore } from '../../shared/api/mock-credentials';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { ToastService } from '../../shared/toast/toast.service';
import { PerfilComponent, ProfileData } from './perfil.component';

describe('PerfilComponent', () => {
  let fixture: ComponentFixture<PerfilComponent>;
  let comp: PerfilComponent;
  let el: HTMLElement;

  const profile: ProfileData = {
    id: 1,
    name: 'SENA Admin',
    email: 'admin@sena.edu.co',
    phone: '3000000001',
    role: 'Administrador',
    entity: 'Servicio Nacional de Aprendizaje (SENA)',
    dateJoined: '24/08/2026',
    photoUrl: '',
    description: ''
  };

  afterEach(() => {
    clearTestSession();
  });

  function create(user?: Parameters<typeof startTestSession>[0]): void {
    startTestSession(user);
    fixture = TestBed.createComponent(PerfilComponent);
    comp = fixture.componentInstance;
    fixture.componentRef.setInput('profile', { ...profile });
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PerfilComponent] }).compileComponents();
  });

  it('should fill the form with the profile that arrives from the shell', () => {
    create();
    expect(comp.formProfile).toEqual(profile);
    expect(el.querySelector('.hero-name')?.textContent).toBe('SENA Admin');
    expect(el.querySelector('.hero-mail')?.textContent).toBe('admin@sena.edu.co');
    expect(el.querySelector('.avatar-initials')?.textContent).toBe('SA');
    expect(el.querySelector('.badge-role')?.textContent).toBe('Administrador');
    expect(el.querySelector('.badge-level')?.textContent).toBe('Nivel Total');
    const email = el.querySelector('#profile-email') as HTMLInputElement;
    expect(email.value).toBe('admin@sena.edu.co');
    expect(email.readOnly).toBeTrue();
    // Cargo y rol salen del rol de la cuenta; regional y centro no los tiene el backend.
    expect(Array.from(el.querySelectorAll('.inst-value')).map((item) => item.textContent)).toEqual(['Sin registrar', 'Sin registrar', 'Clasificación ocupacional', 'Administrador', 'Administrador']);
  });

  it('should say when this session started and leave the indicators the server does not give without a value', () => {
    create();
    expect(el.querySelector('.hero-meta')?.textContent).toMatch(/^Último acceso: Hoy, \d{2}:\d{2} (AM|PM)$/);
    expect(Array.from(el.querySelectorAll('.metric-label')).map((item) => item.textContent)).toEqual(['Análisis realizados', 'Ocupaciones creadas', 'Correlaciones generadas']);
    expect(Array.from(el.querySelectorAll('.metric-value')).map((item) => item.textContent)).toEqual(['—', '—', '—']);
  });

  it('should give an analyst the advanced level and switch between the two tabs', () => {
    create({ id: 2, name: 'Analista TDO', email: 'analista@sena.edu.co', role: 'Analista' });
    fixture.componentRef.setInput('profile', { ...profile, role: 'Analista' });
    fixture.detectChanges();
    expect(el.querySelector('.badge-level')?.textContent).toBe('Nivel Avanzado');

    expect(el.querySelector('.panel-personal')).toBeTruthy();
    expect(el.querySelector('.panel-security')).toBeNull();
    (el.querySelector('#profile-tab-configuracion') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.panel-personal')).toBeNull();
    expect(el.querySelector('.panel-security')).toBeTruthy();
    expect(el.querySelector('#profile-tab-configuracion')?.getAttribute('aria-selected')).toBe('true');
  });

  it('should save the full name, phone and description, and tell the shell', fakeAsync(() => {
    create();
    const saved = spyOn(comp.profileSaved, 'emit');
    const toast = spyOn(TestBed.inject(ToastService), 'success');
    comp.formProfile.name = ' Ana María Ríos ';
    comp.formProfile.phone = '3001234567';
    comp.formProfile.description = ' Analista ocupacional ';
    comp.save();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();

    expect(saved).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Ana María Ríos', phone: '3001234567', description: 'Analista ocupacional' }));
    expect(comp.profile.name).toBe('Ana María Ríos');
    expect(toast).toHaveBeenCalledWith('Perfil actualizado correctamente.');
    expect(el.querySelector('.success-banner')).toBeTruthy();
    tick(3000);
  }));

  it('should require the full name, and restore the form on cancel', () => {
    create();
    const saved = spyOn(comp.profileSaved, 'emit');
    const cancelled = spyOn(comp.cancel, 'emit');
    comp.formProfile.name = '   ';
    comp.save();
    expect(comp.formError).toBe('Por favor escribe tu nombre y apellido.');
    expect(saved).not.toHaveBeenCalled();

    comp.onCancel();
    expect(comp.formProfile.name).toBe('SENA Admin');
    expect(comp.formError).toBe('');
    expect(cancelled).toHaveBeenCalled();
  });

  it('should keep a chosen photo in the form and let remove it', () => {
    create();
    comp.formProfile.photoUrl = 'data:image/png;base64,AAAA';
    fixture.detectChanges();
    expect((el.querySelector('.avatar-image') as HTMLImageElement).getAttribute('src')).toBe('data:image/png;base64,AAAA');
    (el.querySelector('.btn-remove-photo') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.avatar-image')).toBeNull();

    // Una foto de más de 2MB se rechaza sin leerla.
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [big] });
    comp.onPhotoSelected({ target: input } as unknown as Event);
    expect(comp.formError).toBe('La imagen seleccionada supera el límite máximo de 2MB.');
  });

  /** Escribe las tres contraseñas y envía el formulario. */
  function changePassword(current: string, next: string, confirm = next): void {
    comp.tab = 'configuracion';
    comp.currentPassword = current;
    comp.newPassword = next;
    comp.confirmPassword = confirm;
    comp.changePassword();
    tick();
    fixture.detectChanges();
  }
  const passwordError = () => el.querySelector('.password-error')?.textContent?.trim();

  it('should explain what is wrong with the new password before calling the server', fakeAsync(() => {
    create();
    changePassword('', '');
    expect(passwordError()).toBe('Escribe tu contraseña actual, la nueva y su confirmación.');
    changePassword('Admin*Password2026', 'corta');
    expect(passwordError()).toContain('8 a 64 caracteres');
    changePassword('Admin*Password2026', 'Nueva*Clave2026', 'Otra*Clave2026');
    expect(passwordError()).toBe('La nueva contraseña y su confirmación no coinciden.');
    changePassword('Admin*Password2026', 'Admin*Password2026');
    expect(passwordError()).toBe('La nueva contraseña debe ser distinta de la actual.');
    expect(TestBed.inject(MockCredentialsStore).verify(1, 'Admin*Password2026')).toBeTrue();
  }));

  it('should refuse a wrong current password, and change it when it is right', fakeAsync(() => {
    create();
    const credentials = TestBed.inject(MockCredentialsStore);
    changePassword('No*EsLaClave1', 'Nueva*Clave2026');
    expect(passwordError()).toBe('La contraseña actual no es correcta.');
    expect(credentials.verify(1, 'Admin*Password2026')).toBeTrue();

    const toast = spyOn(TestBed.inject(ToastService), 'success');
    changePassword('Admin*Password2026', 'Nueva*Clave2026');
    expect(credentials.verify(1, 'Nueva*Clave2026')).toBeTrue();
    expect(toast).toHaveBeenCalledWith('Contraseña actualizada correctamente.');
    expect(passwordError()).toBeUndefined();
    expect([comp.currentPassword, comp.newPassword, comp.confirmPassword]).toEqual(['', '', '']);
  }));

  it('should show the typed passwords on request', () => {
    create();
    comp.tab = 'configuracion';
    fixture.detectChanges();
    const current = el.querySelector('#profile-current-password') as HTMLInputElement;
    expect(current.type).toBe('password');
    comp.showPasswords = true;
    fixture.detectChanges();
    expect(current.type).toBe('text');
  });
});

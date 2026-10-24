/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { SETTINGS_STORAGE_KEY, SettingsService } from '../../settings/settings.service';
import { ToastService } from '../../shared/toast/toast.service';
import { TranslationService } from '../../shared/i18n/translation.service';
import { AuthService } from '../../shared/auth/auth.service';
import { MOCK_LATENCY_MS } from '../../shared/api/mock-api';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { SESSION_STORAGE_KEY, SessionStore } from '../../shared/auth/session.store';
import { MAX_LOGIN_ATTEMPTS } from '../../shared/auth/auth.service';
import { MockCredentialsStore } from '../../shared/api/mock-credentials';
import { UsuariosService } from '../usuarios/usuarios.service';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let comp: LoginComponent;
  let el: HTMLElement;

  beforeEach(() => {
    clearTestSession();
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    TestBed.configureTestingModule({ imports: [LoginComponent] });
    fixture = TestBed.createComponent(LoginComponent);
    comp = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });
  afterEach(() => {
    clearTestSession();
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it('should show the sign-in logo, the system name and the form', () => {
    expect(el.querySelector('.login-logo')?.getAttribute('src')).toBe('/assets/logos/logo-login.png');
    // Nombre del sistema de cada proyecto (about.appName).
    expect(el.querySelector('.login-app-name')?.textContent?.trim()).toBe(TestBed.inject(TranslationService).translate('about.appName'));
    expect(el.querySelector('h1')?.textContent).toContain('Iniciar sesión');
    expect(el.querySelector('.login-submit')?.textContent).toContain('Iniciar sesión');
    expect(el.querySelector('#login-email')).toBeTruthy();
    expect((el.querySelector('#login-password') as HTMLInputElement).type).toBe('password');
  });

  it('should offer the links to the public site and to the other application, in a new tab', () => {
    const links = Array.from(el.querySelectorAll('.login-links a')) as HTMLAnchorElement[];
    expect(links.map((link) => link.querySelector('span')?.textContent)).toEqual(['Ir a sitio web', 'Ir a tendencias']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://oloserver.tail033823.ts.net/', 'https://oloserver.tail033823.ts.net/tendencias/']);
    expect(links.every((link) => link.target === '_blank' && link.rel === 'noopener noreferrer')).toBeTrue();
  });

  it('should show what is missing under each field before calling the API', () => {
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'login').and.callThrough();
    comp.submit();
    fixture.detectChanges();
    expect(el.querySelector('#login-email-error')?.textContent).toContain('Escribe tu correo SENA o tu número de cédula.');
    expect(el.querySelector('#login-password-error')?.textContent).toContain('Escribe tu contraseña.');
    expect(el.querySelector('#login-email')?.getAttribute('aria-describedby')).toBe('login-email-error');
    expect(document.activeElement?.id).toBe('login-email');
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('should check the SENA email or ID number when leaving the field, and clear the error while typing', async () => {
    await fixture.whenStable();
    comp.email = 'admin-tdo.gov.co';
    comp.validateEmail();
    fixture.detectChanges();
    expect(el.querySelector('#login-email-error')?.textContent).toContain('usuario@sena.edu.co');

    // Con un correo de otro dominio se ingresa con la cédula.
    comp.email = 'persona@gmail.com';
    comp.validateEmail();
    fixture.detectChanges();
    expect(el.querySelector('#login-email-error')?.textContent).toContain('Solo los correos del SENA sirven para ingresar.');

    comp.email = '1234567890';
    comp.validateEmail();
    expect(comp.emailError).toBe('');

    const input = el.querySelector('#login-email') as HTMLInputElement;
    input.value = 'admin@sena.edu.co';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('#login-email-error')).toBeNull();
  });

  it('should ask for at least 5 characters of password, as the server does', () => {
    comp.email = 'admin@sena.edu.co';
    comp.password = 'abc';
    comp.submit();
    expect(comp.passwordError).toBe('La contraseña debe contener al menos 5 caracteres.');
  });

  it('should warn when Caps Lock is on while typing the password', () => {
    const input = el.querySelector('#login-password') as HTMLInputElement;
    const event = new KeyboardEvent('keyup', { key: 'A' });
    spyOn(event, 'getModifierState').and.returnValue(true);
    input.dispatchEvent(event);
    fixture.detectChanges();
    expect(el.querySelector('#login-caps')?.textContent).toContain('Bloq Mayús');
  });

  it('should look dimmed while data is missing, but still explain what is missing', () => {
    const button = el.querySelector('.login-submit') as HTMLButtonElement;
    expect(button.classList).toContain('incomplete');
    expect(button.disabled).toBeFalse();
    comp.email = 'admin@sena.edu.co';
    comp.password = 'algo';
    fixture.detectChanges();
    expect(button.classList).not.toContain('incomplete');
  });

  it('should keep the session after closing the browser only when "keep me signed in" is checked', fakeAsync(() => {
    comp.email = 'admin@sena.edu.co';
    comp.password = 'Admin*Password2026';
    comp.submit();
    tick(MOCK_LATENCY_MS);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    TestBed.inject(SessionStore).clear();

    comp.email = 'admin@sena.edu.co';
    comp.password = 'Admin*Password2026';
    comp.remember = true;
    comp.submit();
    tick(MOCK_LATENCY_MS);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeTruthy();
    TestBed.inject(SessionStore).clear();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  }));

  it('should show a clear message for wrong credentials', fakeAsync(() => {
    comp.email = 'admin@sena.edu.co';
    comp.password = 'incorrecta';
    comp.submit();
    expect(comp.submitting).toBeTrue();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    expect(el.querySelector('.login-error')?.textContent).toContain('El usuario o la contraseña no son correctos.');
    expect(comp.submitting).toBeFalse();
  }));

  it('should sign in, welcome the user and clear the password field', fakeAsync(() => {
    const toast = TestBed.inject(ToastService);
    spyOn(toast, 'success');
    comp.email = 'admin@sena.edu.co';
    comp.password = 'Admin*Password2026';
    comp.submit();
    tick(MOCK_LATENCY_MS);
    expect(TestBed.inject(AuthService).isLoggedIn()).toBeTrue();
    expect(comp.password).toBe('');
    expect(toast.success).toHaveBeenCalledWith('Bienvenido, SENA Admin.');
  }));

  it('should show and hide the password', () => {
    (el.querySelector('.password-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((el.querySelector('#login-password') as HTMLInputElement).type).toBe('text');
  });

  it('should switch dark mode from the sign-in screen and keep it saved', () => {
    const settings = TestBed.inject(SettingsService);
    expect(comp.darkMode()).toBeFalse();
    const [light, dark] = Array.from(el.querySelectorAll('.theme-switch button')) as HTMLButtonElement[];
    expect(light.getAttribute('aria-pressed')).toBe('true');
    dark.click();
    fixture.detectChanges();
    expect(settings.draft().theme).toBe('oscuro');
    expect(settings.saved().theme).toBe('oscuro');
    expect(dark.getAttribute('aria-pressed')).toBe('true');
    // Pulsar otra vez la opción ya elegida no cambia nada.
    dark.click();
    expect(settings.draft().theme).toBe('oscuro');
    light.click();
    expect(settings.draft().theme).toBe('claro');
  });

  it('should clear the password after a failed attempt and warn when access gets locked', fakeAsync(() => {
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      comp.email = 'analista@sena.edu.co';
      comp.password = 'incorrecta';
      comp.submit();
      tick(MOCK_LATENCY_MS);
      expect(comp.password).toBe('');
    }
    expect(comp.error).toContain('Demasiados intentos fallidos');
  }));

  it('should explain that the previous session expired', () => {
    startTestSession();
    TestBed.inject(SessionStore).expire();
    fixture.detectChanges();
    expect(el.querySelector('.login-expired')?.textContent).toContain('Tu sesión venció');
  });

  it('should sign in with the ID number', fakeAsync(() => {
    comp.email = '1000000001';
    comp.password = 'Admin*Password2026';
    comp.submit();
    tick(MOCK_LATENCY_MS);
    expect(TestBed.inject(AuthService).user()?.id).toBe(1);
  }));

  /** Crea una cuenta nueva (su contraseña temporal es la cédula 7654321) e ingresa con ella. */
  function signInWithTemporaryPassword(): void {
    startTestSession();
    TestBed.inject(UsuariosService).create({ name: 'Nueva Persona', email: 'nueva@correo.com', document: '7654321', phone: '3001234567', role: 'Analista' }).subscribe();
    tick(MOCK_LATENCY_MS);
    TestBed.inject(SessionStore).clear();
    comp.email = '7654321';
    comp.password = '7654321';
    comp.submit();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
  }

  it('should ask to change a temporary password, remembering the one just typed', fakeAsync(() => {
    const toast = TestBed.inject(ToastService);
    spyOn(toast, 'success');
    signInWithTemporaryPassword();
    expect(el.querySelector('h1')?.textContent).toContain('Cambia tu contraseña');
    expect(el.querySelector('#login-email')).toBeNull();
    // La temporal se acaba de escribir: no se vuelve a pedir.
    expect(el.querySelector('#login-change-current')).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();

    comp.changeNew = 'corta';
    comp.changeConfirm = 'corta';
    comp.changePassword();
    expect(comp.changeError).toContain('8 a 64 caracteres');
    comp.changeNew = 'Nueva*Clave2026';
    comp.changeConfirm = 'Otra*Clave2026';
    comp.changePassword();
    expect(comp.changeError).toBe('Las contraseñas no coinciden.');

    comp.changeConfirm = 'Nueva*Clave2026';
    comp.changePassword();
    tick();
    expect(TestBed.inject(AuthService).mustChangePassword()).toBeFalse();
    expect(TestBed.inject(MockCredentialsStore).verify(3, 'Nueva*Clave2026')).toBeTrue();
    expect(toast.success).toHaveBeenCalledWith('Contraseña actualizada. Bienvenido, Nueva Persona.');
  }));

  it('should ask for the temporary password after a reload, and let sign out instead', fakeAsync(() => {
    startTestSession({ id: 2, name: 'Analista TDO', email: 'analista@sena.edu.co', role: 'Analista' }, true);
    fixture.detectChanges();
    expect(el.querySelector('#login-change-current')).toBeTruthy();

    comp.changeCurrent = 'no-es-esta';
    comp.changeNew = 'Nueva*Clave2026';
    comp.changeConfirm = 'Nueva*Clave2026';
    comp.changePassword();
    tick();
    expect(comp.changeError).toBe('La contraseña temporal no es correcta.');

    comp.cancelPasswordChange();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    expect(TestBed.inject(AuthService).isLoggedIn()).toBeFalse();
    expect(el.querySelector('#login-email')).toBeTruthy();
    tick();
  }));
});

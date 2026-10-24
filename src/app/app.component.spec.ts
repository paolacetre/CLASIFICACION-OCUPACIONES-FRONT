/// <reference types="jasmine" />

import { reflectComponentType } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AppComponent, VIEW_STORAGE_KEY } from './app.component';
import { UsuariosComponent } from './views/usuarios/usuarios.component';
import { PerfilComponent } from './views/perfil/perfil.component';
import { SettingsComponent } from './settings/settings.component';
import { ToastService } from './shared/toast/toast.service';
import { SETTINGS_STORAGE_KEY, SettingsService } from './settings/settings.service';
import { TranslationService } from './shared/i18n/translation.service';
import { clearTestSession, endTestSession, startTestSession } from './shared/auth/session.testing';
import { SessionStore } from './shared/auth/session.store';
import { MenuItem, buildMenu, menuViews } from './app.menu';
import { DEFAULT_VIEW, PROJECT_MENU } from './proyecto/menu';

/*
 * Pruebas del shell (parte común): no nombran las opciones de ningún proyecto,
 * las leen de PROJECT_MENU. Así este archivo es igual en todos los proyectos.
 */
const MENU: MenuItem[] = buildMenu(PROJECT_MENU);
/** Las opciones que abren una vista (sin los grupos desplegables). */
const ALL_MENU: MenuItem[] = menuViews(MENU);

/** Todos los grupos del menú, a cualquier nivel. */
function groupsOf(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => (item.children ? [item, ...groupsOf(item.children)] : []));
}

/** Etiqueta del componente de una opción (p. ej. 'app-dashboard'). */
function selectorOf(item: MenuItem): string {
  return item.component ? reflectComponentType(item.component)!.selector : `app-${item.id}`;
}

// Lo que la app guarda en el navegador (la vista abierta, la configuración guardada) no debe pasar de una prueba a otra.
afterEach(() => {
  sessionStorage.removeItem(VIEW_STORAGE_KEY);
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
});

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let app: AppComponent;

  afterEach(() => {
    clearTestSession();
    sessionStorage.removeItem(VIEW_STORAGE_KEY);
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, UsuariosComponent, PerfilComponent, SettingsComponent]
    }).compileComponents();

    startTestSession();
    fixture = TestBed.createComponent(AppComponent);
    app = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(app).toBeTruthy();
  });

  it('should render the navigation tabs: the project options first and the administrative part last', () => {
    const translation = TestBed.inject(TranslationService);
    const compiled = fixture.nativeElement as HTMLElement;
    const topLabels = Array.from(compiled.querySelectorAll('.nav-tab.nav-top')).map((tab) => tab.textContent?.trim());
    expect(topLabels).toEqual(MENU.map((item) => translation.translate(item.labelKey)));
    expect(topLabels.slice(-1)).toEqual(['Gestión de usuarios']);

    // El menú es acordeón: se despliega cada grupo de primer nivel (con sus subgrupos) por turnos y,
    // juntando lo que se ve en cada uno, aparecen todas las vistas en el orden del menú.
    const views = (items: typeof MENU): typeof MENU => items.flatMap((item) => (item.children ? views(item.children) : [item]));
    const visibleLabels = () => {
      fixture.detectChanges();
      return Array.from(compiled.querySelectorAll('.nav-tab:not(.nav-group)')).map((tab) => tab.textContent?.trim());
    };
    const labelsOf = (items: typeof MENU) => items.map((item) => translation.translate(item.labelKey));
    const loose = MENU.filter((item) => !item.children);
    let total = loose.length;
    for (const top of MENU.filter((item) => item.children)) {
      for (const group of [top, ...groupsOf(top.children ?? [])]) {
        if (!app.isExpanded(group.id)) app.toggleGroup(group.id);
      }
      // Solo se ven las opciones sueltas y las del grupo abierto, en el orden del menú.
      const expected = MENU.flatMap((item) => (item === top ? views(item.children ?? []) : item.children ? [] : [item]));
      expect(visibleLabels()).toEqual(labelsOf(expected));
      total += views(top.children ?? []).length;
    }
    expect(total).toBe(ALL_MENU.length);
    expect(labelsOf(views(MENU)).slice(-1)).toEqual(['Usuarios']);
  });

  it('should work as an accordion: opening a group closes the other groups of its level', () => {
    const [first, second] = MENU.filter((item) => item.children);
    app.toggleGroup(first.id);
    expect(app.isExpanded(first.id)).toBeTrue();
    app.toggleGroup(second.id);
    expect(app.isExpanded(second.id)).toBeTrue();
    expect(app.isExpanded(first.id)).toBeFalse();
    // Al elegir una vista se despliega su grupo y se recogen los demás.
    const view = (first.children ?? []).find((item) => !item.children)!;
    app.switchView(view.id);
    expect(app.isExpanded(first.id)).toBeTrue();
    expect(app.isExpanded(second.id)).toBeFalse();
  });

  it('should open on the default view and show one view per menu option', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(app.currentView).toBe(DEFAULT_VIEW);

    for (const item of ALL_MENU) {
      app.switchView(item.id);
      fixture.detectChanges();
      expect(compiled.querySelector(selectorOf(item))).withContext(item.id).toBeTruthy();
      expect(compiled.querySelectorAll('main.content > *').length).withContext(item.id).toBe(1);
      expect(compiled.querySelector('.nav-tab.active')?.getAttribute('aria-current')).toBe('page');
    }
  });

  it('should reopen the view that was open when the page is reloaded, and the default one after signing in again', () => {
    const view = ALL_MENU[ALL_MENU.length - 1].id;
    app.switchView(view);
    app.toggleConfiguration();
    fixture.destroy();

    // Recarga: la sesión sigue abierta y se vuelve a la misma vista (Configuración no cuenta como vista).
    const reloaded = TestBed.createComponent(AppComponent);
    reloaded.detectChanges();
    expect(reloaded.componentInstance.currentView).toBe(view);
    expect(reloaded.componentInstance.configurationOpen).toBeFalse();

    // Una vista guardada que ya no existe se ignora.
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'no-existe');
    reloaded.destroy();
    const invalid = TestBed.createComponent(AppComponent);
    invalid.detectChanges();
    expect(invalid.componentInstance.currentView).toBe(DEFAULT_VIEW);

    // Al cerrar la sesión se olvida la vista.
    invalid.componentInstance.switchView(view);
    endTestSession();
    invalid.detectChanges();
    expect(sessionStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
  });

  it('should show and hide the side menu with the three-line button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const toggle = compiled.querySelector('.menu-toggle') as HTMLButtonElement;
    const layout = compiled.querySelector('.app-layout') as HTMLElement;
    const wasOpen = app.menuOpen;
    expect(toggle.getAttribute('aria-controls')).toBe('main-menu');
    expect(compiled.querySelector('#main-menu')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe(String(wasOpen));
    expect(layout.classList.contains('menu-closed')).toBe(!wasOpen);

    toggle.click();
    fixture.detectChanges();
    expect(app.menuOpen).toBe(!wasOpen);
    expect(toggle.getAttribute('aria-expanded')).toBe(String(!wasOpen));
    expect(layout.classList.contains('menu-closed')).toBe(wasOpen);
    // El fondo que cierra el menú en pantallas angostas solo existe mientras está abierto.
    expect(!!compiled.querySelector('.sidebar-backdrop')).toBe(!wasOpen);
  });

  it('should keep the current view under Configuración and return to it when closing', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const item = ALL_MENU[0];
    app.switchView(item.id);
    fixture.detectChanges();

    app.toggleConfiguration();
    fixture.detectChanges();
    expect(compiled.querySelector('app-settings')).toBeTruthy();
    expect(compiled.querySelector(selectorOf(item))).toBeTruthy();

    app.closeConfiguration();
    fixture.detectChanges();
    expect(app.currentView).toBe(item.id);
    expect(compiled.querySelector('app-settings')).toBeNull();
  });

  it('should show the suboptions of a group only while it is expanded, and open Perfil from the user card', () => {
    const sidebar = (fixture.nativeElement as HTMLElement).querySelector('.sidebar') as HTMLElement;
    const group = Array.from(sidebar.querySelectorAll('.nav-group')).pop() as HTMLButtonElement;
    const wasExpanded = group.getAttribute('aria-expanded') === 'true';
    const children = () => sidebar.querySelector(`#${group.getAttribute('aria-controls')}`);
    expect(group.textContent?.trim()).toBe('Gestión de usuarios');
    expect(!!children()).toBe(wasExpanded);

    group.click();
    fixture.detectChanges();
    expect(group.getAttribute('aria-expanded')).toBe(String(!wasExpanded));
    expect(!!children()).toBe(!wasExpanded);

    // Abrir una vista despliega el grupo que la contiene.
    app.switchView('usuarios');
    fixture.detectChanges();
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(Array.from(children()!.querySelectorAll('.nav-tab')).map((tab) => tab.textContent?.trim())).toEqual(['Usuarios']);
    expect(children()!.querySelector('.nav-tab.active')).toBeTruthy();

    (sidebar.querySelector('.user-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(app.currentView).toBe('perfil');
    expect(sidebar.querySelector('.user-card')?.classList).toContain('active');
  });

  it('should show the session role and the user card in the side menu', () => {
    const sidebar = (fixture.nativeElement as HTMLElement).querySelector('.sidebar') as HTMLElement;
    expect(sidebar.querySelector('.brand-role')?.textContent).toContain('Perfil Administrador');
    expect(sidebar.querySelector('.user-info')?.textContent).toContain('SENA Admin');
    expect(sidebar.querySelector('.user-info')?.textContent).toContain('admin@sena.edu.co');
  });

  it('should sign out after confirming and go back to the sign-in screen, discarding unsaved settings', fakeAsync(() => {
    const compiled = fixture.nativeElement as HTMLElement;
    const settingsService = TestBed.inject(SettingsService);
    app.switchView('configuracion');
    settingsService.updateDraft({ accentColor: '#123456' });
    fixture.detectChanges();

    (compiled.querySelector('.sidebar .logout-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('app-confirm-dialog')?.textContent).toContain('¿Deseas cerrar tu sesión?');

    app.confirmLogout();
    tick(250);
    fixture.detectChanges();
    expect(app.sessionReady()).toBeFalse();
    expect(compiled.querySelector('app-login')).toBeTruthy();
    expect(compiled.querySelector('.sidebar')).toBeNull();
    expect(app.configurationOpen).toBeFalse();
    expect(settingsService.draft().accentColor).not.toBe('#123456');
    flush();
  }));

  it('should open Configuración only from the gear icon in the top bar, not from the side menu', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.sidebar')?.textContent).not.toContain('Configuración');

    const gear = compiled.querySelector('.topbar .icon-button[aria-label="Configuración"]') as HTMLButtonElement;
    gear.click();
    fixture.detectChanges();
    expect(app.currentView).toBe('configuracion');
    expect(compiled.querySelector('app-settings')).toBeTruthy();
  });

  it('should switch between views when switchView is called', () => {
    expect(app.currentView).toBe(DEFAULT_VIEW);

    app.switchView('perfil');
    fixture.detectChanges();
    expect(app.currentView).toBe('perfil');

    const profileEl = fixture.nativeElement.querySelector('app-perfil');
    expect(profileEl).toBeTruthy();

    app.switchView('configuracion');
    fixture.detectChanges();
    expect(app.currentView).toBe('configuracion');

    const configEl = fixture.nativeElement.querySelector('app-settings');
    expect(configEl).toBeTruthy();

    app.switchView('usuarios');
    fixture.detectChanges();
    expect(app.currentView).toBe('usuarios');

    const usersEl = fixture.nativeElement.querySelector('app-usuarios');
    expect(usersEl).toBeTruthy();
  });

  it('should notify through the shared ToastService when there are no new notifications', () => {
    const toastService = TestBed.inject(ToastService);
    spyOn(toastService, 'warning');

    app.notifyNoNewNotifications();

    expect(toastService.warning).toHaveBeenCalledWith('No tienes nuevas notificaciones.');
  });

  it('should keep users created or deactivated in Usuarios after navigating to Perfil and back', fakeAsync(() => {
    app.switchView('usuarios');
    fixture.detectChanges();
    let usuarios = fixture.debugElement.query(By.directive(UsuariosComponent)).componentInstance as UsuariosComponent;
    usuarios.startCreate();
    usuarios.formUser = { name: 'Nueva Persona', email: 'nueva@sena.edu.co', document: '1234567', phone: '3001234567', role: 'Analista' };
    usuarios.saveUser();
    tick(250);
    usuarios.requestStatusChange(usuarios.users.find((u) => u.id === 2)!);
    usuarios.confirmStatusChange();
    tick(250);
    fixture.detectChanges();
    flush();

    app.switchView('perfil');
    fixture.detectChanges();
    app.switchView('usuarios');
    fixture.detectChanges();

    usuarios = fixture.debugElement.query(By.directive(UsuariosComponent)).componentInstance as UsuariosComponent;
    expect(usuarios.users.some((u) => u.email === 'nueva@sena.edu.co')).toBeTrue();
    expect(usuarios.users.find((u) => u.id === 2)?.status).toBe('Inactivo');
    flush();
  }));

  it('should close only the nested dialog on Escape inside Configuración, keeping the panel and unsaved changes', fakeAsync(() => {
    const settingsService = TestBed.inject(SettingsService);
    app.switchView('configuracion');
    fixture.detectChanges();
    settingsService.updateDraft({ accentColor: '#123456' });
    const settings = fixture.debugElement.query(By.directive(SettingsComponent)).componentInstance as SettingsComponent;
    settings.requestSave();
    fixture.detectChanges();
    flush();

    const compiled = fixture.nativeElement as HTMLElement;
    const saveDialog = compiled.querySelector('[aria-labelledby="save-dialog-title"]') as HTMLElement;
    saveDialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    flush();

    expect(settings.pendingSave()).toBeFalse();
    expect(app.configurationOpen).toBeTrue();
    expect(settingsService.draft().accentColor).toBe('#123456');

    const panel = compiled.querySelector('.configuration-modal') as HTMLElement;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    flush();

    expect(app.configurationOpen).toBeFalse();
  }));

  it('should show the principal logo together with the app name in the sidebar, and the "T" mark when there is no logo', () => {
    const settingsService = TestBed.inject(SettingsService);
    const compiled = fixture.nativeElement as HTMLElement;
    const logos = settingsService.draft().logos;

    settingsService.updateDraft({ logos: { ...logos, principal: '/assets/logos/logo-simbolo.png' } });
    fixture.detectChanges();
    const img = compiled.querySelector('.brand .brand-logo') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/assets/logos/logo-simbolo.png');
    expect(compiled.querySelector('.brand .brand-name')?.textContent).toContain(TestBed.inject(TranslationService).translate('about.appName'));
    expect(compiled.querySelector('.brand .brand-mark')).toBeNull();

    // Un logo cambiado en Configuración no llega al menú hasta guardar.
    settingsService.updateDraft({ logos: { ...logos, principal: null } });
    fixture.detectChanges();
    expect(compiled.querySelector('.brand .brand-logo')).not.toBeNull();

    settingsService.save().subscribe();
    fixture.detectChanges();
    expect(compiled.querySelector('.brand .brand-logo')).toBeNull();
    expect(compiled.querySelector('.brand .brand-mark')).not.toBeNull();
    expect(compiled.querySelector('.brand')?.textContent).toContain(TestBed.inject(TranslationService).translate('about.appName'));
  });

  it('should translate the sidebar navigation once the language setting is saved (not while it is only a draft)', () => {
    const settingsService = TestBed.inject(SettingsService);
    const compiled = fixture.nativeElement as HTMLElement;

    const translation = TestBed.inject(TranslationService);
    const labels = () => Array.from(compiled.querySelectorAll('.nav-tab.nav-top')).map((tab) => tab.textContent?.trim());
    expect(labels().slice(-1)).toEqual(['Gestión de usuarios']);

    settingsService.updateDraft({ language: 'en' });
    fixture.detectChanges();
    expect(labels().slice(-1)).toEqual(['Gestión de usuarios']);

    settingsService.save().subscribe();
    fixture.detectChanges();

    expect(labels()).toEqual(MENU.map((item) => translation.translate(item.labelKey)));
    expect(labels().slice(-1)).toEqual(['User management']);
    expect(compiled.querySelector('.logout-button')?.textContent).toContain('Sign out');
  });

  it('should toggle dark mode through SettingsService so it survives opening/closing Configuración', () => {
    const settingsService = TestBed.inject(SettingsService);

    expect(app.darkMode).toBeFalse();
    app.toggleDarkMode();
    fixture.detectChanges();
    expect(app.darkMode).toBeTrue();
    expect(settingsService.saved().theme).toBe('oscuro');

    // Abrir y cerrar Configuración sin tocar Apariencia no debe deshacer el toggle.
    settingsService.discardDraft();
    fixture.detectChanges();
    expect(app.darkMode).toBeTrue();

    app.toggleDarkMode();
    fixture.detectChanges();
    expect(app.darkMode).toBeFalse();
    expect(settingsService.saved().theme).toBe('claro');
  });
});

describe('AppComponent — inicio y cierre de sesión', () => {
  let fixture: ComponentFixture<AppComponent>;
  let app: AppComponent;
  let el: HTMLElement;

  function create() {
    fixture = TestBed.createComponent(AppComponent);
    app = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    clearTestSession();
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    TestBed.configureTestingModule({ imports: [AppComponent] });
  });
  afterEach(() => {
    clearTestSession();
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it('should show only the sign-in screen when there is no session', () => {
    create();
    expect(el.querySelector('app-login')).toBeTruthy();
    expect(el.querySelector('.sidebar')).toBeNull();
    expect(el.querySelector('.restricted')).toBeNull();
  });

  it('should apply dark mode chosen on the sign-in screen to the whole shell', () => {
    create();
    (el.querySelectorAll('app-login .theme-switch button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.shell')?.classList).toContain('dark-mode');

    startTestSession();
    fixture.detectChanges();
    expect(el.querySelector('.sidebar')).toBeTruthy();
    expect(el.querySelector('.shell')?.classList).toContain('dark-mode');
  });

  it('should open the default view and load the profile of whoever signs in', () => {
    create();
    startTestSession();
    fixture.detectChanges();
    expect(app.currentView).toBe(DEFAULT_VIEW);
    expect(el.querySelector('.user-info')?.textContent).toContain('admin@sena.edu.co');
  });

  it('should show the restricted screen, with a way to sign out, to an analyst', fakeAsync(() => {
    startTestSession({ id: 2, name: 'Analista TDO', email: 'analista@sena.edu.co', role: 'Analista' });
    create();
    expect(el.querySelector('.restricted')).toBeTruthy();
    expect(el.querySelector('.sidebar')).toBeNull();

    (el.querySelector('.restricted .logout-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    app.confirmLogout();
    tick(250);
    fixture.detectChanges();
    expect(el.querySelector('app-login')).toBeTruthy();
  }));

  it('should keep a session with a temporary password on the change screen until it is changed', fakeAsync(() => {
    startTestSession(undefined, true);
    create();
    expect(el.querySelector('.sidebar')).toBeNull();
    expect(el.querySelector('app-login h1')?.textContent).toContain('Cambia tu contraseña');

    TestBed.inject(SessionStore).passwordChanged();
    fixture.detectChanges();
    tick(250);
    fixture.detectChanges();
    expect(el.querySelector('.sidebar')).toBeTruthy();
    expect(app.currentView).toBe(DEFAULT_VIEW);
    flush();
  }));

  it('should let an expert into its own views only (ROLE_VIEWS), without user management', fakeAsync(() => {
    startTestSession({ id: 3, name: 'Experto TDO', email: 'experto@sena.edu.co', role: 'Experto' });
    create();
    tick();
    fixture.detectChanges();
    expect(el.querySelector('.restricted')).toBeNull();
    expect(app.currentView).toBe('validaciones');
    expect(app.menu.map((item) => item.id)).toEqual(['estadisticas']);
    expect(app.menu[0].children?.map((item) => item.id)).toEqual(['validaciones']);
    expect(el.querySelector('app-validaciones')).toBeTruthy();

    // Una vista fuera de su menú no se pinta, aunque se pida.
    app.switchView('usuarios');
    fixture.detectChanges();
    expect(el.querySelector('app-usuarios')).toBeNull();
  }));
});

import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, effect, inject, untracked } from '@angular/core';
import { UsuariosComponent, User } from './views/usuarios/usuarios.component';
import { UsuariosService } from './views/usuarios/usuarios.service';
import { PerfilComponent, ProfileData, createEmptyProfile } from './views/perfil/perfil.component';
import { PerfilService } from './views/perfil/perfil.service';
import { SettingsComponent } from './settings/settings.component';
import { SettingsService } from './settings/settings.service';
import { ToastContainerComponent } from './shared/toast/toast-container.component';
import { ToastService } from './shared/toast/toast.service';
import { TranslatePipe } from './shared/i18n/translate.pipe';
import { TranslationService } from './shared/i18n/translation.service';
import { DialogDirective } from './shared/dialog/dialog.directive';
import { ADMIN_ROLE } from './shared/session';
import { AuthService } from './shared/auth/auth.service';
import { ConfirmDialogComponent } from './shared/ui/confirm-dialog.component';
import { LoginComponent } from './views/login/login.component';
import { AppView, MenuItem, PageView, buildMenu, filterMenu, menuGroupsOf, menuViews } from './app.menu';
import { PROJECT_STORAGE_PREFIX, ROLE_VIEWS } from './proyecto/config';
import { DEFAULT_VIEW, PROJECT_MENU } from './proyecto/menu';

/** Ancho (px) hasta el que el menú lateral es un panel sobre el contenido; debe coincidir con el de app.component.css. */
export const NARROW_SCREEN_MAX_WIDTH = 900;

/** Clave de sessionStorage con la vista abierta: al recargar la página se vuelve a ella y no a la inicial. */
export const VIEW_STORAGE_KEY = `${PROJECT_STORAGE_PREFIX}_view`;

/**
 * Shell de la aplicación: sin sesión muestra el ingreso; con sesión, la barra
 * superior, el menú lateral (acordeón, filtrado por el rol), la vista elegida y
 * el modal de Configuración. Carga el perfil de quien ingresó y, si es
 * administrador, la lista de usuarios que comparte con Gestión de usuarios.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, UsuariosComponent, PerfilComponent, SettingsComponent, ToastContainerComponent, TranslatePipe, DialogDirective,
    LoginComponent, ConfirmDialogComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);
  private readonly authService = inject(AuthService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly perfilService = inject(PerfilService);

  /**
   * La sesión puede usar la aplicación: hay sesión y no le falta cambiar la
   * contraseña temporal. Si no, se muestra la pantalla de ingreso.
   */
  readonly sessionReady = computed(() => this.authService.isLoggedIn() && !this.authService.mustChangePassword());
  /** Cuenta de la sesión habilitada (`null` sin ella): cambia solo al ingresar o salir, no al renombrarse. */
  private readonly readyAccount = computed(() => (this.sessionReady() ? this.authService.user()?.id ?? null : null));
  /** Rol de la sesión: el Administrador ve el shell completo y los roles de `ROLE_VIEWS` solo sus vistas. */
  readonly sessionRole = computed(() => this.authService.user()?.role ?? '');
  readonly adminRole = ADMIN_ROLE;
  /** Vistas a las que entra un rol con acceso parcial (vacío para el Administrador y para los demás roles). */
  private readonly roleViews = computed(() => ROLE_VIEWS[this.sessionRole()] ?? []);
  /** La sesión entra al shell: el Administrador o un rol con vistas en `ROLE_VIEWS`. */
  readonly hasShell = computed(() => this.sessionRole() === ADMIN_ROLE || this.roleViews().length > 0);
  /** Confirmación de "Cerrar sesión" abierta. */
  logoutConfirmOpen = false;
  loggingOut = false;

  /** La sesión es de administrador: ve todo el menú y la Gestión de usuarios. */
  readonly isAdminSession = computed(() => this.sessionRole() === ADMIN_ROLE);

  /**
   * La campana todavía no lee las notificaciones del backend (`GET /usuario/notificaciones`,
   * pendiente de conectar): 0 oculta el contador. Antes mostraba un "22" fijo que contradecía
   * el aviso "No tienes nuevas notificaciones".
   */
  readonly unreadNotifications = 0;
  /** Configuración > Logos > "Logo principal": se muestra en el menú lateral una vez guardado. */
  readonly brandLogo = computed(() => this.settingsService.saved().logos.principal);
  /** Menú completo: primero las opciones del proyecto y al final la parte administrativa. */
  private readonly fullMenu: MenuItem[] = buildMenu(PROJECT_MENU);
  /**
   * Menú lateral de la sesión: el completo para el Administrador; para un rol de `ROLE_VIEWS`,
   * solo sus vistas (sin la parte administrativa).
   */
  readonly menuOfRole = computed<MenuItem[]>(() => (this.roleViews().length ? filterMenu(PROJECT_MENU, this.roleViews()) : this.fullMenu));
  get menu(): MenuItem[] {
    return this.menuOfRole();
  }
  /** Vistas del proyecto (las opciones del menú que no son grupos). */
  private readonly projectViews = menuViews(PROJECT_MENU);
  /** Grupos del menú que están desplegados. */
  private readonly expandedGroups = new Set<PageView>();
  /** Vista inicial de la sesión: `DEFAULT_VIEW` o, para un rol con acceso parcial, su primera vista. */
  get defaultView(): PageView {
    return this.roleViews()[0] ?? DEFAULT_VIEW;
  }
  currentView: AppView = DEFAULT_VIEW;
  /** Vista del área principal; se mantiene debajo mientras Configuración está abierta. */
  pageView: PageView = DEFAULT_VIEW;
  configurationOpen = false;
  /** Menú lateral visible (botón de las tres rayas). En pantallas angostas empieza cerrado. */
  menuOpen = !this.isNarrowScreen();
  darkMode = false;

  /** Se cargan desde sus servicios (la API); con backend responderán de forma asíncrona. */
  profileUser: ProfileData = createEmptyProfile();
  users: User[] = [];

  constructor() {
    // Al iniciar sesión (o al recargar con la sesión abierta) se cargan los
    // datos de quien ingresó y se abre la vista en la que estaba (al recargar)
    // o la inicial (al ingresar). Si la sesión termina sin pasar por "Cerrar
    // sesión" (el servidor la dio por vencida) o pasa a pedir el cambio de la
    // contraseña temporal, se cierra lo que haya quedado abierto sin guardar.
    effect(() => {
      const account = this.readyAccount();
      untracked(() => {
        if (account !== null) {
          this.loadSessionData();
          this.switchView(this.storedView() ?? this.defaultView);
        } else {
          // Sin sesión no se recuerda la vista: el próximo ingreso abre la inicial.
          sessionStorage.removeItem(VIEW_STORAGE_KEY);
          this.profileUser = createEmptyProfile();
          this.logoutConfirmOpen = false;
          if (this.configurationOpen) {
            this.closeConfiguration();
          }
        }
      });
    });

    // Los ajustes de Configuración son globales y se aplican en vivo (incluso
    // antes de guardar): este efecto mantiene el modo oscuro del shell
    // sincronizado con el borrador mientras se edita, y con lo guardado el
    // resto del tiempo (SettingsService.draft === SettingsService.saved
    // salvo mientras el panel de Configuración está abierto y sucio).
    effect(() => {
      this.darkMode = this.settingsService.saved().theme === 'oscuro';
    });
  }

  ngOnInit(): void {
    this.settingsService.load().subscribe();
  }

  /** Vista del proyecto que corresponde a la opción elegida (null para Usuarios y Perfil, que pinta el shell, y para una vista fuera del menú de la sesión). */
  get projectView(): MenuItem['component'] | null {
    if (!menuViews(this.menu).some((item) => item.id === this.pageView)) {
      return null;
    }
    return this.projectViews.find((item) => item.id === this.pageView)?.component ?? null;
  }

  /** Abre una vista (o el modal de Configuración), la recuerda para la recarga y despliega su grupo del menú. */
  switchView(view: AppView) {
    this.currentView = view;
    this.configurationOpen = view === 'configuracion';
    if (view !== 'configuracion') {
      this.pageView = view;
      sessionStorage.setItem(VIEW_STORAGE_KEY, view);
      // Los grupos que contienen la vista quedan desplegados (y sus hermanos recogidos) para que se vea la opción activa.
      menuGroupsOf(this.menu, view).forEach((group) => this.openGroup(group));
      // En pantallas angostas el menú tapa el contenido: se cierra al elegir una vista.
      if (this.isNarrowScreen()) {
        this.menuOpen = false;
      }
    }
  }

  /** Botón de las tres rayas: muestra u oculta el menú lateral. */
  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  /** Esc cierra el menú cuando está abierto como panel sobre el contenido. */
  @HostListener('document:keydown.escape')
  closeMenuPanel() {
    if (this.menuOpen && this.isNarrowScreen() && !this.configurationOpen && !this.logoutConfirmOpen) {
      this.menuOpen = false;
    }
  }

  private isNarrowScreen(): boolean {
    return window.innerWidth <= NARROW_SCREEN_MAX_WIDTH;
  }

  isExpanded(group: PageView): boolean {
    return this.expandedGroups.has(group);
  }

  /**
   * Despliega o recoge un grupo del menú. Funciona como acordeón: al desplegar uno se recogen los
   * demás grupos del mismo nivel (con sus subgrupos), para que el menú nunca crezca más que la pantalla.
   */
  toggleGroup(group: PageView) {
    if (this.expandedGroups.has(group)) {
      this.closeGroup(group);
    } else {
      this.openGroup(group);
    }
  }

  /** Acordeón: despliega el grupo y recoge los demás de su mismo nivel. */
  private openGroup(group: PageView) {
    for (const sibling of this.siblingsOf(this.menu, group)) {
      if (sibling.children) {
        this.closeGroup(sibling.id);
      }
    }
    this.expandedGroups.add(group);
  }

  /** Recoge un grupo y los subgrupos que tenga dentro. */
  private closeGroup(group: PageView) {
    this.expandedGroups.delete(group);
    const item = this.findItem(this.menu, group);
    for (const child of item?.children ?? []) {
      if (child.children) {
        this.closeGroup(child.id);
      }
    }
  }

  /** Las demás opciones del mismo nivel que la indicada. */
  private siblingsOf(items: MenuItem[], id: PageView): MenuItem[] {
    if (items.some((item) => item.id === id)) {
      return items.filter((item) => item.id !== id);
    }
    for (const item of items) {
      const found = item.children ? this.siblingsOf(item.children, id) : [];
      if (found.length) {
        return found;
      }
    }
    return [];
  }

  /** Busca una opción del menú en todo el árbol. */
  private findItem(items: MenuItem[], id: PageView): MenuItem | null {
    for (const item of items) {
      if (item.id === id) {
        return item;
      }
      const found = item.children ? this.findItem(item.children, id) : null;
      if (found) {
        return found;
      }
    }
    return null;
  }

  /** Un grupo recogido se marca como activo si la vista actual está dentro de él. */
  containsCurrentView(group: MenuItem): boolean {
    return menuViews(group.children ?? []).some((item) => item.id === this.currentView);
  }

  /** Engranaje de la barra superior: abre Configuración o, si ya está abierta, la cierra. */
  toggleConfiguration() {
    if (this.configurationOpen) {
      this.closeConfiguration();
    } else {
      this.switchView('configuracion');
    }
  }

  /** Cierra Configuración sin guardar y vuelve a la vista que estaba debajo. */
  closeConfiguration() {
    this.settingsService.discardDraft();
    this.configurationOpen = false;
    this.currentView = this.pageView;
  }

  /** "Cerrar sesión" (menú lateral o pantalla de acceso restringido): pide confirmación. */
  requestLogout() {
    this.logoutConfirmOpen = true;
  }

  cancelLogout() {
    if (!this.loggingOut) {
      this.logoutConfirmOpen = false;
    }
  }

  /** Cierra la sesión: descarta cambios de Configuración sin guardar y vuelve a la pantalla de ingreso. */
  confirmLogout() {
    if (this.loggingOut) {
      return;
    }
    this.loggingOut = true;
    this.authService.logout().subscribe({
      next: () => {
        this.loggingOut = false;
        this.logoutConfirmOpen = false;
        if (this.configurationOpen) {
          this.closeConfiguration();
        }
        this.toastService.success(this.translationService.translate('shell.toastLoggedOut'));
      },
      error: () => {
        this.loggingOut = false;
        this.toastService.error(this.translationService.translate('common.errorGeneric'));
      }
    });
  }

  /**
   * Antes esto solo tocaba un flag local + una clave de localStorage sin
   * relación con SettingsService, así que cualquier interacción con
   * Configuración (incluso solo abrirla y cerrarla sin cambiar nada) volvía
   * a aplicar `draft().theme` vía el effect() del constructor y deshacía el
   * toggle en silencio. Ahora este botón es un atajo que escribe y guarda
   * directamente el mismo `theme` que usa la pestaña Apariencia, así que
   * ambos quedan sincronizados y no se pisan entre sí.
   */
  toggleDarkMode() {
    this.settingsService.toggleTheme().subscribe({
      error: () => this.toastService.error(this.translationService.translate('settings.toastSaveError'))
    });
  }

  notifyNoNewNotifications() {
    // Solo existen 3 estados (Aprobado/Rechazado/Advertencia): un aviso que no
    // es éxito ni error se muestra como Advertencia.
    this.toastService.warning(this.translationService.translate('notifications.none'));
  }

  /** Vista guardada antes de recargar, si sigue existiendo (una opción del menú o Perfil). */
  private storedView(): PageView | null {
    const view = sessionStorage.getItem(VIEW_STORAGE_KEY);
    return view && (view === 'perfil' || menuViews(this.menu).some((item) => item.id === view)) ? view : null;
  }

  /** El perfil se guardó: se refleja en la tarjeta del menú y en el nombre de la sesión (el saludo de Inicio). */
  onProfileSaved(updated: ProfileData) {
    this.profileUser = { ...updated };
    this.authService.renameSession(updated.name);
  }

  /**
   * Usuarios y perfil de quien inició sesión (desde sus servicios, es decir, la API).
   * También pone al día la sesión con el servidor (`GET /auth/me`): al recargar
   * la página así se sabe si la cookie sigue vigente (un 401 vuelve al ingreso)
   * o si la cuenta cambió de nombre o de rol.
   */
  private loadSessionData() {
    this.authService.refresh().subscribe({ error: () => undefined });
    // La lista de usuarios solo la puede leer el administrador (es su vista de Gestión de usuarios).
    if (this.sessionRole() === ADMIN_ROLE) {
      this.usuariosService.list().subscribe((users) => (this.users = users));
    }
    this.perfilService.get().subscribe((profile) => (this.profileUser = profile));
  }
}

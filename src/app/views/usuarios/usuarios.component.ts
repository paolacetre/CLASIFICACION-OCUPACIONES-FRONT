import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ToastService } from '../../shared/toast/toast.service';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { DialogDirective } from '../../shared/dialog/dialog.directive';
import { SessionStore } from '../../shared/auth/session.store';
import { backendRoleOf } from '../../shared/session';
import {
  DOCUMENT_IN_USE,
  EMAIL_IN_USE,
  INVALID_IMPORT_FILE,
  INVALID_USER_DATA,
  USERNAME_IN_USE,
  USERS_FORBIDDEN,
  USER_NOT_FOUND,
  UserError,
  UsuariosService
} from './usuarios.service';

// Los tipos se siguen exportando desde aquí (así los importa el resto de la app).
export * from './usuarios.model';
import {
  DEFAULT_USER_ROLE,
  USER_PERMISSIONS,
  USER_ROLES,
  User,
  UserDraft,
  UserImportResult,
  UserPermission,
  UserRole,
  accessUsernameOf,
  isSenaEmail,
  isValidDocument,
  isValidPhone,
  normalizeDocument,
  permissionsOf
} from './usuarios.model';

/** Formato básico de correo (la validación completa la hace el servidor). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tamaño máximo del Excel de usuarios (bytes). */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Grupo de la tabla: los usuarios de un rol que pasan los filtros. */
export interface RoleSection {
  role: UserRole;
  users: User[];
  active: number;
  inactive: number;
}

/** Errores del servicio y el texto que los explica. */
const ERROR_KEYS: Record<string, string> = {
  [USER_NOT_FOUND]: 'usuarios.errorUserGone',
  [EMAIL_IN_USE]: 'usuarios.validationDuplicateEmail',
  [DOCUMENT_IN_USE]: 'usuarios.validationDuplicateDocument',
  [USERNAME_IN_USE]: 'usuarios.validationDuplicateUsername',
  [INVALID_IMPORT_FILE]: 'usuarios.importInvalidFile',
  [INVALID_USER_DATA]: 'usuarios.errorInvalidData',
  [USERS_FORBIDDEN]: 'usuarios.errorForbidden'
};

/**
 * Confirmación pendiente sobre un usuario (activarlo o desactivarlo): a qué usuario se refiere y si la operación
 * está en curso. El foco lo maneja `appDialog`: lo lleva a "Cancelar" al abrir
 * y lo devuelve al botón que abrió el diálogo al cerrar; también maneja Esc.
 */
class UserConfirmation {
  user: User | null = null;
  busy = false;

  open(user: User): void {
    this.user = user;
  }

  /** Cierra sin confirmar. No se puede mientras la operación está en curso. */
  cancel(): void {
    if (!this.busy) {
      this.user = null;
    }
  }

  /** Fin de la operación: si salió bien se cierra; si falló queda abierta para reintentar. */
  finish(succeeded: boolean): void {
    this.busy = false;
    if (succeeded) {
      this.user = null;
    }
  }
}

/**
 * Gestión de usuarios (solo administrador): lista por rol con búsqueda y
 * filtros, crear y editar, "Rol y permisos", activar o desactivar e "Importar
 * Excel". La lista vive en el shell (`[(users)]`) y todo pasa por `UsuariosService`.
 */
@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, DialogDirective],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.css'
})
export class UsuariosComponent {
  @ViewChild('userNameInput') userNameInput?: ElementRef<HTMLInputElement>;

  /** Usuarios del sistema; los carga el shell (`UsuariosService.list()`). */
  @Input() users: User[] = [];

  /**
   * Avisa al padre cada vez que la lista cambia de referencia (un alta), para
   * usar `[(users)]`: sin esto, al salir a Perfil y volver, esta vista se
   * recrea con la lista anterior del padre y se pierden las altas.
   */
  @Output() readonly usersChange = new EventEmitter<User[]>();

  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly sessionStore = inject(SessionStore);

  /** Roles que se pueden asignar (los del backend). */
  readonly assignableRoles = USER_ROLES;
  readonly roles = ['Todos', ...USER_ROLES];
  readonly statuses = ['Todos', 'Activo', 'Inactivo'] as const;
  readonly origins = ['Todos', 'Manual', 'Excel'] as const;

  searchTerm = '';
  selectedRole = 'Todos';
  selectedStatus = 'Todos';
  selectedOrigin = 'Todos';
  /** Importación de Excel en curso, y su resultado mientras se muestra. */
  isImporting = false;
  /** Descarga de la plantilla de importación en curso. */
  isDownloadingTemplate = false;
  importResult: UserImportResult | null = null;
  showForm = false;
  formError = '';
  editingUserId: number | null = null;
  isFormPending = false;
  readonly statusConfirmation = new UserConfirmation();

  /** Usuario cuyo detalle se está viendo. */
  detailsUser: User | null = null;
  /** Usuario al que se le está cambiando el rol, y el rol elegido. */
  roleUser: User | null = null;
  roleDraft: UserRole = DEFAULT_USER_ROLE;
  isRolePending = false;
  roleError = '';

  private pendingUserIds = new Set<number>();

  formUser: UserDraft = this.emptyUserDraft();

  /** Usuarios que cumplen la búsqueda (nombre, correo o cédula) y los filtros de rol, estado y origen. */
  get filteredUsers() {
    const term = this.searchTerm.trim().toLowerCase();
    return this.users.filter(
      (user) =>
        (!term || user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term) || user.document.includes(term)) &&
        (this.selectedRole === 'Todos' || user.role === this.selectedRole) &&
        (this.selectedStatus === 'Todos' || user.status === this.selectedStatus) &&
        (this.selectedOrigin === 'Todos' || user.origin === this.selectedOrigin)
    );
  }

  /** La lista filtrada, agrupada por rol (solo los roles que tienen usuarios). */
  get roleSections(): RoleSection[] {
    const users = this.filteredUsers;
    const roles = [...USER_ROLES, ...new Set(users.map((user) => user.role).filter((role) => !USER_ROLES.includes(role)))];
    return roles
      .map((role) => {
        const ofRole = users.filter((user) => user.role === role);
        const active = ofRole.filter((user) => user.status === 'Activo').length;
        return { role, users: ofRole, active, inactive: ofRole.length - active };
      })
      .filter((section) => section.users.length > 0);
  }

  trackSectionByRole(_index: number, section: RoleSection) {
    return section.role;
  }

  /** Título del grupo de un rol ("Administradores") y la descripción del rol; uno desconocido se muestra tal cual. */
  roleGroupLabel(role: UserRole): string {
    return this.roleText('usuarios.roleGroup.', role, role);
  }

  roleDescription(role: UserRole): string {
    return this.roleText('usuarios.roleDesc.', role, '');
  }

  /** Permisos que da un rol y cuántos son del total ("6 / 11"). */
  permissionsOf(role: UserRole): UserPermission[] {
    return permissionsOf(role);
  }

  permissionCount(role: UserRole): string {
    return `${permissionsOf(role).length} / ${USER_PERMISSIONS.length}`;
  }

  /** Cuántos filtros hay activos (la búsqueda cuenta como uno), para el contador del botón. */
  get filtersCount() {
    let count = 0;
    if (this.searchTerm.trim()) count += 1;
    if (this.selectedRole !== 'Todos') count += 1;
    if (this.selectedStatus !== 'Todos') count += 1;
    if (this.selectedOrigin !== 'Todos') count += 1;
    return count;
  }

  get hasActiveFilters() {
    return this.filtersCount > 0;
  }

  get isFilteredEmpty() {
    return !this.filteredUsers.length && this.hasActiveFilters;
  }

  get isCompletelyEmpty() {
    return !this.users.length && !this.hasActiveFilters;
  }

  countBy(field: 'role' | 'status' | 'origin', value: string) {
    return this.users.filter((user) => user[field] === value).length;
  }

  /** Texto de un botón de filtro por rol: el nombre del rol, o "Todos". */
  roleFilterLabel(role: string): string {
    return role === 'Todos' ? this.translationService.translate('usuarios.roleAll') : role;
  }

  /** La cuenta con la que se inició esta sesión: no se puede desactivar ni cambiar de rol a sí misma (se quedaría sin acceso). */
  isOwnAccount(user: Pick<User, 'id'>): boolean {
    return user.id === this.sessionStore.user()?.id;
  }

  statusLabel(status: string): string {
    if (status === 'Activo') return this.translationService.translate('usuarios.statusActive');
    if (status === 'Inactivo') return this.translationService.translate('usuarios.statusInactive');
    return this.translationService.translate('usuarios.statusAll');
  }

  originLabel(origin: string): string {
    if (origin === 'Manual') return this.translationService.translate('usuarios.originManual');
    if (origin === 'Excel') return this.translationService.translate('usuarios.originExcel');
    return this.translationService.translate('usuarios.statusAll');
  }

  setOrigin(origin: string) {
    this.selectedOrigin = this.selectedOrigin === origin && origin !== 'Todos' ? 'Todos' : origin;
  }

  /** El correo del formulario es del SENA: con él se ingresa; con otro, se ingresa con la cédula. */
  get formEmailIsSena(): boolean {
    return isSenaEmail(this.formUser.email);
  }

  /** Usuario de acceso que armará el servidor con el correo y la cédula escritos (solo se muestra). */
  get formAccessUsername(): string {
    return accessUsernameOf(this.formUser.email, this.formUser.document);
  }

  /** Descarga la plantilla de Excel que acepta la importación (`GET /usuario/plantilla`). */
  downloadTemplate() {
    if (this.isDownloadingTemplate) {
      return;
    }
    this.isDownloadingTemplate = true;
    this.usuariosService.template().subscribe({
      next: (blob) => {
        this.isDownloadingTemplate = false;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Plantilla_Usuarios.xlsx';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url));
      },
      error: () => {
        this.isDownloadingTemplate = false;
        this.emitNotice(this.translationService.translate('usuarios.templateError'), 'error');
      }
    });
  }

  /** Sube el Excel elegido; el servidor crea las cuentas y dice cuáles no pudo. Después se vuelve a pedir la lista. */
  onImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Se limpia para poder elegir otra vez el mismo archivo.
    input.value = '';
    if (!file || this.isImporting) {
      return;
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      this.emitNotice(this.translationService.translate('usuarios.importWrongType'), 'error');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      this.emitNotice(this.translationService.translate('usuarios.importTooLarge'), 'error');
      return;
    }

    this.isImporting = true;
    this.usuariosService.importExcel(file).subscribe({
      next: (result) => {
        this.importResult = result;
        this.usuariosService.list().subscribe({
          next: (users) => {
            this.isImporting = false;
            this.setUsers(users);
          },
          error: () => (this.isImporting = false)
        });
      },
      error: (error: unknown) => {
        this.isImporting = false;
        this.emitNotice(this.errorMessage(error, 'usuarios.importFailed'), 'error');
      }
    });
  }

  closeImportResult() {
    this.importResult = null;
  }

  /** Quita búsqueda y filtros y lo avisa. */
  clearFilters() {
    this.searchTerm = '';
    this.selectedOrigin = 'Todos';
    this.selectedRole = 'Todos';
    this.selectedStatus = 'Todos';
    this.emitNotice(this.translationService.translate('usuarios.toastFiltersReset'));
  }

  setRole(role: string) {
    this.selectedRole = this.selectedRole === role && role !== 'Todos' ? 'Todos' : role;
  }

  setStatus(status: string) {
    this.selectedStatus = this.selectedStatus === status && status !== 'Todos' ? 'Todos' : status;
  }

  /** Muestra un aviso de éxito o de error. */
  emitNotice(message: string, type: 'success' | 'error' = 'success') {
    if (type === 'error') {
      this.toastService.error(message);
    } else {
      this.toastService.success(message);
    }
  }

  isUserPending(user: User) {
    return this.pendingUserIds.has(user.id);
  }

  trackUserById(_index: number, user: User) {
    return user.id;
  }

  /** Abre el formulario vacío para crear un usuario (empieza como Ciudadano). */
  startCreate() {
    this.editingUserId = null;
    this.formError = '';
    this.formUser = this.emptyUserDraft();
    this.openForm();
  }

  /** Abre el formulario con los datos del usuario para editarlos. */
  startEdit(user: User) {
    if (this.isUserPending(user)) {
      return;
    }

    this.editingUserId = user.id;
    this.formError = '';
    this.detailsUser = null;
    this.formUser = { name: user.name, email: user.email, document: user.document, phone: user.phone, role: user.role };
    this.openForm();
  }

  /** Cierra el formulario, salvo mientras se está guardando. */
  closeForm() {
    if (!this.isFormPending) {
      this.showForm = false;
      this.formError = '';
    }
  }

  /**
   * Valida el formulario y crea o actualiza el usuario. Al crear son obligatorios
   * nombre, correo, cédula (la contraseña inicial) y teléfono, como en el servidor.
   * Los errores del servidor (correo o cédula repetidos, datos inválidos) se
   * explican en el formulario.
   */
  saveUser() {
    if (this.isFormPending) {
      return;
    }

    const name = this.formUser.name.trim();
    const email = this.formUser.email.trim().toLowerCase();
    const document = normalizeDocument(this.formUser.document);
    const phone = this.formUser.phone.trim();
    const editingId = this.editingUserId;
    const error = this.formErrorKey(name, email, document, phone);
    if (error) {
      this.formError = this.translationService.translate(error);
      return;
    }

    this.isFormPending = true;
    this.formError = '';
    const draft: UserDraft = { name, email, document, phone, role: this.formUser.role };
    const request = editingId === null ? this.usuariosService.create(draft) : this.usuariosService.update(editingId, draft);

    request.subscribe({
      next: (saved) => {
        this.isFormPending = false;
        if (editingId === null) {
          // Una cuenta nueva siempre empieza con la contraseña temporal; la respuesta del alta no lo dice.
          this.setUsers([...this.users, { ...saved, mustChangePassword: true }]);
          this.emitNotice(this.translationService.translate('usuarios.toastUserCreated', { name: saved.name }));
        } else {
          // Se actualiza el mismo objeto de la lista (AppComponent comparte esas referencias).
          const user = this.users.find((item) => item.id === editingId);
          if (user) {
            // El backend no repite el origen ni la contraseña temporal al guardar: se conservan los que ya se conocían.
            Object.assign(user, saved, { origin: user.origin, mustChangePassword: user.mustChangePassword });
          }
          this.emitNotice(this.translationService.translate('usuarios.toastUserUpdated', { name: saved.name }));
        }
        this.showForm = false;
      },
      error: (failure: unknown) => {
        this.isFormPending = false;
        this.formError = this.errorMessage(failure, 'usuarios.errorSave');
      }
    });
  }

  /**
   * Lo que se puede revisar sin el servidor, con sus mismas reglas: campos
   * obligatorios, formato de correo, cédula y teléfono, cédula obligatoria si el
   * correo no es del SENA (es el usuario de acceso) y correo o cédula repetidos.
   */
  private formErrorKey(name: string, email: string, document: string, phone: string): string {
    const editingId = this.editingUserId;
    if (editingId === null && (!name || !email || !document || !phone)) {
      return 'usuarios.validationRequired';
    }
    if (!name || !email) {
      return 'usuarios.validationNameEmail';
    }
    if (!EMAIL_PATTERN.test(email)) {
      return 'usuarios.validationEmailFormat';
    }
    if (document && !isValidDocument(document)) {
      return 'usuarios.validationDocument';
    }
    if (!document && !isSenaEmail(email)) {
      return 'usuarios.validationDocumentRequired';
    }
    if (phone && !isValidPhone(phone)) {
      return 'usuarios.validationPhone';
    }
    if (this.users.some((user) => user.email.toLowerCase() === email && user.id !== editingId)) {
      return 'usuarios.validationDuplicateEmail';
    }
    if (document && this.users.some((user) => user.document === document && user.id !== editingId)) {
      return 'usuarios.validationDuplicateDocument';
    }
    return '';
  }

  requestStatusChange(user: User) {
    if (!this.isOwnAccount(user)) {
      this.openConfirmation(this.statusConfirmation, user);
    }
  }

  cancelStatusChange() {
    this.statusConfirmation.cancel();
  }

  /** Activa o desactiva la cuenta confirmada; una cuenta inactiva no puede ingresar. */
  confirmStatusChange() {
    this.runConfirmation(
      this.statusConfirmation,
      (user) => this.usuariosService.setStatus(user.id, user.status === 'Activo' ? 'Inactivo' : 'Activo'),
      (user, saved) => {
        user.status = saved.status;
        this.emitNotice(this.translationService.translate(saved.status === 'Activo' ? 'usuarios.toastUserActivated' : 'usuarios.toastUserDeactivated', { name: user.name }));
      }
    );
  }

  openDetails(user: User) {
    this.detailsUser = user;
  }

  closeDetails() {
    this.detailsUser = null;
  }

  /** Abre "Rol y permisos" de un usuario (no de la cuenta propia: se quedaría sin acceso). */
  openRoleDialog(user: User) {
    if (this.isOwnAccount(user) || this.isUserPending(user)) {
      return;
    }
    this.detailsUser = null;
    this.roleUser = user;
    this.roleDraft = user.role;
    this.roleError = '';
  }

  closeRoleDialog() {
    if (!this.isRolePending) {
      this.roleUser = null;
    }
  }

  /** Guarda el rol elegido en "Rol y permisos" (los permisos dependen del rol: el backend no los guarda por usuario). */
  saveRole() {
    const user = this.roleUser;
    if (!user || this.isRolePending) {
      return;
    }
    if (this.roleDraft === user.role) {
      this.roleUser = null;
      return;
    }

    this.isRolePending = true;
    this.roleError = '';
    this.usuariosService.setRole(user.id, this.roleDraft).subscribe({
      next: (saved) => {
        this.isRolePending = false;
        user.role = saved.role;
        this.roleUser = null;
        this.emitNotice(this.translationService.translate('usuarios.toastRoleUpdated', { name: user.name, role: saved.role }));
      },
      error: (error: unknown) => {
        this.isRolePending = false;
        this.roleError = this.errorMessage(error, 'usuarios.errorGeneric');
      }
    });
  }

  /** Abre la confirmación, salvo que ese usuario ya tenga una operación en curso. */
  private openConfirmation(confirmation: UserConfirmation, user: User) {
    if (!this.isUserPending(user)) {
      confirmation.open(user);
    }
  }

  /**
   * Ejecuta la operación confirmada contra el servicio (la API) y bloquea las
   * acciones de ese usuario mientras responde. Si sale bien aplica el
   * resultado y cierra el diálogo; si falla muestra el error y lo deja abierto
   * para reintentar o cancelar.
   */
  private runConfirmation<T>(
    confirmation: UserConfirmation,
    request: (user: User) => Observable<T>,
    onSuccess: (user: User, result: T) => void,
    errorKey = 'usuarios.errorGeneric'
  ) {
    const user = confirmation.user;
    if (!user || confirmation.busy || this.isUserPending(user)) {
      return;
    }

    confirmation.busy = true;
    this.pendingUserIds = new Set(this.pendingUserIds).add(user.id);
    const finish = (succeeded: boolean) => {
      const pendingUserIds = new Set(this.pendingUserIds);
      pendingUserIds.delete(user.id);
      this.pendingUserIds = pendingUserIds;
      confirmation.finish(succeeded);
    };

    request(user).subscribe({
      next: (result) => {
        try {
          onSuccess(user, result);
          finish(true);
        } catch (error) {
          this.emitNotice(this.errorMessage(error, errorKey), 'error');
          finish(false);
        }
      },
      error: (error: unknown) => {
        this.emitNotice(this.errorMessage(error, errorKey), 'error');
        finish(false);
      }
    });
  }

  /**
   * Mensaje visible de un error: los códigos de la API se traducen; si el
   * servidor rechazó los datos con un motivo propio (p. ej. «La cédula debe
   * tener entre 5 y 12 dígitos»), se muestra ese motivo.
   */
  private errorMessage(error: unknown, fallbackKey: string): string {
    if (error instanceof UserError && error.message === INVALID_USER_DATA && error.serverMessage) {
      return error.serverMessage;
    }
    const key = error instanceof Error ? ERROR_KEYS[error.message] : undefined;
    return this.translationService.translate(key ?? fallbackKey);
  }

  private setUsers(users: User[]) {
    this.users = users;
    this.usersChange.emit(users);
  }

  private emptyUserDraft(): UserDraft {
    return { name: '', email: '', document: '', phone: '', role: DEFAULT_USER_ROLE };
  }

  /** Texto propio de un rol (`<prefijo><ROL DEL BACKEND>`), o `fallback` si ese rol no tiene. */
  private roleText(prefix: string, role: UserRole, fallback: string): string {
    const key = prefix + backendRoleOf(role);
    const text = this.translationService.translate(key);
    return text === key ? fallback : text;
  }

  /** Abre el formulario con el foco en el nombre (appDialog lo devuelve al botón que lo abrió al cerrar). */
  private openForm() {
    this.showForm = true;
    setTimeout(() => this.userNameInput?.nativeElement.focus());
  }
}

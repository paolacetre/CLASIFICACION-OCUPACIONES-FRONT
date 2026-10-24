import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionStore } from '../../shared/auth/session.store';
import { initialsFrom } from '../../shared/format/initials';
import { nowAsStoredTime } from '../../shared/format/now';
import { isStrongPassword, passwordChangeError } from '../../shared/format/password';
import { ToastService } from '../../shared/toast/toast.service';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ProfileData, createEmptyProfile } from './perfil.model';
import { PROFILE_INVALID, PerfilService, ProfileError } from './perfil.service';

// El tipo se sigue exportando desde aquí (así lo importa el resto de la app).
export * from './perfil.model';

/** Tamaño máximo de la foto de perfil (bytes). */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Pestañas de la vista. */
export type ProfileTab = 'perfil' | 'configuracion';

/** Indicadores de la tarjeta superior. El backend todavía no los entrega por usuario: se muestran sin valor. */
const METRIC_KEYS = ['perfil.metricAnalysis', 'perfil.metricOccupations', 'perfil.metricCorrelations'];

/**
 * Vista "Perfil" (parte común). Tarjeta superior con la foto, el rol, el nivel
 * de acceso y el inicio de la sesión; pestaña "Perfil" con la información
 * personal (nombre y apellido, teléfono, descripción y foto, editables; el
 * correo no) y la institucional; pestaña "Seguridad" con el cambio de contraseña.
 */
@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css'
})
export class PerfilComponent implements OnChanges {
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);
  private readonly perfilService = inject(PerfilService);
  private readonly sessionStore = inject(SessionStore);

  readonly metricKeys = METRIC_KEYS;
  readonly currentYear = new Date().getFullYear();
  tab: ProfileTab = 'perfil';

  /** Perfil de la sesión; lo carga el shell (`PerfilService.get()`). */
  @Input() profile: ProfileData = createEmptyProfile();

  @Output() profileSaved = new EventEmitter<ProfileData>();
  @Output() cancel = new EventEmitter<void>();

  /** Copia que se edita en el formulario; `profile` no cambia hasta guardar. */
  formProfile: ProfileData = { ...this.profile };
  isSaving = false;
  formError = '';
  successNotice = '';

  /* ---------- Cambio de contraseña ---------- */
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  /** Muestra las contraseñas escritas en vez de ocultarlas. */
  showPasswords = false;
  isSavingPassword = false;
  passwordError = '';

  /** El perfil llega del backend después de crear la vista: el formulario lo toma cuando llega. */
  ngOnChanges() {
    this.formProfile = { ...this.profile };
  }

  /** Nombre que muestra la tarjeta de identidad mientras se edita. */
  get formName(): string {
    return this.formProfile.name.trim();
  }

  /** Iniciales que se muestran mientras no hay foto. */
  get initials(): string {
    return initialsFrom(this.formName || this.formProfile.email);
  }

  /** Nivel de acceso según el rol (clave de traducción). */
  get accessLevelKey(): string {
    const role = this.formProfile.role.toLowerCase();
    return role.includes('admin') ? 'perfil.levelTotal' : role.includes('analista') ? 'perfil.levelAdvanced' : 'perfil.levelStandard';
  }

  /** Cuándo se inició esta sesión ("Hoy, 09:42 AM" o "08/10/2026, 09:42 AM"); vacío sin sesión. */
  get lastAccess(): string {
    const startedAt = this.sessionStore.startedAt();
    if (!startedAt) {
      return '';
    }
    const [day, ...time] = nowAsStoredTime(new Date(startedAt)).split(' ');
    const today = nowAsStoredTime().split(' ')[0];
    return `${day === today ? this.translationService.translate('perfil.today') : day}, ${time.join(' ')}`;
  }

  selectTab(tab: ProfileTab) {
    this.tab = tab;
  }

  /** Toma la foto elegida (JPG, PNG o WEBP de hasta 2 MB); se guarda en el servidor al pulsar "Guardar". */
  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.formError = this.translationService.translate('perfil.photoTooLarge');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.formProfile.photoUrl = reader.result as string;
      this.formError = '';
    };
    reader.readAsDataURL(file);
  }

  removePhoto() {
    this.formProfile.photoUrl = '';
  }

  /** Guarda nombre y apellido, teléfono, descripción y foto en el servidor (cualquier rol edita su propio perfil). */
  save() {
    if (this.isSaving) {
      return;
    }
    const name = this.formProfile.name.trim();
    // El servidor pide al menos 2 caracteres: se avisa aquí con un mensaje propio.
    if (name.length < 2) {
      this.formError = this.translationService.translate('perfil.errorRequiredFields');
      return;
    }

    this.isSaving = true;
    this.formError = '';
    this.perfilService.update({ ...this.formProfile, name }).subscribe({
      next: (saved) => {
        this.profile = saved;
        this.formProfile = { ...saved };
        this.profileSaved.emit(saved);
        this.isSaving = false;
        this.successNotice = this.translationService.translate('perfil.successBanner');
        setTimeout(() => (this.successNotice = ''), 3000);
        this.toastService.success(this.translationService.translate('perfil.toastUpdated'));
      },
      error: (failure: unknown) => {
        this.isSaving = false;
        // Si el servidor dice por qué no lo aceptó (p. ej. la foto), se muestra su motivo.
        this.formError = failure instanceof ProfileError && failure.message === PROFILE_INVALID && failure.serverMessage
          ? failure.serverMessage
          : this.translationService.translate('common.errorGeneric');
      }
    });
  }

  /** Descarta lo escrito y vuelve a la vista anterior. */
  onCancel() {
    this.formProfile = { ...this.profile };
    this.formError = '';
    this.clearPasswords();
    this.passwordError = '';
    this.cancel.emit();
  }

  /** Cambia la contraseña; valida aquí lo que no necesita al servidor para avisar antes. */
  changePassword() {
    if (this.isSavingPassword) {
      return;
    }
    const error = !this.currentPassword || !this.newPassword || !this.confirmPassword
      ? 'perfil.errorPasswordRequired'
      : !isStrongPassword(this.newPassword)
        ? 'perfil.errorPasswordWeak'
        : this.newPassword !== this.confirmPassword
          ? 'perfil.errorPasswordMismatch'
          : this.newPassword === this.currentPassword
            ? 'perfil.errorPasswordSame'
            : '';
    if (error) {
      this.passwordError = this.translationService.translate(error);
      return;
    }

    this.isSavingPassword = true;
    this.passwordError = '';
    this.perfilService.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.isSavingPassword = false;
        this.clearPasswords();
        this.toastService.success(this.translationService.translate('perfil.toastPasswordChanged'));
      },
      error: (failure: unknown) => {
        this.isSavingPassword = false;
        this.passwordError = passwordChangeError(failure, (key) => this.translationService.translate(key));
      }
    });
  }

  /** Botón "Limpiar" del cambio de contraseña. */
  resetPasswordForm() {
    this.clearPasswords();
    this.passwordError = '';
  }

  /** Las contraseñas no se quedan escritas después de usarlas. */
  private clearPasswords() {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }
}

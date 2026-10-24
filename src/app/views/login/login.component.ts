import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, ViewChild, afterNextRender, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import { SettingsService } from '../../settings/settings.service';
import { LOGIN_LINKS } from '../../proyecto/config';
import {
  AuthError,
  AuthService,
  EXTERNAL_EMAIL,
  INVALID_CREDENTIALS,
  LOCKOUT_MINUTES,
  LOGIN_REJECTED,
  LOGIN_UNAVAILABLE,
  MAX_LOGIN_ATTEMPTS,
  TOO_MANY_ATTEMPTS,
  USER_INACTIVE,
  WRONG_CURRENT_PASSWORD
} from '../../shared/auth/auth.service';
import { isStrongPassword, passwordChangeError } from '../../shared/format/password';

/** Curvas de GSAP expresadas como curvas CSS. */
const POWER3_OUT = 'cubic-bezier(0.215, 0.61, 0.355, 1)';
const SINE_IN_OUT = 'cubic-bezier(0.37, 0, 0.63, 1)';

/** Formato básico de correo (la validación real la hace el servidor). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Cédula: de 5 a 12 dígitos (misma regla que el servidor). */
const DOCUMENT_PATTERN = /^\d{5,12}$/;
/** Correo institucional: con otro dominio se ingresa con la cédula. */
const SENA_EMAIL = /@(sena\.edu\.co|soy\.sena\.edu\.co)$/i;
/** Largo mínimo que acepta el servidor al ingresar (la contraseña temporal es la cédula, que puede tener 5 dígitos). */
const LOGIN_PASSWORD_MIN = 5;

/**
 * Pantalla de ingreso (parte común a todos los proyectos). Muestra el logo de
 * inicio de sesión de Configuración > Logos y el nombre del sistema, y permite
 * elegir el tema (Claro / Oscuro) antes de ingresar. Se ingresa con el correo
 * SENA o la cédula; el ingreso lo valida el servidor (`AuthService`).
 *
 * Si la cuenta tiene una contraseña temporal (la cédula que asigna el alta), la
 * misma pantalla pasa a "Cambia tu contraseña": hasta cambiarla el servidor
 * no deja usar nada más.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements AfterViewInit {
  private readonly authService = inject(AuthService);
  private readonly settingsService = inject(SettingsService);
  private readonly translationService = inject(TranslationService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** Logo de inicio de sesión (o el principal si no hay uno propio). */
  readonly logo = computed(() => {
    const logos = this.settingsService.saved().logos;
    return logos.login ?? logos.principal;
  });
  readonly darkMode = computed(() => this.settingsService.saved().theme === 'oscuro');
  /** Enlaces a otras aplicaciones (los define cada proyecto). */
  readonly links = LOGIN_LINKS;
  /** Aviso cuando la sesión anterior se cerró porque el servidor la dio por vencida. */
  readonly sessionExpired = this.authService.sessionExpired;
  /** La sesión está abierta con la contraseña temporal: la pantalla pide cambiarla. */
  readonly changingPassword = this.authService.mustChangePassword;
  readonly year = new Date().getFullYear();

  @ViewChild('loginMain') private loginMain?: ElementRef<HTMLElement>;
  @ViewChild('loginHero') private loginHero?: ElementRef<HTMLElement>;
  @ViewChild('emailInput') private emailInput?: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') private passwordInput?: ElementRef<HTMLInputElement>;
  @ViewChild('changeCurrentInput') private changeCurrentInput?: ElementRef<HTMLInputElement>;
  @ViewChild('changeNewInput') private changeNewInput?: ElementRef<HTMLInputElement>;

  email = '';
  password = '';
  showPassword = false;
  submitting = false;
  /** Error del servidor (credenciales, usuario inactivo, bloqueo). */
  error = '';
  /** Errores de cada campo, que se muestran debajo de él. */
  emailError = '';
  passwordError = '';
  /** Bloq Mayús activado mientras se escribe la contraseña. */
  capsLock = false;
  /** "Mantener la sesión iniciada": la sesión sigue abierta al cerrar el navegador. */
  remember = false;
  /** El logo ocupa su espacio desde el inicio y aparece suave al terminar de cargar (sin saltos). */
  logoLoaded = false;
  /** Animaciones en curso (entrada y orbes del fondo), para detenerlas al salir. */
  private readonly animations: Animation[] = [];

  /* ---------- Cambio obligatorio de la contraseña temporal ---------- */
  /**
   * La contraseña temporal con la que se acaba de ingresar. Solo en memoria y
   * solo mientras dura el cambio, para no pedirla dos veces; si la página se
   * recarga (o el servidor no la acepta) se pide en el formulario.
   */
  private temporaryPassword: string | null = null;
  changeCurrent = '';
  changeNew = '';
  changeConfirm = '';
  showChangePasswords = false;
  changeError = '';

  constructor() {
    // El cursor queda listo en el primer campo al abrir la pantalla.
    afterNextRender(() => (this.changingPassword() ? this.focusPasswordChange() : this.emailInput?.nativeElement.focus()));
    // Si la pantalla se cierra a mitad de la animación, se detiene.
    this.destroyRef.onDestroy(() => this.animations.forEach((animation) => animation.cancel()));
  }

  /**
   * Animación de entrada, la misma secuencia que la referencia en GSAP:
   *
   *   gsap.timeline({ defaults: { ease: 'power3.out' } })
   *     .fromTo(card, { opacity: 0, y: 26, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.7 })
   *     .fromTo(hero, { opacity: 0, x: -28 }, { opacity: 1, x: 0, duration: 0.7 }, '<')
   *     .from('.login-reveal', { y: 14, opacity: 0, stagger: 0.08, duration: 0.45 }, '-=0.35')
   *     .from('.login-logo', { rotate: -6, scale: 0.92, duration: 0.45 }, '-=0.25');
   *   gsap.to('.login-bg-orb', { y: '-=24', x: '+=18', duration: 6, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.35 });
   *
   * Se hace con la Web Animations API del navegador (sin instalar GSAP). Cada
   * paso usa `fill: 'backwards'`: mientras espera su turno ya muestra el estado
   * inicial (como `from()` de GSAP) y al terminar no deja estilos pegados.
   * Con "reducir movimiento" activo no se anima nada y todo queda visible.
   */
  ngAfterViewInit(): void {
    const main = this.loginMain?.nativeElement;
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!main || reduceMotion || typeof main.animate !== 'function') {
      return;
    }
    const root = this.host.nativeElement;
    const play = (element: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (element) {
        this.animations.push(element.animate(keyframes, { easing: POWER3_OUT, fill: 'backwards', ...options }));
      }
    };
    try {
      // 1. Formulario: sube 26px, crece de 98,5 % a 100 % y aparece. 0–700 ms.
      //    A la vez, la marca del panel izquierdo entra desde la izquierda.
      play(main, [{ opacity: 0, transform: 'translateY(26px) scale(0.985)' }, { opacity: 1, transform: 'none' }], { duration: 700 });
      play(this.loginHero?.nativeElement ?? null, [{ opacity: 0, transform: 'translateX(-28px)' }, { opacity: 1, transform: 'none' }], { duration: 700 });

      // 2. Elementos .login-reveal en cascada (80 ms entre uno y otro), 350 ms antes de que termine el paso 1.
      const revealStart = 700 - 350;
      const reveals = Array.from(root.querySelectorAll('.login-reveal'));
      reveals.forEach((element, index) =>
        play(element, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: revealStart + index * 80 })
      );

      // 3. Logo: empieza girado -6° y al 92 % y se endereza, 250 ms antes de que termine la cascada.
      const revealEnd = revealStart + Math.max(reveals.length - 1, 0) * 80 + 450;
      play(root.querySelector('.login-logo, .login-mark'), [{ transform: 'rotate(-6deg) scale(0.92)' }, { transform: 'none' }], {
        duration: 450,
        delay: revealEnd - 250
      });

      // Formas del panel de marca: flotan sin parar (ida y vuelta de 6 s), con 350 ms de diferencia entre ellas.
      root.querySelectorAll('.login-bg-orb').forEach((orb, index) =>
        this.animations.push(
          orb.animate([{ transform: 'translate(0, 0)' }, { transform: 'translate(18px, -24px)' }], {
            duration: 6000,
            easing: SINE_IN_OUT,
            direction: 'alternate',
            iterations: Infinity,
            delay: index * 350
          })
        )
      );
    } catch {
      // Si algo falla, se detiene todo y la pantalla queda visible tal cual.
      this.animations.forEach((animation) => animation.cancel());
    }
  }

  /** Al salir del correo solo se avisa si está mal escrito (vacío no, para no regañar antes de tiempo). */
  validateEmail(): void {
    const identifier = this.email.trim();
    this.emailError = identifier ? this.identifierError(identifier) : '';
  }

  /**
   * Correo SENA o cédula de 5 a 12 dígitos, como exige el servidor. Un correo
   * de otro dominio no sirve para ingresar (esas cuentas entran con la cédula).
   */
  private identifierError(identifier: string): string {
    if (DOCUMENT_PATTERN.test(identifier)) {
      return '';
    }
    if (!EMAIL_PATTERN.test(identifier)) {
      return this.translationService.translate('login.errorEmailFormat');
    }
    return SENA_EMAIL.test(identifier) ? '' : this.translationService.translate('login.errorExternalEmail');
  }

  checkCapsLock(event: KeyboardEvent): void {
    this.capsLock = typeof event.getModifierState === 'function' && event.getModifierState('CapsLock');
  }

  /** Faltan datos: el botón se ve atenuado, pero sigue activo para explicar qué falta. */
  get incomplete(): boolean {
    return !this.email.trim() || !this.password;
  }

  /**
   * Valida el correo o la cédula y la contraseña e inicia sesión. La contraseña
   * escrita se borra después de cada intento; si era temporal, se guarda en
   * memoria para el cambio obligatorio.
   */
  submit(): void {
    if (this.submitting) {
      return;
    }
    this.error = '';
    const identifier = this.email.trim();
    this.emailError = identifier ? this.identifierError(identifier) : this.translationService.translate('login.errorEmailRequired');
    this.passwordError = !this.password
      ? this.translationService.translate('login.errorPasswordRequired')
      : this.password.length < LOGIN_PASSWORD_MIN ? this.translationService.translate('login.errorPasswordShort') : '';
    if (this.emailError || this.passwordError) {
      (this.emailError ? this.emailInput : this.passwordInput)?.nativeElement.focus();
      return;
    }
    this.submitting = true;
    const typedPassword = this.password;
    this.authService.login(identifier, typedPassword, this.remember).subscribe({
      next: (user) => {
        this.submitting = false;
        this.password = '';
        if (this.changingPassword()) {
          this.openPasswordChange(typedPassword);
          return;
        }
        this.toastService.success(this.translationService.translate('login.toastWelcome', { name: user.name }));
      },
      error: (error: unknown) => {
        this.submitting = false;
        // La contraseña no se deja escrita tras un intento fallido.
        this.password = '';
        this.error = this.errorMessage(error);
        // Se vuelve a la contraseña para reintentar sin usar el mouse.
        setTimeout(() => this.passwordInput?.nativeElement.focus());
      }
    });
  }

  /** La pantalla pasa al cambio obligatorio; `temporary` es la contraseña con la que se acaba de ingresar. */
  private openPasswordChange(temporary: string | null): void {
    this.temporaryPassword = temporary;
    this.changeCurrent = '';
    this.changeNew = '';
    this.changeConfirm = '';
    this.changeError = '';
    setTimeout(() => this.focusPasswordChange());
  }

  /** El foco va a la contraseña temporal si hay que escribirla; si no, a la nueva. */
  private focusPasswordChange(): void {
    (this.asksTemporaryPassword ? this.changeCurrentInput : this.changeNewInput)?.nativeElement.focus();
  }

  /** Hay que escribir la contraseña temporal: no se conoce la de este ingreso (se recargó la página o no sirvió). */
  get asksTemporaryPassword(): boolean {
    return this.temporaryPassword === null;
  }

  /** Cambia la contraseña temporal; al terminar, el shell abre la aplicación. */
  changePassword(): void {
    if (this.submitting) {
      return;
    }
    const current = this.temporaryPassword ?? this.changeCurrent.trim();
    const error = !current
      ? 'login.changeCurrentRequired'
      : !this.changeNew
        ? 'login.changeNewRequired'
        : !isStrongPassword(this.changeNew)
          ? 'login.changeRules'
          : this.changeNew !== this.changeConfirm
            ? 'login.changeMismatch'
            : this.changeNew === current ? 'login.changeSame' : '';
    if (error) {
      this.changeError = this.translationService.translate(error);
      return;
    }

    this.submitting = true;
    this.changeError = '';
    this.authService.changePassword(current, this.changeNew).subscribe({
      next: () => {
        this.submitting = false;
        this.temporaryPassword = null;
        this.changeNew = '';
        this.changeConfirm = '';
        this.changeCurrent = '';
        const name = this.authService.user()?.name ?? '';
        this.toastService.success(this.translationService.translate('login.toastPasswordChanged', { name }));
      },
      error: (failure: unknown) => {
        this.submitting = false;
        if (failure instanceof AuthError && failure.message === WRONG_CURRENT_PASSWORD) {
          // La temporal recordada no sirvió (o la escrita era otra): se pide de nuevo.
          this.temporaryPassword = null;
          this.changeError = this.translationService.translate('login.changeWrongTemporary');
          setTimeout(() => this.focusPasswordChange());
          return;
        }
        this.changeError = passwordChangeError(failure, (key) => this.translationService.translate(key));
      }
    });
  }

  /** "Cerrar sesión" desde el cambio obligatorio: se olvida la temporal y se vuelve al ingreso. */
  cancelPasswordChange(): void {
    this.temporaryPassword = null;
    this.changeCurrent = '';
    this.changeNew = '';
    this.changeConfirm = '';
    this.changeError = '';
    this.authService.logout().subscribe({ complete: () => setTimeout(() => this.emailInput?.nativeElement.focus()) });
  }

  /** Explica el código de error del ingreso sin revelar si la cuenta existe. */
  private errorMessage(error: unknown): string {
    const code = error instanceof Error ? error.message : '';
    switch (code) {
      case INVALID_CREDENTIALS:
        return this.translationService.translate('login.errorInvalid', { max: MAX_LOGIN_ATTEMPTS });
      case USER_INACTIVE:
        return this.translationService.translate('login.errorInactive');
      case EXTERNAL_EMAIL:
        return this.translationService.translate('login.errorExternalEmail');
      case LOGIN_REJECTED:
        return error instanceof AuthError && error.serverMessage ? error.serverMessage : this.translationService.translate('common.errorGeneric');
      case TOO_MANY_ATTEMPTS:
        return this.translationService.translate('login.errorLocked', { minutes: LOCKOUT_MINUTES });
      case LOGIN_UNAVAILABLE:
        return this.translationService.translate('login.errorUnavailable');
      default:
        return this.translationService.translate('common.errorGeneric');
    }
  }

  /**
   * Selector Claro / Oscuro: el mismo ajuste que el botón de la barra
   * superior. Si no se puede guardar (p. ej. el navegador no tiene espacio), el
   * cambio igual se ve en esta pantalla.
   */
  setDarkMode(dark: boolean): void {
    if (dark !== this.darkMode()) {
      this.settingsService.toggleTheme().subscribe({ error: () => undefined });
    }
  }
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { DEFAULT_SETTINGS, SIZE_PRESETS, SystemConfig, SystemLogos, cloneSettings } from './settings.model';
import { ThemeService } from './theme.service';

import { PROJECT_STORAGE_PREFIX } from '../proyecto/config';

/** Clave de localStorage de la configuración (lleva el prefijo del proyecto). */
export const SETTINGS_STORAGE_KEY = `${PROJECT_STORAGE_PREFIX}_system_config`;
const STORAGE_KEY = SETTINGS_STORAGE_KEY;
const LEGACY_DEFAULT_PRINCIPAL_LOGO = '/assets/logos/logo-principal.png';

/**
 * Estado de los ajustes globales de la plataforma (uno solo, compartido por
 * todos los usuarios). Mantiene dos copias, como pide el requerimiento:
 * - `saved`: lo último persistido (hoy en localStorage; mañana el backend).
 * - `draft`: lo que el usuario está editando ahora mismo.
 *
 * El borrador (`draft`) solo se ve en la vista previa de Configuración; la
 * interfaz usa siempre lo guardado (`saved`), que es lo único que se aplica vía
 * ThemeService. Un cambio pasa a toda la interfaz al guardarlo. `save()`/`load()`/`uploadLogo()` están
 * escritos como si fueran llamadas HTTP (Observable) para que, el día que haya
 * backend, baste con cambiar su implementación interna sin tocar los componentes.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly theme = inject(ThemeService);

  private readonly savedSignal = signal<SystemConfig>(cloneSettings(DEFAULT_SETTINGS));
  private readonly draftSignal = signal<SystemConfig>(cloneSettings(DEFAULT_SETTINGS));

  readonly saved = this.savedSignal.asReadonly();
  readonly draft = this.draftSignal.asReadonly();
  readonly isDirty = computed(() => JSON.stringify(this.draftSignal()) !== JSON.stringify(this.savedSignal()));

  /** Simula `GET /api/settings`. */
  load(): Observable<SystemConfig> {
    const stored = this.readFromStorage();
    this.savedSignal.set(stored);
    this.draftSignal.set(cloneSettings(stored));
    this.theme.apply(stored);
    return new Observable<SystemConfig>((subscriber) => {
      subscriber.next(stored);
      subscriber.complete();
    });
  }

  /** Actualiza el borrador: se ve en la vista previa de Configuración; la interfaz no cambia hasta guardar. */
  updateDraft(patch: Partial<SystemConfig>): void {
    this.draftSignal.set({ ...this.draftSignal(), ...patch });
  }

  /**
   * Guarda el borrador en este navegador (localStorage): el backend no tiene
   * endpoints de configuración. Solo el administrador llega a Configuración.
   */
  save(): Observable<SystemConfig> {
    const toSave = cloneSettings(this.draftSignal());
    if (!this.writeToStorage(toSave)) {
      // No cabe en el almacenamiento (p. ej. logos muy pesados): no se marca
      // como guardado, el borrador sigue pendiente y quien llama muestra el error.
      return throwError(() => new Error('STORAGE_FULL'));
    }
    this.savedSignal.set(toSave);
    this.theme.apply(toSave);
    return new Observable<SystemConfig>((subscriber) => {
      subscriber.next(toSave);
      subscriber.complete();
    });
  }

  /**
   * Cambia entre modo claro y oscuro y lo guarda (el mismo `theme` que usa la
   * pestaña Apariencia). Lo usan el botón de luna de la barra superior y el de
   * la pantalla de ingreso. El cambio se ve de inmediato aunque el guardado
   * falle; quien llama decide qué hacer con el error.
   */
  toggleTheme(): Observable<SystemConfig> {
    const theme = this.savedSignal().theme === 'oscuro' ? 'claro' : 'oscuro';
    // Es un atajo que guarda solo el tema: lo demás que esté en el borrador sigue pendiente.
    const next: SystemConfig = { ...cloneSettings(this.savedSignal()), theme };
    this.savedSignal.set(next);
    this.draftSignal.set({ ...this.draftSignal(), theme });
    this.theme.apply(next);
    if (!this.writeToStorage(next)) {
      return throwError(() => new Error('STORAGE_FULL'));
    }
    return new Observable<SystemConfig>((subscriber) => {
      subscriber.next(next);
      subscriber.complete();
    });
  }

  /**
   * Restablecer: vuelve a los valores de fábrica y los GUARDA de inmediato
   * (misma persistencia que `save()`), descartando cualquier cambio pendiente.
   * No hace falta pulsar "Guardar cambios" después.
   */
  reset(): Observable<SystemConfig> {
    this.draftSignal.set(cloneSettings(DEFAULT_SETTINGS));
    return this.save();
  }

  /** Descarta el borrador sin guardar: vuelve a lo guardado (al cerrar el panel sin "Guardar"). */
  discardDraft(): void {
    const saved = cloneSettings(this.savedSignal());
    this.draftSignal.set(saved);
    this.theme.apply(saved);
  }

  /**
   * Simula `POST /api/settings/logos` (multipart). Valida tipo imagen y máx.
   * 2MB. Los errores usan códigos estables (no texto) porque este servicio no
   * conoce el idioma actual — el componente que llama es quien traduce el
   * código a un mensaje visible (ver `LOGO_UPLOAD_ERROR_KEYS` en el tab de Logos).
   */
  uploadLogo(file: File, slot: keyof SystemLogos): Observable<string> {
    if (!file.type.startsWith('image/')) {
      return throwError(() => new Error('NOT_IMAGE'));
    }
    if (file.size > 2 * 1024 * 1024) {
      return throwError(() => new Error('TOO_LARGE'));
    }

    return new Observable<string>((subscriber) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;

        if (this.isSvg(file) && !this.isSvgContentSafe(url)) {
          subscriber.error(new Error('UNSAFE_SVG'));
          return;
        }

        const logos: SystemLogos = { ...this.draftSignal().logos, [slot]: url };
        this.updateDraft({ logos });
        subscriber.next(url);
        subscriber.complete();
      };
      reader.onerror = () => subscriber.error(new Error('READ_FAILED'));
      reader.readAsDataURL(file);
    });
  }

  private isSvg(file: File): boolean {
    return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  }

  /**
   * Los logos ya se renderizan con `<img [src]="dataUrl">`, un contexto en el
   * que el navegador desactiva scripts y manejadores de eventos embebidos en
   * el SVG por sí solo (no es HTML activo, es "modo imagen"). Aun así se
   * rechaza contenido peligroso al momento de subirlo, como segunda capa de
   * defensa (por si en el futuro se renderiza distinto, p. ej. con
   * `[innerHTML]`, o se envía a un backend que sí lo interprete como XML activo).
   *
   * Se analiza el SVG como XML (no con una regex sobre el texto): una regex
   * del tipo `on[a-z]+=` daba falsos positivos con atributos legítimos como
   * `patternContentUnits="…"` (exportados por Figma) y rechazaba logos limpios.
   */
  private isSvgContentSafe(dataUrl: string): boolean {
    try {
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const svgText = new TextDecoder().decode(bytes);
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');

      if (doc.getElementsByTagName('parsererror').length > 0 || doc.documentElement.localName !== 'svg') {
        return false;
      }

      for (const element of Array.from(doc.getElementsByTagName('*'))) {
        const tag = element.localName.toLowerCase();
        if (tag === 'script' || tag === 'foreignobject') {
          return false;
        }
        for (const attr of Array.from(element.attributes)) {
          // Manejadores de eventos: el NOMBRE del atributo empieza por "on" (onload, onclick…).
          if (attr.localName.toLowerCase().startsWith('on')) {
            return false;
          }
          // Enlaces javascript: (href / xlink:href), ignorando espacios y caracteres de control.
          if (/^javascript:/i.test(attr.value.replace(/[\s\u0000-\u001f]/g, ''))) {
            return false;
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Lee la configuración guardada y descarta los ajustes de versiones anteriores; sin nada guardado usa los valores de fábrica. */
  private readFromStorage(): SystemConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return cloneSettings(DEFAULT_SETTINGS);
      }

      // Ajustes que ya no existen: se descartan si vienen de una versión anterior guardada.
      // - `fontFamily` / `borderRadius`: Work Sans y radio Suave son fijos.
      // - `largeIcons`: se eliminó "Íconos grandes".
      // - `notifications`: las notificaciones siempre están activas.
      // - `timezone` / `dateFormat`: las fechas se muestran tal como llegan de la base de datos.
      // - `readOnly*`: el modo de solo lectura se quitó (el backend no lo tiene).
      const {
        fontFamily: _font,
        borderRadius: _radius,
        largeIcons: _largeIcons,
        notifications: _notifications,
        timezone: _timezone,
        dateFormat: _dateFormat,
        readOnly: _readOnly,
        readOnlyScope: _readOnlyScope,
        readOnlyRoles: _readOnlyRoles,
        ...parsed
      } = JSON.parse(raw);
      // El logo principal por defecto pasó de logo-principal.png (con texto)
      // a logo-simbolo.png; un logo subido por el usuario (data URL) se respeta.
      if (parsed.logos?.principal === LEGACY_DEFAULT_PRINCIPAL_LOGO) {
        parsed.logos.principal = DEFAULT_SETTINGS.logos.principal;
      }
      return {
        ...cloneSettings(DEFAULT_SETTINGS),
        ...parsed,
        fontSize: SIZE_PRESETS.reduce((best, preset) => (Math.abs(preset.value - parsed.fontSize) < Math.abs(best.value - parsed.fontSize) ? preset : best), SIZE_PRESETS[1]).value,
        theme: parsed.theme === 'oscuro' ? 'oscuro' : 'claro',
        density: ['compacta', 'comoda', 'amplia'].includes(parsed.density) ? parsed.density : 'comoda',
        // Portugués ya no está disponible: una configuración guardada con 'pt' vuelve a español.
        language: parsed.language === 'en' ? 'en' : 'es',
        logos: { ...DEFAULT_SETTINGS.logos, ...(parsed.logos ?? {}) }
      };
    } catch {
      return cloneSettings(DEFAULT_SETTINGS);
    }
  }

  /** `false` solo si el almacenamiento está lleno: ahí sí se perdería lo guardado al recargar. */
  private writeToStorage(config: SystemConfig): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      return true;
    } catch (error) {
      // Storage puede no estar disponible en entornos con almacenamiento
      // restringido: en ese caso se sigue guardando solo en memoria, como antes.
      return !(error instanceof DOMException && error.name === 'QuotaExceededError');
    }
  }
}

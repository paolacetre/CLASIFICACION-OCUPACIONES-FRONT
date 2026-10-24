import { Injectable, NgZone } from '@angular/core';
import { APP_FONT_FAMILY, SOFT_BORDER_RADIUS, SystemConfig } from './settings.model';

/** Favicon de index.html: se usa cuando no hay ningún logo de favicon configurado. */
const DEFAULT_FAVICON = 'favicon.ico';

/**
 * Aplica los tokens de diseño (colores, tipografía, tamaño, radios, densidad)
 * como variables CSS sobre `document.documentElement`. Es el único lugar que
 * toca el DOM global para theming; `SettingsService` decide *cuándo* llamarlo:
 * solo con la configuración GUARDADA (al cargar, guardar, restablecer o
 * descartar). El borrador que se está editando no llega aquí: se ve en la
 * vista previa de Configuración, que pide sus variables con `variables()`.
 *
 * Las mutaciones DOM de CSS custom properties se ejecutan fuera de la zona
 * de Angular para que no dispensen ciclos de Change Detection en toda la
 * app. Los componentes que necesitan reaccionar al tema lo hacen vía
 * señales (`saved()`), no observando el DOM.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Último favicon aplicado, para no reemplazar el tag si no cambió. */
  private currentFavicon: string | null = null;

  constructor(private readonly ngZone: NgZone) {}

  /**
   * Variables CSS de una configuración (colores, fuente, radio y escala de
   * texto), sin aplicarlas: `apply()` las pone en el documento y la vista
   * previa de Configuración las pone solo en su tarjeta.
   */
  variables(config: SystemConfig): Record<string, string> {
    // Sobre fondo oscuro un color principal muy oscuro (p. ej. #001631) se
    // pierde: styles.css usa esta variante en `.shell.dark-mode`.
    const onDark = this.luminance(config.primaryColor) < 0.15 ? '#1FACE3' : config.primaryColor;
    return {
      '--primary-color': config.primaryColor,
      '--primary-color-hover': this.adjustColor(config.primaryColor, -12),
      '--primary-color-light': `${config.primaryColor}18`,
      '--primary-color-dark': this.adjustColor(config.primaryColor, -24),
      '--primary-color-soft': this.toRgba(config.primaryColor, 0.14),
      '--primary-on-dark': onDark,
      '--primary-on-dark-light': `${onDark}18`,
      '--primary-on-dark-soft': this.toRgba(onDark, 0.14),
      '--accent-color': config.accentColor,
      '--accent-color-hover': this.adjustColor(config.accentColor, -12),
      '--accent-color-soft': this.toRgba(config.accentColor, 0.2),
      // Fuente y radio son constantes del sistema (Work Sans / Suave), no ajustes.
      '--app-font-family': APP_FONT_FAMILY,
      '--border-radius': `${SOFT_BORDER_RADIUS}px`,
      // Escala de texto: 1 = párrafo 16px, títulos 26px, subtítulos 20px (styles.css).
      '--type-scale': String(config.fontSize / 16)
    };
  }

  /** Aplica la configuración guardada al documento: variables de color y tamaño, densidad, alto contraste, tema y favicon. */
  apply(config: SystemConfig): void {
    if (typeof document === 'undefined') {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      const root = document.documentElement;
      for (const [name, value] of Object.entries(this.variables(config))) {
        root.style.setProperty(name, value);
      }
      root.setAttribute('data-density', config.density);
      // Tema en <html>: el fondo de la página coincide con el tema desde antes de
      // que arranque Angular (index.html lo pone primero) y sin destellos.
      root.setAttribute('data-theme', config.theme);
      // Accesibilidad: banderas que styles.css y los componentes leen para reaccionar.
      root.setAttribute('data-high-contrast', String(config.highContrast));

      this.applyFavicon(config.logos.favicon);
    });
  }

  /**
   * Actualiza el ícono real de la pestaña del navegador al instante.
   * - Sin logo (se quitó): vuelve al favicon por defecto de index.html, en vez
   *   de dejar el anterior visible hasta recargar.
   * - Se REEMPLAZA el <link rel="icon"> por uno nuevo: Chrome no siempre
   *   redibuja el ícono si solo cambia el `href` del tag existente.
   * - Si el ícono no cambió no se toca el DOM (evita parpadeos de la pestaña).
   */
  private applyFavicon(url: string | null): void {
    const href = url || DEFAULT_FAVICON;
    if (href === this.currentFavicon) {
      return;
    }
    this.currentFavicon = href;

    document.querySelectorAll('link[rel~="icon"]').forEach((old) => old.remove());

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = this.faviconMimeType(href);
    link.href = href;
    document.head.appendChild(link);
  }

  /** Tipo de imagen del favicon, para el atributo `type` del enlace. */
  private faviconMimeType(url: string): string {
    if (url.startsWith('data:')) {
      const match = /^data:([^;,]+)/.exec(url);
      return match?.[1] ?? 'image/png';
    }
    if (url.endsWith('.svg')) {
      return 'image/svg+xml';
    }
    if (url.endsWith('.ico')) {
      return 'image/x-icon';
    }
    return 'image/png';
  }

  /** Luminancia relativa aproximada (0 = negro, 1 = blanco). */
  private luminance(color: string): number {
    const value = color.replace('#', '');
    if (value.length !== 6) {
      return 1;
    }
    const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** Aclara (`amount` positivo) u oscurece un color hexadecimal; se usa para los tonos de hover. */
  private adjustColor(color: string, amount: number): string {
    const value = color.replace('#', '');
    if (value.length !== 6) {
      return color;
    }

    const channels = [0, 2, 4].map((index) => Math.max(0, Math.min(255, parseInt(value.slice(index, index + 2), 16) + amount)));
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  /** Color hexadecimal con transparencia, para fondos suaves del color de marca. */
  private toRgba(hex: string, alpha: number): string {
    const value = hex.replace('#', '');
    if (value.length !== 6) {
      return `rgba(25, 59, 115, ${alpha})`;
    }

    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

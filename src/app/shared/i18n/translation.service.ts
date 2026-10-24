import { Injectable, computed, inject } from '@angular/core';
import { SettingsService } from '../../settings/settings.service';
import { TRANSLATIONS } from './translations';

/**
 * Traduce los textos de la interfaz según `SettingsService.saved().language`
 * (el idioma guardado). Como el resto de la interfaz, usa lo guardado y no el
 * borrador: elegir otro idioma en Configuración solo cambia la vista previa
 * hasta pulsar "Guardar cambios". Si una clave no existe en el idioma elegido
 * se usa la española, y si tampoco existe se muestra la clave.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly settings = inject(SettingsService);

  readonly language = computed(() => this.settings.saved().language);

  /** Texto de `key` en el idioma guardado, con los `{{nombre}}` reemplazados por `params`. */
  translate(key: string, params?: Record<string, string | number>): string {
    const dictionary = TRANSLATIONS[this.language()] ?? TRANSLATIONS.es;
    let text = dictionary[key] ?? TRANSLATIONS.es[key] ?? key;

    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
      }
    }

    return text;
  }
}

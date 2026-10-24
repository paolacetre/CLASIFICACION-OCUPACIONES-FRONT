import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from './translation.service';

/**
 * `{{ 'nav.usuarios' | translate }}`. Impuro a propósito: la clave no
 * cambia, pero el idioma sí (vía signal), así que necesita re-evaluarse en
 * cada ciclo de detección de cambios para reflejar el idioma actual.
 */
@Pipe({
  name: 'translate',
  standalone: true,
  pure: false
})
export class TranslatePipe implements PipeTransform {
  private readonly translation = inject(TranslationService);

  transform(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }
}

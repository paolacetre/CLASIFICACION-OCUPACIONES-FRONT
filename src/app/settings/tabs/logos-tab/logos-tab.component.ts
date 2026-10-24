import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { SettingsService } from '../../settings.service';
import { SystemLogos } from '../../settings.model';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';
import { TranslationService } from '../../../shared/i18n/translation.service';

/** Mapea los códigos de error estables de SettingsService.uploadLogo() a claves de traducción. */
const LOGO_UPLOAD_ERROR_KEYS: Record<string, string> = {
  NOT_IMAGE: 'logos.errorNotImage',
  TOO_LARGE: 'logos.errorTooLarge',
  UNSAFE_SVG: 'logos.errorUnsafeSvg',
  READ_FAILED: 'logos.errorReadFailed'
};

/** Pestaña "Logos" de Configuración: logo del menú, logo del inicio de sesión y favicon (en el borrador, hasta guardar). */
@Component({
  selector: 'app-logos-tab',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './logos-tab.component.html',
  styleUrl: './logos-tab.component.scss'
})
export class LogosTabComponent {
  private readonly settings = inject(SettingsService);
  private readonly translationService = inject(TranslationService);

  readonly draft = this.settings.draft;
  readonly errorMessage = signal('');

  /**
   * Nombre del archivo subido en esta sesión, junto con la URL que generó: un
   * logo subido se guarda como data URL (sin nombre), así que el nombre solo se
   * conoce mientras esa URL siga siendo la del borrador.
   */
  private readonly uploadedFiles = signal<Partial<Record<keyof SystemLogos, { name: string; url: string }>>>({});

  /** Nombre a mostrar del logo actual: el del archivo subido, el del asset por defecto o "Logo personalizado". */
  fileName(slot: keyof SystemLogos): string {
    const url = this.draft().logos[slot];
    const uploaded = this.uploadedFiles()[slot];
    if (uploaded && uploaded.url === url) {
      return uploaded.name;
    }
    if (url && !url.startsWith('data:')) {
      return url.split('/').pop() ?? url;
    }
    return this.translationService.translate('logos.customName');
  }

  /** Formato del logo actual (SVG, PNG, JPG…), a partir del tipo del data URL o de la extensión. */
  fileFormat(slot: keyof SystemLogos): string {
    const url = this.draft().logos[slot] ?? '';
    const mime = /^data:image\/([a-z0-9.+-]+)/i.exec(url)?.[1];
    const raw = mime ?? url.split('?')[0].split('.').pop() ?? '';
    const format = raw.replace('+xml', '').replace('jpeg', 'jpg').toUpperCase();
    return format || '—';
  }

  /** Pasa el logo elegido a `SettingsService.uploadLogo()`, que valida tipo y tamaño; si no sirve, muestra por qué. */
  onLogoSelected(event: Event, slot: keyof SystemLogos): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.settings.uploadLogo(file, slot).subscribe({
      next: (url) => {
        this.errorMessage.set('');
        this.uploadedFiles.update((files) => ({ ...files, [slot]: { name: file.name, url } }));
      },
      error: (error: Error) => {
        const key = LOGO_UPLOAD_ERROR_KEYS[error.message] ?? 'logos.errorReadFailed';
        this.errorMessage.set(this.translationService.translate(key));
      }
    });
    input.value = '';
  }
}

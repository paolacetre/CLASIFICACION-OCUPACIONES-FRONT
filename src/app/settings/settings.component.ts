import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { SettingsService } from './settings.service';
import { ThemeService } from './theme.service';
import { ToastService } from '../shared/toast/toast.service';
import { TranslatePipe } from '../shared/i18n/translate.pipe';
import { TranslationService } from '../shared/i18n/translation.service';
import { LANGUAGE_OPTIONS, densityLabelKey, sizeLabelKey, themeLabelKey } from './settings.model';
import { AppearanceTabComponent } from './tabs/appearance-tab/appearance-tab.component';
import { LogosTabComponent } from './tabs/logos-tab/logos-tab.component';
import { LanguageTabComponent } from './tabs/language-tab/language-tab.component';
import { AboutTabComponent } from './tabs/about-tab/about-tab.component';
import { DialogDirective } from '../shared/dialog/dialog.directive';

/** Pestañas del modal de Configuración. */
export type SettingsTabId = 'apariencia' | 'logos' | 'idioma' | 'acerca';

interface SettingsTabDef {
  id: SettingsTabId;
  labelKey: string;
  /** Trazos SVG (viewBox 24x24) del ícono de línea, como los Material Symbols de la referencia. */
  icon: string;
}

/**
 * Contenedor de la vista de Configuración: encabezado, tabs y footer con el
 * indicador de cambios sin guardar. El estado real vive en `SettingsService`
 * (borrador/guardado compartidos por toda la app); este componente solo
 * coordina la navegación entre pestañas y las acciones de Guardar/Restablecer,
 * que piden confirmación con el mismo patrón de diálogo que "Eliminar" y
 * "Cambio de estado" en Usuarios, porque son ajustes globales para todos los
 * usuarios de la plataforma.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe,
    AppearanceTabComponent,
    LogosTabComponent,
    LanguageTabComponent,
    AboutTabComponent,
    DialogDirective
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly themeService = inject(ThemeService);
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);

  readonly isDirty = this.settingsService.isDirty;
  readonly activeTab = signal<SettingsTabId>('apariencia');

  readonly pendingSave = signal(false);
  readonly pendingReset = signal(false);
  isSavePending = false;

  /**
   * Panel "Preview en vivo": vive aquí (no en app-appearance-tab) para que
   * quede fijo y visible sin importar la pestaña activa, en vez de
   * desmontarse cada vez que se sale de Apariencia.
   */
  readonly draft = this.settingsService.draft;
  /** Colores y tamaño de texto del borrador, aplicados solo a la tarjeta de vista previa. */
  readonly previewVariables = computed(() => {
    const variables = this.themeService.variables(this.draft());
    // En oscuro el color principal usa su variante legible, igual que hace `.shell.dark-mode` en styles.css.
    return this.draft().theme === 'oscuro'
      ? {
          ...variables,
          '--primary-color': variables['--primary-on-dark'],
          '--primary-color-light': variables['--primary-on-dark-light'],
          '--primary-color-soft': variables['--primary-on-dark-soft']
        }
      : variables;
  });
  readonly themeLabelKey = themeLabelKey;
  readonly densityLabelKey = densityLabelKey;
  readonly sizeLabelKey = sizeLabelKey;
  readonly previewBars = [40, 25, 55, 50, 75, 45, 60];
  readonly previewTableRows = [70, 55, 85];
  readonly languageCode = computed(() => LANGUAGE_OPTIONS.find((lang) => lang.id === this.draft().language)?.code ?? '');

  readonly tabs: SettingsTabDef[] = [
    // Paleta, imagen, globo e información.
    { id: 'apariencia', labelKey: 'settings.tab.apariencia', icon: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-1.8a1.7 1.7 0 0 0-1.3 2.8 1.7 1.7 0 0 1-1.3 2.9ZM7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01M16.5 11.5h.01' },
    { id: 'logos', labelKey: 'settings.tab.logos', icon: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM21 15l-5-5L5 21M8.5 8.5h.01' },
    { id: 'idioma', labelKey: 'settings.tab.idioma', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z' },
    { id: 'acerca', labelKey: 'settings.tab.acerca', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 16v-4M12 8h.01' }
  ];

  selectTab(tab: SettingsTabId): void {
    this.activeTab.set(tab);
  }

  /** Patrón de pestañas: flechas izquierda/derecha, Inicio y Fin cambian de pestaña y mueven el foco. */
  onTabsKeydown(event: KeyboardEvent): void {
    const current = this.tabs.findIndex((tab) => tab.id === this.activeTab());
    const last = this.tabs.length - 1;
    const next =
      event.key === 'ArrowRight' ? (current === last ? 0 : current + 1) :
      event.key === 'ArrowLeft' ? (current === 0 ? last : current - 1) :
      event.key === 'Home' ? 0 :
      event.key === 'End' ? last :
      -1;
    if (next < 0) {
      return;
    }

    event.preventDefault();
    const tab = this.tabs[next];
    this.selectTab(tab.id);
    setTimeout(() => document.getElementById(`settings-tab-${tab.id}`)?.focus());
  }

  /** "Guardar cambios" pide confirmación, solo si hay cambios. */
  requestSave(): void {
    if (!this.isDirty()) {
      return;
    }
    this.pendingSave.set(true);
  }

  cancelSave(): void {
    this.pendingSave.set(false);
  }

  /** Guarda el borrador y cierra la confirmación; si no se pudo guardar (sin espacio en el navegador), lo avisa. */
  confirmSave(): void {
    this.isSavePending = true;
    this.settingsService.save().subscribe({
      next: () => {
        this.isSavePending = false;
        this.pendingSave.set(false);
        this.toastService.success(this.translationService.translate('settings.toastSaved'));
      },
      error: (error: unknown) => {
        this.isSavePending = false;
        this.pendingSave.set(false);
        this.toastService.error(this.saveErrorMessage(error));
      }
    });
  }

  private saveErrorMessage(error: unknown): string {
    return this.translationService.translate('settings.toastSaveError');
  }

  /** Pide confirmación para volver a los valores de fábrica. */
  requestReset(): void {
    // A diferencia de "Guardar cambios", Restablecer siempre está habilitado:
    // al confirmar, restaura los valores de fábrica y los guarda de inmediato,
    // sin importar si ya había cambios pendientes (se descartan).
    this.pendingReset.set(true);
  }

  cancelReset(): void {
    this.pendingReset.set(false);
  }

  /** Restablece y guarda de inmediato los valores de fábrica. */
  confirmReset(): void {
    this.settingsService.reset().subscribe({
      next: () => {
        this.pendingReset.set(false);
        this.toastService.success(this.translationService.translate('settings.toastReset'));
      },
      error: (error: unknown) => {
        this.pendingReset.set(false);
        this.toastService.error(this.saveErrorMessage(error));
      }
    });
  }
}

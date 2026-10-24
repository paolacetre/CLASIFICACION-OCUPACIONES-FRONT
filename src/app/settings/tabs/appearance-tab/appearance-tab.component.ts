import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SettingsService } from '../../settings.service';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';
import { TranslationService } from '../../../shared/i18n/translation.service';
import { StatesDetailComponent } from './states-detail/states-detail.component';
import {
  ACCENT_COLOR_PRESETS,
  DENSITY_OPTIONS,
  GLOBAL_COLOR_CATALOG,
  PRIMARY_COLOR_PRESETS,
  SIZE_PRESETS,
  THEME_OPTIONS,
  DensityOption,
  GlobalColorEntry,
  densityLabelKey,
  sizeLabelKey,
  themeLabelKey
} from '../../settings.model';
import { normalizeText } from '../../../shared/ui/list';

const HEX_COLOR_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Ventana de debounce del buscador de color: filtra solo tras una pausa al escribir, no en cada tecla. */
const COLOR_SEARCH_DEBOUNCE_MS = 250;
/** Tope de filas que se insertan en el desplegable, para no inflar el DOM con cada tecla. */
const MAX_COLOR_RESULTS = 12;

/**
 * Pestaña "Apariencia" de Configuración: tema claro/oscuro, alto contraste,
 * tamaño de texto, densidad y colores de marca (con buscador de colores), más el
 * detalle de "Estados y mensajes". Todo cambia el borrador; se ve en la vista
 * previa y se aplica al pulsar "Guardar cambios".
 */
@Component({
  selector: 'app-appearance-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, StatesDetailComponent],
  templateUrl: './appearance-tab.component.html',
  styleUrl: './appearance-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppearanceTabComponent {
  private readonly settings = inject(SettingsService);
  private readonly fb = inject(FormBuilder);
  private readonly translation = inject(TranslationService);

  readonly draft = this.settings.draft;

  readonly themeOptions = THEME_OPTIONS;
  readonly densityOptions = DENSITY_OPTIONS;
  readonly primaryPresets = PRIMARY_COLOR_PRESETS;
  readonly accentPresets = ACCENT_COLOR_PRESETS;
  readonly sizePresets = SIZE_PRESETS;

  /** Controla el detalle desplegable de "Estados y mensajes" (informativo, sin cambios que guardar). */
  showStatesDetail = signal(false);

  toggleStatesDetail(): void {
    this.showStatesDetail.update((open) => !open);
  }

  /** Cierra el detalle y devuelve el foco al botón que lo abre (la "X" desaparece con el panel). */
  closeStatesDetail(toggle?: HTMLElement): void {
    this.showStatesDetail.set(false);
    toggle?.focus();
  }

  /**
   * Único buscador para ambas paletas (Color principal y Color de acción).
   * Es el único punto de entrada para colores personalizados: ya no hay
   * gotero/selector nativo. La paleta de círculos (primaryPresets/
   * accentPresets) se muestra siempre completa y sin filtrar — el buscador
   * solo despliega coincidencias del catálogo global en su propio panel, sin
   * tocar esa lista fija.
   *
   * Estado dividido en dos capas para que escribir nunca se sienta lento:
   * - `colorQuery` (campo plano) sigue el input tecla por tecla, sin demora
   *   visual — es puramente estado LOCAL de la búsqueda.
   * - `colorQuery$` → `debouncedQuery` (signal) es quien alimenta el filtrado
   *   real, con `debounceTime`: el catálogo (~70
   *   colores) solo se recorre una vez que el usuario hace una pausa al
   *   escribir, no en cada pulsación.
   * `globalColorMatches` es un `computed()`, no un método: Angular solo lo
   * vuelve a calcular cuando `debouncedQuery` realmente cambia de valor, no
   * en cada ciclo de detección de cambios (a diferencia de un método de
   * plantilla, que se re-ejecuta en cada CD aunque nada relevante cambie).
   * Aplicar un color (setPrimaryColor/setAccentColor, que sí toca el estado
   * global vía el formulario) es una escritura de signal totalmente
   * independiente de este pipeline de búsqueda, así que nunca lo bloquea.
   */
  colorQuery = '';
  colorDropdownOpen = false;
  private readonly colorQuery$ = new Subject<string>();
  private readonly debouncedQuery = signal('');

  /** Etiquetas de tema/densidad/tamaño: definidas una sola vez en settings.model.ts. */
  readonly themeLabelKey = themeLabelKey;
  readonly densityLabelKey = densityLabelKey;
  readonly sizeLabelKey = sizeLabelKey;

  /**
   * Un único FormGroup reactivo por esta pestaña (theme/density/colores/
   * tamaño de texto). Cada cambio se propaga al SettingsService, que
   * lo aplica en vivo a toda la interfaz vía ThemeService. Un `effect()`
   * mantiene el formulario sincronizado si el borrador cambia por fuera
   * (por ejemplo, al pulsar "Restablecer" en el footer).
   */
  readonly form = this.fb.nonNullable.group({
    theme: this.settings.draft().theme,
    density: this.settings.draft().density,
    primaryColor: this.settings.draft().primaryColor,
    accentColor: this.settings.draft().accentColor,
    fontSize: this.settings.draft().fontSize,
    highContrast: this.settings.draft().highContrast
  });

  constructor() {
    effect(() => {
      this.form.patchValue(this.settings.draft(), { emitEvent: false });
    });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => this.settings.updateDraft(value));

    // Sin distinctUntilChanged: applyGlobalColor() limpia `debouncedQuery`
    // por fuera de este pipeline, así que su "último valor emitido" puede
    // quedar desfasado (p. ej. sigue en "coral") y bloquear una segunda
    // búsqueda del mismo término. El signal ya ignora valores repetidos.
    this.colorQuery$
      .pipe(debounceTime(COLOR_SEARCH_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe((value) => this.debouncedQuery.set(value));
  }

  toggleHighContrast(): void {
    this.form.controls.highContrast.setValue(!this.form.controls.highContrast.value);
  }

  setDensity(density: DensityOption): void {
    this.form.controls.density.setValue(density);
  }

  setPrimaryColor(color: string): void {
    this.form.controls.primaryColor.setValue(color);
  }

  setAccentColor(color: string): void {
    this.form.controls.accentColor.setValue(color);
  }

  setFontSize(size: number): void {
    this.form.controls.fontSize.setValue(size);
  }

  /** Nombre a mostrar de una entrada del catálogo global según el idioma activo (es/en). */
  globalColorDisplayName(entry: GlobalColorEntry): string {
    const lang = this.translation.language();
    if (lang === 'en') return entry.nameEn;
    return entry.nameEs;
  }

  /**
   * Cada tecla actualiza el input al instante; solo el filtrado real se debounce.
   * Reabre el desplegable al escribir: tras aplicar un color, el input nunca
   * pierde el foco (el dropdown y sus botones usan mousedown/preventDefault
   * para no quitárselo), así que el evento nativo `focus` no vuelve a
   * dispararse por sí solo. Sin esto, `colorDropdownOpen` se queda en false
   * después de aplicar el primer color y una segunda búsqueda no se ve,
   * aunque los resultados ya estén calculados.
   */
  onColorQueryChange(value: string): void {
    this.colorQuery = value;
    this.colorQuery$.next(value);
    if (value.trim()) {
      this.colorDropdownOpen = true;
    }
  }

  /**
   * Si lo escrito en el buscador es un código hex válido (con o sin '#',
   * 3 o 6 dígitos) que no está ya en el catálogo, arma una entrada "Color
   * personalizado" al vuelo — así el buscador cubre también un código que no
   * tiene nombre propio, sin necesitar el selector nativo del sistema.
   */
  private customHexEntry(query: string): GlobalColorEntry | null {
    const term = query.trim();
    if (!HEX_COLOR_PATTERN.test(term)) return null;

    const hex = term.startsWith('#') ? term : `#${term}`;
    const normalized = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;

    const known = GLOBAL_COLOR_CATALOG.find((entry) => entry.color.toLowerCase() === normalized.toLowerCase());
    if (known) return null;

    return {
      id: 'custom-hex',
      nameEs: 'Color personalizado',
      nameEn: 'Custom color',
      color: normalized.toUpperCase()
    };
  }

  /**
   * Catálogo global de colores (no solo los swatches de marca), ya en
   * memoria (ver GLOBAL_COLOR_CATALOG): busca por nombre en español o inglés
   * y por código hex, sin tildes de ningún lado (normalize) —
   * "carmesi"/"marron" encuentran "Carmesí"/"Marrón". Si lo escrito es un
   * hex válido sin nombre en el catálogo, se agrega como primer resultado
   * ("Color personalizado"). Se limita a MAX_COLOR_RESULTS filas para no
   * insertar de golpe cientos de nodos en el DOM.
   *
   * `computed()` en vez de método de plantilla: solo se recalcula cuando
   * `debouncedQuery` cambia de valor (no en cada detección de cambios).
   */
  readonly globalColorMatches = computed<GlobalColorEntry[]>(() => {
    const rawQuery = this.debouncedQuery();
    const term = normalizeText(rawQuery);
    if (!term) return [];

    const nameMatches = GLOBAL_COLOR_CATALOG.filter(
      (entry) =>
        normalizeText(entry.nameEs).includes(term) ||
        normalizeText(entry.nameEn).includes(term) ||
        entry.color.toLowerCase().includes(term)
    );

    const customHex = this.customHexEntry(rawQuery);
    const matches = customHex ? [customHex, ...nameMatches] : nameMatches;
    return matches.slice(0, MAX_COLOR_RESULTS);
  });

  trackByColorEntry(_index: number, entry: GlobalColorEntry): string {
    return entry.id;
  }

  /** También se llama en (click): tras aplicar un color el input conserva el foco y `focus` no vuelve a dispararse. */
  onColorSearchFocus(): void {
    this.colorDropdownOpen = true;
  }

  /**
   * Aplica un color (del catálogo global o un hex escrito directamente) al
   * destino elegido. Solo actualiza el valor activo de esa sección — la
   * paleta de círculos predeterminados no cambia nunca desde acá. Limpia el
   * buscador de inmediato (sin esperar el debounce) para que el desplegable
   * no quede "congelado" mostrando el resultado ya aplicado.
   */
  applyGlobalColor(entry: GlobalColorEntry, target: 'primary' | 'accent'): void {
    if (target === 'primary') {
      this.setPrimaryColor(entry.color);
    } else {
      this.setAccentColor(entry.color);
    }

    this.colorQuery = '';
    this.colorQuery$.next('');
    this.debouncedQuery.set('');
    this.colorDropdownOpen = false;
  }
}

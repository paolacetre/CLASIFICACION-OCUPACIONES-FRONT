/** Tema de la interfaz. */
export type ThemeOption = 'claro' | 'oscuro';
/** Densidad: cuánto espacio dejan entre sí los elementos. */
export type DensityOption = 'compacta' | 'comoda' | 'amplia';
/** Idiomas de la interfaz. */
export type LanguageCode = 'es' | 'en';

/** Logos del sistema (ruta o data URL; `null` = el de fábrica): menú lateral, inicio de sesión y favicon. */
export interface SystemLogos {
  principal: string | null;
  login: string | null;
  favicon: string | null;
}

/**
 * Ajustes globales de la plataforma: una sola copia, compartida por todos los
 * usuarios. Los administra `SettingsService` (borrador vs. guardado) y los
 * aplica en vivo `ThemeService`.
 */
export interface SystemConfig {
  theme: ThemeOption;
  primaryColor: string;
  accentColor: string;
  /** Escala de texto: 14 / 16 / 18 / 20 px de párrafo (16 = tamaño de Figma, 100%). */
  fontSize: number;
  density: DensityOption;
  highContrast: boolean;
  language: LanguageCode;
  logos: SystemLogos;
}

/** Color de marca que se ofrece como muestra en Apariencia. */
export interface ColorPreset {
  id: string;
  name: string;
  color: string;
}

/** Color del buscador de colores de Apariencia, con su nombre en español e inglés. */
export interface GlobalColorEntry {
  id: string;
  nameEs: string;
  nameEn: string;
  color: string;
}

/** Tamaño de texto predefinido (valor base en px y su descripción). */
export interface SizePreset {
  label: string;
  value: number;
  desc: string;
}

/** Valores de fábrica: los que aplica "Restablecer" y los que se usan si no hay nada guardado. */
export const DEFAULT_SETTINGS: SystemConfig = {
  theme: 'claro',
  primaryColor: '#001631',
  accentColor: '#7DB728',
  fontSize: 16,
  density: 'comoda',
  highContrast: false,
  language: 'es',
  // Assets reales de marca en src/assets/logos/ (servidos gracias al input
  // adicional agregado en angular.json). Hoy están en PNG porque son los
  // archivos disponibles; si se agregan versiones .svg más adelante, basta
  // con cambiar estas 3 rutas.
  // El principal es solo el símbolo (sin "Observatorio Laboral y
  // Ocupacional"): en el menú lateral va al lado del nombre de la plataforma.
  logos: {
    principal: '/assets/logos/logo-simbolo.png',
    login: '/assets/logos/logo-login.png',
    favicon: '/assets/logos/favicon.png'
  }
};

/**
 * Sistema visual (Figma "Ecosistema visual nivel fábrica").
 * Tipografía: solo Work Sans. Radio: solo "Suave" (16px, el de los botones en
 * Figma). Ninguno es configurable: son constantes del sistema.
 */
export const APP_FONT_FAMILY = "'Work Sans', sans-serif";
/** Radio "Suave" del sistema visual (px): botones, campos y tarjetas. Es fijo, no se configura. */
export const SOFT_BORDER_RADIUS = 16;

/**
 * Brand Colors de Figma: 3 de marca + escala Neutral (neutral-50 es el mismo
 * #F1F1F1 de "Background body"). Cualquier otro color solo se elige con el
 * chip "Personalizado" (selector nativo), que se marca activo cuando el color
 * guardado no coincide con ninguno de estos.
 */
export const PRIMARY_COLOR_PRESETS: ColorPreset[] = [
  { id: 'brand-green', name: 'Verde', color: '#7DB728' },
  { id: 'brand-blue', name: 'Azul', color: '#1FACE3' },
  { id: 'brand-dark-blue', name: 'Azul oscuro', color: '#001631' },
  { id: 'neutral-50', name: 'Neutral 50', color: '#F1F1F1' },
  { id: 'neutral-100', name: 'Neutral 100', color: '#D4D4D4' },
  { id: 'neutral-400', name: 'Neutral 400', color: '#8F8F8F' },
  { id: 'neutral-700', name: 'Neutral 700', color: '#525252' },
  { id: 'neutral-900', name: 'Neutral 900', color: '#303030' }
];

/** Color de acción (botones): solo colores de marca. */
export const ACCENT_COLOR_PRESETS: ColorPreset[] = [
  { id: 'brand-green', name: 'Verde', color: '#7DB728' },
  { id: 'brand-blue', name: 'Azul', color: '#1FACE3' },
  { id: 'brand-dark-blue', name: 'Azul oscuro', color: '#001631' }
];

/**
 * Catálogo global de colores (nombre en español/inglés -> hex),
 * independiente de los swatches de marca. El buscador de "Color" lo usa para
 * que el usuario encuentre y aplique CUALQUIER color por nombre en
 * cualquiera de los 3 idiomas de la app (p. ej. "Azul marino"/"Navy"/"Azul-
 * marinho"), no solo los 8/3 swatches predefinidos — igual que ya permitía
 * el selector "Personalizado", pero encontrable por nombre en vez de tener
 * que abrir el selector nativo del sistema operativo.
 * Vive 100% en memoria (ningún fetch/red): es un array estático que se
 * recorre por filtro de texto, ~70 elementos — trivial para el hilo
 * principal incluso sin ninguna otra optimización.
 */
export const GLOBAL_COLOR_CATALOG: GlobalColorEntry[] = [
  { id: 'red', nameEs: 'Rojo', nameEn: 'Red', color: '#FF0000' },
  { id: 'crimson', nameEs: 'Carmesí', nameEn: 'Crimson', color: '#DC143C' },
  { id: 'firebrick', nameEs: 'Ladrillo', nameEn: 'Firebrick', color: '#B22222' },
  { id: 'maroon', nameEs: 'Granate', nameEn: 'Maroon', color: '#800000' },
  { id: 'burgundy', nameEs: 'Borgoña', nameEn: 'Burgundy', color: '#800020' },
  { id: 'tomato', nameEs: 'Tomate', nameEn: 'Tomato', color: '#FF6347' },
  { id: 'coral', nameEs: 'Coral', nameEn: 'Coral', color: '#FF7F50' },
  { id: 'salmon', nameEs: 'Salmón', nameEn: 'Salmon', color: '#FA8072' },
  { id: 'terracotta', nameEs: 'Terracota', nameEn: 'Terracotta', color: '#E2725B' },
  { id: 'rust', nameEs: 'Óxido', nameEn: 'Rust', color: '#B7410E' },
  { id: 'pink', nameEs: 'Rosado', nameEn: 'Pink', color: '#FFC0CB' },
  { id: 'pastel-pink', nameEs: 'Rosa pastel', nameEn: 'Pastel Pink', color: '#FFD1DC' },
  { id: 'hot-pink', nameEs: 'Rosa fuerte', nameEn: 'Hot Pink', color: '#FF69B4' },
  { id: 'magenta', nameEs: 'Fucsia', nameEn: 'Magenta', color: '#FF00FF' },
  { id: 'ruby', nameEs: 'Rubí', nameEn: 'Ruby', color: '#E0115F' },
  { id: 'orange', nameEs: 'Naranja', nameEn: 'Orange', color: '#FFA500' },
  { id: 'dark-orange', nameEs: 'Naranja oscuro', nameEn: 'Dark Orange', color: '#FF8C00' },
  { id: 'amber', nameEs: 'Ámbar', nameEn: 'Amber', color: '#FFBF00' },
  { id: 'gold', nameEs: 'Dorado', nameEn: 'Gold', color: '#FFD700' },
  { id: 'yellow', nameEs: 'Amarillo', nameEn: 'Yellow', color: '#FFFF00' },
  { id: 'mustard', nameEs: 'Mostaza', nameEn: 'Mustard', color: '#FFDB58' },
  { id: 'khaki', nameEs: 'Caqui', nameEn: 'Khaki', color: '#F0E68C' },
  { id: 'olive', nameEs: 'Verde oliva', nameEn: 'Olive', color: '#808000' },
  { id: 'lime', nameEs: 'Verde lima', nameEn: 'Lime', color: '#00FF00' },
  { id: 'green', nameEs: 'Verde', nameEn: 'Green', color: '#008000' },
  { id: 'dark-green', nameEs: 'Verde oscuro', nameEn: 'Dark Green', color: '#006400' },
  { id: 'forest-green', nameEs: 'Verde bosque', nameEn: 'Forest Green', color: '#228B22' },
  { id: 'emerald', nameEs: 'Esmeralda', nameEn: 'Emerald', color: '#50C878' },
  { id: 'jade', nameEs: 'Jade', nameEn: 'Jade', color: '#00A86B' },
  { id: 'mint', nameEs: 'Menta', nameEn: 'Mint', color: '#3EB489' },
  { id: 'sage', nameEs: 'Salvia', nameEn: 'Sage', color: '#9CAF88' },
  { id: 'teal', nameEs: 'Verde azulado', nameEn: 'Teal', color: '#008080' },
  { id: 'cyan', nameEs: 'Cian', nameEn: 'Cyan', color: '#00FFFF' },
  { id: 'turquoise', nameEs: 'Turquesa', nameEn: 'Turquoise', color: '#40E0D0' },
  { id: 'aquamarine', nameEs: 'Aguamarina', nameEn: 'Aquamarine', color: '#7FFFD4' },
  { id: 'sky-blue', nameEs: 'Azul cielo', nameEn: 'Sky Blue', color: '#87CEEB' },
  { id: 'steel-blue', nameEs: 'Azul acero', nameEn: 'Steel Blue', color: '#4682B4' },
  { id: 'royal-blue', nameEs: 'Azul rey', nameEn: 'Royal Blue', color: '#4169E1' },
  { id: 'blue', nameEs: 'Azul', nameEn: 'Blue', color: '#0000FF' },
  { id: 'navy', nameEs: 'Azul marino', nameEn: 'Navy', color: '#000080' },
  { id: 'sapphire', nameEs: 'Zafiro', nameEn: 'Sapphire', color: '#0F52BA' },
  { id: 'indigo', nameEs: 'Índigo', nameEn: 'Indigo', color: '#4B0082' },
  { id: 'blue-violet', nameEs: 'Violeta azulado', nameEn: 'Blue Violet', color: '#8A2BE2' },
  { id: 'violet', nameEs: 'Violeta', nameEn: 'Violet', color: '#EE82EE' },
  { id: 'purple', nameEs: 'Morado', nameEn: 'Purple', color: '#800080' },
  { id: 'lavender', nameEs: 'Lavanda', nameEn: 'Lavender', color: '#E6E6FA' },
  { id: 'lilac', nameEs: 'Lila', nameEn: 'Lilac', color: '#C8A2C8' },
  { id: 'orchid', nameEs: 'Orquídea', nameEn: 'Orchid', color: '#DA70D6' },
  { id: 'plum', nameEs: 'Ciruela', nameEn: 'Plum', color: '#DDA0DD' },
  { id: 'mauve', nameEs: 'Malva', nameEn: 'Mauve', color: '#E0B0FF' },
  { id: 'brown', nameEs: 'Marrón', nameEn: 'Brown', color: '#A52A2A' },
  { id: 'chocolate', nameEs: 'Chocolate', nameEn: 'Chocolate', color: '#D2691E' },
  { id: 'coffee', nameEs: 'Café', nameEn: 'Coffee', color: '#6F4E37' },
  { id: 'cinnamon', nameEs: 'Canela', nameEn: 'Cinnamon', color: '#C97848' },
  { id: 'bronze', nameEs: 'Bronce', nameEn: 'Bronze', color: '#CD7F32' },
  { id: 'copper', nameEs: 'Cobre', nameEn: 'Copper', color: '#B87333' },
  { id: 'beige', nameEs: 'Beige', nameEn: 'Beige', color: '#F5F5DC' },
  { id: 'sand', nameEs: 'Arena', nameEn: 'Sand', color: '#C2B280' },
  { id: 'peach', nameEs: 'Durazno', nameEn: 'Peach', color: '#FFE5B4' },
  { id: 'cream', nameEs: 'Crema', nameEn: 'Cream', color: '#FFFDD0' },
  { id: 'ivory', nameEs: 'Marfil', nameEn: 'Ivory', color: '#FFFFF0' },
  { id: 'pearl', nameEs: 'Perla', nameEn: 'Pearl', color: '#EAE0C8' },
  { id: 'topaz', nameEs: 'Topacio', nameEn: 'Topaz', color: '#FFC87C' },
  { id: 'white', nameEs: 'Blanco', nameEn: 'White', color: '#FFFFFF' },
  { id: 'white-smoke', nameEs: 'Blanco humo', nameEn: 'White Smoke', color: '#F5F5F5' },
  { id: 'light-gray', nameEs: 'Gris claro', nameEn: 'Light Gray', color: '#D3D3D3' },
  { id: 'silver', nameEs: 'Plata', nameEn: 'Silver', color: '#C0C0C0' },
  { id: 'gray', nameEs: 'Gris', nameEn: 'Gray', color: '#808080' },
  { id: 'dark-gray', nameEs: 'Gris oscuro', nameEn: 'Dark Gray', color: '#A9A9A9' },
  { id: 'charcoal', nameEs: 'Carbón', nameEn: 'Charcoal', color: '#36454F' },
  { id: 'onyx', nameEs: 'Ónix', nameEn: 'Onyx', color: '#353839' },
  { id: 'black', nameEs: 'Negro', nameEn: 'Black', color: '#000000' }
];

/** Escala de texto seleccionable: el párrafo base es 16px (100%). */
export const SIZE_PRESETS: SizePreset[] = [
  { label: 'Pequeño', value: 14, desc: '88%' },
  { label: 'Normal', value: 16, desc: '100% - Recomendado' },
  { label: 'Grande', value: 18, desc: '113%' },
  { label: 'Muy Grande', value: 20, desc: '125%' }
];

/** Opciones del selector de tema. */
export const THEME_OPTIONS: { id: ThemeOption; label: string }[] = [
  { id: 'claro', label: 'Claro' },
  { id: 'oscuro', label: 'Oscuro' }
];

/** Opciones del selector de densidad. */
export const DENSITY_OPTIONS: { id: DensityOption; label: string }[] = [
  { id: 'compacta', label: 'Compacta' },
  { id: 'comoda', label: 'Cómoda' },
  { id: 'amplia', label: 'Espaciosa' }
];

/** `code`: código de idioma ISO 639-1 (estándar internacional de 2 letras), en mayúsculas. */
export const LANGUAGE_OPTIONS: { id: LanguageCode; code: string; name: string; native: string }[] = [
  { id: 'es', code: 'ES', name: 'Español', native: 'Español' },
  { id: 'en', code: 'EN', name: 'English', native: 'English' }
];

/** Copia la configuración (también los logos) para que borrador y guardado no compartan objetos. */
export function cloneSettings(config: SystemConfig): SystemConfig {
  return { ...config, logos: { ...config.logos } };
}

/**
 * Traducen un valor guardado (tema/tamaño/densidad) a su clave de i18n. Son
 * funciones puras (no dependen de un componente) porque tanto la pestaña
 * Apariencia como el resumen fijo de Configuración (`SettingsComponent`)
 * necesitan formatear el mismo valor de la misma forma.
 */
export function themeLabelKey(id: ThemeOption): string {
  return id === 'oscuro' ? 'appearance.themeOscuro' : 'appearance.themeClaro';
}

/** Clave de traducción del nombre de una densidad. */
export function densityLabelKey(id: DensityOption): string {
  if (id === 'compacta') return 'appearance.densityCompacta';
  if (id === 'amplia') return 'appearance.densityAmplia';
  return 'appearance.densityComoda';
}

/** Clave de traducción del nombre de un tamaño de texto (pequeño, normal, grande o muy grande). */
export function sizeLabelKey(value: number): string {
  if (value <= 14) return 'appearance.sizePequeno';
  if (value <= 16) return 'appearance.sizeNormal';
  if (value <= 18) return 'appearance.sizeGrande';
  return 'appearance.sizeMuyGrande';
}


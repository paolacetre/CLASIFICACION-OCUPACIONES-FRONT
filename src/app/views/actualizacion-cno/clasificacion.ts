import { Injectable, Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '../../shared/i18n/translation.service';
import { TRANSLATIONS } from '../../shared/i18n/translations';

/**
 * "Actualización" es la misma pantalla para las dos clasificaciones, como en la
 * versión desplegada: CNO (Clasificación Nacional de Ocupaciones) y CUOC
 * (Clasificación Única de Ocupaciones para Colombia). Cambian los endpoints,
 * algunos campos y los textos.
 */
export type Classification = 'cno' | 'cuoc';

/**
 * Clasificación de la vista abierta. La provee `ActualizacionCnoComponent`; el
 * asistente de ocupaciones y la carga de Excel, que se pintan dentro de ella,
 * la heredan. Sin vista (en sus pruebas sueltas) es CNO.
 */
@Injectable()
export class ClassificationContext {
  value: Classification = 'cno';
}

/** Textos con versión propia de CUOC: `actualizacionCuoc.x` reemplaza a `actualizacionCno.x` si existe. */
const CUOC_NAMESPACES: Record<string, string> = {
  actualizacionCno: 'actualizacionCuoc',
  cargaCno: 'cargaCuoc',
  ocupacionWizard: 'ocupacionWizardCuoc',
  editarOcupacion: 'editarOcupacionCuoc'
};

/** La clave de traducción para la clasificación: la de CUOC si tiene una propia; si no, la común (la de CNO). */
export function classKey(classification: Classification, key: string): string {
  if (classification !== 'cuoc') return key;
  const dot = key.indexOf('.');
  const namespace = CUOC_NAMESPACES[key.slice(0, dot)];
  if (!namespace) return key;
  const candidate = namespace + key.slice(dot);
  return candidate in TRANSLATIONS.es ? candidate : key;
}

/** `translate` que respeta la clasificación de la vista (textos de CUOC cuando los hay). */
@Pipe({ name: 'ctranslate', standalone: true, pure: false })
export class ClassTranslatePipe implements PipeTransform {
  private readonly translation = inject(TranslationService);
  private readonly context = inject(ClassificationContext, { optional: true });

  transform(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(classKey(this.context?.value ?? 'cno', key), params);
  }
}

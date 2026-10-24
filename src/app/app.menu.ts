import { Type } from '@angular/core';

/**
 * Menú lateral (parte común). Las opciones propias de cada proyecto, sus
 * íconos, sus vistas y la vista inicial se definen en src/app/proyecto/menu.ts;
 * este archivo es igual en todos los proyectos.
 */

/** Identificador de una vista del área principal (p. ej. 'usuarios', 'inicio'). */
export type PageView = string;

/** Configuración no es una vista del área principal: se abre como modal. */
export type AppView = PageView | 'configuracion';

/** Una opción del menú lateral: abre una vista o, si tiene `children`, es un grupo desplegable. */
export interface MenuItem {
  /** Identificador único en todo el menú (de la vista o, si tiene `children`, del grupo). */
  id: PageView;
  /** Clave de traducción del texto del menú. */
  labelKey: string;
  /** Trazos del ícono (atributo `d` de cada <path>, en una caja de 24×24). */
  icon: string[];
  /**
   * Componente que se muestra al elegir la opción. Solo lo llevan las vistas
   * del proyecto; Usuarios y Perfil los pinta el shell porque se comunican con él.
   */
  component?: Type<unknown>;
  /**
   * Subopciones. Una opción con `children` es un grupo desplegable: no abre
   * ninguna vista, solo muestra u oculta sus subopciones (que a su vez pueden
   * ser grupos).
   */
  children?: MenuItem[];
}

/**
 * Parte administrativa: igual en todos los proyectos, siempre al final del
 * menú. Perfil no está en el menú: se abre desde la tarjeta del usuario.
 */
export const ADMIN_MENU: MenuItem[] = [
  {
    id: 'gestion-usuarios',
    labelKey: 'nav.gestionUsuarios',
    icon: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'],
    children: [
      {
        id: 'usuarios',
        labelKey: 'nav.usuarios',
        icon: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75']
      }
    ]
  }
];

/** Arma el menú: primero lo del proyecto (si tiene) y al final la parte administrativa. */
export function buildMenu(projectMenu: MenuItem[]): MenuItem[] {
  return [...projectMenu, ...ADMIN_MENU];
}

/** Menú con solo las vistas indicadas y los grupos que las contienen (para un rol con acceso parcial). */
export function filterMenu(items: MenuItem[], views: readonly PageView[]): MenuItem[] {
  return items.flatMap((item): MenuItem[] => {
    if (!item.children) {
      return views.includes(item.id) ? [item] : [];
    }
    const children = filterMenu(item.children, views);
    return children.length ? [{ ...item, children }] : [];
  });
}

/** Las opciones que abren una vista (sin los grupos), en el orden del menú. */
export function menuViews(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => (item.children ? menuViews(item.children) : [item]));
}

/** Ids de los grupos que contienen la vista indicada, del más externo al más interno. */
export function menuGroupsOf(items: MenuItem[], view: PageView): PageView[] {
  for (const item of items) {
    if (!item.children) {
      continue;
    }
    if (item.children.some((child) => !child.children && child.id === view)) {
      return [item.id];
    }
    const inner = menuGroupsOf(item.children, view);
    if (inner.length) {
      return [item.id, ...inner];
    }
  }
  return [];
}

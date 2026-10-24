/**
 * Fecha de alta para un usuario creado en memoria, en el mismo formato que los
 * datos de ejemplo (DD/MM/YYYY). Las fechas se muestran tal como llegan de la
 * base de datos (sin reformatear ni convertir zona horaria); cuando exista
 * backend, la fecha de alta la asignará el servidor y esta función sobrará.
 */
export function todayAsStored(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

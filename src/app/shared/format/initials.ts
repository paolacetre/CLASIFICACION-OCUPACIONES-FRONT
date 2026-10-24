/** Iniciales (máx. 2 letras) a partir de un nombre completo, p. ej. "Ana Ríos" → "AR". */
export function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

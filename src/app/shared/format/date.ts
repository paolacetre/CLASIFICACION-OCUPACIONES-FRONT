/**
 * Fecha del backend ('YYYY-MM-DD' o ISO) como se muestra en la app,
 * 'DD/MM/YYYY', sin convertir zona horaria (se toman los dígitos tal cual).
 * Vacío si no hay fecha; un texto que no es fecha se devuelve como llegó.
 */
export function displayDate(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
}

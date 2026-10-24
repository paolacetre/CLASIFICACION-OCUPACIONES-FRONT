import { todayAsStored } from './today';

/**
 * Fecha y hora actuales en el formato en que se guardan y muestran los
 * registros (DD/MM/YYYY hh:mm AM/PM). Cuando exista backend, la fecha la
 * asignará el servidor y esta función sobrará.
 */
export function nowAsStoredTime(date: Date = new Date()): string {
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${todayAsStored(date)} ${String(hour12).padStart(2, '0')}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

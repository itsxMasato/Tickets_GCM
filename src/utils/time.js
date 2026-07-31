/* Documentado por: Miguel Flores */
'use strict'

const MONTH_NAMES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/**
 * Devuelve la fecha/hora actual en formato ISO 8601.
 * @returns {string} timestamp actual en ISO
 */
function now() {
  return new Date().toISOString();
}

/**
 * Devuelve la fecha/hora actual en formato compatible con SQL (YYYY-MM-DD HH:mm:ss).
 * @returns {string} timestamp actual en formato SQL
 */
function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Formatea una fecha ISO/SQL a un string legible en español corto (ej. "05 jul 2026 14:30").
 * @param {string} iso - fecha en formato ISO o SQL
 * @returns {string} fecha formateada, o cadena vacía si es inválida
 */
function formatDateTime(iso) {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z')) : new Date(iso);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year} ${hh}:${mm}`;
}

/**
 * Devuelve una descripción relativa en español de cuánto tiempo pasó desde una fecha
 * ("hace un momento", "hace N min/h/d"), cayendo a formatDateTime() para fechas de más de 30 días.
 * @param {string} iso - fecha en formato ISO o SQL
 * @returns {string} descripción relativa, o cadena vacía si es inválida
 */
function relativeFromNow(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'));
  const diff = Date.now() - d.getTime();
  if (isNaN(diff)) return '';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'hace un momento';
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `hace ${day} d`;
  return formatDateTime(iso);
}

/**
 * Calcula la cantidad de horas transcurridas entre dos fechas (b - a).
 * @param {string} a - fecha inicial (ISO o SQL)
 * @param {string} b - fecha final (ISO o SQL)
 * @returns {number|null} diferencia en horas, o null si falta algún parámetro
 */
function hoursBetween(a, b) {
  if (!a || !b) return null;
  const da = new Date(a.replace(' ', 'T') + (a.includes('T') ? '' : 'Z'));
  const db2 = new Date(b.replace(' ', 'T') + (b.includes('T') ? '' : 'Z'));
  return (db2 - da) / 36e5;
}

module.exports = { now, nowSql, formatDateTime, relativeFromNow, hoursBetween };


/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';

const MONTH_NAMES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function now() {
  return new Date().toISOString();
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

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

function ticketCodeFor(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `TKT-${year}${month}-`;
}

function hoursBetween(a, b) {
  if (!a || !b) return null;
  const da = new Date(a.replace(' ', 'T') + (a.includes('T') ? '' : 'Z'));
  const db2 = new Date(b.replace(' ', 'T') + (b.includes('T') ? '' : 'Z'));
  return (db2 - da) / 36e5;
}

module.exports = { now, nowSql, formatDateTime, relativeFromNow, ticketCodeFor, hoursBetween };

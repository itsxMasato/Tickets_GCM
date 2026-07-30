/* Documentado por: Miguel Flores */
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year} · ${hh}:${mm}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeFromNow(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
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
  return formatDate(iso);
}

export function fileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export const STATUS_LABEL = {
  recibido:    'Recibido',
  asignado:    'Asignado',
  en_proceso:  'En proceso',
  solucionado: 'Solucionado',
  cerrado:     'Cerrado',
  reabierto:   'Reabierto',
};

export const PRIORITY_LABEL = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
export const ROLE_LABEL = {
  supervisor_campo: 'Supervisor de campo',
  sac:              'SAC (Servicio al cliente)',
  admin_area:       'Administrador de área',
  jefe_inmediato:   'Jefe inmediato',
};
export const AREA_LABEL = {
  operaciones:   'Operaciones',
  logistica:     'Logística',
  mantenimiento: 'Mantenimiento',
  sistemas:      'Sistemas',
  otro:          'Otro',
};

export function isImage(mime) { return /^image\//i.test(mime || ''); }


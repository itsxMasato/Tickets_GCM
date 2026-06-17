// Carga SheetJS (xlsx) y jsPDF + jspdf-autotable desde CDN
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
const AUTOTABLE_CDN = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js';

let xlsxReady = null;
async function ensureXLSX() {
  if (window.XLSX) return window.XLSX;
  if (!xlsxReady) xlsxReady = loadScript(XLSX_CDN);
  await xlsxReady;
  return window.XLSX;
}

let jsPdfReady = null;
async function ensureJsPDF() {
  if (window.jspdf?.jsPDF) return window.jspdf;
  if (!jsPdfReady) jsPdfReady = (async () => {
    await loadScript(JSPDF_CDN);
    await loadScript(AUTOTABLE_CDN);
    return window.jspdf;
  })();
  await jsPdfReady;
  return window.jspdf;
}

import { api } from '../api.js';
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL, ROLE_LABEL, formatDateTime } from './format.js';

const EXPORT_COLS = [
  { key: 'code',             label: 'Código' },
  { key: 'title',            label: 'Título' },
  { key: 'description',      label: 'Descripción' },
  { key: 'category_name',    label: 'Categoría' },
  { key: 'area',             label: 'Área' },
  { key: 'status',           label: 'Estado' },
  { key: 'priority',         label: 'Prioridad' },
  { key: 'created_by_name',  label: 'Creado por' },
  { key: 'assigned_to_name', label: 'Asignado a' },
  { key: 'created_at',       label: 'Creado' },
  { key: 'updated_at',       label: 'Actualizado' },
  { key: 'closed_at',        label: 'Cerrado' },
];

function humanize(t) {
  return {
    ...t,
    status: STATUS_LABEL[t.status] || t.status,
    priority: PRIORITY_LABEL[t.priority] || t.priority,
    area: AREA_LABEL[t.area] || t.area || '',
    created_at: formatDateTime(t.created_at),
    updated_at: formatDateTime(t.updated_at),
    closed_at: formatDateTime(t.closed_at),
  };
}

export async function fetchAllForExport(filters = {}) {
  const all = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = { ...filters, page, limit: 100 };
    Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
    const data = await api.tickets.list(params);
    all.push(...data.tickets);
    if (all.length >= data.total || data.tickets.length < 100) break;
    page++;
    if (page > 50) break; // safety
  }
  return all.map(humanize);
}

export async function exportToExcel(rows, filename = 'reporte.xlsx') {
  const XLSX = await ensureXLSX();
  const data = [EXPORT_COLS.map((c) => c.label), ...rows.map((r) => EXPORT_COLS.map((c) => r[c.key] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = EXPORT_COLS.map((c) => ({ wch: Math.max(12, c.label.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
  XLSX.writeFile(wb, filename);
}

export async function exportTicketToPDF(ticket) {
  const { jsPDF } = await ensureJsPDF();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Cabecera
  doc.setFontSize(18);
  doc.setTextColor(37, 99, 235);
  doc.text('GCM · Sistema de Tickets', 40, 50);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generado: ${formatDateTime(new Date().toISOString())}`, 40, 66);

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`${ticket.code} — ${ticket.title}`, 40, 96);

  // Tabla de info
  const info = [
    ['Estado',      STATUS_LABEL[ticket.status] || ticket.status],
    ['Prioridad',   PRIORITY_LABEL[ticket.priority] || ticket.priority],
    ['Categoría',   ticket.category_name || '—'],
    ['Área',        AREA_LABEL[ticket.area] || ticket.area || '—'],
    ['Creado por',  ticket.created_by_name || '—'],
    ['Asignado a',  ticket.assigned_to_name || '—'],
    ['Creado',      formatDateTime(ticket.created_at)],
    ['Actualizado', formatDateTime(ticket.updated_at)],
    ['Cerrado',     formatDateTime(ticket.closed_at) || '—'],
  ];
  doc.autoTable({
    startY: 116,
    head: [['Campo', 'Valor']],
    body: info,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: 40, right: 40 },
  });

  // Descripción
  let y = doc.lastAutoTable.finalY + 16;
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Descripción', 40, y);
  y += 12;
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const descLines = doc.splitTextToSize(ticket.description || '—', 515);
  doc.text(descLines, 40, y);
  y += descLines.length * 12 + 8;

  // Timeline de actividad
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Línea de tiempo', 40, y);
  y += 8;

  const events = [];
  if (ticket.created_at) events.push([formatDateTime(ticket.created_at), `${ticket.created_by_name || '—'} creó el ticket`]);
  for (const a of ticket.assignments || []) {
    const text = a.from_user_name
      ? `Reasignado de ${a.from_user_name} → ${a.to_user_name} (por ${a.assigned_by_name || '—'})`
      : `Asignado a ${a.to_user_name} (por ${a.assigned_by_name || '—'})`;
    events.push([formatDateTime(a.assigned_at), text]);
  }
  for (const c of ticket.comments || []) {
    events.push([formatDateTime(c.created_at), `${c.user_name}: ${c.comment}`]);
  }

  doc.autoTable({
    startY: y + 4,
    head: [['Fecha', 'Evento']],
    body: events,
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 400 } },
    margin: { left: 40, right: 40 },
  });

  // Pie
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('GCM · Sistema interno de tickets', 40, h - 24);

  doc.save(`${ticket.code}.pdf`);
}

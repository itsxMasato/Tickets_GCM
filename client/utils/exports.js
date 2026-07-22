/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
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
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    ['GCM · Reporte formal de tickets'],
    [''],
    ['Resumen ejecutivo'],
    ['Total de registros', rows.length],
    ['Estado más frecuente', rows.length ? (() => {
      const counts = rows.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    })() : '—'],
    ['Fecha de generación', formatDateTime(new Date().toISOString())],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 30 }];
  summarySheet['A1'].font = { bold: true, sz: 16, color: { rgb: 'FF0F172A' } };
  summarySheet['A3'].font = { bold: true, sz: 12, color: { rgb: 'FF0F172A' } };
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen');

  const data = [EXPORT_COLS.map((c) => c.label), ...rows.map((r) => EXPORT_COLS.map((c) => r[c.key] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = EXPORT_COLS.map((c) => ({ wch: Math.max(12, c.label.length + 4) }));

  ws['A1'].font = { bold: true, color: { rgb: 'FFFFFFFF' } };
  ws['A1'].fill = { fgColor: { rgb: 'FF0F172A' }, patternType: 'solid' };
  for (let i = 0; i < EXPORT_COLS.length; i += 1) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (cell) {
      cell.s = {
        fill: { fgColor: { rgb: 'FF0F172A' }, patternType: 'solid' },
        font: { bold: true, color: { rgb: 'FFFFFFFF' } },
        border: { top: { style: 'thin', color: { rgb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { rgb: 'FFE2E8F0' } } },
      };
    }
  }

  const lastRow = rows.length + 1;
  for (let r = 1; r <= lastRow; r += 1) {
    for (let c = 0; c < EXPORT_COLS.length; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = ws[address];
      if (!cell) continue;
      cell.s = {
        border: {
          top: { style: 'thin', color: { rgb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { rgb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { rgb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { rgb: 'FFE2E8F0' } },
        },
        font: { sz: 10, color: { rgb: 'FF334155' } },
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
  XLSX.writeFile(wb, filename);
}

export async function exportTicketToPDF(ticket) {
  const { jsPDF } = await ensureJsPDF();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const primary = [15, 23, 42];
  const muted = [100, 116, 139];
  const border = [226, 232, 240];
  const surface = [248, 250, 252];
  const white = [255, 255, 255];

  doc.setFillColor(...surface);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setFillColor(...primary);
  doc.rect(0, 0, pageWidth, 120, 'F');

  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Informe de ticket', margin, 48);
  doc.text(`Código: ${ticket.code || '—'}`, pageWidth - margin, 48, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('GCM · Gestión de tickets corporativa', margin, 66);
  doc.text(`Estado: ${STATUS_LABEL[ticket.status] || ticket.status || '—'}`, pageWidth - margin, 66, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(160, 173, 189);
  doc.text(`Generado: ${formatDateTime(new Date().toISOString())}`, margin, 82);
  doc.setDrawColor(...white);
  doc.setLineWidth(0.5);
  doc.line(margin, 94, pageWidth - margin, 94);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...white);
  doc.text(ticket.title || 'Sin título', margin, 110, { maxWidth: contentWidth - 160 });

  const summaryItems = [
    ['Código', ticket.code || '—'],
    ['Estado', STATUS_LABEL[ticket.status] || ticket.status || '—'],
    ['Prioridad', PRIORITY_LABEL[ticket.priority] || ticket.priority || '—'],
    ['Área', AREA_LABEL[ticket.area] || ticket.area || '—'],
    ['Creado por', ticket.created_by_name || '—'],
    ['Asignado a', ticket.assigned_to_name || '—'],
    ['Categoría', ticket.category_name || '—'],
    ['Actualizado', ticket.updated_at ? formatDateTime(ticket.updated_at) : '—'],
  ];

  let y = 132;
  doc.setFillColor(...white);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, y, contentWidth, 118, 10, 10, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...primary);
  doc.text('Resumen del ticket', margin + 14, y + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  summaryItems.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + 14 + col * ((contentWidth - 28) / 2 + 16);
    const itemY = y + 42 + row * 18;
    doc.setTextColor(...muted);
    doc.text(item[0], x, itemY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primary);
    doc.text(String(item[1]), x, itemY + 10, { maxWidth: (contentWidth - 56) / 2 });
    doc.setFont('helvetica', 'normal');
  });

  y += 142;
  doc.setFillColor(...white);
  doc.roundedRect(margin, y, contentWidth, 108, 10, 10, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...primary);
  doc.text('Descripción', margin + 14, y + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  const descLines = doc.splitTextToSize(ticket.description || 'Sin descripción registrada.', contentWidth - 28);
  doc.text(descLines, margin + 14, y + 44);

  y += 130;
  doc.setFillColor(...white);
  doc.roundedRect(margin, y, contentWidth, 136, 10, 10, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...primary);
  doc.text('Línea de tiempo', margin + 14, y + 24);

  const events = [];
  if (ticket.created_at) events.push([formatDateTime(ticket.created_at), `${ticket.created_by_name || '—'} creó el ticket`]);
  for (const a of ticket.assignments || []) {
    const text = a.from_user_name
      ? `Reasignado de ${a.from_user_name} → ${a.to_user_name} por ${a.assigned_by_name || '—'}`
      : `Asignado a ${a.to_user_name} por ${a.assigned_by_name || '—'}`;
    events.push([formatDateTime(a.assigned_at), text]);
  }
  for (const c of ticket.comments || []) {
    events.push([formatDateTime(c.created_at), `${c.user_name}: ${c.comment}`]);
  }

  doc.autoTable({
    startY: y + 36,
    head: [['Fecha', 'Detalle']],
    body: events.length ? events : [['—', 'No existen eventos adicionales para este ticket.']],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 5 },
    columnStyles: { 0: { cellWidth: 132 }, 1: { cellWidth: contentWidth - 132 - 16 } },
    margin: { left: margin + 14, right: margin + 14 },
    styles: { lineColor: [226, 232, 240], lineWidth: 0.5, overflow: 'linebreak' },
    didDrawPage: (data) => {
      const footerY = pageHeight - 42;
      doc.setDrawColor(...border);
      doc.line(margin, footerY, pageWidth - margin, footerY);
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text('GCM · Sistema interno de tickets · Uso confidencial', margin, footerY + 16);
      doc.text(`Página ${data.pageNumber}`, pageWidth - margin - 40, footerY + 16);
    },
  });

  doc.save(`${ticket.code || 'ticket'}.pdf`);
}

/* Documentado por: Miguel Flores */
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
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL, formatDateTime } from './format.js';

export const BRAND = {
  name: 'Grupo Camaronero Milcien',
  shortName: 'GCM',
  system: 'Sistema de Tickets',
  logoUrl: '/img/Logo.png',
  navy: [7, 29, 76],
  ocean: [22, 172, 228],
  ink: [36, 52, 71],
  muted: [100, 116, 139],
  border: [214, 222, 232],
  surface: [247, 249, 252],
};

let logoImagePromise = null;
function loadLogoImage() {
  if (!logoImagePromise) {
    logoImagePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = BRAND.logoUrl;
    });
  }
  return logoImagePromise;
}

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

export const TICKET_EXPORT_COLUMNS = [
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

const FETCH_ALL_MAX_ROWS = 20000;

export async function fetchAllTickets(filters = {}) {
  const all = [];
  let cursor = null;
  let truncated = false;
  while (true) {
    const params = { ...filters, limit: 200 };
    if (cursor) params.cursor = cursor;
    Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
    const data = await api.tickets.list(params);
    all.push(...data.tickets);
    if (all.length >= FETCH_ALL_MAX_ROWS) { truncated = !!data.hasMore; break; }
    if (!data.hasMore || data.tickets.length === 0) break;
    cursor = data.nextCursor;
  }
  return { rows: all, truncated };
}

export async function fetchAllForExport(filters = {}) {
  const { rows, truncated } = await fetchAllTickets(filters);
  return { rows: rows.map(humanize), truncated };
}

export async function exportToExcel(rows, filename = 'reporte.xlsx', options = {}) {
  const columns = options.columns || TICKET_EXPORT_COLUMNS;
  const title = options.title || 'Reporte';
  const subtitle = options.subtitle || '';
  const sheetName = options.sheetName || 'Datos';
  const summaryField = options.summaryField || 'status';
  const summaryLabel = options.summaryLabel || 'Estado más frecuente';
  const generatedByName = options.generatedByName || '—';
  const generatedByRole = options.generatedByRole || '';

  const XLSX = await ensureXLSX();
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    [BRAND.name],
    [`${BRAND.shortName} · ${BRAND.system}`],
    [''],
    [title],
    subtitle ? [subtitle] : [''],
    [''],
    ['Resumen ejecutivo'],
    ['Total de registros', rows.length],
    [summaryLabel, rows.length ? (() => {
      const counts = rows.reduce((acc, row) => {
        acc[row[summaryField]] = (acc[row[summaryField]] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    })() : '—'],
    ['Fecha de generación', formatDateTime(new Date().toISOString())],
    ['Generado por', generatedByName + (generatedByRole ? ` (${generatedByRole})` : '')],
    [''],
    [''],
    ['Firmas'],
    [''],
    ['Elaborado por', 'Revisado por', 'Aprobado por'],
    [generatedByName, '', ''],
    ['_______________________', '_______________________', '_______________________'],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 26 }, { wch: 26 }];
  summarySheet['A1'].font = { bold: true, sz: 18, color: { rgb: 'FF071D4C' } };
  summarySheet['A2'].font = { bold: true, sz: 10, color: { rgb: 'FF16ACE4' } };
  summarySheet['A4'].font = { bold: true, sz: 14, color: { rgb: 'FF071D4C' } };
  if (subtitle) summarySheet['A5'].font = { italic: true, sz: 10, color: { rgb: 'FF64748B' } };
  summarySheet['A7'].font = { bold: true, sz: 12, color: { rgb: 'FF071D4C' } };
  summarySheet['A14'].font = { bold: true, sz: 12, color: { rgb: 'FF071D4C' } };
  ['A16', 'B16', 'C16'].forEach((addr) => {
    if (summarySheet[addr]) summarySheet[addr].font = { bold: true, sz: 9, color: { rgb: 'FF64748B' } };
  });
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen');

  const data = [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => r[c.key] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.label.length + 4) }));

  for (let i = 0; i < columns.length; i += 1) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (cell) {
      cell.s = {
        fill: { fgColor: { rgb: 'FF071D4C' }, patternType: 'solid' },
        font: { bold: true, color: { rgb: 'FFFFFFFF' } },
        border: { top: { style: 'thin', color: { rgb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { rgb: 'FFE2E8F0' } } },
      };
    }
  }

  const lastRow = rows.length + 1;
  for (let r = 1; r <= lastRow; r += 1) {
    for (let c = 0; c < columns.length; c += 1) {
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

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

const PDF_MARGIN = 40;

async function drawPdfHeader(doc, { title, subtitle, meta = [] }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await loadLogoImage();
  const headerHeight = 112;

  doc.setFillColor(...BRAND.navy);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  const logoSize = 52;
  let textX = PDF_MARGIN;
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', PDF_MARGIN, 20, logoSize, logoSize, undefined, 'FAST');
      textX = PDF_MARGIN + logoSize + 16;
    } catch {}
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(BRAND.name, textX, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(190, 210, 240);
  doc.text(`${BRAND.shortName} · ${BRAND.system}`, textX, 50);

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.line(textX, 60, pageWidth - PDF_MARGIN, 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(title, textX, 80, { maxWidth: pageWidth - textX - PDF_MARGIN - 10 });
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(190, 210, 240);
    doc.text(subtitle, textX, 96, { maxWidth: pageWidth - textX - PDF_MARGIN - 10 });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(190, 210, 240);
  let metaY = 24;
  for (const line of meta) {
    doc.text(line, pageWidth - PDF_MARGIN, metaY, { align: 'right' });
    metaY += 12;
  }

  return headerHeight;
}

function drawPdfFooter(doc, pageNumber) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 30;
  doc.setDrawColor(...BRAND.border);
  doc.setLineWidth(0.5);
  doc.line(PDF_MARGIN, footerY, pageWidth - PDF_MARGIN, footerY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.muted);
  doc.text(`${BRAND.name} · Documento confidencial de uso interno`, PDF_MARGIN, footerY + 14);
  doc.text(`Página ${pageNumber}`, pageWidth - PDF_MARGIN, footerY + 14, { align: 'right' });
}

function drawSignatureBlock(doc, y, generatedByName, generatedByRole) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const blockHeight = 92;
  if (y + blockHeight > pageHeight - 50) {
    doc.addPage();
    drawPdfFooter(doc, doc.internal.getNumberOfPages());
    y = 50;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.navy);
  doc.text('Firmas', PDF_MARGIN, y);
  y += 18;

  const gap = 20;
  const colWidth = (pageWidth - PDF_MARGIN * 2 - gap * 2) / 3;
  const signers = [
    { role: 'Elaborado por', name: generatedByName || '', sub: generatedByRole || '' },
    { role: 'Revisado por', name: '', sub: '' },
    { role: 'Aprobado por', name: '', sub: '' },
  ];
  signers.forEach((s, i) => {
    const x = PDF_MARGIN + i * (colWidth + gap);
    doc.setDrawColor(...BRAND.border);
    doc.setLineWidth(0.8);
    doc.line(x, y + 40, x + colWidth, y + 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.ink);
    doc.text(s.name || ' ', x, y + 34, { maxWidth: colWidth });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(s.role, x, y + 52);
    if (s.sub) doc.text(s.sub, x, y + 62, { maxWidth: colWidth });
  });

  return y + blockHeight;
}

export async function exportListToPDF(rows, columns, filename = 'reporte.pdf', options = {}) {
  const { jsPDF } = await ensureJsPDF();
  const orientation = columns.length > 6 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation });

  const generatedByName = options.generatedByName || '—';
  const generatedByRole = options.generatedByRole || '';

  const headerHeight = await drawPdfHeader(doc, {
    title: options.title || 'Reporte',
    subtitle: options.subtitle || '',
    meta: [
      `Generado: ${formatDateTime(new Date().toISOString())}`,
      `Por: ${generatedByName}`,
      `Total: ${rows.length.toLocaleString('es-ES')} registro${rows.length === 1 ? '' : 's'}`,
    ],
  });

  let startY = headerHeight + 24;
  if (options.summaryField && rows.length) {
    const counts = rows.reduce((acc, row) => {
      acc[row[options.summaryField]] = (acc[row[options.summaryField]] || 0) + 1;
      return acc;
    }, {});
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    doc.text(`${options.summaryLabel || 'Más frecuente'}: `, PDF_MARGIN, startY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.ink);
    const label = `${options.summaryLabel || 'Más frecuente'}: `;
    doc.text(String(top), PDF_MARGIN + doc.getTextWidth(label), startY);
    startY += 16;
  }

  doc.autoTable({
    startY,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => String(r[c.key] ?? ''))),
    theme: 'grid',
    headStyles: { fillColor: BRAND.navy, textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, textColor: BRAND.ink, cellPadding: 4 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 50 },
    styles: { lineColor: BRAND.border, lineWidth: 0.5, overflow: 'linebreak' },
    didDrawPage: (data) => drawPdfFooter(doc, data.pageNumber),
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 30 : startY + 30;
  drawSignatureBlock(doc, finalY, generatedByName, generatedByRole);

  doc.save(filename);
}

export async function exportTicketToPDF(ticket) {
  const { jsPDF } = await ensureJsPDF();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = PDF_MARGIN;
  const contentWidth = pageWidth - margin * 2;
  const primary = BRAND.navy;
  const muted = BRAND.muted;
  const border = BRAND.border;
  const white = [255, 255, 255];

  doc.setFillColor(...BRAND.surface);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  await drawPdfHeader(doc, {
    title: ticket.title || 'Sin título',
    subtitle: `Código: ${ticket.code || '—'} · Estado: ${STATUS_LABEL[ticket.status] || ticket.status || '—'}`,
    meta: [`Generado: ${formatDateTime(new Date().toISOString())}`],
  });

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

  let y = 134;
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
    headStyles: { fillColor: primary, textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 5 },
    columnStyles: { 0: { cellWidth: 132 }, 1: { cellWidth: contentWidth - 132 - 16 } },
    margin: { left: margin + 14, right: margin + 14, bottom: 50 },
    styles: { lineColor: border, lineWidth: 0.5, overflow: 'linebreak' },
    didDrawPage: (data) => drawPdfFooter(doc, data.pageNumber),
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 30 : y + 160;
  drawSignatureBlock(doc, finalY, ticket.created_by_name, 'Solicitante');

  doc.save(`${ticket.code || 'ticket'}.pdf`);
}


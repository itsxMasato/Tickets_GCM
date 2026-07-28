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
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL, formatDateTime } from './format.js';

// ── Identidad de marca para membretes de export (PDF y Excel) ──────────────
// Mismos colores que DESIGN.md (brand-navy, brand-ocean, brand-ink,
// surface-border) y el nombre legal completo usado en el splash de login
// (client/index.html) — para que un documento exportado se lea como un
// documento oficial de la empresa, no un CSV genérico con logo pegado.
export const BRAND = {
  name: 'Grupo Camaronero Milcien',
  shortName: 'GCM',
  system: 'Sistema de Tickets',
  logoUrl: '/img/Logo.png',
  navy: [7, 29, 76],       // #071D4C
  ocean: [22, 172, 228],   // #16ACE4
  ink: [36, 52, 71],       // #243447
  muted: [100, 116, 139],  // slate-500
  border: [214, 222, 232], // #D6DEE8
  surface: [247, 249, 252],// #F7F9FC
};

// Carga el logo una sola vez por sesión de página. Si falla (offline, ruta
// rota), el export sigue sin logo en vez de romperse — nunca debe bloquear
// la generación de un documento que el usuario necesita ahora.
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

// Exportado para que los call-sites de tickets puedan reusar el mismo set
// de columnas en exportListToPDF (que no tiene un default interno como
// exportToExcel — es genérica para cualquier entidad).
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

// Recorre todas las páginas del listado de tickets que cumplen `filters`.
// Usado tanto por el export (Excel/PDF) como por los reportes agregados
// (KPIs/gráficos), que necesitan el conjunto completo filtrado — no solo la
// página que se muestra en la tabla — para no subestimar los totales.
//
// Antes esto paginaba con `page` (offset): cada vuelta del loop volvía a
// pedirle al server `limit(page*limit)` documentos desde el principio y
// descartaba casi todos — exportar 5,000 tickets terminaba leyendo del
// orden de 127,000 documentos en total (la página 50 sola releía 5,000).
// Encima cortaba en `page > 50` EN SILENCIO: con más de 5,000 tickets
// matcheando el filtro, el export/reporte quedaba incompleto sin ningún
// aviso. Ahora usa el cursor que devuelve el server (ver
// firestoreData.listTickets): cada página cuesta lo mismo sin importar
// cuántas se hayan pedido antes, y el límite de seguridad es mucho más
// alto y se informa explícitamente si se llega a truncar.
const FETCH_ALL_MAX_ROWS = 20000;

export async function fetchAllTickets(filters = {}) {
  const all = [];
  let cursor = null;
  let truncated = false;
  // eslint-disable-next-line no-constant-condition
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

// ═══════════════════════════════════════════════════════════════════════
// EXCEL
// ═══════════════════════════════════════════════════════════════════════
// `options.columns` permite exportar otras entidades (ej. usuarios) sin
// depender de TICKET_EXPORT_COLUMNS, que es específico de tickets. Por defecto se
// mantiene el comportamiento histórico (tickets) para no romper los
// call-sites existentes.
//
// El logo NO se incrusta como imagen: la build gratuita de SheetJS (CDN,
// xlsx.full.min.js) no expone una API de imágenes — eso es exclusivo de
// SheetJS Pro (de pago). El membrete de marca en Excel es tipográfico
// (nombre completo en navy, tamaño grande) en vez de logo + texto.
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

  // ── Hoja "Resumen": membrete + resumen ejecutivo + firmas ──────────────
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
  // Encabezados de la fila "Elaborado por | Revisado por | Aprobado por"
  ['A16', 'B16', 'C16'].forEach((addr) => {
    if (summarySheet[addr]) summarySheet[addr].font = { bold: true, sz: 9, color: { rgb: 'FF64748B' } };
  });
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen');

  // ── Hoja de datos ────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════
// PDF — helpers de membrete compartidos entre el export de listas
// (exportListToPDF) y el de un ticket individual (exportTicketToPDF).
// ═══════════════════════════════════════════════════════════════════════
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
    } catch {
      // Formato de imagen no soportado por jsPDF (raro, pero no debe
      // romper el export) — seguimos sin logo.
    }
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

// drawSignatureBlock — tres espacios de firma (Elaborado / Revisado /
// Aprobado), estándar en reportes formales corporativos. "Elaborado por"
// viene pre-llenado con quien generó el documento (queda registrado quién
// lo sacó del sistema); los otros dos quedan en blanco para firma física
// tras imprimir. Si no entra en la página actual, abre una nueva.
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

// exportListToPDF — versión tabular genérica (tickets, auditoría, usuarios,
// empresas...) con el mismo membrete/firma que exportTicketToPDF. Antes
// sólo existía PDF para el detalle de un ticket individual; el resto de
// las vistas sólo ofrecían Excel.
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

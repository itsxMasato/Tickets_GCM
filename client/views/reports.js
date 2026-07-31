/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { exportToExcel, exportListToPDF, fetchAllForExport, fetchAllTickets, TICKET_EXPORT_COLUMNS } from '../utils/exports.js';
import { statusBadge, priorityBadge } from '../components/badge.js';
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL, formatDate, formatDateTime } from '../utils/format.js';
import { setFilterInUrl, clearFiltersInUrl } from '../utils/url-filters.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { exportButton } from '../components/export-button.js';
import { toast } from '../utils/toast.js';
import { mountDataList } from '../components/data-list.js';
import { passwordConfirmModal } from '../components/modal.js';
import { verifyCurrentPassword } from '../firebase.js';
import { ICON, svg } from '../utils/icons.js';
import { avatarColor, initials } from '../utils/avatar.js';
import { getRoleLabel } from '../utils/role-labels.js';

const STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];
const NO_AREA = '__sin_area__';
const AREA_ORDER = [...Object.keys(AREA_LABEL), NO_AREA];
const AREA_CHART_LABEL = { ...AREA_LABEL, [NO_AREA]: 'Sin área' };
const PAGE_SIZE = 25;

const STATUS_BAR_COLOR = {
  recibido: 'bg-slate-400', asignado: 'bg-blue-500', en_proceso: 'bg-amber-500',
  solucionado: 'bg-emerald-500', cerrado: 'bg-slate-600', reabierto: 'bg-orange-500',
};
const PRIORITY_BAR_COLOR = { baja: 'bg-slate-400', media: 'bg-blue-500', alta: 'bg-amber-500', urgente: 'bg-red-600' };
const AREA_BAR_COLOR = {
  operaciones: 'bg-brand-ocean', logistica: 'bg-violet-500', mantenimiento: 'bg-amber-500',
  sistemas: 'bg-blue-500', otro: 'bg-slate-400', [NO_AREA]: 'bg-slate-300',
};

const KPI_TONE = {
  '':      { border: 'border-l-4 border-l-surface-border-strong', icon: 'bg-surface-alt text-brand', value: 'text-brand-ink' },
  ocean:   { border: 'border-l-4 border-l-brand-ocean',           icon: 'bg-brand-ocean/10 text-brand-ocean', value: 'text-brand-ocean' },
  good:    { border: 'border-l-4 border-l-emerald-500',           icon: 'bg-emerald-100 text-emerald-700',    value: 'text-emerald-700' },
  warn:    { border: 'border-l-4 border-l-orange-500',            icon: 'bg-orange-100 text-orange-700',      value: 'text-orange-700' },
  accent:  { border: 'border-2 border-accent/25 bg-accent/5',      icon: 'bg-accent/10 text-accent',           value: 'text-accent' },
};

const TABLE_COLUMNS = [
  { key: 'code',     label: 'Código' },
  { key: 'title',    label: 'Título' },
  { key: 'area',     label: 'Área' },
  { key: 'assigned', label: 'Asignado' },
  { key: 'status',   label: 'Estado' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'created',  label: 'Creado' },
];

/**
 * Convierte un valor de fecha (string con o sin "T") a un objeto Date, tolerando el formato de fecha del backend.
 * @param {string} value - valor de fecha a convertir
 * @returns {Date|null} fecha convertida, o null si no es válida
 */
function toDate(value) {
  if (!value) return null;
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Arma la vista de reportes de tickets: filtros, KPIs, tabla paginada, exportación y gráficos de análisis (estado, prioridad, área, responsables y tendencia diaria).
 * @param {Object} params - parámetros de la ruta
 * @param {Object} [params.query] - filtros iniciales tomados de la URL
 * @param {Object} params.user - usuario autenticado
 * @returns {Promise<HTMLElement>} nodo raíz de la vista
 */
export async function renderReports({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  const exportBtn = exportButton({ label: 'Exportar', kind: 'secondary', onExport: doExport });
  root.appendChild(h('div.flex.flex-col.justify-between.gap-4', { class: 'md:flex-row md:items-end' }, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-brand.tracking-tight', { class: 'md:text-3xl' }, 'Reportes de Tickets'),
      h('p.text-sm.text-slate-500.mt-1', {}, 'Análisis detallado y métricas del soporte técnico.'),
    ]),
    exportBtn,
  ]));

  const filters = { status: query?.status || '', priority: query?.priority || '', area: query?.area || '', assigned_to: query?.assigned_to || '', date_from: query?.date_from || '', date_to: query?.date_to || '', search: query?.search || '' };
  const filtersBar = h('div.card.grid.grid-cols-1.gap-4.items-end', { class: 'sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6' });
  const search = h('input.input', { type: 'search', placeholder: 'Ej: GCM-2849…' });
  const statusSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los estados'), ...STATUS.map((s) => h('option', { value: s, selected: filters.status === s ? '' : null }, STATUS_LABEL[s]))]);
  const prioSel = h('select.input', {}, [h('option', { value: '' }, 'Todas las prioridades'), ...PRIORITIES.map((p) => h('option', { value: p, selected: filters.priority === p ? '' : null }, PRIORITY_LABEL[p]))]);
  const areaSel = h('select.input', {}, [h('option', { value: '' }, 'Todas las áreas'), ...Object.entries(AREA_LABEL).map(([k, v]) => h('option', { value: k, selected: filters.area === k ? '' : null }, v))]);
  const assignedSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los responsables')]);
  const from = h('input.input', { type: 'date', value: filters.date_from });
  const to = h('input.input', { type: 'date', value: filters.date_to });
  const apply = h('button.btn.btn-primary.flex-1', { onclick: () => render() }, 'Aplicar');
  const clearBtn = h('button.btn.btn-ghost', { onclick: () => { clearFiltersInUrl(); Object.assign(filters, { status: '', priority: '', area: '', assigned_to: '', date_from: '', date_to: '', search: '' }); search.value=''; statusSel.value=''; prioSel.value=''; areaSel.value=''; assignedSel.value=''; from.value=''; to.value=''; render(); } }, 'Limpiar');

  filtersBar.appendChild(h('div.space-y-1', {}, [h('label.label', {}, 'Búsqueda'), search]));
  filtersBar.appendChild(h('div.space-y-1', {}, [h('label.label', {}, 'Estado'), statusSel]));
  filtersBar.appendChild(h('div.space-y-1', {}, [h('label.label', {}, 'Prioridad'), prioSel]));
  filtersBar.appendChild(h('div.space-y-1', {}, [h('label.label', {}, 'Área'), areaSel]));
  filtersBar.appendChild(h('div.space-y-1', {}, [h('label.label', {}, 'Responsable'), assignedSel]));
  filtersBar.appendChild(h('div.space-y-1', {}, [h('label.label', {}, 'Desde'), from]));
  filtersBar.appendChild(h('div.space-y-1', {}, [h('label.label', {}, 'Hasta'), to]));
  filtersBar.appendChild(h('div.flex.gap-2', {}, [apply, clearBtn]));
  root.appendChild(filtersBar);

  const kpis = h('div.grid.grid-cols-2.gap-3', { class: 'md:grid-cols-3 lg:grid-cols-6' });
  root.appendChild(kpis);

  const listWrap = h('div', {});
  const pagerInfo = h('div.text-xs.text-slate-500', {}, '');
  const pagerPageLabel = h('div.text-xs.text-slate-500.font-medium', {}, '');
  const prevBtn = h('button.btn-icon-sm', { 'aria-label': 'Página anterior', onclick: () => { if (currentPage > 1) { currentPage--; renderTablePage(); } } }, [svg(h, ICON.chevronL, 'w-4 h-4')]);
  const nextBtn = h('button.btn-icon-sm', { 'aria-label': 'Página siguiente', onclick: () => { currentPage++; renderTablePage(); } }, [svg(h, ICON.chevronR, 'w-4 h-4')]);
  const pager = h('div.px-4.py-3.bg-surface.flex.items-center.justify-between.gap-3.flex-wrap.rounded-b-xl', {}, [
    pagerInfo,
    h('div.flex.items-center.gap-2', {}, [prevBtn, pagerPageLabel, nextBtn]),
  ]);
  const listContainer = h('div.flex.flex-col', {}, [listWrap, pager]);
  root.appendChild(listContainer);

  const chartsRow1 = h('div.grid.grid-cols-1.gap-3', { class: 'lg:grid-cols-2' });
  const chartsRow2 = h('div.grid.grid-cols-1.gap-3', { class: 'lg:grid-cols-2' });
  const trendWrap = h('div', {});
  const charts = h('div.flex.flex-col.gap-3', {}, [chartsRow1, chartsRow2, trendWrap]);
  root.appendChild(charts);

  let dataList = null;
  let cachedAll = [];
  let currentPage = 1;

  /**
   * Inicializa el componente de listado (mountDataList) una sola vez, si todavía no fue creado.
   * @returns {void}
   */
  function ensureDataList() {
    if (dataList) return;
    dataList = mountDataList({
      wrapper: listWrap,
      columns: TABLE_COLUMNS,
      renderRow: tableRow,
      renderMobileCard,
      emptyState: emptyState({ ...EMPTY_STATES.reports, className: 'py-10' }),
    });
  }

  /**
   * Arma el HTML de una fila de la tabla de tickets para el listado de escritorio.
   * @param {Object} t - ticket a renderizar
   * @returns {string} HTML de la fila de tabla
   */
  function tableRow(t) {
    const rowCls = t.priority === 'urgente' ? 'border-l-4 border-l-accent' : '';
    const assigned = t.assigned_to_name
      ? `<div class="flex items-center gap-2">
           <span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-none" style="background-color:${avatarColor(t.assigned_to)}">${escapeHtml(initials(t.assigned_to_name))}</span>
           <span class="text-brand-ink">${escapeHtml(t.assigned_to_name)}</span>
         </div>`
      : `<span class="text-slate-400 italic text-xs">Sin asignar</span>`;
    return `
      <tr class="${rowCls}">
        <td class="font-mono text-xs text-brand font-medium">${escapeHtml(t.code)}</td>
        <td>
          <div class="font-medium text-slate-800">${escapeHtml(t.title)}</div>
          <div class="text-xs text-slate-500 line-clamp-1">${escapeHtml(t.description || '')}</div>
        </td>
        <td>${escapeHtml(AREA_LABEL[t.area] || '—')}</td>
        <td>${assigned}</td>
        <td>${statusBadge(t.status).outerHTML}</td>
        <td>${priorityBadge(t.priority).outerHTML}</td>
        <td class="text-xs text-slate-500 whitespace-nowrap">${escapeHtml(formatDateTime(t.created_at))}</td>
      </tr>
    `;
  }

  /**
   * Arma la tarjeta de un ticket para el listado en formato mobile.
   * @param {Object} t - ticket a renderizar
   * @returns {HTMLElement} tarjeta de ticket
   */
  function renderMobileCard(t) {
    return h('button.card.text-left.flex.flex-col.gap-2.p-3.transition', {
      class: 'hover:border-brand-ocean hover:shadow-card focus:outline-none focus:ring-2 focus:ring-brand-ocean/60',
      onclick: () => { window.location.hash = `#/tickets/${t.id}`; },
      'aria-label': `Abrir ticket ${escapeHtml(t.code)}: ${escapeHtml(t.title)}`,
    }, [
      h('div.flex.items-center.justify-between.gap-2', {}, [
        h('div.min-w-0', {}, [
          h('div.text-xs.font-mono.text-brand.font-medium', {}, escapeHtml(t.code || '')),
          h('div.font-medium.text-brand-ink.line-clamp-2', {}, escapeHtml(t.title || '')),
        ]),
        priorityBadge(t.priority),
      ]),
      h('div.flex.items-center.gap-2.flex-wrap.text-xs.text-slate-500', {}, [
        statusBadge(t.status),
        h('span', {}, '·'),
        h('span', {}, escapeHtml(AREA_LABEL[t.area] || '—')),
        h('span', {}, '·'),
        h('span', {}, escapeHtml(formatDateTime(t.created_at))),
      ]),
      t.assigned_to_name
        ? h('div.flex.items-center.gap-2', {}, [
            h('span.w-5.h-5.rounded-full.flex.items-center.justify-center.font-bold.text-white.flex-none', { class: 'text-[9px]', style: { backgroundColor: avatarColor(t.assigned_to) } }, initials(t.assigned_to_name)),
            h('span.text-xs.text-slate-500', {}, escapeHtml(t.assigned_to_name)),
          ])
        : h('div.flex.items-center.gap-1.text-slate-400.italic.text-xs', {}, 'Sin asignar'),
    ]);
  }

  /**
   * Carga los usuarios activos desde la API y llena el selector de filtro "Responsable".
   * @returns {Promise<void>}
   */
  async function populateAssignedUsers() {
    try {
      const users = await api.users.list({ active: true });
      const options = (users.users || []).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')).map((u) => h('option', { value: u.id, selected: String(filters.assigned_to) === String(u.id) ? '' : null }, u.full_name || u.username));
      assignedSel.innerHTML = '<option value="">Todos los responsables</option>';
      options.forEach((opt) => assignedSel.appendChild(opt));
    } catch {
      assignedSel.innerHTML = '<option value="">Todos los responsables</option>';
    }
  }

  /**
   * Aplica los filtros actuales, los sincroniza con la URL, recarga todos los tickets desde la API y redibuja KPIs, gráficos y tabla.
   * @returns {Promise<void>}
   */
  async function render() {
    filters.status = statusSel.value;
    filters.priority = prioSel.value;
    filters.area = areaSel.value;
    filters.assigned_to = assignedSel.value;
    filters.search = search.value.trim();
    filters.date_from = from.value;
    filters.date_to = to.value;

    setFilterInUrl('search', filters.search);
    setFilterInUrl('status', filters.status);
    setFilterInUrl('priority', filters.priority);
    setFilterInUrl('area', filters.area);
    setFilterInUrl('assigned_to', filters.assigned_to);
    setFilterInUrl('date_from', filters.date_from);
    setFilterInUrl('date_to', filters.date_to);

    currentPage = 1;
    ensureDataList();
    dataList.update({ loading: true, items: [] });
    pagerInfo.textContent = '';
    pagerPageLabel.textContent = '';
    chartsRow1.innerHTML = '';
    chartsRow2.innerHTML = '';
    trendWrap.innerHTML = '';
    kpis.innerHTML = '';
    try {
      const { rows, truncated } = await fetchAllTickets(filters);
      cachedAll = rows;
      if (truncated) {
        toast('Hay más tickets de los que se muestran — los KPIs y gráficos sólo reflejan los primeros 20,000. Achica el rango de fechas para ver el total exacto.', 'warn', 6000);
      }
      drawChartsAndKpis(cachedAll);
      renderTablePage();
    } catch (e) {
      dataList.update({ loading: false, items: [] });
      listWrap.innerHTML = `<div class="card p-8 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
  }

  /**
   * Recalcula la página actual y redibuja el listado con la porción de tickets correspondiente, actualizando el paginador.
   * @returns {void}
   */
  function renderTablePage() {
    const total = cachedAll.length;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > pageCount) currentPage = pageCount;
    const start = (currentPage - 1) * PAGE_SIZE;
    dataList.update({ loading: false, items: cachedAll.slice(start, start + PAGE_SIZE) });

    const startIdx = total ? start + 1 : 0;
    const endIdx = Math.min(start + PAGE_SIZE, total);
    pagerInfo.textContent = total ? `Mostrando ${startIdx}–${endIdx} de ${total} tickets filtrados` : 'Sin resultados para estos filtros.';
    pagerPageLabel.textContent = `Página ${currentPage} de ${pageCount}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= pageCount;
  }

  /**
   * Calcula los KPIs y dibuja todos los gráficos (por estado, prioridad, área, responsables y tendencia diaria) a partir de los tickets filtrados.
   * @param {Array<Object>} tickets - tickets filtrados a analizar
   * @returns {void}
   */
  function drawChartsAndKpis(tickets) {
    const total = tickets.length;
    const byStatus = STATUS.map((s) => ({ key: s, c: tickets.filter((t) => t.status === s).length }));
    const byPrio = PRIORITIES.map((p) => ({ key: p, c: tickets.filter((t) => t.priority === p).length }));
    const byArea = AREA_ORDER.map((k) => ({ key: k, c: tickets.filter((t) => (t.area || NO_AREA) === k).length }));
    const open = byStatus.filter((x) => x.key !== 'cerrado').reduce((a, b) => a + b.c, 0);
    const closed = byStatus.find((x) => x.key === 'cerrado')?.c || 0;
    const reopened = byStatus.find((x) => x.key === 'reabierto')?.c || 0;
    const avgDays = avgResolutionDays(tickets);

    kpis.appendChild(kpiCard({ label: 'Total tickets', value: total, tone: '', icon: ICON.report }));
    kpis.appendChild(kpiCard({ label: 'Abiertos', value: open, hint: 'En curso', tone: 'ocean', icon: ICON.refresh }));
    kpis.appendChild(kpiCard({ label: 'Cerrados', value: closed, hint: 'Resueltos', tone: 'good', icon: ICON.check }));
    kpis.appendChild(kpiCard({ label: 'Reabiertos', value: reopened, hint: 'Requieren seguimiento', tone: 'warn', icon: ICON.reopen }));
    kpis.appendChild(kpiCard({ label: 'Urgentes', value: byPrio.find((x) => x.key === 'urgente')?.c || 0, tone: 'accent', icon: ICON.alert, badge: 'Crítico', pulse: true }));
    kpis.appendChild(kpiCard({ label: 'Resolución prom.', value: avgDays == null ? '—' : `${avgDays.toFixed(1)} d`, hint: 'Creado → cerrado', tone: '', icon: ICON.clock }));

    chartsRow1.appendChild(barChart('Por estado', byStatus, STATUS, STATUS_LABEL, STATUS_BAR_COLOR));
    chartsRow1.appendChild(barChart('Por prioridad', byPrio, PRIORITIES, PRIORITY_LABEL, PRIORITY_BAR_COLOR));
    chartsRow2.appendChild(barChart('Por área', byArea, AREA_ORDER, AREA_CHART_LABEL, AREA_BAR_COLOR));
    chartsRow2.appendChild(topAssigneesChart(tickets));
    trendWrap.appendChild(dailyTrendChart(tickets));
  }

  /**
   * Calcula el promedio de días entre creación y cierre de los tickets que ya fueron cerrados.
   * @param {Array<Object>} tickets - tickets a analizar
   * @returns {number|null} promedio de días de resolución, o null si no hay tickets cerrados
   */
  function avgResolutionDays(tickets) {
    const durations = [];
    for (const t of tickets) {
      const created = toDate(t.created_at);
      const closedAt = toDate(t.closed_at);
      if (!created || !closedAt) continue;
      const days = (closedAt - created) / 86400000;
      if (days >= 0) durations.push(days);
    }
    if (!durations.length) return null;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }

  /**
   * Arma una tarjeta de indicador (KPI) para el panel de reportes, con tono de color, ícono, badge opcional y animación de pulso.
   * @param {Object} params - configuración de la tarjeta
   * @param {string} params.label - etiqueta del indicador
   * @param {number|string} params.value - valor a mostrar
   * @param {string} [params.hint] - texto de ayuda debajo del valor
   * @param {string} [params.tone] - variante visual de color
   * @param {string} [params.icon] - path del ícono a mostrar
   * @param {string} [params.badge] - texto de una insignia opcional
   * @param {boolean} [params.pulse] - si true, anima el ícono con pulso
   * @returns {HTMLElement} tarjeta de indicador
   */
  function kpiCard({ label, value, hint = '', tone = '', icon = null, badge = '', pulse = false }) {
    const t = KPI_TONE[tone] || KPI_TONE[''];
    return h('div.card.flex.flex-col.gap-3', { class: t.border }, [
      h('div.flex.items-start.justify-between.gap-2', {}, [
        icon ? h('div.w-9.h-9.rounded-lg.flex.items-center.justify-center.flex-none', { class: pulse ? `${t.icon} animate-pulse` : t.icon }, [svg(h, icon, 'w-4 h-4')]) : h('span'),
        badge ? h('span.kpi-badge', { class: t.icon }, badge) : null,
      ]),
      h('div', {}, [
        h('div.text-3xl.font-bold', { class: t.value }, String(value ?? 0)),
        h('div.text-xs.uppercase.tracking-wider.text-slate-500.font-medium', {}, label),
      ]),
      hint ? h('div.text-xs.text-slate-500', {}, hint) : null,
    ]);
  }

  /**
   * Arma un gráfico de barras horizontales con la distribución de tickets según una dimensión (estado, prioridad o área).
   * @param {string} title - título del gráfico
   * @param {Array<Object>} data - conteos por clave ({ key, c })
   * @param {Array<string>} order - orden de las claves a mostrar
   * @param {Object} labelMap - mapa de clave a etiqueta legible
   * @param {Object} colorMap - mapa de clave a clase de color de la barra
   * @returns {HTMLElement} tarjeta con el gráfico de barras
   */
  function barChart(title, data, order, labelMap, colorMap) {
    const max = Math.max(1, ...data.map((d) => d.c));
    const totalAll = data.reduce((a, d) => a + d.c, 0);
    return h('div.card', {}, [
      h('h3.text-base.font-semibold.text-brand-ink.mb-4', {}, title),
      h('div.flex.flex-col.gap-3', {}, order.map((k) => {
        const v = data.find((d) => d.key === k)?.c || 0;
        const widthPct = Math.round((v / max) * 100);
        const sharePct = totalAll ? Math.round((v / totalAll) * 100) : 0;
        return h('div', {}, [
          h('div.flex.items-center.justify-between.text-xs.mb-1', {}, [
            h('span.text-brand-ink', {}, labelMap[k] || k),
            h('span.text-slate-500', {}, totalAll ? `${v} (${sharePct}%)` : '0'),
          ]),
          h('div.w-full.bg-surface.rounded-full.overflow-hidden', { class: 'h-2.5' }, [
            h('div.h-full.rounded-full.transition-all', { class: colorMap[k] || 'bg-brand-ocean', style: { width: `${widthPct}%` } }),
          ]),
        ]);
      })),
    ]);
  }

  /**
   * Arma el gráfico de carga de trabajo con los responsables que tienen más tickets asignados.
   * @param {Array<Object>} tickets - tickets a analizar
   * @returns {HTMLElement} tarjeta con el gráfico de top responsables
   */
  function topAssigneesChart(tickets) {
    const counts = new Map();
    for (const t of tickets) {
      if (!t.assigned_to_name) continue;
      counts.set(t.assigned_to_name, (counts.get(t.assigned_to_name) || 0) + 1);
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...top.map(([, c]) => c));
    return h('div.card', {}, [
      h('h3.text-base.font-semibold.text-brand-ink.mb-4', {}, 'Carga de trabajo · Top responsables'),
      top.length
        ? h('div.flex.flex-col.gap-3', {}, top.map(([name, c]) => {
            const pct = Math.round((c / max) * 100);
            return h('div', {}, [
              h('div.flex.items-center.justify-between.gap-2.text-xs.mb-1', {}, [
                h('span.text-brand-ink.truncate', {}, name),
                h('span.text-slate-500.flex-none', {}, `${c} ticket${c === 1 ? '' : 's'}`),
              ]),
              h('div.w-full.bg-surface.rounded-full.overflow-hidden', { class: 'h-2.5' }, [
                h('div.h-full.bg-brand-ocean.rounded-full.transition-all', { style: { width: `${pct}%` } }),
              ]),
            ]);
          }))
        : h('p.text-sm.text-slate-500.py-6.text-center', {}, 'Sin tickets asignados en este filtro.'),
    ]);
  }

  /**
   * Arma el gráfico de barras verticales con la cantidad de tickets creados por día, dentro del rango de fechas filtrado (o los últimos 30 días por defecto, con tope de 60 días).
   * @param {Array<Object>} tickets - tickets a analizar
   * @returns {HTMLElement} tarjeta con el gráfico de tendencia diaria
   */
  function dailyTrendChart(tickets) {
    const MAX_DAYS = 60;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let start;
    let end;
    if (filters.date_from && filters.date_to) {
      start = toDate(filters.date_from) || today;
      end = toDate(filters.date_to) || today;
    } else {
      end = today;
      start = new Date(today);
      start.setDate(start.getDate() - 29);
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    let days = Math.round((end - start) / 86400000) + 1;
    if (days < 1) days = 1;
    if (days > MAX_DAYS) {
      start = new Date(end);
      start.setDate(start.getDate() - (MAX_DAYS - 1));
      days = MAX_DAYS;
    }

    const counts = new Array(days).fill(0);
    for (const t of tickets) {
      const d = toDate(t.created_at);
      if (!d) continue;
      d.setHours(0, 0, 0, 0);
      const idx = Math.round((d - start) / 86400000);
      if (idx >= 0 && idx < days) counts[idx]++;
    }
    const max = Math.max(1, ...counts);
    const totalCount = counts.reduce((a, b) => a + b, 0);
    const avgPerDay = (totalCount / days).toFixed(1);
    const labelStep = Math.max(1, Math.ceil(days / 8));

    const bars = counts.map((c, i) => {
      const heightPct = c === 0 ? 3 : Math.max(6, Math.round((c / max) * 100));
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const showLabel = i === 0 || i === days - 1 || i % labelStep === 0;
      return h('div.flex-1.flex.flex-col.items-center.gap-1.min-w-0', {}, [
        h('div.w-full.flex.items-end', { style: { height: '110px' }, title: `${formatDate(day.toISOString())}: ${c} ticket${c === 1 ? '' : 's'}` }, [
          h('div.w-full.bg-brand-ocean.rounded-t.transition-all', { class: 'hover:bg-brand', style: { height: `${heightPct}%` } }),
        ]),
        h('div.text-slate-400.truncate.w-full.text-center', { class: 'text-[10px]' }, showLabel ? formatDate(day.toISOString()).slice(0, 6) : ''),
      ]);
    });

    return h('div.card', {}, [
      h('div.flex.items-center.justify-between.flex-wrap.gap-2.mb-4', {}, [
        h('h3.text-base.font-semibold.text-brand-ink', {}, 'Tendencia de creación de tickets'),
        h('span.text-xs.text-slate-500', {}, `${totalCount} en ${days} días · Prom. ${avgPerDay}/día`),
      ]),
      h('div.flex.items-end.gap-1', {}, bars),
    ]);
  }

  /**
   * Maneja la exportación del reporte: confirma la contraseña del usuario, obtiene todos los tickets filtrados y genera el archivo Excel o PDF.
   * @param {string} format - formato de exportación ('pdf' o 'excel')
   * @returns {Promise<void>}
   */
  async function doExport(format) {
    const formatLabel = format === 'pdf' ? 'PDF' : 'Excel';
    const setBusy = (busy, labelText = 'Exportar') => {
      exportBtn.disabled = busy;
      exportBtn.setLabel(labelText);
    };
    try {
      setBusy(true, 'Verificando…');
      await passwordConfirmModal({
        title: 'Confirmar exportación',
        message: `Ingresa tu contraseña para exportar los datos de este reporte a ${formatLabel}.`,
        confirmText: 'Exportar',
        onConfirm: async (password) => {
          await verifyCurrentPassword(password);
        },
      });
      setBusy(true, 'Exportando…');
      const { rows, truncated } = await fetchAllForExport(filters);
      if (!rows.length) {
        toast('No hay datos para exportar con los filtros seleccionados.', 'info');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const exportOpts = {
        columns: TICKET_EXPORT_COLUMNS,
        title: 'Reporte de tickets',
        subtitle: `${rows.length} ticket${rows.length === 1 ? '' : 's'} · filtros aplicados desde /reports`,
        sheetName: 'Tickets',
        summaryField: 'status',
        summaryLabel: 'Estado más frecuente',
        generatedByName: user.full_name || user.username,
        generatedByRole: getRoleLabel(user.role) || user.role,
      };
      if (format === 'pdf') {
        await exportListToPDF(rows, TICKET_EXPORT_COLUMNS, `reporte-tickets-${stamp}.pdf`, exportOpts);
      } else {
        await exportToExcel(rows, `reporte-tickets-${stamp}.xlsx`, exportOpts);
      }
      toast(
        truncated
          ? `Exportadas ${rows.length} filas (hay más — achica el rango de fechas para exportar el resto).`
          : `Exportadas ${rows.length} filas a ${formatLabel}.`,
        truncated ? 'warn' : 'success',
      );
    } catch (e) {
      if (e && e.message !== 'Modal closed') {
        toast(e.message || 'Error al exportar', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  await populateAssignedUsers();
  await render();
  return root;
}


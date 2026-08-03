/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { statusBadge } from '../components/badge.js';
import { relativeFromNow, STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL } from '../utils/format.js';
import { setFilterInUrl, clearFiltersInUrl } from '../utils/url-filters.js';
import { go } from '../router.js';
import { isSAC, isJefe, isAdmin, canViewAllTickets, canCreateTicket, isPlatformAdmin } from '../utils/permissions.js';
import { exportToExcel, exportListToPDF, fetchAllForExport, TICKET_EXPORT_COLUMNS } from '../utils/exports.js';
import { toast } from '../utils/toast.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { exportButton } from '../components/export-button.js';
import { activeFiltersChips } from '../components/active-filters-chips.js';
import { mountDataList } from '../components/data-list.js';
import { passwordConfirmModal } from '../components/modal.js';
import { verifyCurrentPassword } from '../auth-reverify.js';
import { ICON, svg } from '../utils/icons.js';
import { avatarColor, initials } from '../utils/avatar.js';
import { getRoleLabel } from '../utils/role-labels.js';

const STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

const KPI_TONE = {
  '':      { border: 'border-l-4 border-l-surface-border-strong', icon: 'bg-surface-alt text-brand', value: 'text-brand-ink' },
  ocean:   { border: 'border-l-4 border-l-brand-ocean',           icon: 'bg-brand-ocean/10 text-brand-ocean', value: 'text-brand-ocean' },
  good:    { border: 'border-l-4 border-l-emerald-500',           icon: 'bg-emerald-100 text-emerald-700',    value: 'text-emerald-700' },
  warn:    { border: 'border-l-4 border-l-orange-500',            icon: 'bg-orange-100 text-orange-700',      value: 'text-orange-700' },
  accent:  { border: 'border-2 border-accent/25 bg-accent/5',      icon: 'bg-accent/10 text-accent',           value: 'text-accent' },
};

/**
 * Arma una tarjeta de indicador (KPI) con icono, valor y etiqueta para el resumen superior de la lista.
 * @param {Object} params - datos del KPI
 * @param {string} params.label - etiqueta del indicador
 * @param {*} params.value - valor a mostrar
 * @param {string} [params.hint] - texto de ayuda debajo del valor
 * @param {string} [params.tone] - variante de color/estilo del KPI
 * @param {string} [params.icon] - icono a mostrar
 * @returns {HTMLElement} tarjeta KPI
 */
function kpiCard({ label, value, hint = '', tone = '', icon = null }) {
  const t = KPI_TONE[tone] || KPI_TONE[''];
  return h('div.card.flex.flex-col.gap-3', { class: t.border }, [
    icon ? h('div.w-9.h-9.rounded-lg.flex.items-center.justify-center', { class: t.icon }, [svg(h, icon, 'w-4 h-4')]) : null,
    h('div', {}, [
      h('div.text-2xl.font-bold', { class: t.value }, String(value ?? '—')),
      h('div.text-xs.uppercase.tracking-wider.text-slate-500.font-medium', {}, label),
    ]),
    hint ? h('div.text-xs.text-slate-500', {}, hint) : null,
  ]);
}

/**
 * Formatea un número de horas en texto legible, usando días cuando supera las 48 horas.
 * @param {number} hours - cantidad de horas
 * @returns {string} texto formateado (ej. "2.5 h" o "3.0 d")
 */
function formatHours(hours) {
  if (hours == null || isNaN(hours)) return '—';
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`;
  return `${Number(hours).toFixed(1)} h`;
}

/**
 * Arma el icono/indicador visual de prioridad de un ticket (alerta para alta/urgente, punto de color para media/baja).
 * @param {string} p - prioridad del ticket
 * @returns {HTMLElement} icono de prioridad
 */
function priorityIcon(p) {
  const label = PRIORITY_LABEL[p] || p || '—';
  if (p === 'urgente' || p === 'alta') {
    return h('span.inline-flex.items-center.justify-center', { class: p === 'urgente' ? 'text-error' : 'text-amber-600', title: label, 'aria-label': label }, [svg(h, ICON.alert, 'w-5 h-5')]);
  }
  const dotCls = p === 'media' ? 'bg-blue-500' : 'bg-slate-400';
  return h('span.inline-flex.items-center.justify-center', { title: label, 'aria-label': label }, [
    h('span.rounded-full', { class: `w-2.5 h-2.5 ${dotCls}` }),
  ]);
}

/**
 * Arma la vista de listado de tickets: KPIs, filtros, filtros rápidos, tabla/tarjetas paginadas y exportación.
 * @param {Object} params - parámetros de entrada de la ruta
 * @param {Object} params.query - parámetros de query string de la URL (filtros iniciales)
 * @param {Object} params.user - usuario autenticado actual
 * @returns {Promise<{view: HTMLElement, cleanup: Function}>} nodo raíz de la vista y función de limpieza de listeners
 */
export async function renderTicketsList({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  let exportBtn;
  const listTitle = h('h1.text-2xl.font-bold.text-brand.tracking-tight', { class: 'md:text-3xl' }, isJefe(user) ? 'Tickets listos para cerrar' : 'Tickets');
  const listSub = h('p.text-sm.text-slate-500.mt-1', {}, '');
  const header = h('div.flex.flex-col.justify-between.gap-4', { class: 'md:flex-row md:items-end' }, [
    h('div', {}, [listTitle, listSub]),
    h('div.flex.items-center.gap-2', {}, [
      exportBtn = exportButton({ label: 'Exportar', kind: 'secondary', onExport: doExport }),
      canCreateTicket(user) ? h('button.btn.btn-primary', { onclick: () => go('/tickets/new') }, [svg(h, ICON.plus, 'w-4 h-4'), h('span', {}, 'Nuevo ticket')]) : null,
    ]),
  ]);
  root.appendChild(header);

  const statsRow = h('div.grid.grid-cols-2.gap-3', { class: 'md:grid-cols-4' });
  root.appendChild(statsRow);

  const initialStatus = isJefe(user) && !query.status ? 'solucionado' : query.status || '';
  const canFilterByCompany = isSAC(user) || isPlatformAdmin(user);
  const filters = {
    status: initialStatus,
    priority: query.priority || '',
    search: query.search || '',
    assigned_to: query.assigned_to || '',
    area: isJefe(user) ? '' : query.area || '',
    company_id: canFilterByCompany ? query.company_id || '' : '',
    date_from: query.date_from || '',
    date_to: query.date_to || '',
    limit: 20,
  };
  const state = { filters, result: { tickets: [], total: 0, hasMore: false }, cursors: [null], pageIndex: 0 };
  const filtersBar = h('div.card.flex.flex-col.gap-3', { class: 'md:flex-row md:flex-wrap md:items-end' });
  const searchInput = h('input.input', { type: 'search', placeholder: 'Buscar código, título, descripción…', value: filters.search });
  const statusSel = h('select.input', {}, [
    h('option', { value: '' }, 'Todos los estados'),
    ...STATUS.map((s) => h('option', { value: s, selected: filters.status === s ? '' : null }, STATUS_LABEL[s])),
  ]);
  const prioSel = h('select.input', {}, [
    h('option', { value: '' }, 'Todas las prioridades'),
    ...PRIORITIES.map((p) => h('option', { value: p, selected: filters.priority === p ? '' : null }, PRIORITY_LABEL[p])),
  ]);
  const areaSel = h('select.input', {}, [
    h('option', { value: '' }, 'Todas las áreas'),
    ...Object.entries(AREA_LABEL).map(([k, v]) => h('option', { value: k, selected: filters.area === k ? '' : null }, v)),
  ]);
  const assignedSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los responsables')]);
  const companySel = h('select.input', {}, [h('option', { value: '' }, 'Todas las empresas')]);
  let companyNames = {};
  const fromInput = h('input.input', { type: 'date', value: filters.date_from });
  const toInput = h('input.input', { type: 'date', value: filters.date_to });
  const applyBtn = h('button.btn.btn-primary', { onclick: () => applyFilters() }, 'Filtrar');
  const resetBtn = h('button.btn.btn-ghost', { onclick: () => { clearFiltersInUrl(); Object.assign(filters, { status: '', priority: '', search: '', area: '', assigned_to: '', company_id: '', date_from: '', date_to: '' }); searchInput.value=''; statusSel.value=''; prioSel.value=''; areaSel.value=''; assignedSel.value=''; companySel.value=''; fromInput.value=''; toInput.value=''; state.cursors = [null]; state.pageIndex = 0; render(); } }, 'Limpiar');

  for (const el of [searchInput, statusSel, prioSel, areaSel, assignedSel, companySel, fromInput, toInput]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyFilters(); }
    });
  }

  filtersBar.appendChild(h('div.w-full', { class: 'md:flex-1 md:min-w-[200px]' }, [h('label.label', {}, 'Búsqueda'), searchInput]));
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-44' }, [h('label.label', {}, 'Estado'), statusSel]));
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-44' }, [h('label.label', {}, 'Prioridad'), prioSel]));
  if (!isJefe(user)) {
    filtersBar.appendChild(h('div.w-full', { class: 'md:w-44' }, [h('label.label', {}, 'Área'), areaSel]));
  }
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-44' }, [h('label.label', {}, 'Responsable'), assignedSel]));
  if (canFilterByCompany) {
    filtersBar.appendChild(h('div.w-full', { class: 'md:w-44' }, [h('label.label', {}, 'Empresa'), companySel]));
  }
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-40' }, [h('label.label', {}, 'Desde'), fromInput]));
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-40' }, [h('label.label', {}, 'Hasta'), toInput]));
  filtersBar.appendChild(h('div.flex.gap-2.w-full', { class: 'md:w-auto' }, [applyBtn, resetBtn]));
  root.appendChild(filtersBar);

  const quickFiltersWrap = h('div.flex.flex-wrap.gap-2', {});
  root.appendChild(quickFiltersWrap);

  const filtersChipsWrap = h('div.flex.gap-2.items-center.flex-wrap', {});
  root.appendChild(filtersChipsWrap);

  const listWrap = h('div.table-zebra', {});
  const pagWrap = h('div.px-4.py-3.bg-surface.flex.items-center.justify-between.gap-3.flex-wrap.rounded-b-xl', {});
  const listContainer = h('div.card-tight.overflow-hidden', {}, [listWrap, pagWrap]);
  root.appendChild(listContainer);

  const TABLE_COLUMNS = [
    { key: 'code',          label: 'Ticket' },
    { key: 'title',         label: 'Asunto' },
    { key: 'created_by',    label: 'Usuario' },
    { key: 'status',        label: 'Estado', align: 'center' },
    { key: 'priority',      label: 'Prioridad', align: 'center' },
    { key: 'assigned_to',   label: 'Asignado' },
    { key: 'updated_at',    label: 'Última act.' },
    { key: 'actions',       label: '' },
  ];

  const statusBadgeCache = new Map();
  /**
   * Devuelve el HTML del badge de estado de un ticket, usando caché para evitar recrearlo.
   * @param {string} s - estado del ticket
   * @returns {string} HTML del badge de estado
   */
  function statusBadgeHtml(s) {
    if (statusBadgeCache.has(s)) return statusBadgeCache.get(s);
    const html = statusBadge(s).outerHTML;
    statusBadgeCache.set(s, html);
    return html;
  }
  const priorityIconCache = new Map();
  /**
   * Devuelve el HTML del icono de prioridad de un ticket, usando caché para evitar recrearlo.
   * @param {string} p - prioridad del ticket
   * @returns {string} HTML del icono de prioridad
   */
  function priorityIconHtml(p) {
    if (priorityIconCache.has(p)) return priorityIconCache.get(p);
    const html = priorityIcon(p).outerHTML;
    priorityIconCache.set(p, html);
    return html;
  }

  /**
   * Arma el HTML de una celda de persona (avatar con iniciales + nombre) para las columnas de usuario/asignado de la tabla.
   * @param {string} name - nombre de la persona
   * @param {string|number} seedId - identificador usado para generar el color del avatar
   * @param {string} [emptyLabel] - texto a mostrar cuando no hay persona asignada
   * @returns {string} HTML de la celda
   */
  function personCellHtml(name, seedId, emptyLabel = 'Sin asignar') {
    if (!name) return `<span class="text-slate-400 italic text-xs">${escapeHtml(emptyLabel)}</span>`;
    return `
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-none" style="background-color:${avatarColor(seedId)}">${escapeHtml(initials(name))}</span>
        <span class="text-brand-ink truncate max-w-[140px]">${escapeHtml(name)}</span>
      </div>
    `;
  }

  /**
   * Arma la tarjeta de un ticket para la vista mobile del listado (código, prioridad, título, estado, área y responsable).
   * @param {Object} t - datos del ticket
   * @returns {HTMLElement} tarjeta del ticket
   */
  function mobileCard(t) {
    const open = () => go(`/tickets/${t.id}`);
    const card = h('button.card.text-left.flex.flex-col.gap-2.p-3.transition', {
      class: 'hover:border-brand-ocean hover:shadow-card focus:outline-none focus:ring-2 focus:ring-brand-ocean/60',
      onclick: open,
      'aria-label': `Abrir ticket ${escapeHtml(t.code)}: ${escapeHtml(t.title)}`,
    }, [
      h('div.flex.items-center.justify-between.gap-2', {}, [
        h('span.text-xs.font-mono.text-brand.font-medium', {}, escapeHtml(t.code || '')),
        priorityIcon(t.priority),
      ]),
      h('div', {}, [
        h('div.font-medium.text-brand-ink.line-clamp-2', {}, escapeHtml(t.title || '')),
        t.description ? h('div.text-xs.text-slate-500.line-clamp-1', { class: 'mt-0.5' }, escapeHtml(t.description)) : null,
      ]),
      h('div.flex.items-center.gap-2.flex-wrap.text-xs.text-slate-500', {}, [
        statusBadge(t.status),
        h('span', {}, '·'),
        h('span', {}, escapeHtml(AREA_LABEL[t.area] || t.area || '—')),
        h('span', {}, '·'),
        h('span', { title: escapeHtml(t.updated_at || t.created_at || '') }, escapeHtml(relativeFromNow(t.updated_at || t.created_at))),
      ]),
      h('div.flex.items-center.justify-between.gap-2.text-xs.text-slate-500.pt-1.border-t.border-surface-border', {}, [
        h('span', {}, `Reportó: ${escapeHtml(t.created_by_name || '—')}`),
        t.assigned_to_name ? h('span', {}, `Asignado: ${escapeHtml(t.assigned_to_name)}`) : h('span.italic.text-slate-400', {}, 'Sin asignar'),
      ]),
    ]);
    return card;
  }

  /**
   * Arma el HTML de una fila de la tabla de tickets para la vista desktop.
   * @param {Object} t - datos del ticket
   * @returns {string} HTML de la fila `<tr>`
   */
  function tableRow(t) {
    return `
      <tr class="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-ocean/60 focus:ring-inset group" data-id="${escapeHtml(String(t.id))}" tabindex="0" role="link" aria-label="Abrir ticket ${escapeHtml(t.code)}: ${escapeHtml(t.title)}">
        <td class="font-mono text-xs text-brand font-medium">${escapeHtml(t.code || '')}</td>
        <td>
          <div class="font-medium text-slate-800">${escapeHtml(t.title || '')}</div>
          <div class="text-xs text-slate-500 line-clamp-1">${escapeHtml(t.description || '')}</div>
        </td>
        <td>${personCellHtml(t.created_by_name, t.created_by, 'Desconocido')}</td>
        <td class="text-center">${statusBadgeHtml(t.status)}</td>
        <td class="text-center">${priorityIconHtml(t.priority)}</td>
        <td>${personCellHtml(t.assigned_to_name, t.assigned_to)}</td>
        <td class="text-xs text-slate-500 whitespace-nowrap" title="${escapeHtml(t.updated_at || t.created_at || '')}">${escapeHtml(relativeFromNow(t.updated_at || t.created_at))}</td>
        <td class="text-right">
          <span class="inline-flex opacity-0 group-hover:opacity-100 text-slate-400 group-hover:text-brand transition-opacity" aria-hidden="true">${svg(h, ICON.chevronR, 'w-4 h-4').outerHTML}</span>
        </td>
      </tr>
    `;
  }

  let dataList = null;
  let currentTickets = [];
  let currentTotal = 0;
  let currentLimit = 20;

  /**
   * Conecta los listeners de click y teclado a las filas de la tabla renderizada para abrir el detalle del ticket.
   * @returns {void}
   */
  function wireTableRows() {
    const rows = listWrap.querySelectorAll('tr[data-id]');
    rows.forEach((tr) => {
      const open = () => go(`/tickets/${tr.dataset.id}`);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  /**
   * Reacciona al cambio entre vista mobile y desktop, re-conectando los listeners de la tabla cuando corresponde.
   * @param {boolean} isMobile - true si el breakpoint activo es mobile
   * @returns {void}
   */
  function onMatchMediaChange(isMobile) {
    if (!isMobile) wireTableRows();
  }

  /**
   * Dibuja los botones de filtro rápido por estado (varían según el rol del usuario) sobre la barra de filtros.
   * @returns {void}
   */
  function renderQuickFilters() {
    quickFiltersWrap.innerHTML = '';
    const options = isJefe(user)
      ? [
          { value: '', label: 'Todos' },
          { value: 'solucionado', label: 'Listos para cerrar' },
          { value: 'cerrado', label: 'Cerrados' },
        ]
      : [
          { value: '', label: 'Todos' },
          { value: 'recibido', label: 'Recibidos' },
          { value: 'en_proceso', label: 'En proceso' },
          { value: 'solucionado', label: 'Solucionados' },
        ];

    const buttons = options.map((option) => {
      const active = filters.status === option.value;
      return h('button', {
        type: 'button',
        class: active ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm',
        onclick: () => {
          filters.status = option.value;
          statusSel.value = option.value;
          applyFilters();
        },
      }, option.label);
    });

    quickFiltersWrap.appendChild(h('div.flex.flex-wrap.gap-2', {}, buttons));
  }

  /**
   * Toma los valores actuales de los controles de filtro, los sincroniza con la URL y recarga el listado desde la primera página.
   * @returns {Promise<void>}
   */
  async function applyFilters() {
    filters.search = searchInput.value.trim();
    filters.status = statusSel.value;
    filters.priority = prioSel.value;
    filters.area = isJefe(user) ? '' : areaSel.value;
    filters.assigned_to = assignedSel.value;
    filters.company_id = canFilterByCompany ? companySel.value : '';
    filters.date_from = fromInput.value;
    filters.date_to = toInput.value;

    setFilterInUrl('search', filters.search);
    setFilterInUrl('status', filters.status);
    setFilterInUrl('priority', filters.priority);
    setFilterInUrl('area', filters.area);
    setFilterInUrl('assigned_to', filters.assigned_to);
    setFilterInUrl('company_id', filters.company_id);
    setFilterInUrl('date_from', filters.date_from);
    setFilterInUrl('date_to', filters.date_to);

    state.cursors = [null];
    state.pageIndex = 0;
    render();
  }

  /**
   * Avanza o retrocede una página en la paginación por cursor y vuelve a renderizar el listado.
   * @param {string} direction - dirección de navegación ('next' o 'prev')
   * @returns {Promise<void>}
   */
  async function goToPage(direction) {
    if (direction === 'next') {
      if (!state.result.hasMore || !state.result.nextCursor) return;
      if (state.pageIndex + 1 >= state.cursors.length) {
        state.cursors.push(state.result.nextCursor);
      }
      state.pageIndex += 1;
    } else if (direction === 'prev') {
      if (state.pageIndex <= 0) return;
      state.pageIndex -= 1;
    }
    render();
  }

  /**
   * Carga los usuarios activos desde la API y llena el select de "Responsable" con las opciones disponibles.
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
   * Carga las empresas visibles para el usuario y llena el select de "Empresa" (solo SAC/admin de plataforma).
   * @returns {Promise<void>}
   */
  async function populateCompanies() {
    if (!canFilterByCompany) return;
    try {
      const { companies } = await api.companies.list();
      companyNames = Object.fromEntries((companies || []).map((c) => [String(c.id), c.name]));
      const options = (companies || [])
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((c) => h('option', { value: String(c.id), selected: String(filters.company_id) === String(c.id) ? '' : null }, `${c.code_prefix ? `${c.code_prefix} — ` : ''}${c.name}`));
      companySel.innerHTML = '<option value="">Todas las empresas</option>';
      options.forEach((opt) => companySel.appendChild(opt));
    } catch {
      companySel.innerHTML = '<option value="">Todas las empresas</option>';
    }
  }

  /**
   * Obtiene las estadísticas del dashboard (o del usuario, según rol) y dibuja los KPIs superiores.
   * @returns {Promise<void>}
   */
  async function loadStats() {
    try {
      const data = user.role === 'sac' ? await api.stats.dashboard() : await api.stats.me();
      drawStats(data || {});
    } catch {
      statsRow.innerHTML = '';
    }
  }

  /**
   * Renderiza las tarjetas KPI (resolución promedio, urgentes, cerrados hoy, reabiertos) con los datos de estadísticas.
   * @param {Object} data - datos de estadísticas del dashboard
   * @returns {void}
   */
  function drawStats(data) {
    const totals = data.totals || {};
    statsRow.innerHTML = '';
    statsRow.appendChild(kpiCard({ label: 'Resolución prom.', value: formatHours(data.avg_resolution_hours), hint: 'Creado → cerrado', tone: '', icon: ICON.clock }));
    statsRow.appendChild(kpiCard({ label: 'Urgentes', value: totals.urgent ?? '—', hint: 'Prioridad elevada', tone: 'accent', icon: ICON.alert }));
    statsRow.appendChild(kpiCard({ label: 'Cerrados hoy', value: totals.closed_today ?? '—', hint: 'Últimas 24 h', tone: 'good', icon: ICON.check }));
    statsRow.appendChild(kpiCard({ label: 'Reabiertos', value: totals.reabierto ?? '—', hint: 'Requieren seguimiento', tone: 'warn', icon: ICON.reopen }));
  }

  /**
   * Solicita a la API el listado de tickets según los filtros y la página actual, y dibuja el resultado.
   * @returns {Promise<void>}
   */
  async function render() {
    ensureDataList();
    dataList.update({ loading: true, items: [] });
    pagWrap.innerHTML = '';
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) { if (v) params.set(k, v); }
      const cursor = state.cursors[state.pageIndex];
      if (cursor) params.set('cursor', cursor);
      const data = await api.tickets.list(Object.fromEntries(params));
      state.result = data;
      renderQuickFilters();
      draw();
    } catch (e) {
      listWrap.innerHTML = '';
      listWrap.appendChild(h('div.card.p-6.text-center.text-sm.text-red-600', {}, escapeHtml(e.message)));
    }
  }

  /**
   * Inicializa el componente de lista de datos (tabla/tarjetas) una única vez, si todavía no fue montado.
   * @returns {void}
   */
  function ensureDataList() {
    if (dataList) return;
    dataList = mountDataList({
      wrapper: listWrap,
      columns: TABLE_COLUMNS,
      renderRow: tableRow,
      renderMobileCard: mobileCard,
      emptyState: emptyState({ ...EMPTY_STATES.tickets, className: 'py-10' }),
      onMatchMediaChange,
    });
  }

  /**
   * Actualiza el subtítulo de resultados, la lista de tickets, el paginador y los chips de filtros activos con el resultado actual.
   * @returns {void}
   */
  function draw() {
    const { tickets, total, hasMore, limit } = state.result;
    currentTickets = tickets;
    currentTotal = total;
    currentLimit = limit;

    const totalLabel = total == null ? `${tickets.length}+` : String(total);
    listSub.textContent = isJefe(user)
      ? `Mostrando ${totalLabel} ticket${total === 1 ? '' : 's'} en estado solucionado para revisión y cierre.`
      : canViewAllTickets(user) ? `Gestionando ${totalLabel} ticket${total === 1 ? '' : 's'} en el sistema.` : `${totalLabel} ticket${total === 1 ? '' : 's'} que puedes ver.`;

    ensureDataList();
    dataList.update({ loading: false, items: tickets });

    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(max-width: 767.95px)').matches) {
      requestAnimationFrame(() => requestAnimationFrame(wireTableRows));
    }

    drawPager(tickets.length, total, hasMore, state.pageIndex);

    filtersChipsWrap.innerHTML = '';
    const chips = activeFiltersChips(filters, (filterKey) => {
      filters[filterKey] = '';
      const inputMap = {
        'search': searchInput,
        'status': statusSel,
        'priority': prioSel,
        'area': areaSel,
        'assigned_to': assignedSel,
        'company_id': companySel,
        'date_from': fromInput,
        'date_to': toInput,
      };
      if (inputMap[filterKey]) inputMap[filterKey].value = '';
      setFilterInUrl(filterKey, '');
      applyFilters();
    }, {}, companyNames);
    if (chips) filtersChipsWrap.appendChild(chips);
  }

  /**
   * Dibuja el resumen de resultados mostrados y los controles de paginación (anterior/siguiente).
   * @param {number} shown - cantidad de tickets mostrados en la página actual
   * @param {number} total - total de tickets que coinciden con los filtros
   * @param {boolean} hasMore - si existe una página siguiente
   * @param {number} pageIndex - índice de la página actual
   * @returns {void}
   */
  function drawPager(shown, total, hasMore, pageIndex) {
    pagWrap.innerHTML = '';
    if (!shown) return;
    const summary = total == null
      ? [h('span.font-medium.text-brand-ink', {}, String(shown)), ' resultados en esta página']
      : ['Mostrando ', h('span.font-medium.text-brand-ink', {}, String(shown)), ' de ', h('span.font-medium.text-brand-ink', {}, String(total))];
    pagWrap.appendChild(h('p.text-xs.text-slate-500', {}, summary));
    pagWrap.appendChild(h('div.flex.items-center.gap-2', {}, [
      h('button.btn.btn-secondary.btn-sm.gap-1', { disabled: pageIndex <= 0, onclick: () => goToPage('prev') }, [svg(h, ICON.chevronL, 'w-4 h-4'), h('span', {}, 'Anterior')]),
      h('button.btn.btn-secondary.btn-sm.gap-1', { disabled: !hasMore, onclick: () => goToPage('next') }, [h('span', {}, 'Siguiente'), svg(h, ICON.chevronR, 'w-4 h-4')]),
    ]));
  }

  /**
   * Pide confirmación de contraseña y exporta el listado de tickets filtrado a Excel o PDF.
   * @param {string} format - formato de exportación ('pdf' o 'excel')
   * @returns {Promise<void>}
   */
  async function doExport(format) {
    const formatLabel = format === 'pdf' ? 'PDF' : 'Excel';
    /**
     * Activa/desactiva el estado de carga del botón de exportación y actualiza su etiqueta.
     * @param {boolean} busy - true para mostrar estado ocupado
     * @param {string} [labelText] - texto a mostrar en el botón
     * @returns {void}
     */
    const setBusy = (busy, labelText = 'Exportar') => {
      if (!exportBtn) return;
      exportBtn.disabled = busy;
      exportBtn.setLabel(labelText);
    };
    try {
      setBusy(true, 'Verificando…');
      await passwordConfirmModal({
        title: 'Confirmar exportación',
        message: `Ingresa tu contraseña para exportar los datos de los tickets a ${formatLabel}.`,
        confirmText: 'Exportar',
        onConfirm: async (password) => {
          await verifyCurrentPassword(password);
        },
      });
      setBusy(true, 'Exportando…');
      const { rows, truncated } = await fetchAllForExport(filters);
      if (!rows.length) {
        toast('No hay tickets para exportar con los filtros actuales.', 'info');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const exportOpts = {
        columns: TICKET_EXPORT_COLUMNS,
        title: isJefe(user) ? 'Tickets listos para cerrar' : 'Reporte de tickets',
        subtitle: `${rows.length} ticket${rows.length === 1 ? '' : 's'} · filtros aplicados desde /tickets`,
        sheetName: 'Tickets',
        summaryField: 'status',
        summaryLabel: 'Estado más frecuente',
        generatedByName: user.full_name || user.username,
        generatedByRole: getRoleLabel(user.role) || user.role,
      };
      if (format === 'pdf') {
        await exportListToPDF(rows, TICKET_EXPORT_COLUMNS, `tickets-${stamp}.pdf`, exportOpts);
      } else {
        await exportToExcel(rows, `tickets-${stamp}.xlsx`, exportOpts);
      }
      toast(
        truncated
          ? `Exportadas ${rows.length} filas (hay más — filtra por fecha para exportar el resto).`
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

  await Promise.all([populateAssignedUsers(), populateCompanies()]);
  await Promise.all([render(), loadStats()]);

  const evs = ['ticket:created', 'ticket:updated', 'ticket:assigned',
               'ticket:status_changed', 'ticket:commented', 'attachment:added'];
  const ac = new AbortController();
  window.addEventListener('gcm:realtime', (e) => {
    if (evs.includes(e.detail?.event)) { render(); loadStats(); }
  }, { signal: ac.signal });

  return { view: root, cleanup: () => ac.abort() };
}


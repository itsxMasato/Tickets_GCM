/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { statusBadge, priorityBadge } from '../components/badge.js';
import { relativeFromNow, STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL } from '../utils/format.js';
import { setFilterInUrl, clearFiltersInUrl } from '../utils/url-filters.js';
import { go } from '../router.js';
import { isSAC, isJefe, isAdmin, canViewAllTickets, canCreateTicket } from '../utils/permissions.js';
import { exportToExcel, fetchAllForExport } from '../utils/exports.js';
import { toast } from '../utils/toast.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { exportButton } from '../components/export-button.js';
import { filterBadge, countActiveFilters } from '../components/filter-badge.js';
import { activeFiltersChips } from '../components/active-filters-chips.js';
import { mountDataList } from '../components/data-list.js';
import { passwordConfirmModal } from '../components/modal.js';

const STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

export async function renderTicketsList({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  // Header
  let exportBtn;
  const header = h('div.flex.items-center.justify-between.flex-wrap.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, isJefe(user) ? 'Tickets listos para cerrar' : 'Tickets'),
      h('p.text-sm.text-slate-500', {}, isJefe(user)
        ? 'Mostrando los tickets en estado solucionado para revisión y cierre.'
        : canViewAllTickets(user) ? 'Todos los tickets del sistema.' : 'Tickets que puedes ver.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
      exportBtn = exportButton({ label: 'Exportar', format: 'excel', kind: 'secondary', onclick: doExport }),
      canCreateTicket(user) ? h('button.btn.btn-primary', { onclick: () => go('/tickets/new') }, '+ Nuevo ticket') : null,
    ]),
  ]);
  root.appendChild(header);

  // Filtros
  const initialStatus = isJefe(user) && !query.status ? 'solucionado' : query.status || '';
  const filters = {
    status: initialStatus,
    priority: query.priority || '',
    search: query.search || '',
    assigned_to: query.assigned_to || '',
    area: query.area || '',
    date_from: query.date_from || '',
    date_to: query.date_to || '',
    page: parseInt(query.page || '1', 10) || 1,
    limit: 20,
  };
  const state = { filters, result: { tickets: [], total: 0, page: 1 } };
  // Filtros: en mobile colapsan a flex-col con cada filtro a full-width y los
  // botones a flex-1. En desktop vuelve al layout horizontal con anchos fijos.
  const filtersBar = h('div.card.flex.flex-col.gap-3.md\\:flex-row.md\\:flex-wrap.md\\:items-end', {});
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
  const fromInput = h('input.input', { type: 'date', value: filters.date_from });
  const toInput = h('input.input', { type: 'date', value: filters.date_to });
  const applyBtn = h('button.btn.btn-primary', { onclick: () => apply(1) }, 'Filtrar');
  const resetBtn = h('button.btn.btn-ghost', { onclick: () => { clearFiltersInUrl(); Object.assign(filters, { status: '', priority: '', search: '', area: '', assigned_to: '', date_from: '', date_to: '', page: 1 }); searchInput.value=''; statusSel.value=''; prioSel.value=''; areaSel.value=''; assignedSel.value=''; fromInput.value=''; toInput.value=''; render(); } }, 'Limpiar');

  // Enter en cualquier input/select de filtro dispara apply(1) — sin esto
  // el usuario tiene que tabular hasta el botón "Filtrar" para confirmar.
  for (const el of [searchInput, statusSel, prioSel, areaSel, assignedSel, fromInput, toInput]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); apply(1); }
    });
  }

  // Cada filtro va en un wrapper w-full md:w-* (los anchos fijos sólo aplican
  // en desktop). Los botones comparten fila con flex-1 en mobile.
  filtersBar.appendChild(h('div.w-full.md\\:flex-1.md\\:min-w-\\[200px\\]', {}, [h('label.label', {}, 'Búsqueda'), searchInput]));
  filtersBar.appendChild(h('div.w-full.md\\:w-44', {}, [h('label.label', {}, 'Estado'), statusSel]));
  filtersBar.appendChild(h('div.w-full.md\\:w-44', {}, [h('label.label', {}, 'Prioridad'), prioSel]));
  filtersBar.appendChild(h('div.w-full.md\\:w-44', {}, [h('label.label', {}, 'Área'), areaSel]));
  filtersBar.appendChild(h('div.w-full.md\\:w-44', {}, [h('label.label', {}, 'Responsable'), assignedSel]));
  filtersBar.appendChild(h('div.w-full.md\\:w-40', {}, [h('label.label', {}, 'Desde'), fromInput]));
  filtersBar.appendChild(h('div.w-full.md\\:w-40', {}, [h('label.label', {}, 'Hasta'), toInput]));
  filtersBar.appendChild(h('div.flex.gap-2.w-full.md\\:w-auto', {}, [applyBtn, resetBtn]));
  root.appendChild(filtersBar);

  const quickFiltersWrap = h('div.flex.flex-wrap.gap-2', {});
  root.appendChild(quickFiltersWrap);

  // Mostrar filtros activos como chips
  const filtersChipsWrap = h('div.flex.gap-2.items-center.flex-wrap', {});
  root.appendChild(filtersChipsWrap);

  // Lista (tabla desktop / cards mobile) + paginación. El data-list decide
  // qué variante pintar según el viewport y re-renderiza al cruzar el
  // breakpoint md (768px) sin perder el estado de scroll ni el foco.
  const listWrap = h('div', {});
  const pagWrap = h('div.flex.items-center.justify-between.mt-3.text-sm.text-slate-600', {});
  root.appendChild(listWrap);
  root.appendChild(pagWrap);

  // Columnas para la tabla desktop. El orden/alineación se mantiene del
  // HTML original; el card mobile decide su propio layout en renderMobileCard.
  const TABLE_COLUMNS = [
    { key: 'code',          label: 'Código' },
    { key: 'title',         label: 'Título' },
    { key: 'category_name', label: 'Categoría' },
    { key: 'area',          label: 'Área' },
    { key: 'assigned_to',   label: 'Asignado a' },
    { key: 'status',        label: 'Estado' },
    { key: 'priority',      label: 'Prioridad' },
    { key: 'created_at',    label: 'Creado' },
  ];

  // Cache de badges serializados: statusBadge/priorityBadge devuelven HTMLElement
  // y necesitamos su .outerHTML para la tabla. Se cachean por valor para
  // no reconstruir el DOM en cada draw.
  const badgeCache = new Map();
  function badgeHtml(t, kind) {
    const cacheKey = `${kind}:${t}`;
    if (badgeCache.has(cacheKey)) return badgeCache.get(cacheKey);
    const el = kind === 'status' ? statusBadge(t) : priorityBadge(t);
    const html = el.outerHTML;
    badgeCache.set(cacheKey, html);
    return html;
  }

  // Cell mobile por ticket. Estructura:
  //   ┌────────────────────────────────────────────┐
  //   │ [código]                    [prio badge]   │
  //   │ Título del ticket (line-clamp-2)           │
  //   │ descripción (1 línea, slate-500)           │
  //   │ [status] · área · asignado · hace Xd       │
  //   └────────────────────────────────────────────┘
  // Toda la card es un <button> para que click en cualquier punto abra el
  // ticket. Hit-area 44px garantizada por la utility mobile de .btn en CSS.
  function mobileCard(t) {
    const open = () => go(`/tickets/${t.id}`);
    const card = h('button.card.text-left.flex.flex-col.gap-2.p-3.hover\\:border-brand-ocean.hover\\:shadow-card.focus\\:outline-none.focus\\:ring-2.focus\\:ring-brand-ocean\\/60.transition', {
      onclick: open,
      'aria-label': `Abrir ticket ${escapeHtml(t.code)}: ${escapeHtml(t.title)}`,
    }, [
      // Header: código (mono) + priority badge a la derecha
      h('div.flex.items-center.justify-between.gap-2', {}, [
        h('span.text-xs.font-mono.text-slate-500', {}, escapeHtml(t.code || '')),
        priorityBadge(t.priority),
      ]),
      // Título + descripción truncada
      h('div', {}, [
        h('div.font-medium.text-brand-ink.line-clamp-2', {}, escapeHtml(t.title || '')),
        t.description ? h('div.text-xs.text-slate-500.line-clamp-1.mt-0\\.5', {}, escapeHtml(t.description)) : null,
      ]),
      // Footer: status, área, asignado, fecha relativa
      h('div.flex.items-center.gap-2.flex-wrap.text-xs.text-slate-500', {}, [
        statusBadge(t.status),
        h('span', {}, '·'),
        h('span', {}, escapeHtml(AREA_LABEL[t.area] || t.area || '—')),
        t.assigned_to_name ? h('span', {}, `· ${escapeHtml(t.assigned_to_name)}`) : null,
        h('span', {}, '·'),
        h('span', { title: escapeHtml(t.created_at || '') }, escapeHtml(relativeFromNow(t.created_at))),
      ]),
    ]);
    return card;
  }

  // Fila HTML para la tabla desktop. Mantiene el markup original
  // (incluyendo role=link + tabindex para accesibilidad por teclado).
  function tableRow(t) {
    return `
      <tr class="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-ocean/60 focus:ring-inset" data-id="${escapeHtml(String(t.id))}" tabindex="0" role="link" aria-label="Abrir ticket ${escapeHtml(t.code)}: ${escapeHtml(t.title)}">
        <td class="font-mono text-xs text-slate-500">${escapeHtml(t.code || '')}</td>
        <td>
          <div class="font-medium text-slate-800">${escapeHtml(t.title || '')}</div>
          <div class="text-xs text-slate-500 line-clamp-1">${escapeHtml(t.description || '')}</div>
        </td>
        <td>${escapeHtml(t.category_name || '—')}</td>
        <td>${escapeHtml(AREA_LABEL[t.area] || t.area || '—')}</td>
        <td>${escapeHtml(t.assigned_to_name || '—')}</td>
        <td>${badgeHtml(t.status, 'status')}</td>
        <td>${badgeHtml(t.priority, 'priority')}</td>
        <td class="text-xs text-slate-500">${escapeHtml(relativeFromNow(t.created_at))}</td>
      </tr>
    `;
  }

  let dataList = null;
  let currentTickets = [];
  let currentTotal = 0;
  let currentPage = 1;
  let currentLimit = 20;

  // Re-engancha los listeners de teclado/click en las filas desktop. Sólo
  // aplica en >= 768px (data-list reemplaza el HTML al cruzar el breakpoint);
  // cada repaint debe re-vincular los handlers porque el DOM es nuevo.
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

  // data-list llama onMatchMediaChange después de un repaint; re-enganchamos
  // las filas para que el handler de teclado siga funcionando en desktop.
  function onMatchMediaChange(isMobile) {
    if (!isMobile) wireTableRows();
  }

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
          apply(1);
        },
      }, option.label);
    });

    quickFiltersWrap.appendChild(h('div.flex.flex-wrap.gap-2', {}, buttons));
  }

  async function apply(newPage) {
    filters.page = newPage || 1;
    filters.search = searchInput.value.trim();
    filters.status = statusSel.value;
    filters.priority = prioSel.value;
    filters.area = areaSel.value;
    filters.assigned_to = assignedSel.value;
    filters.date_from = fromInput.value;
    filters.date_to = toInput.value;
    
    // Guardar filtros en la URL para que sean compartibles
    setFilterInUrl('search', filters.search);
    setFilterInUrl('status', filters.status);
    setFilterInUrl('priority', filters.priority);
    setFilterInUrl('area', filters.area);
    setFilterInUrl('assigned_to', filters.assigned_to);
    setFilterInUrl('date_from', filters.date_from);
    setFilterInUrl('date_to', filters.date_to);
    setFilterInUrl('page', filters.page);
    
    render();
  }

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

  async function render() {
    // Estado de carga: pintamos skeleton y vaciamos paginación.
    ensureDataList();
    dataList.update({ loading: true, items: [] });
    pagWrap.innerHTML = '';
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) { if (v) params.set(k, v); }
      const data = await api.tickets.list(Object.fromEntries(params));
      state.result = data;
      renderQuickFilters();
      draw();
    } catch (e) {
      // En error, mostramos el mensaje dentro del listWrap (no del tableWrap antiguo).
      listWrap.innerHTML = '';
      listWrap.appendChild(h('div.card.p-6.text-center.text-sm.text-red-600', {}, escapeHtml(e.message)));
    }
  }

  // Crea el data-list la primera vez. En repaints, update() reusa la misma
  // instancia y mantiene el listener de matchMedia.
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

  function draw() {
    const { tickets, total, page, limit } = state.result;
    currentTickets = tickets;
    currentTotal = total;
    currentPage = page;
    currentLimit = limit;

    ensureDataList();
    dataList.update({ loading: false, items: tickets });

    // Si estamos en desktop, enganchamos los handlers de click/teclado en
    // las filas que mountDataList acaba de inyectar.
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(max-width: 767.95px)').matches) {
      // Doble rAF: primero el repaint del data-list, luego enganchamos.
      requestAnimationFrame(() => requestAnimationFrame(wireTableRows));
    }

    if (tickets.length === 0) {
      pagWrap.innerHTML = '';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    pagWrap.innerHTML = `
      <div>Mostrando <span class="font-medium">${tickets.length}</span> de <span class="font-medium">${total}</span></div>
      <div class="flex items-center gap-2">
        <button class="btn btn-secondary btn-sm" id="prev" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span>Página ${page} de ${totalPages}</span>
        <button class="btn btn-secondary btn-sm" id="next" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
      </div>
    `;
    pagWrap.querySelector('#prev')?.addEventListener('click', () => apply(page - 1));
    pagWrap.querySelector('#next')?.addEventListener('click', () => apply(page + 1));
    
    // Actualizar chips de filtros activos
    filtersChipsWrap.innerHTML = '';
    const chips = activeFiltersChips(filters, (filterKey) => {
      // Limpiar filtro individual
      filters[filterKey] = '';
      const inputMap = {
        'search': searchInput,
        'status': statusSel,
        'priority': prioSel,
        'area': areaSel,
        'assigned_to': assignedSel,
        'date_from': fromInput,
        'date_to': toInput,
      };
      if (inputMap[filterKey]) inputMap[filterKey].value = '';
      setFilterInUrl(filterKey, '');
      apply(1);
    });
    if (chips) filtersChipsWrap.appendChild(chips);
  }

  async function doExport() {
    const setBusy = (busy, labelText = 'Exportar Excel') => {
      if (!exportBtn) return;
      exportBtn.disabled = busy;
      const label = exportBtn.querySelector('span');
      if (label) label.textContent = labelText;
    };
    try {
      setBusy(true, 'Verificando…');
      await passwordConfirmModal({
        title: 'Confirmar exportación',
        message: 'Ingresa tu contraseña para exportar los datos de los tickets.',
        confirmText: 'Exportar',
        onConfirm: async (password) => {
          await api.auth.verifyPassword({ password });
        },
      });
      setBusy(true, 'Exportando…');
      const rows = await fetchAllForExport(filters);
      if (!rows.length) {
        toast('No hay tickets para exportar con los filtros actuales.', 'info');
        return;
      }
      exportToExcel(rows, `tickets-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast(`Exportadas ${rows.length} filas a Excel.`, 'success');
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

  // ── Tiempo real: refrescar la tabla cuando algo cambia ─────────────────────
  const evs = ['ticket:created', 'ticket:updated', 'ticket:assigned',
               'ticket:status_changed', 'ticket:commented', 'attachment:added'];
  const ac = new AbortController();
  window.addEventListener('gcm:realtime', (e) => {
    if (evs.includes(e.detail?.event)) render();
  }, { signal: ac.signal });

  return { view: root, cleanup: () => ac.abort() };
}

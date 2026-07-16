import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { formatDateTime } from '../utils/format.js';
import { emptyState } from '../components/empty-state.js';
import { setFilterInUrl, clearFiltersInUrl } from '../utils/url-filters.js';
import { activeFiltersChips } from '../components/active-filters-chips.js';

const spinnerHtml = '<svg class="animate-spin w-5 h-5 text-brand-navy" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>';

function formatActionType(actionType) {
  const labels = {
    ticket_created:       'Ticket creado',
    ticket_assigned:      'Ticket asignado',
    ticket_status_changed: 'Estado cambiado',
    comment_added:        'Comentario añadido',
    attachment_added:     'Archivo subido',
    user_created:         'Usuario creado',
    user_modified:        'Usuario modificado',
    user_deleted:         'Usuario eliminado',
    category_created:     'Categoría creada',
    category_modified:    'Categoría modificada',
    category_deleted:     'Categoría eliminada',
  };
  return labels[actionType] || actionType;
}

function badgeColor(actionType) {
  const colors = {
    ticket_created:       'bg-blue-100 text-blue-700',
    ticket_assigned:      'bg-purple-100 text-purple-700',
    ticket_status_changed: 'bg-amber-100 text-amber-700',
    comment_added:        'bg-emerald-100 text-emerald-700',
    attachment_added:     'bg-cyan-100 text-cyan-700',
    user_created:         'bg-indigo-100 text-indigo-700',
    user_modified:        'bg-yellow-100 text-yellow-700',
    user_deleted:         'bg-red-100 text-red-700',
    category_created:     'bg-lime-100 text-lime-700',
    category_modified:    'bg-pink-100 text-pink-700',
    category_deleted:     'bg-rose-100 text-rose-700',
  };
  return colors[actionType] || 'bg-slate-100 text-slate-700';
}

export async function renderAudit({ query, user }) {
  const root = h('div.space-y-6', {});

  // ── Header ────────────────────────────────────────────────────────────
  root.appendChild(h('div', {}, [
    h('h1.text-3xl.font-bold.text-brand-ink', {}, 'Bitácora de Auditoría'),
    h('p.text-sm.text-slate-500.mt-2', {}, 'Registro completo de todas las acciones realizadas en el sistema. Filtra por usuario, tipo de acción y rango de fechas.'),
  ]));

  // ── Filtros ───────────────────────────────────────────────────────────
  const filterCard = h('div.card.bg-white.rounded-xl.border.border-surface-border.p-5', {});

  // Filtros con valores iniciales de URL
  const filters = {
    search: query?.search || '',
    user_id: query?.user_id || '',
    action_type: query?.action_type || '',
    date_from: query?.date_from || '',
    date_to: query?.date_to || '',
  };

  const search = h('input.input', {
    type: 'search',
    placeholder: 'Buscar por código o descripción…',
    value: filters.search,
  });

  const userSelect = h('select.input', {}, [
    h('option', { value: '' }, '— Todos los usuarios —'),
  ]);
  userSelect.value = filters.user_id;

  const actionSelect = h('select.input', {}, [
    h('option', { value: '' }, '— Todos los tipos —'),
  ]);
  actionSelect.value = filters.action_type;

  const dateFrom = h('input.input', { type: 'date', value: filters.date_from });
  const dateTo = h('input.input', { type: 'date', value: filters.date_to });
  const applyBtn = h('button.btn.btn-primary', {}, 'Aplicar');
  const clearBtn = h('button.btn.btn-secondary', {}, 'Limpiar');

  filterCard.appendChild(h('div.grid.grid-cols-1.md:grid-cols-2.lg:grid-cols-3.gap-4', {}, [
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Búsqueda'), search]),
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Usuario'), userSelect]),
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Tipo de acción'), actionSelect]),
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Desde'), dateFrom]),
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Hasta'), dateTo]),
  ]));

  filterCard.appendChild(h('div.flex.gap-2.mt-4.flex-wrap', {}, [applyBtn, clearBtn]));
  root.appendChild(filterCard);

  // Mostrar filtros activos como chips
  const filtersChipsWrap = h('div.flex.gap-2.items-center.flex-wrap', {});
  root.appendChild(filtersChipsWrap);

  // ── KPI Cards ─────────────────────────────────────────────────────────
  const kpiContainer = h('div.grid.grid-cols-1.md:grid-cols-3.gap-4', {});
  root.appendChild(kpiContainer);

  // ── Tabla ─────────────────────────────────────────────────────────────
  const tableContainer = h('div', {});
  root.appendChild(tableContainer);

  // Helpers
  function renderKpis(data = {}) {
    kpiContainer.innerHTML = '';

    const cards = [
      { label: 'Total de acciones', value: data.total || 0 },
      { label: 'Tipo más frecuente', value: formatActionType(data.mostFrequentAction || '—') },
      { label: 'Usuarios activos', value: data.activeUserCount || 0 },
    ];

    cards.forEach(({ label, value }) => {
      kpiContainer.appendChild(h('div.card.bg-white.rounded-xl.border.border-surface-border.p-5', {}, [
        h('div.text-xs.font-semibold.text-slate-500.uppercase.tracking-wide.mb-3', {}, label),
        h('div.text-3xl.font-bold.text-brand-navy', {}, value),
      ]));
    });
  }

  function renderTable(records = []) {
    tableContainer.innerHTML = '';

    if (!records || records.length === 0) {
      tableContainer.appendChild(emptyState({
        icon: 'search',
        title: 'Sin registros',
        message: 'No se encontraron acciones con los filtros aplicados. Intenta modificar los criterios de búsqueda.',
      }));
      return;
    }

    const table = h('div.card.bg-white.rounded-xl.border.border-surface-border.overflow-hidden', {}, [
      h('div.overflow-x-auto', {}, [
        h('table.w-full.text-sm', {}, [
          h('thead.bg-slate-50.border-b.border-surface-border', {}, [
            h('tr', {}, [
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Fecha y hora'),
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Usuario'),
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Acción'),
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Ticket'),
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Descripción'),
            ]),
          ]),
          h('tbody.divide-y.divide-surface-border', {}, records.map((record) =>
            h('tr.hover:bg-slate-50.transition-colors.duration-150', {}, [
              h('td.px-5.py-3.text-slate-600.text-xs.font-mono', {}, formatDateTime(record.created_at)),
              h('td.px-5.py-3.text-slate-800.font-medium.text-sm', {}, record.user_name || '—'),
              h('td.px-5.py-3', {}, [
                h(`span.inline-flex.items-center.px-2.py-1.rounded-full.text-xs.font-medium.${badgeColor(record.action_type)}`, {},
                  formatActionType(record.action_type)
                )
              ]),
              h('td.px-5.py-3.text-brand-navy.font-mono.text-xs.font-medium', {}, record.target_code ? `#${record.target_code}` : '—'),
              h('td.px-5.py-3.text-slate-700.text-xs.max-w-sm', { title: record.description, style: 'max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' },
                record.description || '—'
              ),
            ])
          )),
        ]),
      ]),
    ]);

    tableContainer.appendChild(table);
  }

  async function loadAudit() {
    tableContainer.innerHTML = `
      <div class="card bg-white rounded-xl border border-surface-border flex items-center justify-center gap-3 py-12 text-slate-600">
        ${spinnerHtml}
        <span class="text-sm">Cargando auditoría…</span>
      </div>
    `;
    kpiContainer.innerHTML = '';

    try {
      // Actualizar objeto de filtros
      filters.search = search.value.trim();
      filters.user_id = userSelect.value;
      filters.action_type = actionSelect.value;
      filters.date_from = dateFrom.value;
      filters.date_to = dateTo.value;

      // Guardar filtros en URL
      setFilterInUrl('search', filters.search);
      setFilterInUrl('user_id', filters.user_id);
      setFilterInUrl('action_type', filters.action_type);
      setFilterInUrl('date_from', filters.date_from);
      setFilterInUrl('date_to', filters.date_to);

      const params = {
        search: filters.search,
        user_id: filters.user_id,
        action_type: filters.action_type,
        date_from: filters.date_from,
        date_to: filters.date_to,
        page: 1,
        limit: 100,
      };

      Object.keys(params).forEach(k => !params[k] && delete params[k]);

      const result = await api.audit.list(params);

      renderKpis({
        total: result.total || 0,
        mostFrequentAction: result.mostFrequentAction || '',
        activeUserCount: result.activeUserCount || 0,
      });

      renderTable(result.data || []);

      // Actualizar chips de filtros activos
      filtersChipsWrap.innerHTML = '';
      const chips = activeFiltersChips(filters, (filterKey) => {
        filters[filterKey] = '';
        const inputMap = {
          'search': search,
          'user_id': userSelect,
          'action_type': actionSelect,
          'date_from': dateFrom,
          'date_to': dateTo,
        };
        if (inputMap[filterKey]) inputMap[filterKey].value = '';
        setFilterInUrl(filterKey, '');
        loadAudit();
      });
      if (chips) filtersChipsWrap.appendChild(chips);
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="card bg-red-50 border border-red-200 rounded-xl p-5 text-red-800">
          <h3 class="font-semibold text-sm mb-2">Error al cargar auditoría</h3>
          <p class="text-xs">${escapeHtml(err.message || 'No se pudo cargar el registro. Intenta de nuevo.')}</p>
        </div>
      `;
    }
  }

  function clearFilters() {
    clearFiltersInUrl();
    search.value = '';
    userSelect.value = '';
    actionSelect.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    Object.assign(filters, { search: '', user_id: '', action_type: '', date_from: '', date_to: '' });
    filtersChipsWrap.innerHTML = '';
    loadAudit();
  }

  // Inicializar filtros
  async function initializeFilters() {
    try {
      // Cargar usuarios: primero intenta audit.activeUsers(), luego api.users.list()
      let users = [];
      try {
        const activeUsersResult = await api.audit.activeUsers();
        users = activeUsersResult || [];
      } catch (e) {
        // Fallback: cargar desde api.users.list()
        const usersResult = await api.users.list({ active: true });
        users = usersResult?.users || [];
      }

      // Cargar tipos de acción
      let actions = [];
      try {
        actions = await api.audit.actionTypes() || [];
      } catch (e) {
        // Fallback: usar tipos conocidos
        actions = ['ticket_created', 'ticket_assigned', 'ticket_status_changed', 'comment_added', 'attachment_added', 'user_created', 'user_modified', 'user_deleted', 'category_created', 'category_modified', 'category_deleted'];
      }

      // Poblar select de usuarios
      if (users && users.length > 0) {
        users
          .sort((a, b) => (a.full_name || a.name || '').localeCompare(b.full_name || b.name || ''))
          .forEach(u => {
            userSelect.appendChild(h('option', { value: u.id }, u.full_name || u.name || u.username));
          });
      }

      // Poblar select de tipos de acción
      if (actions && actions.length > 0) {
        actions.forEach(a => {
          actionSelect.appendChild(h('option', { value: a }, formatActionType(a)));
        });
      }

      // Restaurar valores de URL si existen
      if (filters.user_id) userSelect.value = filters.user_id;
      if (filters.action_type) actionSelect.value = filters.action_type;

      await loadAudit();
    } catch (err) {
      console.error('Error inicializando filtros de auditoría:', err);
      tableContainer.innerHTML = `
        <div class="card bg-red-50 border border-red-200 rounded-xl p-5 text-red-800">
          <h3 class="font-semibold text-sm mb-2">Error al cargar datos</h3>
          <p class="text-xs">${escapeHtml(err.message || 'No se pudieron cargar los usuarios y tipos de acción.')}</p>
        </div>
      `;
    }
  }

  // Event listeners
  applyBtn.addEventListener('click', loadAudit);
  clearBtn.addEventListener('click', clearFilters);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault(), loadAudit();
  });
  userSelect.addEventListener('change', loadAudit);
  actionSelect.addEventListener('change', loadAudit);
  dateFrom.addEventListener('change', loadAudit);
  dateTo.addEventListener('change', loadAudit);

  initializeFilters();

  return { view: root };
}


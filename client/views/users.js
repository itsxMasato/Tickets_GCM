/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { api, assetUrl } from '../api.js';
import { go } from '../router.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal, passwordConfirmModal } from '../components/modal.js';
import { verifyCurrentPassword } from '../firebase.js';
import { AREA_LABEL, relativeFromNow, formatDateTime } from '../utils/format.js';
import { getRoleLabel } from '../utils/role-labels.js';
import { ROLES, AREAS } from '../utils/permissions.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { mountDataList } from '../components/data-list.js';
import { exportToExcel, exportListToPDF } from '../utils/exports.js';
import { exportButton } from '../components/export-button.js';
import { ICON, svg } from '../utils/icons.js';
import { renderAvatar, avatarColor, initials } from '../utils/avatar.js';

const AUTO_EMAIL_DOMAIN = 'gcm.com';

function usernameToLocalPart(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

const TABLE_COLUMNS = [
  { key: 'username',   label: 'Usuario' },
  { key: 'role',       label: 'Rol / Área' },
  { key: 'created_at', label: 'Creado' },
  { key: 'active',     label: 'Estado', align: 'center' },
  { key: 'actions',    label: '' },
];

const PAGE_SIZE = 10;

const ROLE_BADGE_TONE = {
  sac:              'bg-brand text-white',
  admin_area:       'bg-brand-ocean/15 text-brand-ocean',
  jefe_inmediato:   'bg-brand-deep/15 text-brand-deep',
  supervisor_campo: 'bg-slate-100 text-slate-700',
};
const ROLE_DOT_COLOR = {
  sac:              'bg-brand',
  admin_area:       'bg-brand-ocean',
  jefe_inmediato:   'bg-brand-deep',
  supervisor_campo: 'bg-slate-400',
};

function isUserActive(value) {
  return value === 0 || value === false || value === '0' || value === 'false' ? false : true;
}

function kpiCard({ label, value, hint = '', icon = null, tone = '' }) {
  const TONE = {
    '':     { border: 'border-l-4 border-l-surface-border-strong', icon: 'bg-surface-alt text-brand' },
    ocean:  { border: 'border-l-4 border-l-brand-ocean',           icon: 'bg-brand-ocean/10 text-brand-ocean' },
    good:   { border: 'border-l-4 border-l-emerald-500',           icon: 'bg-emerald-100 text-emerald-700' },
    warn:   { border: 'border-l-4 border-l-orange-500',            icon: 'bg-orange-100 text-orange-700' },
    accent: { border: 'border-l-4 border-l-accent',                icon: 'bg-accent/10 text-accent' },
  }[tone] || {};
  return h('div.card.flex.flex-col.gap-3', { class: TONE.border }, [
    icon ? h('div.w-9.h-9.rounded-lg.flex.items-center.justify-center', { class: TONE.icon }, [svg(h, icon, 'w-4 h-4')]) : null,
    h('div', {}, [
      h('div.text-2xl.font-bold.text-brand-ink', {}, String(value ?? 0)),
      h('div.text-xs.uppercase.tracking-wider.text-slate-500.font-medium', {}, label),
    ]),
    hint ? h('div.text-xs.text-slate-500', {}, hint) : null,
  ]);
}

export async function renderUsers({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  let exportBtn;
  root.appendChild(h('div.flex.flex-col.justify-between.gap-4', { class: 'md:flex-row md:items-end' }, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-brand.tracking-tight', { class: 'md:text-3xl' }, 'Gestión de usuarios'),
      h('p.text-sm.text-slate-500.mt-1', {}, 'Administra el personal, permisos de acceso y estados de servicio.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
      h('button.btn.btn-secondary', { onclick: () => filtersBar.classList.toggle('hidden') }, [svg(h, ICON.search, 'w-4 h-4'), h('span', {}, 'Filtrar')]),
      exportBtn = exportButton({ label: 'Exportar', kind: 'secondary', onExport: (format) => doExportUsers(format) }),
      h('button.btn.btn-primary', { onclick: () => openEditModal(null, reload, user) }, [svg(h, ICON.plus, 'w-4 h-4'), h('span', {}, 'Nuevo usuario')]),
    ]),
  ]));

  const kpis = h('div.grid.grid-cols-2.gap-3', { class: 'md:grid-cols-4' });
  root.appendChild(kpis);

  const searchInput = h('input.input', { type: 'search', placeholder: 'Buscar por nombre, usuario o correo…' });
  const roleSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los roles'), ...ROLES.map((r) => h('option', { value: r }, getRoleLabel(r)))]);
  const areaSel = h('select.input', {}, [h('option', { value: '' }, 'Todas las áreas'), ...AREAS.map((a) => h('option', { value: a }, AREA_LABEL[a]))]);
  const statusSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los estados'), h('option', { value: '1' }, 'Activo'), h('option', { value: '0' }, 'Inactivo')]);
  const filtersBar = h('div.card.grid.grid-cols-1.gap-4.items-end.hidden', { class: 'sm:grid-cols-2 lg:grid-cols-5' }, [
    h('div.space-y-1', { class: 'lg:col-span-2' }, [h('label.label', {}, 'Búsqueda'), searchInput]),
    h('div.space-y-1', {}, [h('label.label', {}, 'Rol'), roleSel]),
    h('div.space-y-1', {}, [h('label.label', {}, 'Área'), areaSel]),
    h('div.space-y-1', {}, [h('label.label', {}, 'Estado'), statusSel]),
  ]);
  root.appendChild(filtersBar);
  for (const el of [searchInput, roleSel, areaSel, statusSel]) {
    el.addEventListener('input', () => { currentPage = 1; draw(); });
  }

  const listWrap = h('div', {});
  const pagerInfo = h('div.text-xs.text-slate-500', {}, '');
  const pagerPageLabel = h('div.text-xs.text-slate-500.font-medium', {}, '');
  const prevBtn = h('button.btn-icon-sm', { 'aria-label': 'Página anterior', onclick: () => { if (currentPage > 1) { currentPage--; draw(); } } }, [svg(h, ICON.chevronL, 'w-4 h-4')]);
  const nextBtn = h('button.btn-icon-sm', { 'aria-label': 'Página siguiente', onclick: () => { currentPage++; draw(); } }, [svg(h, ICON.chevronR, 'w-4 h-4')]);
  const pager = h('div.px-4.py-3.bg-surface.flex.items-center.justify-between.gap-3.flex-wrap.rounded-b-xl', {}, [
    pagerInfo,
    h('div.flex.items-center.gap-2', {}, [prevBtn, pagerPageLabel, nextBtn]),
  ]);
  root.appendChild(h('div.card-tight.overflow-hidden', {}, [listWrap, pager]));

  const roleChipsWrap = h('div.flex.flex-wrap.gap-2.mt-1', {});
  const bentoSection = h('div.grid.grid-cols-1.gap-3', { class: 'md:grid-cols-3' }, [
    h('div.card.flex.flex-col.gap-3', { class: 'md:col-span-2' }, [
      h('h3.font-bold.text-brand-ink', {}, 'Distribución por rol'),
      h('p.text-sm.text-slate-500', {}, 'Cuántas cuentas tiene cada rol del sistema.'),
      roleChipsWrap,
    ]),
    h('div.card.flex.flex-col.gap-3.bg-brand.text-white', {}, [
      h('div.w-10.h-10.rounded-lg.flex.items-center.justify-center', { class: 'bg-white/15' }, [svg(h, ICON.shield, 'w-5 h-5')]),
      h('h3.font-bold', {}, 'Roles protegidos'),
      h('p.text-sm.leading-relaxed', { class: 'text-white/75' }, 'Los roles base del sistema no pueden reasignarse por accidente — el último usuario con rol SAC activo no se puede desactivar ni degradar.'),
      h('button.mt-2.w-full.py-2.rounded-lg.font-medium.text-sm.transition', { class: 'bg-white/15 hover:bg-white/25', onclick: () => go('/roles') }, 'Revisar roles'),
    ]),
  ]);
  root.appendChild(bentoSection);

  let dataList = null;
  let allUsers = [];
  let currentPage = 1;

  function ensureDataList() {
    if (dataList) return;
    dataList = mountDataList({
      wrapper: listWrap,
      columns: TABLE_COLUMNS,
      renderRow: tableRow,
      renderMobileCard,
      emptyState: emptyState({ ...EMPTY_STATES.users, className: 'py-10' }),
      onMatchMediaChange(isMobile) { if (!isMobile) wireTableRows(); },
    });
  }

  function wireTableRows() {
    const rows = listWrap.querySelectorAll('tr[data-id]');
    rows.forEach((tr) => {
      const id = tr.dataset.id;
      tr.addEventListener('click', () => onEdit(+id));
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(+id); }
      });
      const editBtn = tr.querySelector('[data-edit]');
      if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); onEdit(+id); });
      const toggleBtn = tr.querySelector('[data-toggle]');
      if (toggleBtn) toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(+id); });
      const rolesBtn = tr.querySelector('[data-roles]');
      if (rolesBtn) rolesBtn.addEventListener('click', (e) => { e.stopPropagation(); go('/roles'); });
    });
  }

  async function onEdit(id) {
    try {
      const res = await api.users.get(id);
      openEditModal(res.user, reload, user);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function onToggle(id) {
    const u = allUsers.find((x) => x.id === id);
    if (!u) return;
    const isActive = isUserActive(u.active);
    confirmModal({
      title: isActive ? 'Desactivar usuario' : 'Activar usuario',
      message: `¿${isActive ? 'Desactivar' : 'Activar'} a <b>${escapeHtml(u.full_name)}</b>?`,
      confirmText: isActive ? 'Desactivar' : 'Activar',
      onConfirm: async () => {
        try { await api.users.update(id, { active: !isActive }); toast('Usuario actualizado', 'success'); reload(); } catch (e) { toast(e.message, 'error'); }
      },
    });
  }

  function statusToggleHtml(u) {
    const active = isUserActive(u.active);
    return `
      <div class="flex items-center justify-center gap-2">
        <button type="button" data-toggle role="switch" aria-checked="${active}" aria-label="${active ? 'Desactivar' : 'Activar'} usuario"
          class="relative inline-flex items-center w-9 h-5 rounded-full transition-colors flex-none ${active ? 'bg-brand' : 'bg-slate-300'}">
          <span class="inline-block w-4 h-4 bg-white rounded-full shadow-sm transition-transform" style="transform: translateX(${active ? '18px' : '2px'})"></span>
        </button>
        <span class="text-xs font-bold ${active ? 'text-brand' : 'text-slate-400'}">${active ? 'ACTIVO' : 'INACTIVO'}</span>
      </div>
    `;
  }

  function personCellHtml(u) {
    const avatarHtml = u.avatar_url
      ? `<img class="w-10 h-10 rounded-full object-cover flex-none" src="${escapeHtml(assetUrl(u.avatar_url))}" alt="">`
      : `<span class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-none" style="background-color:${avatarColor(u.id)}">${escapeHtml(initials(u.full_name))}</span>`;
    return `
      <div class="flex items-center gap-3">
        ${avatarHtml}
        <div class="min-w-0">
          <div class="font-semibold text-brand-ink truncate">${escapeHtml(u.full_name || '—')}</div>
          <div class="text-xs text-slate-500 truncate">${escapeHtml(u.email || `@${u.username}`)}</div>
        </div>
      </div>
    `;
  }

  function roleCellHtml(u) {
    const tone = ROLE_BADGE_TONE[u.role] || 'bg-slate-100 text-slate-700';
    return `
      <div class="flex flex-col gap-1">
        <span class="inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tone}">${escapeHtml(getRoleLabel(u.role))}</span>
        <span class="text-xs text-slate-500">${escapeHtml(AREA_LABEL[u.area] || 'Sin área')}</span>
      </div>
    `;
  }

  function tableRow(u) {
    return `
      <tr class="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-ocean/60 focus:ring-inset" data-id="${escapeHtml(String(u.id))}" tabindex="0" role="link" aria-label="Editar ${escapeHtml(u.full_name || u.username)}">
        <td>${personCellHtml(u)}</td>
        <td>${roleCellHtml(u)}</td>
        <td class="text-xs text-slate-500 whitespace-nowrap" title="${escapeHtml(formatDateTime(u.created_at))}">${escapeHtml(relativeFromNow(u.created_at) || '—')}</td>
        <td class="text-center">${statusToggleHtml(u)}</td>
        <td class="text-right whitespace-nowrap">
          <button class="btn-icon-sm" data-edit title="Editar" aria-label="Editar usuario">${svg(h, ICON.edit, 'w-4 h-4').outerHTML}</button>
          <button class="btn-icon-sm" data-roles title="Ver roles y permisos" aria-label="Ver roles y permisos">${svg(h, ICON.shield, 'w-4 h-4').outerHTML}</button>
        </td>
      </tr>
    `;
  }

  function renderMobileCard(u) {
    const active = isUserActive(u.active);
    const tone = ROLE_BADGE_TONE[u.role] || 'bg-slate-100 text-slate-700';
    return h('button.card.text-left.flex.flex-col.gap-3.p-3.transition', {
      class: 'hover:border-brand-ocean hover:shadow-card focus:outline-none focus:ring-2 focus:ring-brand-ocean/60',
      onclick: () => onEdit(u.id),
      'aria-label': `Editar ${escapeHtml(u.full_name || u.username)}`,
    }, [
      h('div.flex.items-center.gap-3', {}, [
        renderAvatar(u, { className: 'w-10 h-10 rounded-full' }),
        h('div.min-w-0.flex-1', {}, [
          h('div.font-semibold.text-brand-ink.truncate', {}, escapeHtml(u.full_name || '—')),
          h('div.text-xs.text-slate-500.truncate', {}, escapeHtml(u.email || `@${u.username}`)),
        ]),
      ]),
      h('div.flex.items-center.justify-between.gap-2', {}, [
        h('span.px-2.rounded-full.font-bold.uppercase', { class: `py-0.5 text-[10px] ${tone}` }, escapeHtml(getRoleLabel(u.role))),
        h('span.text-xs.text-slate-500', {}, escapeHtml(AREA_LABEL[u.area] || 'Sin área')),
      ]),
      h('div.flex.items-center.justify-between.text-xs.text-slate-500', {}, [
        h('span', { title: escapeHtml(formatDateTime(u.created_at)) }, `Creado ${escapeHtml(relativeFromNow(u.created_at) || '—')}`),
        h('span.font-bold', { class: active ? 'text-brand' : 'text-slate-400' }, active ? 'ACTIVO' : 'INACTIVO'),
      ]),
      h('div.flex.items-center.gap-2.pt-1.border-t.border-surface-border', {}, [
        h('button.btn.btn-secondary.btn-sm.flex-1', { type: 'button', onclick: (e) => { e.stopPropagation(); onEdit(u.id); } }, 'Editar'),
        h('button.btn.btn-ghost.btn-sm.flex-1', {
          type: 'button',
          class: active ? 'text-accent hover:bg-accent/10' : '',
          onclick: (e) => { e.stopPropagation(); onToggle(u.id); },
        }, active ? 'Desactivar' : 'Activar'),
      ]),
    ]);
  }

  function getFiltered() {
    const q = searchInput.value.trim().toLowerCase();
    const role = roleSel.value;
    const area = areaSel.value;
    const status = statusSel.value;
    return allUsers.filter((u) => {
      if (q && !`${u.full_name} ${u.username} ${u.email || ''}`.toLowerCase().includes(q)) return false;
      if (role && u.role !== role) return false;
      if (area && u.area !== area) return false;
      if (status && String(isUserActive(u.active) ? 1 : 0) !== status) return false;
      return true;
    });
  }

  function drawKpis() {
    const total = allUsers.length;
    const active = allUsers.filter((u) => isUserActive(u.active)).length;
    const inactive = total - active;
    const sinArea = allUsers.filter((u) => !u.area).length;
    kpis.innerHTML = '';
    kpis.appendChild(kpiCard({ label: 'Total personal', value: total, icon: ICON.users, tone: '' }));
    kpis.appendChild(kpiCard({ label: 'Activos', value: active, hint: 'Cuentas habilitadas', icon: ICON.check, tone: 'good' }));
    kpis.appendChild(kpiCard({ label: 'Inactivos', value: inactive, hint: 'Cuentas deshabilitadas', icon: ICON.x, tone: 'accent' }));
    kpis.appendChild(kpiCard({ label: 'Sin área', value: sinArea, hint: 'Requieren asignación', icon: ICON.tag, tone: 'warn' }));
  }

  function drawRoleChips() {
    roleChipsWrap.innerHTML = '';
    ROLES.forEach((r) => {
      const count = allUsers.filter((u) => u.role === r).length;
      const chip = h('div.bg-surface.px-3.py-2.rounded-lg.border.border-surface-border.flex.items-center.gap-2', {}, [
        h('span.w-2.h-2.rounded-full.flex-none', { class: ROLE_DOT_COLOR[r] || 'bg-slate-400' }),
        h('div', {}, [
          h('div.text-sm.font-medium.text-brand-ink', {}, getRoleLabel(r)),
          h('div.text-xs.text-slate-500', {}, `${count} usuario${count === 1 ? '' : 's'}`),
        ]),
      ]);
      roleChipsWrap.appendChild(chip);
    });
  }

  function draw() {
    ensureDataList();
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    dataList.update({ loading: false, items: pageItems });
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(max-width: 767.95px)').matches) {
      requestAnimationFrame(() => requestAnimationFrame(wireTableRows));
    }

    const startIdx = filtered.length ? start + 1 : 0;
    const endIdx = Math.min(start + PAGE_SIZE, filtered.length);
    pagerInfo.textContent = filtered.length ? `Mostrando ${startIdx}–${endIdx} de ${filtered.length} usuarios` : 'Sin resultados para estos filtros.';
    pagerPageLabel.textContent = `Página ${currentPage} de ${totalPages}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  async function reload() {
    ensureDataList();
    dataList.update({ loading: true, items: [] });
    try {
      const { users } = await api.users.list();
      allUsers = users || [];
      currentPage = 1;
      drawKpis();
      drawRoleChips();
      draw();
    } catch (e) {
      dataList.update({ loading: false, items: [] });
      listWrap.innerHTML = `<div class="card p-8 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
  }

  async function doExportUsers(format) {
    const formatLabel = format === 'pdf' ? 'PDF' : 'Excel';
    const setBusy = (busy, label = 'Exportar') => {
      exportBtn.disabled = busy;
      exportBtn.setLabel(label);
    };
    try {
      setBusy(true, 'Verificando…');
      await passwordConfirmModal({
        title: 'Confirmar exportación',
        message: `Ingresa tu contraseña para exportar el listado de usuarios a ${formatLabel}.`,
        confirmText: 'Exportar',
        onConfirm: async (password) => { await verifyCurrentPassword(password); },
      });
      setBusy(true, 'Exportando…');
      const rows = getFiltered().map((u) => ({
        username: u.username,
        full_name: u.full_name,
        email: u.email || '',
        role: getRoleLabel(u.role),
        area: AREA_LABEL[u.area] || 'Sin área',
        active: isUserActive(u.active) ? 'Activo' : 'Inactivo',
        created_at: formatDateTime(u.created_at),
      }));
      if (!rows.length) { toast('No hay usuarios para exportar con los filtros actuales.', 'info'); return; }
      const columns = [
        { key: 'username', label: 'Usuario' },
        { key: 'full_name', label: 'Nombre' },
        { key: 'email', label: 'Correo' },
        { key: 'role', label: 'Rol' },
        { key: 'area', label: 'Área' },
        { key: 'active', label: 'Estado' },
        { key: 'created_at', label: 'Creado' },
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      const exportOpts = {
        columns,
        title: 'Listado de usuarios',
        subtitle: `${rows.length} usuario${rows.length === 1 ? '' : 's'} · filtros aplicados desde /users`,
        sheetName: 'Usuarios',
        summaryField: 'active',
        summaryLabel: 'Estado más frecuente',
        generatedByName: user.full_name || user.username,
        generatedByRole: getRoleLabel(user.role) || user.role,
      };
      if (format === 'pdf') {
        await exportListToPDF(rows, columns, `usuarios-${stamp}.pdf`, exportOpts);
      } else {
        await exportToExcel(rows, `usuarios-${stamp}.xlsx`, exportOpts);
      }
      toast(`Exportados ${rows.length} usuarios a ${formatLabel}.`, 'success');
    } catch (e) {
      if (e && e.message !== 'Modal closed') toast(e.message || 'Error al exportar', 'error');
    } finally {
      setBusy(false);
    }
  }

  await reload();

  const onRealtime = (e) => {
    const t = e.detail?.event;
    if (t === 'user:created' || t === 'user:updated' || t === 'user:deactivated') {
      reload();
    }
  };
  window.addEventListener('gcm:realtime', onRealtime);

  root._gcmCleanup = () => {
    window.removeEventListener('gcm:realtime', onRealtime);
  };

  return root;
}

const VALIDATION = {
  username: { min: 3, max: 50, pattern: /^[a-zA-Z0-9._-]+$/ },
  fullName: { max: 200 },
  email:    { max: 255, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  password: { min: 4, max: 200 },
};

function setFieldError(input, errorEl, message) {
  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorEl.id);
  } else {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
    input.removeAttribute('aria-invalid');
  }
}

function clearFieldError(input, errorEl) {
  setFieldError(input, errorEl, null);
}

async function openEditModal(u, onSaved, currentUser) {
  const isEdit = !!u;

  const username = h('input.input', {
    type: 'text',
    value: u?.username || '',
    maxlength: String(VALIDATION.username.max),
    disabled: isEdit,
  });
  const fullname = h('input.input', {
    type: 'text',
    value: u?.full_name || '',
    maxlength: String(VALIDATION.fullName.max),
    required: 'required',
  });
  const role = h('select.input', {},
    ROLES.map((r) => h('option', { value: r, selected: u?.role === r ? '' : null }, getRoleLabel(r)))
  );
  const area = h('select.input', { value: u?.area || '' }, [
    h('option', { value: '' }, '— Sin área —'),
    ...AREAS.map((a) => h('option', { value: a, selected: u?.area === a ? '' : null }, AREA_LABEL[a])),
  ]);
  let company = h('select.input', {}, [h('option', { value: '' }, 'Cargando empresas…')]);
  const companyErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-edit-company-err', role: 'alert' });
  let currentCompanyId = null;
  if (isEdit) {
    try {
      const memRes = await api.companies.members.userList(u.id);
      const memberships = memRes.memberships || [];
      const currentMembership = memberships.find((m) => m.active) || memberships[0] || null;
      currentCompanyId = currentMembership ? currentMembership.company_id : null;
    } catch (e) {
      currentCompanyId = null;
    }
  }
  try {
    const res = await api.companies.list();
    const comps = (res.companies || []).filter((c) => c.active);
    const opts = [h('option', { value: '' }, isEdit
      ? (currentCompanyId ? '— Sin cambios —' : '— Sin empresa asignada —')
      : '— Selecciona empresa —')];
    for (const c of comps) {
      const selected = currentCompanyId != null && String(currentCompanyId) === String(c.id);
      opts.push(h('option', { value: String(c.id), selected: selected ? '' : null }, c.name));
    }
    company = h('select.input', {}, opts);
  } catch (e) {
    company = h('select.input', {}, [h('option', { value: '' }, 'Error cargando empresas')]);
  }
  if (u?.area)
    area.value = u.area;
  function makePasswordInput(input) {
    const wrap = h('div.relative', {});
    const eyeBtn = h('button', {
      type: 'button',
      'aria-label': 'Mostrar contraseña',
      'aria-pressed': 'false',
      title: 'Mostrar / ocultar contraseña',
      class: 'absolute inset-y-0 right-0 flex items-center gap-1 rounded-r-md border-l border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-ocean/60',
      onclick: () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        eyeBtn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
        eyeBtn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
        eyeBtn.innerHTML = isHidden
          ? '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg><span class="sr-only">Mostrar</span>'
          : '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"></path><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path><path d="M9.88 5.08A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a20.7 20.7 0 0 1-4.07 5.03"></path><path d="M6.53 6.53A20.7 20.7 0 0 0 2 12s3.5 6 10 6a10.94 10.94 0 0 0 3.95-.83"></path></svg><span class="sr-only">Ocultar</span>';
      },
    }, [
      h('svg.w-4.h-4', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        h('path', { d: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z' }),
        h('circle', { cx: '12', cy: '12', r: '3' }),
      ]),
      h('span.sr-only', {}, 'Mostrar'),
    ]);
    input.classList.add('pr-20');
    wrap.appendChild(input);
    wrap.appendChild(eyeBtn);
    return wrap;
  }

  const password = h('input.input', {
    type: 'password',
    maxlength: String(VALIDATION.password.max),
    autocomplete: isEdit ? 'new-password' : 'new-password',
  });
  const passwordWithToggle = makePasswordInput(password);

  const email = h('input.input', {
    type: 'email',
    value: u?.email || '',
    maxlength: String(VALIDATION.email.max),
    readonly: isEdit ? null : 'readonly',
    tabindex: isEdit ? null : '0',
    'aria-readonly': isEdit ? null : 'true',
    autocomplete: 'off',
    spellcheck: 'false',
    class: isEdit ? '' : 'bg-slate-50 text-slate-600 cursor-default focus:ring-0',
  });
  const emailHelp = h('p.text-xs.text-slate-500.mt-1', {}, 'Se genera automáticamente como nombre+@gcm.com a partir del usuario.');
  const emailField = h('div', {}, [
    h('label.label', {}, 'Correo'),
    email,
    emailHelp,
  ]);

  const usernameErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-edit-username-err', role: 'alert' });
  const fullnameErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-edit-fullname-err', role: 'alert' });
  const roleErr     = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-edit-role-err',     role: 'alert' });
  const passwordErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-edit-password-err', role: 'alert' });

  const usernameField = h('div', {}, [
    h('label.label', {}, 'Usuario *'),
    username,
    h('p.text-xs.text-slate-500.mt-1', {}, 'Letras, dígitos, puntos, guiones y guiones bajos. No se puede cambiar.'),
    usernameErr,
  ]);
  const fullnameField = h('div', {}, [
    h('label.label', {}, 'Nombre completo *'),
    fullname,
    fullnameErr,
  ]);
  const roleField = h('div', {}, [
    h('label.label', {}, 'Rol *'),
    role,
    roleErr,
  ]);
  const areaField = h('div', {}, [
    h('label.label', {}, 'Área'),
    area,
  ]);

  const canTogglePlatformAdmin = isEdit && currentUser?.isPlatformAdmin;
  const platformAdminCheckbox = canTogglePlatformAdmin
    ? h('input', { type: 'checkbox', checked: !!u?.is_platform_admin || undefined, class: 'w-4 h-4 rounded border-slate-300' })
    : null;
  const platformAdminField = canTogglePlatformAdmin
    ? h('div', {}, [
        h('label.flex.items-center.gap-2.text-sm.font-medium.text-brand-ink', {}, [
          platformAdminCheckbox,
          'Administrador de plataforma',
        ]),
        h('p.text-xs.text-slate-500.mt-1', {}, 'Ve y administra todas las empresas, sin importar su rol. No se puede quitar al único administrador de plataforma activo.'),
      ])
    : null;
  const passwordField = h('div', {}, [
    h('label.label', {}, isEdit ? 'Nueva contraseña — opcional' : 'Contraseña *'),
    passwordWithToggle,
    h('p.text-xs.text-slate-500.mt-1', {}, isEdit
      ? 'Déjala en blanco para mantener la contraseña actual. Usa el ojo para ver lo que escribes.'
      : `Mínimo ${VALIDATION.password.min} caracteres. Usa el ojo para ver lo que escribes.`),
    passwordErr,
  ]);

  const banner = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', {
    role: 'alert',
  });

  const body = h('div.flex.flex-col.gap-3', {}, [
    usernameField,
    fullnameField,
    isEdit ? null : emailField,
    h('div.grid.grid-cols-2.gap-3', {}, [roleField, areaField]),
    platformAdminField,
    h('div', {}, [
      h('label.label', {}, isEdit ? 'Empresa' : 'Empresa *'),
      company,
      companyErr,
      isEdit ? h('p.text-xs.text-slate-500.mt-1', {}, 'Dejalo en "Sin cambios" si no querés modificarla. Útil para asignar empresa a usuarios creados antes de este cambio.') : null,
    ]),
    passwordField,
    banner,
  ]);

  const wireClear = (input, errorEl) => {
    const ev = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(ev, () => clearFieldError(input, errorEl));
  };
  wireClear(username, usernameErr);
  wireClear(fullname, fullnameErr);
  wireClear(role, roleErr);
  if (company) wireClear(company, companyErr);
  wireClear(password, passwordErr);

  if (!isEdit) {
    username.addEventListener('input', () => {
      const local = usernameToLocalPart(username.value);
      email.value = local ? `${local}@${AUTO_EMAIL_DOMAIN}` : '';
    });
  }

  function validate() {
    const fullnameVal = fullname.value.trim();
    const roleVal = role.value;
    const passwordVal = password.value;
    let firstInvalid = null;

    if (!isEdit) {
      const usernameVal = username.value.trim();
      if (!usernameVal) {
        setFieldError(username, usernameErr, 'El usuario es obligatorio.');
        firstInvalid = firstInvalid || username;
      } else if (usernameVal.length < VALIDATION.username.min) {
        setFieldError(username, usernameErr, `Mínimo ${VALIDATION.username.min} caracteres.`);
        firstInvalid = firstInvalid || username;
      } else if (usernameVal.length > VALIDATION.username.max) {
        setFieldError(username, usernameErr, `Máximo ${VALIDATION.username.max} caracteres.`);
        firstInvalid = firstInvalid || username;
      } else if (!VALIDATION.username.pattern.test(usernameVal)) {
        setFieldError(username, usernameErr, 'Sólo letras, dígitos, puntos, guiones y guiones bajos.');
        firstInvalid = firstInvalid || username;
      }
    }

    if (!fullnameVal) {
      setFieldError(fullname, fullnameErr, 'El nombre completo es obligatorio.');
      firstInvalid = firstInvalid || fullname;
    } else if (fullnameVal.length > VALIDATION.fullName.max) {
      setFieldError(fullname, fullnameErr, `Máximo ${VALIDATION.fullName.max} caracteres.`);
      firstInvalid = firstInvalid || fullname;
    }

    if (!ROLES.includes(roleVal)) {
      setFieldError(role, roleErr, 'Selecciona un rol.');
      firstInvalid = firstInvalid || role;
    }

    if (passwordVal) {
      if (passwordVal.length < VALIDATION.password.min) {
        setFieldError(password, passwordErr, `La contraseña debe tener al menos ${VALIDATION.password.min} caracteres.`);
        firstInvalid = firstInvalid || password;
      } else if (passwordVal.length > VALIDATION.password.max) {
        setFieldError(password, passwordErr, `La contraseña no puede superar los ${VALIDATION.password.max} caracteres.`);
        firstInvalid = firstInvalid || password;
      }
    } else if (!isEdit) {
      setFieldError(password, passwordErr, 'La contraseña es obligatoria al crear un usuario.');
      firstInvalid = firstInvalid || password;
    }

    if (!isEdit) {
      if (!company || !company.value) {
        setFieldError(company, companyErr, 'Selecciona una empresa.');
        firstInvalid = firstInvalid || company;
      }
    }

    let emailVal = null;
    if (!isEdit) {
      const local = usernameToLocalPart(username.value.trim());
      emailVal = local ? `${local}@${AUTO_EMAIL_DOMAIN}` : null;
    }

    if (firstInvalid) return { ok: false, firstInvalid };

    const payload = isEdit
      ? {
          full_name: fullnameVal,
          role: roleVal,
          area: area.value || null,
          ...(company && company.value ? { company_id: Number(company.value) } : {}),
          ...(platformAdminCheckbox ? { is_platform_admin: platformAdminCheckbox.checked } : {}),
        }
      : {
          username: username.value.trim(),
          full_name: fullnameVal,
          role: roleVal,
          area: area.value || null,
          password: passwordVal,
          email: emailVal,
          company_id: company ? (company.value ? Number(company.value) : null) : null,
        };
    if (isEdit && passwordVal) payload.password = passwordVal;
    return { ok: true, payload };
  }

  function showBanner(message) {
    banner.textContent = message;
    banner.classList.remove('hidden');
  }
  function hideBanner() {
    banner.textContent = '';
    banner.classList.add('hidden');
  }

  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close, type: 'button' }, 'Cancelar'),
    h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      [usernameErr, fullnameErr, roleErr, passwordErr].forEach((el) => el.classList.add('hidden'));
      hideBanner();
      const v = validate();
      if (!v.ok) {
        v.firstInvalid.focus();
        return;
      }
      try {
        if (isEdit) {
          await api.users.update(u.id, v.payload);
          toast('Usuario actualizado', 'success');
        } else {
          await api.users.create(v.payload);
          toast('Usuario creado', 'success');
        }
        close(); onSaved?.();
      } catch (e) {
        showBanner(e.message || 'No se pudo guardar el usuario.');
      }
    } }, 'Guardar'),
  ];
  openModal({ title: isEdit ? 'Editar usuario' : 'Nuevo usuario', body, actions });
}


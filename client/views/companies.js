/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal, passwordConfirmModal } from '../components/modal.js';
import { verifyCurrentPassword } from '../firebase.js';
import { emptyState } from '../components/empty-state.js';
import { usersCache } from '../utils/users-cache.js';
import { canManageCompanies, ROLES } from '../utils/permissions.js';
import { ICON, svg } from '../utils/icons.js';
import { getRoleLabel } from '../utils/role-labels.js';
import { avatarColor, initials } from '../utils/avatar.js';
import { exportButton } from '../components/export-button.js';
import { exportToExcel, exportListToPDF } from '../utils/exports.js';

// ── Límites espejo del backend (services/companies + memberships) ──
// El cliente valida para feedback inmediato, pero el backend es la fuente de verdad.
const LIMITS = {
  company: { name: { max: 200 }, slug: { max: 50 }, logo: { max: 500 }, color: { max: 20 }, codePrefix: { max: 6 } },
};

// Espejo de CODE_PREFIX_RE en services/companies.service.js
const CODE_PREFIX_RE = /^[A-Z0-9]{1,6}$/;

// Roles canónicos: misma fuente que el resto de las vistas
// (users.js, roles.js, dashboard.js). Defensa: si por error de import ROLES
// viniera vacío, caemos a la lista cruda que coincide con validators.ROLES.
const ROLES_FALLBACK = (Array.isArray(ROLES) && ROLES.length)
  ? ROLES
  : ['supervisor_campo', 'sac', 'admin_area', 'jefe_inmediato'];

// ── Estado interno ──────────────────────────────────────────────────────────
// Empresas cargadas del backend (lo que ve el requester — ya filtrado por
// membresía si no es platform admin en companies.service.js:list).
let companies = [];
let selectedId = null;           // empresa seleccionada para abrir el modal
let activeDetailModal = null;    // instancia activa del modal de detalle
let membersByCompany = new Map(); // companyId -> [membresías]
let loadedAt = null;
let loading = false;

// ── Helpers ────────────────────────────────────────────────────────────────
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
function clearFieldError(input, errorEl) { setFieldError(input, errorEl, null); }

// Convierte un color hex "#0F2A47" en un dot con ese color. Si es null,
// usa el fallback del brand.
function colorDot(color) {
  const safe = (color && /^#[0-9A-Fa-f]{3,8}$/.test(color)) ? color : '#0b1e3a';
  return h('span.inline-block.w-3.h-3.rounded-full.flex-none', {
    style: { backgroundColor: safe },
    'aria-hidden': 'true',
  });
}

// ── Carga ──────────────────────────────────────────────────────────────────
async function loadCompanies() {
  const res = await api.companies.list({ all: true });
  companies = res.companies || [];
  loadedAt = new Date();
  // Limpiar caches de detalle: si una empresa fue eliminada, soltar su sub-data.
  const liveIds = new Set(companies.map((c) => c.id));
  for (const id of [...membersByCompany.keys()]) {
    if (!liveIds.has(id)) membersByCompany.delete(id);
  }
  if (selectedId && !liveIds.has(selectedId)) selectedId = null;
}

async function loadMembers(companyId) {
  const res = await api.companies.members.list(companyId);
  membersByCompany.set(companyId, res.memberships || []);
}

async function ensureDetail(companyId) {
  if (!membersByCompany.has(companyId)) await loadMembers(companyId);
}

// Encargado de cuenta (responsible_user_id) resuelto contra el cache de
// usuarios ya cargado — no es un objeto embebido en la respuesta de
// companies.list(), sólo el FK.
function responsibleUser(company) {
  if (!company?.responsible_user_id) return null;
  return usersCache.get().find((u) => String(u.id) === String(company.responsible_user_id)) || null;
}

// ── Render principal ───────────────────────────────────────────────────────
export async function renderCompanies({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  const canManage = canManageCompanies(user);
  let exportBtn;

  // Header
  const headerRight = canManage
    ? h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => openCompanyModal(null, reloadAll),
      }, [
        svg(h, ICON.plus, 'w-4 h-4'),
        h('span', {}, 'Nueva empresa'),
      ])
    : h('span.badge.bg-slate-100.text-slate-700', {}, 'Solo administrador de plataforma');

  root.appendChild(h('div.flex.flex-wrap.items-start.justify-between.gap-3', {}, [
    h('div', {}, [
      h('div.flex.items-center.text-xs.font-semibold.uppercase.tracking-wider.text-brand-ocean.mb-1', { class: 'gap-1.5' }, [
        svg(h, ICON.building, 'w-4 h-4'),
        h('span', {}, 'Administración global'),
      ]),
      h('h1.text-2xl.font-bold.text-brand.tracking-tight', { class: 'md:text-3xl' }, 'Gestión de empresas'),
      h('p.text-sm.text-slate-500.mt-1', {}, canManage
        ? 'Administra los datos, encargados y miembros de las empresas del sistema.'
        : 'Perfiles de las empresas. La gestión está reservada a usuarios autorizados.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
      h('button.btn.btn-ghost', {
        type: 'button',
        onclick: reloadAll,
        title: 'Recargar empresas',
        'aria-label': 'Recargar',
      }, [
        svg(h, ICON.refresh, 'w-4 h-4'),
        h('span', {}, 'Recargar'),
      ]),
      exportBtn = exportButton({ label: 'Exportar', kind: 'secondary', onExport: (format) => doExportCompanies(format) }),
      headerRight,
    ]),
  ]));

  const grid = h('div.grid.grid-cols-1.gap-3', { class: 'md:grid-cols-2 xl:grid-cols-3' });
  root.appendChild(grid);

  // Loading inicial
  grid.appendChild(renderLoading('Cargando empresas…'));

  // Realtime: refresca la lista cuando otro platform admin o sesión del
  // propio Miguel en otra pestaña crea/edita empresas o membresías.
  const onRealtime = (e) => {
    const t = e.detail?.event;
    if (!t) return;
    const relevant = t.startsWith('company:') || t.startsWith('membership:');
    if (!relevant) return;
    // Invalida caches para que el siguiente draw() haga fetch fresco.
    if (t === 'company:created' || t === 'company:updated' || t === 'company:deleted') {
      reloadAll();
    } else if (t.startsWith('membership:')) {
      // No tenemos el companyId en el payload para saber a quién refrescar;
      // recargamos todo (es barato: 1 GET por recurso).
      membersByCompany.clear();
      drawGrid();
      if (selectedId) refreshDetailModal();
    }
  };
  window.addEventListener('gcm:realtime', onRealtime);

  // ── Boot ──────────────────────────────────────────────────────────────
  loading = true;
  try {
    await loadCompanies();
    await usersCache.load();
    // Precarga de miembros de todas las empresas — sin esto, la card sólo
    // mostraba el conteo real después de haber abierto el detalle al menos
    // una vez en la sesión (quedaba en "0 miembros" hasta el primer click).
    await Promise.all(companies.map((c) => loadMembers(c.id).catch(() => {})));
  } catch (e) {
    grid.innerHTML = '';
    grid.appendChild(emptyState({
      icon: 'inbox',
      title: 'No se pudieron cargar las empresas',
      message: e.message || 'Error desconocido',
    }));
    return root;
  } finally {
    loading = false;
  }
  drawGrid();

  // ── Draw: grid de cards ──────────────────────────────────────────────
  function drawGrid() {
    grid.innerHTML = '';
    if (loading) { grid.appendChild(renderLoading('Cargando…')); return; }
    if (!companies.length) {
      grid.appendChild(emptyState({
        icon: 'inbox',
        title: canManage ? 'Aún no hay empresas registradas' : 'No tienes empresas asignadas',
        message: canManage
          ? 'Crea la primera empresa del grupo para empezar a asignarle miembros.'
          : 'Pídele al administrador de plataforma que te agregue como miembro de una empresa.',
        action: canManage ? { label: '+ Nueva empresa', onclick: () => openCompanyModal(null, reloadAll) } : null,
      }));
      return;
    }
    for (const c of companies) {
      const isActive = c.active;
      const isDefault = c.is_default;
      const isSelected = c.id === selectedId;
      const memberCount = (membersByCompany.get(c.id) || []).length;
      const encargado = responsibleUser(c);

      const card = h('div.text-left.card.p-5.w-full.transition.relative.overflow-hidden', {
        class: [
          isSelected ? 'ring-2 ring-brand-ocean' : 'hover:shadow-pop hover:border-brand-ocean/40',
          !isActive ? 'border-dashed opacity-75 hover:opacity-100' : '',
        ],
      }, [
        isDefault ? h('span.absolute.top-0.right-4.px-2.py-1.rounded-b-lg.font-bold.uppercase.tracking-widest.bg-brand.text-white', { class: 'text-[10px]' }, 'Por defecto') : null,
        h('button.flex.items-start.justify-between.gap-2.w-full.text-left', {
          type: 'button',
          'aria-pressed': String(isSelected),
          onclick: () => selectCompany(c.id),
        }, [
          h('div.flex.items-start.gap-2.min-w-0', {}, [
            h('span.rounded-full.flex-none', {
              class: `mt-1.5 w-2.5 h-2.5 ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`,
            }),
            h('div.min-w-0.flex-1', {}, [
              h('div.font-semibold.truncate', { class: isActive ? 'text-brand-ink' : 'text-slate-400' }, c.name),
              h('div.flex.items-center.gap-1.5.min-w-0', {}, [
                h('span.text-xs.font-mono.truncate', { class: isActive ? 'text-slate-500' : 'text-slate-400' }, c.slug),
                c.code_prefix ? h('span.badge.bg-brand-ocean/10.text-brand-ocean.font-mono.flex-none', { class: 'text-[10px]' }, c.code_prefix) : null,
              ]),
            ]),
          ]),
          isActive
            ? h('span.badge.bg-emerald-100.text-emerald-800.flex-none', {}, 'Activa')
            : h('span.badge.bg-slate-100.text-slate-500.flex-none', {}, 'Inactiva'),
        ]),
        h('div.flex.flex-col.gap-2.mt-4.text-sm', {}, [
          h('div.flex.items-center.gap-2.text-slate-600', {}, [
            svg(h, ICON.users, 'w-4 h-4 text-slate-400 flex-none'),
            h('span', {}, `${memberCount} ${memberCount === 1 ? 'miembro' : 'miembros'}`),
          ]),
          c.location ? h('div.flex.items-center.gap-2.text-slate-600', {}, [
            svg(h, ICON.pin, 'w-4 h-4 text-slate-400 flex-none'),
            h('span.truncate', {}, c.location),
          ]) : null,
          encargado ? h('div.flex.items-center.gap-2.text-slate-600', {}, [
            svg(h, ICON.user, 'w-4 h-4 text-slate-400 flex-none'),
            h('span.truncate', {}, encargado.full_name || encargado.username),
          ]) : null,
        ]),
        h('div.pt-3.mt-3.border-t.border-surface-border.flex.gap-2', {}, [
          h('button.flex-1.btn.btn-secondary.btn-sm', { type: 'button', onclick: () => selectCompany(c.id) }, 'Ver detalles'),
          canManage ? h('button.btn.btn-sm', {
            type: 'button',
            class: c.active ? 'bg-red-50 text-red-700 hover:bg-red-100 font-medium' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium',
            onclick: (e) => {
              e.stopPropagation();
              openConfirmToggleCompany(c.id, c.active);
            },
          }, c.active ? 'Desactivar' : 'Activar') : null,
        ]),
      ]);
      grid.appendChild(card);
    }
  }

  // ── Modal: detalle de empresa ───────────────────────────────────────
  function openDetailModal(company) {
    if (!company) return;
    const body = h('div.flex.flex-col.gap-4', {}, [
      h('div.flex.items-start.justify-between.gap-3.flex-wrap', {}, [
        h('div.min-w-0.flex-1', {}, [
          h('div.flex.items-center.gap-2.flex-wrap', {}, [
            colorDot(company.color),
            h('h2.text-base.font-semibold.text-brand-ink', {}, company.name),
            company.is_default ? h('span.badge', { class: 'bg-brand-ocean/10 text-brand-ocean' }, 'Por defecto') : null,
            company.active
              ? h('span.badge.bg-emerald-100.text-emerald-800', {}, 'Activa')
              : h('span.badge.bg-slate-200.text-slate-700', {}, 'Inactiva'),
          ]),
          h('p.text-xs.text-slate-500.font-mono.mt-1', {}, `${company.slug} · ID ${company.id}${company.code_prefix ? ` · Prefijo ${company.code_prefix}` : ''}`),
        ]),
      ]),
      renderTabs(company),
    ]);

    if (activeDetailModal?.cleanup) {
      activeDetailModal.cleanup();
      activeDetailModal = null;
    }

    activeDetailModal = openModal({
      title: company.name,
      body,
      size: 'xl',
      onClose: () => {
        activeDetailModal = null;
        if (selectedId === company.id) {
          selectedId = null;
          drawGrid();
        }
      },
    });
  }

  function refreshDetailModal() {
    if (!selectedId) return;
    const company = companies.find((x) => x.id === selectedId);
    if (!company) return;
    openDetailModal(company);
  }

  // ── Tabs del detalle ─────────────────────────────────────────────────
  function renderTabs(company) {
    const tabs = [
      { key: 'data',    label: 'Datos' },
      { key: 'members', label: 'Miembros' },
    ];
    const bar = h('div.flex.gap-1.border-b.border-surface-border.overflow-x-auto', {
      role: 'tablist',
      'aria-label': 'Secciones de la empresa',
    });
    const tabContent = h('div.p-5', {});
    const state = { active: 'data' };

    function renderBar() {
      bar.innerHTML = '';
      for (const t of tabs) {
        const isActive = t.key === state.active;
        bar.appendChild(h('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': String(isActive),
          class: [
            'flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 text-sm font-medium transition whitespace-nowrap',
            isActive
              ? 'border-brand-ocean text-brand-ink font-semibold'
              : 'border-transparent text-slate-500 hover:text-brand-ink hover:border-surface-border',
          ],
          onclick: () => { state.active = t.key; renderBar(); renderContent(); },
        }, [
          h('span', {}, t.label),
        ]));
      }
    }

    function renderContent() {
      tabContent.innerHTML = '';
      const node = state.active === 'data'
        ? renderDataTab(company)
        : state.active === 'members'
          ? renderMembersTab(company)
          : null;
      if (node) tabContent.appendChild(node);
    }

    renderBar();
    renderContent();
    return h('div', {}, [bar, tabContent]);
  }

  // ── Tab: Datos ───────────────────────────────────────────────────────
  function renderDataTab(company) {
    if (!canManage) {
      return h('p.text-sm.text-slate-500', {}, 'Solo el administrador de plataforma puede editar los datos de la empresa.');
    }

    const name = h('input.input', { type: 'text', value: company.name || '', maxlength: String(LIMITS.company.name.max) });
    const location = h('input.input', { type: 'text', value: company.location || '', maxlength: '200', placeholder: 'Ciudad, dirección (opcional)' });
    const codePrefix = h('input.input.font-mono.uppercase', {
      type: 'text',
      value: company.code_prefix || '',
      maxlength: String(LIMITS.company.codePrefix.max),
      placeholder: 'N7',
      oninput: () => { codePrefix.value = codePrefix.value.toUpperCase(); },
    });
    const responsible = h('select.input', {}, []);
    const nameErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-name-err', role: 'alert' });
    const locationErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-location-err', role: 'alert' });
    const codePrefixErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-prefix-err', role: 'alert' });
    const responsibleErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-resp-err', role: 'alert' });
    const banner = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', { role: 'alert' });

    const wireClear = (input, err) => input.addEventListener('input', () => clearFieldError(input, err));
    wireClear(name, nameErr);
    wireClear(codePrefix, codePrefixErr);

    function populateResponsible() {
      const users = usersCache.get().filter((u) => u.active && u.role === 'admin_area');
      responsible.innerHTML = '';
      const currentId = company.responsible_user_id != null ? String(company.responsible_user_id) : null;
      const currentInList = currentId != null && users.some((u) => String(u.id) === currentId);
      if (!users.length && !currentId) {
        responsible.appendChild(h('option', { value: '', disabled: 'disabled' }, 'No hay administradores de área activos'));
        return;
      }
      responsible.appendChild(h('option', { value: '' }, '— Selecciona un encargado —'));
      if (currentId && !currentInList) {
        // El encargado actual ya no es admin_area activo (se desactivó o le
        // cambiaron el rol desde /users). Sin esta opción, el <select>
        // quedaba en "" y el form bloqueaba GUARDAR CUALQUIER cambio (hasta
        // ubicación o prefijo) hasta elegir un reemplazo, aunque el admin
        // solo quisiera editar otro campo sin tocar el encargado.
        const currentUser = usersCache.get().find((u) => String(u.id) === currentId);
        const label = currentUser
          ? `${currentUser.full_name || currentUser.username} (actual — ya no es admin. de área activo)`
          : `Encargado actual #${currentId} (ya no disponible)`;
        responsible.appendChild(h('option', { value: currentId, selected: 'selected' }, label));
      }
      for (const u of users) {
        const o = h('option', { value: String(u.id) }, `${u.full_name || u.username} (${u.username || u.id})`);
        if (currentId === String(u.id)) o.selected = 'selected';
        responsible.appendChild(o);
      }
    }

    if (!usersCache.isLoaded()) {
      responsible.appendChild(h('option', { value: '' }, 'Cargando encargados…'));
      usersCache.load().then(populateResponsible).catch(populateResponsible);
    } else {
      populateResponsible();
    }

    const wireClearExtra = (input, err) => input.addEventListener('input', () => clearFieldError(input, err));
    wireClearExtra(location, locationErr);
    wireClearExtra(responsible, responsibleErr);

    return h('div.flex.flex-col.gap-4', {}, [
      h('div', {}, [
        h('label.label', {}, 'Nombre *'),
        name,
        nameErr,
      ]),
      h('div', {}, [
        h('label.label', {}, 'Ubicación (opcional)'),
        location,
        locationErr,
      ]),
      h('div', {}, [
        h('label.label', {}, 'Prefijo de nomenclatura *'),
        codePrefix,
        h('p.text-xs.text-slate-500.mt-1', {}, 'Define la nomenclatura de los tickets de esta empresa, ej. N7 → N7-000001. Solo letras/números, máx. 6 caracteres.'),
        codePrefixErr,
      ]),
      h('div', {}, [
        h('label.label', {}, 'Encargado *'),
        responsible,
        h('p.text-xs.text-slate-500.mt-1', {}, 'Solo se listan usuarios activos con rol Administrador de área.'),
        responsibleErr,
      ]),
      banner,
      h('div.flex.items-center.justify-end.gap-2.pt-2', {}, [
        h('button.btn.btn-primary', {
          type: 'button',
          onclick: async () => {
            nameErr.classList.add('hidden');
            locationErr.classList.add('hidden');
            codePrefixErr.classList.add('hidden');
            responsibleErr.classList.add('hidden');
            banner.classList.add('hidden');
            let firstInvalid = null;
            const nameVal = name.value.trim();
            const codePrefixVal = codePrefix.value.trim().toUpperCase();
            const responsibleVal = responsible.value ? Number(responsible.value) : null;
            if (!nameVal) { setFieldError(name, nameErr, 'El nombre es obligatorio.'); firstInvalid = firstInvalid || name; }
            if (!codePrefixVal) {
              setFieldError(codePrefix, codePrefixErr, 'El prefijo de nomenclatura es obligatorio.');
              firstInvalid = firstInvalid || codePrefix;
            } else if (!CODE_PREFIX_RE.test(codePrefixVal)) {
              setFieldError(codePrefix, codePrefixErr, 'Solo letras/números, sin espacios, máx. 6 caracteres.');
              firstInvalid = firstInvalid || codePrefix;
            }
            if (!responsibleVal) { setFieldError(responsible, responsibleErr, 'El encargado es obligatorio.'); firstInvalid = firstInvalid || responsible; }
            if (firstInvalid) { firstInvalid.focus(); return; }
            try {
              await api.companies.update(company.id, {
                name: nameVal,
                location: location.value.trim() || null,
                code_prefix: codePrefixVal,
                responsible_user_id: responsibleVal,
              });
              toast('Empresa actualizada', 'success');
              await reloadAll();
            } catch (e) {
              banner.textContent = e.message;
              banner.classList.remove('hidden');
            }
          },
        }, 'Guardar cambios'),
      ]),
    ]);
  }

  // ── Tab: Miembros ────────────────────────────────────────────────────
  function renderMembersTab(company) {
    const members = membersByCompany.get(company.id) || [];
    const header = h('div.flex.items-center.justify-between.mb-3', {}, [
      h('div', {}, [
        h('h3.text-sm.font-semibold.text-brand-ink', {}, 'Miembros'),
        h('p.text-xs.text-slate-500', {}, 'Personas con acceso a esta empresa y su rol.'),
      ]),
      canManage ? h('button.btn.btn-primary.btn-sm', {
        type: 'button',
        onclick: () => openMembershipModal(company.id, async () => { await loadMembers(company.id); drawGrid(); refreshDetailModal(); }),
      }, [
        svg(h, ICON.plus, 'w-4 h-4'),
        h('span', {}, 'Agregar miembro'),
      ]) : null,
    ]);

    if (!members.length) {
      return h('div', {}, [header, emptyState({
        icon: 'users',
        title: 'Sin miembros',
        message: 'Esta empresa no tiene miembros asignados.',
        className: 'py-6',
      })]);
    }

    const rows = members.map((m) => `
      <tr>
        <td>
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-none" style="background-color:${avatarColor(m.user_id)}">${escapeHtml(initials(m.user?.full_name))}</span>
            <div class="min-w-0">
              <div class="font-medium text-brand-ink truncate">${escapeHtml(m.user?.full_name || `user#${m.user_id}`)}</div>
              <div class="text-xs text-slate-500 font-mono truncate">${escapeHtml(m.user?.username || '')}</div>
            </div>
          </div>
        </td>
        <td><span class="badge bg-brand-ocean/10 text-brand-ocean">${escapeHtml(roleLabel(m.role))}</span></td>
        <td>${m.is_default ? '<span class="badge bg-brand-ocean/10 text-brand-ocean">Default</span>' : ''}</td>
        <td>${m.active
          ? '<span class="badge bg-emerald-100 text-emerald-800">Activo</span>'
          : '<span class="badge bg-slate-200 text-slate-700">Inactivo</span>'}</td>
        <td class="text-right">
          ${canManage ? `
            <button class="btn btn-ghost btn-sm" data-edit-member="${m.id}">Editar</button>
            <button class="btn btn-ghost btn-sm text-accent hover:bg-accent/10" data-remove-member="${m.id}">${m.active ? 'Desactivar' : 'Activar'}</button>
          ` : ''}
        </td>
      </tr>
    `).join('');

    const wrap = h('div', {});
    wrap.appendChild(header);
    wrap.appendChild(h('div.table-wrap', {}, [
      h('table.table', {}, [
        h('thead', {}, [h('tr', {}, [
          h('th', {}, 'Persona'),
          h('th', {}, 'Rol'),
          h('th', {}, 'Default'),
          h('th', {}, 'Estado'),
          h('th', {}, ''),
        ])]),
        h('tbody', { html: rows }),
      ]),
    ]));

    if (canManage) {
      wrap.querySelectorAll('[data-edit-member]').forEach((b) => b.addEventListener('click', () => {
        // String(): m.id llega como string desde Firestore (p.ej. "11"), el
        // dataset también es string — comparar contra Number(dataset) nunca
        // hacía match y el botón quedaba mudo (sin request, sin error).
        const id = b.dataset.editMember;
        const m = members.find((x) => String(x.id) === String(id));
        if (m) openMembershipModal(company.id, async () => { await loadMembers(company.id); drawGrid(); refreshDetailModal(); }, m);
      }));
      wrap.querySelectorAll('[data-remove-member]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.removeMember;
        const m = members.find((x) => String(x.id) === String(id));
        if (!m) return;
        confirmModal({
          title: m.active ? 'Desactivar membresía' : 'Activar membresía',
          message: `${m.active ? 'Desactivar' : 'Activar'} la membresía de <b>${escapeHtml(m.user?.full_name || `user#${m.user_id}`)}</b>?${m.active ? ' El servidor bloquea si es la última membresía activa del usuario.' : ''}`,
          confirmText: m.active ? 'Desactivar' : 'Activar',
          danger: m.active,
          onConfirm: async () => {
            try {
              await api.companies.members.update(m.user_id, m.id, { active: !m.active });
              toast('Membresía actualizada', 'success');
              await loadMembers(company.id);
              drawGrid();
              refreshDetailModal();
            } catch (e) { toast(e.message, 'error'); }
          },
        });
      }));
    }
    return wrap;
  }

  async function selectCompany(id) {
    if (id === null) {
      selectedId = null;
      if (activeDetailModal?.cleanup) {
        activeDetailModal.cleanup();
        activeDetailModal = null;
      }
      drawGrid();
      return;
    }
    selectedId = id;
    drawGrid();
    try {
      await ensureDetail(id);
      const company = companies.find((x) => x.id === id);
      if (company) openDetailModal(company);
    } catch (e) {
      toast(e.message, 'error');
      selectedId = null;
      drawGrid();
    }
  }

  function openConfirmToggleCompany(companyId, isCurrentlyActive) {
    confirmModal({
      title: isCurrentlyActive ? 'Desactivar empresa' : 'Activar empresa',
      message: `${isCurrentlyActive ? 'Desactivar' : 'Activar'} esta empresa?`,
      confirmText: isCurrentlyActive ? 'Desactivar' : 'Activar',
      danger: isCurrentlyActive,
      onConfirm: async () => {
        try {
          await api.companies.update(companyId, { active: !isCurrentlyActive });
          toast('Empresa actualizada', 'success');
          await reloadAll();
        } catch (e) { toast(e.message, 'error'); }
      },
    });
  }

  async function reloadAll() {
    loading = true;
    drawGrid();
    try {
      await loadCompanies();
      await Promise.all(companies.map((c) => loadMembers(c.id).catch(() => {})));
      if (selectedId) await ensureDetail(selectedId);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      loading = false;
      drawGrid();
      if (selectedId) refreshDetailModal();
    }
  }

  async function doExportCompanies(format) {
    const formatLabel = format === 'pdf' ? 'PDF' : 'Excel';
    const setBusy = (busy, label = 'Exportar') => {
      exportBtn.disabled = busy;
      exportBtn.setLabel(label);
    };
    try {
      setBusy(true, 'Verificando…');
      await passwordConfirmModal({
        title: 'Confirmar exportación',
        message: `Ingresa tu contraseña para exportar el listado de empresas a ${formatLabel}.`,
        confirmText: 'Exportar',
        onConfirm: async (password) => { await verifyCurrentPassword(password); },
      });
      setBusy(true, 'Exportando…');
      const rows = companies.map((c) => {
        const encargado = responsibleUser(c);
        return {
          name: c.name,
          slug: c.slug,
          code_prefix: c.code_prefix || '—',
          location: c.location || '—',
          responsible: encargado?.full_name || encargado?.username || '—',
          members: (membersByCompany.get(c.id) || []).length,
          active: c.active ? 'Activa' : 'Inactiva',
          is_default: c.is_default ? 'Sí' : 'No',
        };
      });
      if (!rows.length) { toast('No hay empresas para exportar.', 'info'); return; }
      const columns = [
        { key: 'name', label: 'Empresa' },
        { key: 'slug', label: 'Slug' },
        { key: 'code_prefix', label: 'Prefijo' },
        { key: 'location', label: 'Ubicación' },
        { key: 'responsible', label: 'Encargado' },
        { key: 'members', label: 'Miembros' },
        { key: 'active', label: 'Estado' },
        { key: 'is_default', label: 'Por defecto' },
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      const exportOpts = {
        columns,
        title: 'Empresas registradas',
        subtitle: `${rows.length} empresa${rows.length === 1 ? '' : 's'} del grupo`,
        sheetName: 'Empresas',
        summaryField: 'active',
        summaryLabel: 'Estado más frecuente',
        generatedByName: user.full_name || user.username,
        generatedByRole: getRoleLabel(user.role) || user.role,
      };
      if (format === 'pdf') {
        await exportListToPDF(rows, columns, `empresas-${stamp}.pdf`, exportOpts);
      } else {
        await exportToExcel(rows, `empresas-${stamp}.xlsx`, exportOpts);
      }
      toast(`Exportadas ${rows.length} empresas a ${formatLabel}.`, 'success');
    } catch (e) {
      if (e && e.message !== 'Modal closed') toast(e.message || 'Error al exportar', 'error');
    } finally {
      setBusy(false);
    }
  }

  root._gcmCleanup = () => {
    if (activeDetailModal?.cleanup) {
      activeDetailModal.cleanup();
      activeDetailModal = null;
    }
    window.removeEventListener('gcm:realtime', onRealtime);
  };

  return root;
}

// ── Helpers compartidos ────────────────────────────────────────────────────
// Wrapper de getRoleLabel (de ../utils/role-labels.js) que cae a la key cruda
// si el cache aún no se inicializó (mismo patrón que dashboard.js, roles.js).
function roleLabel(role) {
  return getRoleLabel(role) || role;
}

function renderLoading(message) {
  return h('div.flex.items-center.justify-center.gap-2.py-8.text-sm.text-slate-600', {
    role: 'status',
    'aria-live': 'polite',
  }, [
    h('svg.animate-spin.w-4.h-4.text-brand-ocean', {
      fill: 'none', viewBox: '0 0 24 24', 'aria-hidden': 'true',
      html: '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>',
    }),
    h('span', {}, message),
  ]);
}

// ── Modal: crear/editar empresa ───────────────────────────────────────────
function openCompanyModal(company, onSaved) {
  const isEdit = !!company;
  const name = h('input.input', { type: 'text', value: company?.name || '', maxlength: String(LIMITS.company.name.max) });
  const location = h('input.input', { type: 'text', value: company?.location || '', maxlength: '200', placeholder: 'Ciudad, dirección (opcional)' });
  const codePrefix = h('input.input.font-mono.uppercase', {
    type: 'text',
    value: company?.code_prefix || '',
    maxlength: String(LIMITS.company.codePrefix.max),
    placeholder: 'N7',
    oninput: () => { codePrefix.value = codePrefix.value.toUpperCase(); },
  });
  const responsible = h('select.input', {}, []);
  const nameErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-new-name-err', role: 'alert' });
  const locationErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-new-location-err', role: 'alert' });
  const codePrefixErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-new-prefix-err', role: 'alert' });
  const responsibleErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-new-resp-err', role: 'alert' });
  const banner = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', { role: 'alert' });
  const wireClear = (input, err) => input.addEventListener('input', () => clearFieldError(input, err));
  wireClear(name, nameErr);
  wireClear(codePrefix, codePrefixErr);
  wireClear(location, locationErr); wireClear(responsible, responsibleErr);

  // Poblar encargado solo con usuarios activos que son administrador de área.
  function populateResponsibleNew() {
    const users = usersCache.get().filter((u) => u.active && u.role === 'admin_area');
    responsible.innerHTML = '';
    if (!users.length) {
      responsible.appendChild(h('option', { value: '', disabled: 'disabled' }, 'No hay administradores de área activos'));
      return;
    }
    responsible.appendChild(h('option', { value: '' }, '— Selecciona un encargado —'));
    for (const u of users) {
      const o = h('option', { value: String(u.id) }, `${u.full_name || u.username} (${u.username || u.id})`);
      if (company?.responsible_user_id && String(company?.responsible_user_id) === String(u.id)) o.selected = 'selected';
      responsible.appendChild(o);
    }
  }
  if (!usersCache.isLoaded()) {
    responsible.appendChild(h('option', { value: '' }, 'Cargando encargados…'));
    usersCache.load().then(populateResponsibleNew).catch(populateResponsibleNew);
  } else {
    populateResponsibleNew();
  }

  const body = h('div.flex.flex-col.gap-3', {}, [
    h('div', {}, [h('label.label', {}, 'Nombre *'), name, nameErr]),
    h('div', {}, [h('label.label', {}, 'Ubicación (opcional)'), location, locationErr]),
    h('div', {}, [
      h('label.label', {}, 'Prefijo de nomenclatura *'),
      codePrefix,
      h('p.text-xs.text-slate-500.mt-1', {}, 'Define la nomenclatura de los tickets de esta empresa, ej. N7 → N7-000001. Solo letras/números, máx. 6 caracteres.'),
      codePrefixErr,
    ]),
h('div', {}, [h('label.label', {}, 'Encargado *'), responsible, h('p.text-xs.text-slate-500.mt-1', {}, 'Solo se listan usuarios activos con rol Administrador de área.'), responsibleErr]),
    banner,
  ]);

  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close, type: 'button' }, 'Cancelar'),
    h('button.btn.btn-primary', {
      type: 'button',
      onclick: async () => {
        nameErr.classList.add('hidden');
        codePrefixErr.classList.add('hidden');
        banner.classList.add('hidden');
        let firstInvalid = null;
        const nameVal = name.value.trim();
        const codePrefixVal = codePrefix.value.trim().toUpperCase();
        const responsibleVal = responsible.value ? Number(responsible.value) : null;
        if (!nameVal) { setFieldError(name, nameErr, 'El nombre es obligatorio.'); firstInvalid = firstInvalid || name; }
        if (!codePrefixVal) {
          setFieldError(codePrefix, codePrefixErr, 'El prefijo de nomenclatura es obligatorio.');
          firstInvalid = firstInvalid || codePrefix;
        } else if (!CODE_PREFIX_RE.test(codePrefixVal)) {
          setFieldError(codePrefix, codePrefixErr, 'Solo letras/números, sin espacios, máx. 6 caracteres.');
          firstInvalid = firstInvalid || codePrefix;
        }
        if (!responsibleVal) { setFieldError(responsible, responsibleErr, 'El encargado es obligatorio.'); firstInvalid = firstInvalid || responsible; }
        if (firstInvalid) { firstInvalid.focus(); return; }
        try {
          const payload = {
            name: nameVal,
            location: location.value.trim() || null,
            code_prefix: codePrefixVal,
            responsible_user_id: responsibleVal,
          };
          if (isEdit) {
            await api.companies.update(company.id, payload);
            toast('Empresa actualizada', 'success');
          } else {
            await api.companies.create(payload);
            toast('Empresa creada', 'success');
          }
          close(); onSaved?.();
        } catch (e) {
          banner.textContent = e.message;
          banner.classList.remove('hidden');
        }
      },
    }, isEdit ? 'Guardar cambios' : 'Crear empresa'),
  ];
  openModal({ title: isEdit ? `Editar ${company.name}` : 'Nueva empresa', body, actions, size: 'lg' });
}

// ── Modal: crear/editar membresía ─────────────────────────────────────────
function openMembershipModal(companyId, onSaved, membership = null) {
  const isEdit = !!membership;
  const company = companies.find((c) => c.id === companyId);
  // Lista de usuarios activos: usamos usersCache (sincronizado por realtime).
  // El encargado de la empresa ya pertenece a ella (es su admin de área) y
  // no se agrega como miembro aparte, así que se excluye de la lista.
  // También se excluye a quien YA tiene una membresía (activa o inactiva) en
  // esta empresa — el backend rechaza duplicados con un 409 crudo
  // ("El usuario ya tiene una membresía..."); mejor prevenirlo en el
  // selector que dejar que el admin lo intente y se encuentre con un error.
  const existingMemberIds = new Set((membersByCompany.get(companyId) || []).map((m) => String(m.user_id)));
  const allUsers = usersCache.get().filter((u) =>
    (!company?.responsible_user_id || String(u.id) !== String(company.responsible_user_id))
    && !existingMemberIds.has(String(u.id)));
  const userOptions = allUsers.map((u) => ({ value: String(u.id), label: `${u.full_name} (${u.username})` }));

  const userSel = h('select.input', { disabled: isEdit ? 'disabled' : null },
    isEdit ? [h('option', { value: String(membership.user_id) }, `${membership.user?.full_name || `user#${membership.user_id}`}`)] : [
      h('option', { value: '' }, '— Selecciona un usuario —'),
      ...userOptions.map((o) => h('option', { value: o.value }, o.label)),
    ]
  );
  const role = h('select.input', {},
    ROLES_FALLBACK.map((r) => h('option', { value: r, selected: (membership?.role === r) ? '' : null }, roleLabel(r)))
  );
  const userErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-mb-user-err', role: 'alert' });
  const roleErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-mb-role-err', role: 'alert' });
  const banner = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', { role: 'alert' });
  const wireClear = (input, err) => input.addEventListener('change', () => clearFieldError(input, err));
  wireClear(userSel, userErr); wireClear(role, roleErr);

  const body = h('div.flex.flex-col.gap-3', {}, [
    h('div', {}, [
      h('label.label', {}, 'Usuario *'),
      userSel,
      userErr,
      h('p.text-xs.text-slate-500.mt-1', {}, isEdit
        ? 'No se puede cambiar el usuario de una membresía existente. Para reasignar, desactivá y creá una nueva.'
        : 'Solo se listan usuarios activos que todavía no son miembros de esta empresa.'),
    ]),
    h('div', {}, [h('label.label', {}, 'Rol *'), role, roleErr]),
    banner,
  ]);

  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close, type: 'button' }, 'Cancelar'),
    h('button.btn.btn-primary', {
      type: 'button',
      onclick: async () => {
        userErr.classList.add('hidden');
        roleErr.classList.add('hidden');
        banner.classList.add('hidden');
        let firstInvalid = null;
        const userId = Number(userSel.value);
        if (!isEdit && !userId) { setFieldError(userSel, userErr, 'Selecciona un usuario.'); firstInvalid = firstInvalid || userSel; }
        if (!role.value) { setFieldError(role, roleErr, 'Selecciona un rol.'); firstInvalid = firstInvalid || role; }
        if (firstInvalid) { firstInvalid.focus(); return; }
        try {
          if (isEdit) {
            await api.companies.members.update(membership.user_id, membership.id, {
              role: role.value,
            });
            toast('Membresía actualizada', 'success');
          } else {
            await api.companies.members.create(userId, {
              company_id: companyId,
              role: role.value,
            });
            toast('Miembro agregado', 'success');
          }
          close(); onSaved?.();
        } catch (e) {
          banner.textContent = e.message;
          banner.classList.remove('hidden');
        }
      },
    }, isEdit ? 'Guardar cambios' : 'Agregar miembro'),
  ];
  openModal({ title: isEdit ? 'Editar membresía' : 'Agregar miembro a la empresa', body, actions, size: 'md' });
}

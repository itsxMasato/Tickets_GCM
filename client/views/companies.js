/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { emptyState } from '../components/empty-state.js';
import { usersCache } from '../utils/users-cache.js';
import { canManageCompanies, ROLES } from '../utils/permissions.js';
import { ICON, svg } from '../utils/icons.js';
import { getRoleLabel } from '../utils/role-labels.js';

// ── Límites espejo del backend (services/companies + company-areas + memberships) ──
// El cliente valida para feedback inmediato, pero el backend es la fuente de verdad.
const LIMITS = {
  company: { name: { max: 200 }, slug: { max: 50 }, logo: { max: 500 }, color: { max: 20 } },
  area:    { key: { max: 50, pattern: /^[a-z0-9_-]+$/ }, label: { max: 100 } },
};

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
let selectedId = null;           // empresa actualmente expandida
let areasByCompany = new Map();  // companyId -> [areas]
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
  const res = await api.companies.list();
  companies = res.companies || [];
  loadedAt = new Date();
  // Limpiar caches de detalle: si una empresa fue eliminada, soltar su sub-data.
  const liveIds = new Set(companies.map((c) => c.id));
  for (const id of [...areasByCompany.keys()]) {
    if (!liveIds.has(id)) { areasByCompany.delete(id); membersByCompany.delete(id); }
  }
  if (selectedId && !liveIds.has(selectedId)) selectedId = null;
}

async function loadAreas(companyId) {
  const res = await api.companies.areas.list(companyId);
  areasByCompany.set(companyId, res.areas || []);
}

async function loadMembers(companyId) {
  const res = await api.companies.members.list(companyId);
  membersByCompany.set(companyId, res.memberships || []);
}

async function ensureDetail(companyId) {
  // Carga áreas y miembros si no están en cache. Paralelo.
  const tasks = [];
  if (!areasByCompany.has(companyId)) tasks.push(loadAreas(companyId));
  if (!membersByCompany.has(companyId)) tasks.push(loadMembers(companyId));
  if (tasks.length) await Promise.all(tasks);
}

// ── Render principal ───────────────────────────────────────────────────────
export async function renderCompanies({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  const canManage = canManageCompanies(user);

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
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Empresas'),
      h('p.text-sm.text-slate-500', {}, canManage
        ? 'Perfiles de las empresas que usan el sistema. Solo el administrador de plataforma puede crear o modificar.'
        : 'Perfiles de las empresas. La gestión está reservada al administrador de plataforma.'),
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
      headerRight,
    ]),
  ]));

  const grid = h('div.grid.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-3.gap-3', {});
  root.appendChild(grid);

  const detailContainer = h('div', {});
  root.appendChild(detailContainer);

  // Loading inicial
  grid.appendChild(renderLoading('Cargando empresas…'));

  // Realtime: refresca la lista cuando otro platform admin o sesión del
  // propio Miguel en otra pestaña crea/edita empresas, áreas o membresías.
  const onRealtime = (e) => {
    const t = e.detail?.event;
    if (!t) return;
    const relevant = t.startsWith('company:') || t.startsWith('area:') || t.startsWith('membership:');
    if (!relevant) return;
    // Invalida caches para que el siguiente draw() haga fetch fresco.
    if (t === 'company:created' || t === 'company:updated' || t === 'company:deleted') {
      reloadAll();
    } else if (t.startsWith('area:') || t.startsWith('membership:')) {
      // No tenemos el companyId en el payload para saber a quién refrescar;
      // recargamos todo (es barato: 1 GET por recurso).
      areasByCompany.clear();
      membersByCompany.clear();
      drawGrid();
      if (selectedId) drawDetail();
    }
  };
  window.addEventListener('gcm:realtime', onRealtime);

  // ── Boot ──────────────────────────────────────────────────────────────
  loading = true;
  try {
    await loadCompanies();
    await usersCache.load();
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
  if (selectedId) drawDetail();

  // ── Draw: grid de cards ──────────────────────────────────────────────
  function drawGrid() {
    grid.innerHTML = '';
    if (loading) { grid.appendChild(renderLoading('Cargando…')); return; }
    if (!companies.length) {
      grid.appendChild(emptyState({
        icon: 'inbox',
        title: canManage ? 'Aún no hay empresas registradas' : 'No tienes empresas asignadas',
        message: canManage
          ? 'Crea la primera empresa del grupo para empezar a asignarle áreas y miembros.'
          : 'Pídele al administrador de plataforma que te agregue como miembro de una empresa.',
        action: canManage ? { label: '+ Nueva empresa', onclick: () => openCompanyModal(null, reloadAll) } : null,
      }));
      return;
    }
    for (const c of companies) {
      const isActive = c.active;
      const isDefault = c.is_default;
      const isSelected = c.id === selectedId;
      const card = h('button.text-left.card.p-4.transition.cursor-pointer', {
        type: 'button',
        'aria-pressed': String(isSelected),
        onclick: () => selectCompany(c.id),
        class: [
          isSelected ? 'ring-2 ring-brand-ocean' : 'hover:border-brand-ocean/40',
          !isActive ? 'opacity-60' : '',
        ],
      }, [
        h('div.flex.items-start.gap-2', {}, [
          colorDot(c.color),
          h('div.min-w-0.flex-1', {}, [
            h('div.font-semibold.text-brand-ink.truncate', {}, c.name),
            h('div.text-xs.text-slate-500.font-mono.truncate', {}, c.slug),
          ]),
        ]),
        h('div.flex.flex-wrap.items-center.gap-1.mt-2', {}, [
          isDefault ? h('span.badge.bg-brand-ocean\\/10.text-brand-ocean', {}, 'Por defecto') : null,
          isActive
            ? h('span.badge.bg-emerald-100.text-emerald-800', {}, 'Activa')
            : h('span.badge.bg-slate-200.text-slate-700', {}, 'Inactiva'),
        ]),
        h('div.flex.items-center.gap-3.mt-3.text-xs.text-slate-500', {}, [
          h('span', {}, [
            (areasByCompany.get(c.id) || []).length,
            ' ',
            (areasByCompany.get(c.id) || []).length === 1 ? 'área' : 'áreas',
          ]),
          h('span.text-slate-300', {}, '·'),
          h('span', {}, [
            (membersByCompany.get(c.id) || []).length,
            ' ',
            (membersByCompany.get(c.id) || []).length === 1 ? 'miembro' : 'miembros',
          ]),
        ]),
      ]);
      grid.appendChild(card);
    }
  }

  // ── Draw: detalle expandido ──────────────────────────────────────────
  function drawDetail() {
    detailContainer.innerHTML = '';
    if (!selectedId) return;
    const c = companies.find((x) => x.id === selectedId);
    if (!c) return;
    const panel = h('div.card.p-0.overflow-hidden', {}, [
      h('div.px-5.py-4.border-b.border-surface-border.bg-surface\\/40', {}, [
        h('div.flex.items-start.justify-between.gap-3.flex-wrap', {}, [
          h('div.min-w-0.flex-1', {}, [
            h('div.flex.items-center.gap-2.flex-wrap', {}, [
              colorDot(c.color),
              h('h2.text-base.font-semibold.text-brand-ink', {}, c.name),
              c.is_default ? h('span.badge.bg-brand-ocean\\/10.text-brand-ocean', {}, 'Por defecto') : null,
              c.active
                ? h('span.badge.bg-emerald-100.text-emerald-800', {}, 'Activa')
                : h('span.badge.bg-slate-200.text-slate-700', {}, 'Inactiva'),
            ]),
            h('p.text-xs.text-slate-500.font-mono.mt-1', {}, c.slug),
          ]),
          h('div.flex.items-center.gap-2', {}, [
            h('button.btn.btn-ghost.btn-sm', {
              type: 'button',
              onclick: () => selectCompany(null),
              title: 'Cerrar detalle',
            }, 'Cerrar'),
          ]),
        ]),
      ]),
      h('div.p-0', {}, [renderTabs(c)]),
    ]);
    detailContainer.appendChild(panel);
  }

  // ── Tabs del detalle ─────────────────────────────────────────────────
  function renderTabs(company) {
    const tabs = [
      { key: 'data',    label: 'Datos' },
      { key: 'areas',   label: 'Áreas' },
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
      if (state.active === 'data')    tabContent.appendChild(renderDataTab(company));
      if (state.active === 'areas')   tabContent.appendChild(renderAreasTab(company));
      if (state.active === 'members') tabContent.appendChild(renderMembersTab(company));
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
    const slug = h('input.input', { type: 'text', value: company.slug || '', maxlength: String(LIMITS.company.slug.max) });
    const color = h('input.input.font-mono', { type: 'text', value: company.color || '', maxlength: String(LIMITS.company.color.max), placeholder: '#0F2A47' });
    const logo = h('input.input', { type: 'url', value: company.logo_url || '', maxlength: String(LIMITS.company.logo.max), placeholder: 'https://…' });
    const active = h('input', { type: 'checkbox', checked: company.active ? '' : null });
    const isDefault = h('input', { type: 'checkbox', checked: company.is_default ? '' : null });
    const nameErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-name-err', role: 'alert' });
    const slugErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-slug-err', role: 'alert' });
    const banner = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', { role: 'alert' });

    const wireClear = (input, err) => input.addEventListener('input', () => clearFieldError(input, err));
    wireClear(name, nameErr); wireClear(slug, slugErr);

    // Toggle: marcar "por defecto" desmarcará al resto (server-side); el cliente
    // deshabilita el toggle de "activa" si la empresa es default (no se puede
    // desactivar la única empresa activa del sistema — server lo valida).
    const previewColor = h('span.inline-block.w-4.h-4.rounded.border.border-surface-border', {
      style: { backgroundColor: (color.value && /^#[0-9A-Fa-f]{3,8}$/.test(color.value)) ? color.value : 'transparent' },
    });
    color.addEventListener('input', () => {
      previewColor.style.backgroundColor = (/^#[0-9A-Fa-f]{3,8}$/.test(color.value)) ? color.value : 'transparent';
    });

    const body = h('div.flex.flex-col.gap-3', {}, [
      h('div', {}, [h('label.label', {}, 'Nombre *'), name, nameErr]),
      h('div', {}, [h('label.label', {}, 'Slug *'), slug, slugErr, h('p.text-xs.text-slate-500.mt-1', {}, 'Identificador URL-safe. Solo letras minúsculas, dígitos y guiones.')]),
      h('div.grid.grid-cols-1.md\\:grid-cols-2.gap-3', {}, [
        h('div', {}, [
          h('label.label', {}, 'Color de marca'),
          h('div.flex.items-center.gap-2', {}, [color, previewColor]),
          h('p.text-xs.text-slate-500.mt-1', {}, 'Hex (#0F2A47). Define el accent en sidebar y badges.'),
        ]),
        h('div', {}, [h('label.label', {}, 'Logo URL'), logo, h('p.text-xs.text-slate-500.mt-1', {}, 'Opcional. URL completa al asset.')]),
      ]),
      h('div.flex.flex-wrap.gap-4.mt-2', {}, [
        h('label.flex.items-center.gap-2.text-sm', { for: 'gcm-co-active' }, [active, 'Empresa activa']),
        h('label.flex.items-center.gap-2.text-sm', { for: 'gcm-co-default' }, [isDefault, 'Empresa por defecto']),
      ]),
      banner,
    ]);

    const actions = (close) => [
      h('button.btn.btn-ghost', { onclick: close, type: 'button' }, 'Cancelar'),
      h('button.btn.btn-ghost.text-accent.hover\\:bg-accent\\/10', {
        type: 'button',
        onclick: () => {
          confirmModal({
            title: company.active ? 'Desactivar empresa' : 'Activar empresa',
            message: `¿${company.active ? 'Desactivar' : 'Activar'} <b>${escapeHtml(company.name)}</b>?${company.active ? ' No se podrá desactivar si es la última empresa activa.' : ''}`,
            confirmText: company.active ? 'Desactivar' : 'Activar',
            danger: company.active,
            onConfirm: async () => {
              try {
                await api.companies.update(company.id, { active: !company.active });
                toast(company.active ? 'Empresa desactivada' : 'Empresa activada', 'success');
                close(); await reloadAll();
              } catch (e) { toast(e.message, 'error'); }
            },
          });
        },
      }, company.active ? 'Desactivar' : 'Activar'),
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: async () => {
          nameErr.classList.add('hidden');
          slugErr.classList.add('hidden');
          banner.classList.add('hidden');
          let firstInvalid = null;
          const nameVal = name.value.trim();
          const slugVal = slug.value.trim();
          if (!nameVal) { setFieldError(name, nameErr, 'El nombre es obligatorio.'); firstInvalid = firstInvalid || name; }
          if (!slugVal) { setFieldError(slug, slugErr, 'El slug es obligatorio.'); firstInvalid = firstInvalid || slug; }
          else if (!/^[a-z0-9-]+$/.test(slugVal)) { setFieldError(slug, slugErr, 'Solo minúsculas, dígitos y guiones.'); firstInvalid = firstInvalid || slug; }
          if (firstInvalid) { firstInvalid.focus(); return; }
          try {
            await api.companies.update(company.id, {
              name: nameVal,
              slug: slugVal,
              color: color.value.trim() || null,
              logo_url: logo.value.trim() || null,
              active: active.checked,
              is_default: isDefault.checked,
            });
            toast('Empresa actualizada', 'success');
            close();
            await reloadAll();
          } catch (e) {
            banner.textContent = e.message;
            banner.classList.remove('hidden');
          }
        },
      }, 'Guardar cambios'),
    ];
    openModal({ title: `Editar ${company.name}`, body, actions, size: 'lg' });
  }

  // ── Tab: Áreas ───────────────────────────────────────────────────────
  function renderAreasTab(company) {
    const areas = areasByCompany.get(company.id) || [];
    const header = h('div.flex.items-center.justify-between.mb-3', {}, [
      h('div', {}, [
        h('h3.text-sm.font-semibold.text-brand-ink', {}, 'Áreas operativas'),
        h('p.text-xs.text-slate-500', {}, 'Definen las áreas de trabajo de esta empresa. Cada área tiene un `key` estable (no se renombra) y un label visible.'),
      ]),
      canManage ? h('button.btn.btn-primary.btn-sm', {
        type: 'button',
        onclick: () => openAreaModal(company.id, null, async () => { await loadAreas(company.id); drawGrid(); drawDetail(); }),
      }, [
        svg(h, ICON.plus, 'w-4 h-4'),
        h('span', {}, 'Nueva área'),
      ]) : null,
    ]);

    if (!areas.length) {
      return h('div', {}, [header, emptyState({
        icon: 'tag',
        title: 'Sin áreas',
        message: 'Esta empresa no tiene áreas definidas.',
        className: 'py-6',
      })]);
    }

    const rows = areas.map((a) => `
      <tr>
        <td><span class="font-mono text-xs">${escapeHtml(a.key)}</span></td>
        <td>${escapeHtml(a.label)}</td>
        <td class="text-xs text-slate-500">${a.sort_order}</td>
        <td>${a.active
          ? '<span class="badge bg-emerald-100 text-emerald-800">Activa</span>'
          : '<span class="badge bg-slate-200 text-slate-700">Inactiva</span>'}</td>
        <td class="text-right">
          ${canManage ? `
            <button class="btn btn-ghost btn-sm" data-edit-area="${a.id}">Editar</button>
            <button class="btn btn-ghost btn-sm ${a.active ? 'text-accent hover:bg-accent/10' : ''}" data-toggle-area="${a.id}">${a.active ? 'Desactivar' : 'Activar'}</button>
          ` : ''}
        </td>
      </tr>
    `).join('');

    const wrap = h('div', {});
    wrap.appendChild(header);
    wrap.appendChild(h('div.table-wrap', {}, [
      h('table.table', {}, [
        h('thead', {}, [h('tr', {}, [
          h('th', {}, 'Key'),
          h('th', {}, 'Label'),
          h('th', {}, 'Orden'),
          h('th', {}, 'Estado'),
          h('th', {}, ''),
        ])]),
        h('tbody', { html: rows }),
      ]),
    ]));

    if (canManage) {
      wrap.querySelectorAll('[data-edit-area]').forEach((b) => b.addEventListener('click', () => {
        const id = Number(b.dataset.editArea);
        const a = areas.find((x) => x.id === id);
        if (a) openAreaModal(company.id, a, async () => { await loadAreas(company.id); drawGrid(); drawDetail(); });
      }));
      wrap.querySelectorAll('[data-toggle-area]').forEach((b) => b.addEventListener('click', () => {
        const id = Number(b.dataset.toggleArea);
        const a = areas.find((x) => x.id === id);
        if (!a) return;
        confirmModal({
          title: a.active ? 'Desactivar área' : 'Activar área',
          message: `¿${a.active ? 'Desactivar' : 'Activar'} <b>${escapeHtml(a.label)}</b>?${a.active ? ' El servidor bloquea si tiene tickets activos o miembros usándola.' : ''}`,
          confirmText: a.active ? 'Desactivar' : 'Activar',
          danger: a.active,
          onConfirm: async () => {
            try {
              await api.companies.areas.update(a.id, { active: !a.active });
              toast('Área actualizada', 'success');
              await loadAreas(company.id);
              drawGrid();
              drawDetail();
            } catch (e) { toast(e.message, 'error'); }
          },
        });
      }));
    }
    return wrap;
  }

  // ── Tab: Miembros ────────────────────────────────────────────────────
  function renderMembersTab(company) {
    const members = membersByCompany.get(company.id) || [];
    const header = h('div.flex.items-center.justify-between.mb-3', {}, [
      h('div', {}, [
        h('h3.text-sm.font-semibold.text-brand-ink', {}, 'Miembros'),
        h('p.text-xs.text-slate-500', {}, 'Personas con acceso a esta empresa. Cada una tiene un rol y opcionalmente un área.'),
      ]),
      canManage ? h('button.btn.btn-primary.btn-sm', {
        type: 'button',
        onclick: () => openMembershipModal(company.id, async () => { await loadMembers(company.id); drawGrid(); drawDetail(); }),
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
          <div class="font-medium text-brand-ink">${escapeHtml(m.user?.full_name || `user#${m.user_id}`)}</div>
          <div class="text-xs text-slate-500 font-mono">${escapeHtml(m.user?.username || '')}</div>
        </td>
        <td><span class="badge bg-brand-ocean/10 text-brand-ocean">${escapeHtml(roleLabel(m.role))}</span></td>
        <td><span class="text-xs text-slate-600">${escapeHtml(m.area_key || '—')}</span></td>
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
          h('th', {}, 'Área'),
          h('th', {}, 'Default'),
          h('th', {}, 'Estado'),
          h('th', {}, ''),
        ])]),
        h('tbody', { html: rows }),
      ]),
    ]));

    if (canManage) {
      wrap.querySelectorAll('[data-edit-member]').forEach((b) => b.addEventListener('click', () => {
        const id = Number(b.dataset.editMember);
        const m = members.find((x) => x.id === id);
        if (m) openMembershipModal(company.id, async () => { await loadMembers(company.id); drawGrid(); drawDetail(); }, m);
      }));
      wrap.querySelectorAll('[data-remove-member]').forEach((b) => b.addEventListener('click', () => {
        const id = Number(b.dataset.removeMember);
        const m = members.find((x) => x.id === id);
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
              drawDetail();
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
      drawGrid();
      drawDetail();
      return;
    }
    selectedId = id;
    drawGrid();
    // Mostrar loading breve mientras se cargan áreas+miembros.
    detailContainer.innerHTML = '';
    detailContainer.appendChild(renderLoading('Cargando detalle…'));
    try {
      await ensureDetail(id);
    } catch (e) {
      toast(e.message, 'error');
    }
    drawGrid();
    drawDetail();
  }

  async function reloadAll() {
    loading = true;
    drawGrid();
    try {
      await loadCompanies();
      if (selectedId) await ensureDetail(selectedId);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      loading = false;
      drawGrid();
      if (selectedId) drawDetail();
    }
  }

  root._gcmCleanup = () => {
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
  const slug = h('input.input', { type: 'text', value: company?.slug || '', maxlength: String(LIMITS.company.slug.max), placeholder: 'auto desde nombre' });
  const color = h('input.input.font-mono', { type: 'text', value: company?.color || '', maxlength: String(LIMITS.company.color.max), placeholder: '#0F2A47' });
  const logo = h('input.input', { type: 'url', value: company?.logo_url || '', maxlength: String(LIMITS.company.logo.max), placeholder: 'https://…' });
  const active = h('input', { type: 'checkbox', checked: (company?.active ?? 1) ? '' : null });
  const isDefault = h('input', { type: 'checkbox', checked: company?.is_default ? '' : null });
  const nameErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-new-name-err', role: 'alert' });
  const slugErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-co-new-slug-err', role: 'alert' });
  const banner = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', { role: 'alert' });
  const wireClear = (input, err) => input.addEventListener('input', () => clearFieldError(input, err));
  wireClear(name, nameErr); wireClear(slug, slugErr);

  const body = h('div.flex.flex-col.gap-3', {}, [
    h('div', {}, [h('label.label', {}, 'Nombre *'), name, nameErr]),
    h('div', {}, [
      h('label.label', {}, 'Slug'),
      slug,
      slugErr,
      h('p.text-xs.text-slate-500.mt-1', {}, isEdit
        ? 'Cambiar el slug puede romper URLs amigables guardadas en otros lugares.'
        : 'Opcional. Si lo dejás vacío, se genera a partir del nombre (slugify).'),
    ]),
    h('div.grid.grid-cols-1.md\\:grid-cols-2.gap-3', {}, [
      h('div', {}, [h('label.label', {}, 'Color'), color, h('p.text-xs.text-slate-500.mt-1', {}, 'Hex de marca (opcional).')]),
      h('div', {}, [h('label.label', {}, 'Logo URL'), logo]),
    ]),
    h('div.flex.flex-wrap.gap-4.mt-2', {}, [
      h('label.flex.items-center.gap-2.text-sm', { for: 'gcm-co-new-active' }, [active, 'Activa']),
      h('label.flex.items-center.gap-2.text-sm', { for: 'gcm-co-new-default' }, [isDefault, 'Por defecto']),
    ]),
    banner,
  ]);

  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close, type: 'button' }, 'Cancelar'),
    h('button.btn.btn-primary', {
      type: 'button',
      onclick: async () => {
        nameErr.classList.add('hidden');
        slugErr.classList.add('hidden');
        banner.classList.add('hidden');
        let firstInvalid = null;
        const nameVal = name.value.trim();
        const slugVal = slug.value.trim();
        if (!nameVal) { setFieldError(name, nameErr, 'El nombre es obligatorio.'); firstInvalid = firstInvalid || name; }
        if (slugVal && !/^[a-z0-9-]+$/.test(slugVal)) { setFieldError(slug, slugErr, 'Solo minúsculas, dígitos y guiones.'); firstInvalid = firstInvalid || slug; }
        if (firstInvalid) { firstInvalid.focus(); return; }
        try {
          const payload = {
            name: nameVal,
            color: color.value.trim() || null,
            logo_url: logo.value.trim() || null,
            active: active.checked,
            is_default: isDefault.checked,
          };
          if (slugVal) payload.slug = slugVal;
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

// ── Modal: crear/editar área ──────────────────────────────────────────────
function openAreaModal(companyId, area, onSaved) {
  const isEdit = !!area;
  const key = h('input.input.font-mono', { type: 'text', value: area?.key || '', maxlength: String(LIMITS.area.key.max), disabled: isEdit ? 'disabled' : null });
  const label = h('input.input', { type: 'text', value: area?.label || '', maxlength: String(LIMITS.area.label.max) });
  const sortOrder = h('input.input', { type: 'number', value: String(area?.sort_order ?? 0), min: '0' });
  const active = h('input', { type: 'checkbox', checked: (area?.active ?? 1) ? '' : null });
  const keyErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-ar-key-err', role: 'alert' });
  const labelErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-ar-label-err', role: 'alert' });
  const banner = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', { role: 'alert' });
  const wireClear = (input, err) => input.addEventListener('input', () => clearFieldError(input, err));
  wireClear(key, keyErr); wireClear(label, labelErr);

  const body = h('div.flex.flex-col.gap-3', {}, [
    h('div', {}, [
      h('label.label', {}, 'Key *'),
      key,
      keyErr,
      h('p.text-xs.text-slate-500.mt-1', {}, isEdit
        ? 'No se puede renombrar tras creación. Es la FK lógica de tickets y membresías.'
        : 'Solo minúsculas, dígitos y guiones bajos. Si lo dejás vacío, se genera a partir del label.'),
    ]),
    h('div', {}, [h('label.label', {}, 'Label *'), label, labelErr]),
    h('div.grid.grid-cols-2.gap-3', {}, [
      h('div', {}, [h('label.label', {}, 'Orden'), sortOrder]),
      h('div', {}, [h('label.label', {}, 'Estado'), h('label.flex.items-center.gap-2.text-sm.mt-2', { for: 'gcm-ar-active' }, [active, 'Activa'])]),
    ]),
    banner,
  ]);

  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close, type: 'button' }, 'Cancelar'),
    h('button.btn.btn-primary', {
      type: 'button',
      onclick: async () => {
        keyErr.classList.add('hidden');
        labelErr.classList.add('hidden');
        banner.classList.add('hidden');
        let firstInvalid = null;
        const keyVal = key.value.trim();
        const labelVal = label.value.trim();
        if (!labelVal) { setFieldError(label, labelErr, 'El label es obligatorio.'); firstInvalid = firstInvalid || label; }
        if (keyVal && !LIMITS.area.key.pattern.test(keyVal)) { setFieldError(key, keyErr, 'Solo minúsculas, dígitos, guiones y guiones bajos.'); firstInvalid = firstInvalid || key; }
        if (firstInvalid) { firstInvalid.focus(); return; }
        try {
          if (isEdit) {
            await api.companies.areas.update(area.id, {
              label: labelVal,
              sort_order: Math.max(0, Math.floor(Number(sortOrder.value) || 0)),
              active: active.checked,
            });
            toast('Área actualizada', 'success');
          } else {
            const payload = {
              label: labelVal,
              sort_order: Math.max(0, Math.floor(Number(sortOrder.value) || 0)),
              active: active.checked,
            };
            if (keyVal) payload.key = keyVal;
            await api.companies.areas.create(companyId, payload);
            toast('Área creada', 'success');
          }
          close(); onSaved?.();
        } catch (e) {
          banner.textContent = e.message;
          banner.classList.remove('hidden');
        }
      },
    }, isEdit ? 'Guardar cambios' : 'Crear área'),
  ];
  openModal({ title: isEdit ? `Editar ${area.label}` : 'Nueva área', body, actions, size: 'md' });
}

// ── Modal: crear/editar membresía ─────────────────────────────────────────
function openMembershipModal(companyId, onSaved, membership = null) {
  const isEdit = !!membership;
  // Lista de usuarios activos: usamos usersCache (sincronizado por realtime).
  // Para edición, pre-seleccionamos el user_id y no lo dejamos cambiar.
  const allUsers = usersCache.get();
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
  const areas = areasByCompany.get(companyId) || [];
  const areaSel = h('select.input', {},
    [
      h('option', { value: '' }, '— Sin área —'),
      ...areas.map((a) => h('option', { value: a.key, selected: (membership?.area_key === a.key) ? '' : null }, a.label)),
    ]
  );
  const isDefault = h('input', { type: 'checkbox', checked: membership?.is_default ? '' : null });
  const active = h('input', { type: 'checkbox', checked: (membership?.active ?? 1) ? '' : null });
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
        : 'Solo se listan usuarios activos. Si falta alguien, activalo en /users primero.'),
    ]),
    h('div.grid.grid-cols-2.gap-3', {}, [
      h('div', {}, [h('label.label', {}, 'Rol *'), role, roleErr]),
      h('div', {}, [h('label.label', {}, 'Área'), areaSel, h('p.text-xs.text-slate-500.mt-1', {}, 'Opcional. Solo áreas activas de esta empresa.')]),
    ]),
    h('div.flex.flex-wrap.gap-4.mt-2', {}, [
      h('label.flex.items-center.gap-2.text-sm', { for: 'gcm-mb-default' }, [isDefault, 'Membresía por defecto']),
      h('label.flex.items-center.gap-2.text-sm', { for: 'gcm-mb-active' }, [active, 'Activa']),
    ]),
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
              area_key: areaSel.value || null,
              is_default: isDefault.checked,
              active: active.checked,
            });
            toast('Membresía actualizada', 'success');
          } else {
            await api.companies.members.create(userId, {
              company_id: companyId,
              role: role.value,
              area_key: areaSel.value || null,
              is_default: isDefault.checked,
              active: active.checked,
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

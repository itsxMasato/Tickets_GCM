import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { getRoleLabel, subscribe as subscribeRoleLabel } from '../utils/role-labels.js';
import { usersCache } from '../utils/users-cache.js';
import { ICON, svg } from '../utils/icons.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';

// ── Datos canónicos ─────────────────────────────────────────────────────────
// Roles en orden de autoridad del flujo: SAC arriba (admin global), jefe
// inmediato (última palabra), admin de área (ejecuta), supervisor de campo
// (origen). Este orden guía las tabs y el orden del preview.
const ROLE_ORDER = ['sac', 'jefe_inmediato', 'admin_area', 'supervisor_campo'];

// Una línea que resume la responsabilidad del rol. Aparece bajo el nombre
// en la card principal y justifica por qué el rol tiene los permisos que tiene.
const ROLE_DESCRIPTIONS = {
  sac:              'Administra el sistema, configura permisos y es el último eslabón antes del cliente.',
  jefe_inmediato:   'Cierra y reabre tickets. Tiene la última palabra sobre los casos del área.',
  admin_area:       'Ejecuta y resuelve los tickets asignados a su área.',
  supervisor_campo: 'Levanta tickets en campo sobre lo que ve en operación.',
};

// Permisos que se consideran "críticos": al desactivarlos, el sistema
// pierde una capacidad operativa real. Los marcamos con rojo camarón
// en la fila del permiso y en el dot del cambio pendiente.
let CRITICAL_PERMS = new Set(['manageUsers', 'assign', 'createTicket']);

// ── Permisos: claves + labels + descripciones ──────────────────────────────
// Se inicializan con defaults y el backend puede sobreescribirlos vía
// rolesRes.permissions (mismo contrato que el módulo anterior).
let PERMISSION_KEYS = [
  'manageUsers',
  'manageCategories',
  'viewReports',
  'viewAllTickets',
  'createTicket',
  'assign',
];

let PERMISSION_LABELS = {
  manageUsers:       'Gestionar usuarios',
  manageCategories:  'Gestionar categorías',
  viewReports:       'Ver informes',
  viewAllTickets:    'Ver todos los tickets',
  createTicket:      'Crear tickets',
  assign:            'Asignar tickets',
};

let PERMISSION_DESCRIPTIONS = {
  manageUsers:      'Crear, editar y desactivar cuentas; asignar rol y área.',
  manageCategories: 'Crear, renombrar y desactivar categorías de ticket.',
  viewReports:      'Acceder a reportes y exportaciones del sistema.',
  viewAllTickets:   'Ver tickets de todas las áreas, no sólo los propios.',
  createTicket:     'Aperturar tickets a nombre de cualquier usuario o área.',
  assign:           'Asignar tickets a responsables y reasignar entre áreas.',
};

// Agrupado por categoría para bajar carga cognitiva. El orden de los
// grupos y de los permisos dentro de cada grupo es el orden de aparición
// en la card. Si el backend agrega permisos, los huérfanos (no listados)
// se renderizan en un grupo "Otros" al final para no perderlos.
const PERMISSION_GROUPS = [
  {
    title: 'Tickets',
    description: 'Capacidades operativas del flujo de tickets.',
    perms: ['viewAllTickets', 'createTicket', 'assign'],
  },
  {
    title: 'Administración',
    description: 'Configuración del sistema y cuentas.',
    perms: ['manageUsers', 'manageCategories'],
  },
  {
    title: 'Reportes',
    description: 'Acceso a datos agregados y exportaciones.',
    perms: ['viewReports'],
  },
];

// ── Estado interno del módulo ──────────────────────────────────────────────
// Permisos efectivos leídos del backend (fuente de verdad).
let current = null;
// Permisos locales del usuario (lo que está editando, aún no guardado).
// Es una copia profunda de `current` al cargar, mutada al togglear.
let pending = null;
// Edición inline del label por rol. Map<role, { value, error, saving }>.
// Vacío = todos los nombres en modo lectura.
const editingLabels = new Map();
// Tab activa (qué rol se está editando). Default: el primero del orden.
let activeRole = ROLE_ORDER[0];

// ── Carga inicial ──────────────────────────────────────────────────────────
async function loadAll() {
  // Carga permisos y dispara el cache de usuarios (que se sincroniza con
  // user:created/updated/deactivated). El cache entrega el array actual
  // sin re-fetch si ya estaba cargado por otra vista.
  const [rolesRes] = await Promise.all([
    api.roles.list(),
    usersCache.load(),
  ]);
  current = rolesRes.roles || {};
  if (rolesRes.permissions) {
    PERMISSION_KEYS = Array.isArray(rolesRes.permissions.keys) && rolesRes.permissions.keys.length
      ? [...rolesRes.permissions.keys]
      : PERMISSION_KEYS;
    PERMISSION_LABELS = { ...PERMISSION_LABELS, ...(rolesRes.permissions.labels || {}) };
    PERMISSION_DESCRIPTIONS = { ...PERMISSION_DESCRIPTIONS, ...(rolesRes.permissions.descriptions || {}) };
    CRITICAL_PERMS = new Set(Array.isArray(rolesRes.permissions.critical) ? rolesRes.permissions.critical : Array.from(CRITICAL_PERMS));
  }
  // Clonar para que el toggle local no mute el snapshot.
  pending = JSON.parse(JSON.stringify(current));
}

function usersWithRole(role) {
  return usersCache.get().filter((u) => u.role === role);
}

function isDirty() {
  if (!current || !pending) return false;
  for (const role of ROLE_ORDER) {
    const a = current[role] || {};
    const b = pending[role] || {};
    for (const p of PERMISSION_KEYS) {
      if (!!a[p] !== !!b[p]) return true;
    }
  }
  return false;
}

function pendingChanges() {
  // Devuelve [{ role, perm, from, to, affectedUsers }] con el diff real.
  const out = [];
  for (const role of ROLE_ORDER) {
    const a = current[role] || {};
    const b = pending[role] || {};
    const affected = usersWithRole(role).length;
    for (const p of PERMISSION_KEYS) {
      if (!!a[p] !== !!b[p]) {
        out.push({ role, perm: p, from: !!a[p], to: !!b[p], affectedUsers: affected });
      }
    }
  }
  return out;
}

function totalAffected() {
  // Cuántos usuarios únicos se ven afectados por el diff actual.
  const roles = new Set(pendingChanges().map((c) => c.role));
  let n = 0;
  for (const r of roles) n += usersWithRole(r).length;
  return n;
}

function rolesUsingPerm(perm) {
  // Roles que tienen este permiso activo (en `current`, no en pending — es
  // para "¿qué se romperá si elimino este permiso?").
  if (!current) return [];
  return ROLE_ORDER.filter((r) => !!(current[r] || {})[perm]);
}

// ── Render principal ───────────────────────────────────────────────────────
export async function renderRoles({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  // Banner de "otro usuario modificó permisos" (aparece sólo si lo
  // detectamos por socket y tenemos cambios pendientes). Se inserta
  // el primero en el root para que sea visible al cargar.
  const conflictBanner = h('div.hidden', { role: 'alert' });
  root.appendChild(conflictBanner);

  // Header
  root.appendChild(h('div.flex.flex-wrap.items-start.justify-between.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Roles y permisos'),
      h('p.text-sm.text-slate-500', {}, 'Define qué puede hacer cada rol. Los cambios se aplican en vivo.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
      // Botones "Próximamente" — visibles pero deshabilitados. El tooltip
      // explica qué falta en el backend. Cuando se implemente, reemplazar
      // `disabled: 'disabled'` por la acción real.
      h('button.btn.btn-ghost.btn-sm.cursor-not-allowed.opacity-60', {
        type: 'button',
        disabled: 'disabled',
        title: 'Próximamente — requiere migración del backend (POST /api/roles)',
        'aria-label': 'Crear nuevo rol (próximamente)',
      }, [
        svg(h, ICON.plus, 'w-4 h-4'),
        h('span', {}, 'Nuevo rol'),
      ]),
      h('button.btn.btn-ghost.btn-sm.cursor-not-allowed.opacity-60', {
        type: 'button',
        disabled: 'disabled',
        title: 'Próximamente — requiere migración del backend (POST /api/permissions)',
        'aria-label': 'Crear nuevo permiso (próximamente)',
      }, [
        svg(h, ICON.plus, 'w-4 h-4'),
        h('span', {}, 'Nuevo permiso'),
      ]),
      h('button.btn.btn-ghost', {
        onclick: refresh,
        title: 'Recargar permisos desde el sistema',
        'aria-label': 'Recargar permisos',
      }, [
        svg(h, ICON.refresh, 'w-4 h-4'),
        h('span', {}, 'Recargar'),
      ]),
    ]),
  ]));

  // Contenedor principal: card del rol activo + panel lateral
  const main = h('div.grid.grid-cols-1.lg\\:grid-cols-[1fr_360px].gap-4', {});
  root.appendChild(main);

  // Columna principal: tabs + card del rol activo
  const primary = h('div.flex.flex-col.gap-3', {});
  main.appendChild(primary);

  // Tabs de roles (se llena tras la carga)
  const tabsBar = h('div.flex.gap-1.border-b.border-surface-border.overflow-x-auto', {
    role: 'tablist',
    'aria-label': 'Roles',
  });
  primary.appendChild(tabsBar);

  // Card del rol activo (se llena tras la carga)
  const roleCard = h('div', {});
  primary.appendChild(roleCard);

  // Panel de cambios pendientes (sticky en desktop)
  const pendingCard = h('div.card.flex.flex-col', {
    style: { position: 'sticky', top: '16px' },
  });
  main.appendChild(pendingCard);

  // Footer
  const footer = h('div.text-xs.text-slate-500', {}, '');
  root.appendChild(footer);

  // Loading inicial
  roleCard.appendChild(renderLoading('Cargando roles y permisos…'));

  // ── Realtime: refresca cuando otro SAC guarda permisos o renombra un rol ──
  const onRealtime = (e) => {
    const t = e.detail?.event;
    const payload = e.detail || {};

    if (t === 'role:label_updated') {
      const role = payload.role;
      if (role && editingLabels.has(role)) {
        const who = payload.updatedBy?.full_name || 'otro usuario';
        const newLabel = payload.label || '';
        conflictBanner.classList.remove('hidden');
        conflictBanner.innerHTML = '';
        conflictBanner.className = 'card border-amber-300 bg-amber-50 p-3 flex items-start gap-3';
        conflictBanner.appendChild(svg(h, ICON.alert, 'w-5 h-5 text-amber-600 flex-none mt-0.5'));
        conflictBanner.appendChild(h('div.flex-1.text-sm', {}, [
          h('div.font-semibold.text-amber-800', {}, 'Otro usuario renombró este rol.'),
          h('div.text-amber-700', {}, `${who} cambió el nombre a «${newLabel}» mientras editabas. Recarga para ver el cambio o descarta tu edición.`),
        ]));
        conflictBanner.appendChild(h('div.flex.gap-2.flex-none', {}, [
          h('button.btn.btn-ghost.btn-sm.py-2.min-h-\\[36px\\]', { onclick: () => cancelEditLabel(role) }, 'Descartar'),
          h('button.btn.btn-primary.btn-sm.py-2.min-h-\\[36px\\]', { onclick: refresh }, 'Recargar'),
        ]));
      }
      return;
    }

    if (t !== 'role:permissions_updated') return;
    if (!isDirty()) {
      const incoming = payload.permissions;
      const role = payload.role;
      if (incoming && role && current[role]) {
        current[role] = { ...incoming };
        pending[role] = { ...incoming };
        renderTabs();
        renderRoleCard();
        renderPending();
        renderFooter();
        const by = payload.updatedBy?.full_name;
        toast(by ? `Permisos actualizados por ${by}` : 'Permisos actualizados', 'info', 3000);
      }
    } else {
      conflictBanner.classList.remove('hidden');
      const who = payload.updatedBy?.full_name || 'otro usuario';
      conflictBanner.innerHTML = '';
      conflictBanner.className = 'card border-amber-300 bg-amber-50 p-3 flex items-start gap-3';
      conflictBanner.appendChild(svg(h, ICON.alert, 'w-5 h-5 text-amber-600 flex-none mt-0.5'));
      conflictBanner.appendChild(h('div.flex-1.text-sm', {}, [
        h('div.font-semibold.text-amber-800', {}, 'Otro usuario modificó permisos.'),
        h('div.text-amber-700', {}, `${who} actualizó los permisos del sistema mientras editabas. Recarga para ver los cambios actuales o descarta los tuyos.`),
      ]));
      conflictBanner.appendChild(h('div.flex.gap-2.flex-none', {}, [
        h('button.btn.btn-ghost.btn-sm.py-2.min-h-\\[36px\\]', { onclick: discard }, 'Descartar'),
        h('button.btn.btn-primary.btn-sm.py-2.min-h-\\[36px\\]', { onclick: refresh }, 'Recargar'),
      ]));
    }
  };
  window.addEventListener('gcm:realtime', onRealtime);

  // Suscripción local a cambios del cache de role-labels: cuando llega
  // un cambio externo y NO estamos editando ese label, re-renderizamos
  // las tabs y el header de la card para reflejar el nuevo getRoleLabel().
  const unsubscribeRoleLabel = subscribeRoleLabel((e) => {
    const role = e?.detail?.role;
    if (!role) return;
    if (editingLabels.has(role)) return;
    renderTabs();
    // Re-render del header del rol activo si coincide
    if (role === activeRole) {
      const head = roleCard.querySelector(`[data-role-label="${role}"]`)?.parentElement;
      if (head) {
        const fresh = renderLabelBlock(role);
        head.replaceWith(fresh);
      }
    }
  });

  // Suscripción al cache de usuarios: actualiza los badges de las tabs
  // y el header de la card. No re-renderizamos todo para no perder foco.
  const refreshCountBadges = () => {
    for (const role of ROLE_ORDER) {
      const tab = tabsBar.querySelector(`[data-tab-role="${role}"] [data-role-count]`);
      if (tab) {
        const c = usersCache.countByRole(role);
        tab.textContent = String(c);
      }
      const cardBadge = roleCard.querySelector(`[data-role-count="${role}"]`);
      if (cardBadge) {
        const c = usersCache.countByRole(role);
        cardBadge.textContent = '';
        cardBadge.append(c + ' ');
        cardBadge.append(c === 1 ? 'usuario' : 'usuarios');
      }
    }
    renderPending();
  };
  const unsubscribeUsersCache = usersCache.subscribe(() => {
    refreshCountBadges();
  });

  // Atajos: Ctrl/Cmd+S guarda, Esc descarta. Esc sólo descarta si NO hay
  // un modal/diálogo abierto encima (que ya consume su propio Esc) y si NO
  // estamos dentro de un input (no se lo quitamos al usuario mientras edita).
  const onKey = (e) => {
    const tag = (e.target?.tagName || '').toUpperCase();
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    const hasModal = !!document.querySelector('[role="dialog"]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !typing && isDirty()) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape' && isDirty() && !hasModal && !typing) {
      e.preventDefault();
      discard();
    }
  };
  document.addEventListener('keydown', onKey);

  // ── Render: tabs ────────────────────────────────────────────────────────
  function renderTabs() {
    tabsBar.innerHTML = '';
    for (const role of ROLE_ORDER) {
      const isActive = role === activeRole;
      const count = usersCache.countByRole(role);
      const tab = h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': String(isActive),
        'data-tab-role': role,
        class: [
          'flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 text-sm font-medium transition whitespace-nowrap',
          isActive
            ? 'border-brand-ocean text-brand-ink font-semibold'
            : 'border-transparent text-slate-500 hover:text-brand-ink hover:border-surface-border',
        ],
        onclick: () => {
          if (editingLabels.has(role)) return; // no cambiar de tab mientras edita un label
          activeRole = role;
          renderTabs();
          renderRoleCard();
        },
      }, [
        h('span', {}, getRoleLabel(role)),
        h('span.badge.bg-surface-alt.text-brand-ink.text-\\[11px\\]', { 'data-role-count': '', title: `${count} ${count === 1 ? 'usuario' : 'usuarios'} con este rol` }, String(count)),
      ]);
      tabsBar.appendChild(tab);
    }
  }

  // ── Render: card del rol activo ────────────────────────────────────────
  function renderRoleCard() {
    roleCard.innerHTML = '';
    if (!current) {
      roleCard.appendChild(renderLoading('Cargando…'));
      return;
    }
    const role = activeRole;
    const perms = pending[role] || {};
    const currentPerms = current[role] || {};
    const count = usersWithRole(role).length;
    const enabledCount = PERMISSION_KEYS.filter((p) => perms[p]).length;

    const card = h('div.card.p-0.overflow-hidden', {}, [
      // Cabecera: label editable + descripción + acciones del rol
      h('div.px-5.py-4.border-b.border-surface-border.bg-surface\\/40', {}, [
        h('div.flex.items-start.justify-between.gap-3', {}, [
          h('div.min-w-0.flex-1', {}, [
            h('div.flex.items-center.gap-2.flex-wrap', {}, [
              renderLabelBlock(role),
              h('span.badge.bg-surface-alt.text-brand-ink', { 'data-role-count': role }, [
                String(count),
                ' ',
                count === 1 ? 'usuario' : 'usuarios',
              ]),
              h('span.badge.bg-brand-ocean\\/10.text-brand-ocean', {}, [
                `${enabledCount}/${PERMISSION_KEYS.length} permisos`,
              ]),
            ]),
            h('p.text-xs.text-slate-500.mt-1', {}, ROLE_DESCRIPTIONS[role] || ''),
          ]),
        ]),
        h('div.flex.items-center.gap-2.mt-3.flex-wrap', {}, [
          h('button.btn.btn-ghost.btn-sm', {
            type: 'button',
            onclick: () => disableRole(role),
            title: 'Apagar todos los permisos de este rol (cambia sin guardar)',
          }, [
            svg(h, ICON.alert, 'w-4 h-4'),
            h('span', {}, 'Apagar todo'),
          ]),
          h('button.btn.btn-ghost.btn-sm', {
            type: 'button',
            onclick: () => resetRole(role),
            title: 'Restaurar los permisos al estado actual del servidor',
          }, [
            svg(h, ICON.refresh, 'w-4 h-4'),
            h('span', {}, 'Restaurar'),
          ]),
          h('button.btn.btn-ghost.btn-sm.text-accent.hover\\:bg-accent\\/10', {
            type: 'button',
            onclick: () => openReassignWizard({ type: 'role', target: role }),
            title: 'Eliminar este rol y reasignar sus usuarios',
          }, [
            svg(h, ICON.trash, 'w-4 h-4'),
            h('span', {}, 'Eliminar rol…'),
          ]),
        ]),
      ]),
      // Permisos agrupados por categoría
      h('div.p-5.flex.flex-col.gap-5', {}, renderPermissionGroups(role, perms, currentPerms)),
    ]);
    roleCard.appendChild(card);
  }

  // Devuelve las secciones de permisos, agrupadas. Los permisos que
  // aparezcan en `PERMISSION_KEYS` pero no estén en ningún grupo van a un
  // grupo "Otros" al final (defensa contra drift del backend).
  function renderPermissionGroups(role, perms, currentPerms) {
    const listed = new Set(PERMISSION_GROUPS.flatMap((g) => g.perms));
    const orphans = PERMISSION_KEYS.filter((p) => !listed.has(p));
    const groups = [...PERMISSION_GROUPS];
    if (orphans.length) {
      groups.push({ title: 'Otros', description: 'Permisos sin categoría asignada.', perms: orphans });
    }
    return groups.map((g) => h('div', {}, [
      h('div.flex.items-baseline.gap-2.mb-2', {}, [
        h('h3.text-\\[11px\\].font-semibold.text-brand-ink.uppercase.tracking-wider', {}, g.title),
        h('span.text-\\[11px\\].text-slate-500', {}, g.description),
      ]),
      h('div.flex.flex-col.gap-2', {},
        g.perms.map((p) => renderPermRow({ role, perm: p, perms, currentPerms })),
      ),
    ]));
  }

  // Editor inline del nombre del rol. Modo lectura: texto + lápiz.
  // Modo edición: input + guardar/cancelar. Estado por rol en `editingLabels`.
  // El servidor impone LABEL_MAX=80; lo espejamos en maxlength.
  const LABEL_MAX = 80;

  function renderLabelBlock(role) {
    const edit = editingLabels.get(role);
    if (!edit) {
      return h('div.flex.items-center.gap-1', {}, [
        h('h2.text-base.font-semibold.text-brand-ink', { 'data-role-label': role }, getRoleLabel(role)),
        h('button.btn.btn-ghost.btn-sm.p-1.min-h-\\[36px\\].min-w-\\[36px\\]', {
          type: 'button',
          'aria-label': `Editar nombre del rol ${getRoleLabel(role)}`,
          title: 'Editar nombre del rol',
          onclick: () => startEditLabel(role),
        }, [svg(h, ICON.edit, 'w-4 h-4')]),
      ]);
    }
    return h('div.flex.flex-col.gap-1.min-w-0', {}, [
      h('div.flex.items-center.gap-2', {}, [
        h('input.input.flex-1.min-w-0', {
          type: 'text',
          value: edit.value,
          maxlength: String(LABEL_MAX),
          'data-role-label-input': role,
          'aria-label': `Nombre del rol ${getRoleLabel(role)}`,
          'aria-invalid': edit.error ? 'true' : 'false',
          'aria-describedby': edit.error ? `gcm-role-err-${role}` : null,
          oninput: (e) => updateEditLabel(role, { value: e.target.value, error: null }),
          onkeydown: (e) => {
            if (e.key === 'Enter') { e.preventDefault(); saveEditLabel(role); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelEditLabel(role); }
          },
        }),
        h('button.btn.btn-primary.btn-sm.py-2.min-h-\\[36px\\]', {
          type: 'button',
          'aria-label': 'Guardar nombre del rol',
          disabled: edit.saving,
          onclick: () => saveEditLabel(role),
        }, edit.saving
          ? [svg(h, ICON.spinner, 'w-4 h-4 animate-spin')]
          : [svg(h, ICON.check, 'w-4 h-4')]),
        h('button.btn.btn-ghost.btn-sm.py-2.min-h-\\[36px\\]', {
          type: 'button',
          'aria-label': 'Cancelar edición',
          disabled: edit.saving,
          onclick: () => cancelEditLabel(role),
        }, [svg(h, ICON.close, 'w-4 h-4')]),
      ]),
      edit.error ? h('p.text-xs.text-red-600', { id: `gcm-role-err-${role}`, role: 'alert' }, edit.error) : null,
    ]);
  }

  function startEditLabel(role) {
    editingLabels.set(role, { value: getRoleLabel(role), error: null, saving: false });
    renderTabs();
    renderRoleCard();
    // Foco al input recién montado (post-render).
    queueMicrotask(() => {
      const input = roleCard.querySelector(`[data-role-label-input="${role}"]`);
      if (input) { input.focus(); input.select(); }
    });
  }

  function updateEditLabel(role, patch) {
    const cur = editingLabels.get(role);
    if (!cur) return;
    editingLabels.set(role, { ...cur, ...patch });
    // Re-render quirúrgico: sólo el bloque del label, no la card entera.
    const head = roleCard.querySelector(`[data-role-label="${role}"]`)?.parentElement;
    if (head) {
      const fresh = renderLabelBlock(role);
      head.replaceWith(fresh);
      const input = roleCard.querySelector(`[data-role-label-input="${role}"]`);
      if (input && document.activeElement?.matches?.(`[data-role-label-input="${role}"]`)) {
        const v = input.value;
        input.focus();
        try { input.setSelectionRange(v.length, v.length); } catch {}
      }
    } else {
      renderRoleCard();
    }
  }

  async function saveEditLabel(role) {
    const edit = editingLabels.get(role);
    if (!edit || edit.saving) return;
    const trimmed = (edit.value || '').trim();
    if (trimmed.length === 0) {
      updateEditLabel(role, { error: 'El nombre del rol no puede estar vacío.' });
      return;
    }
    if (trimmed.length > LABEL_MAX) {
      updateEditLabel(role, { error: `El nombre no puede superar los ${LABEL_MAX} caracteres.` });
      return;
    }
    if (trimmed === getRoleLabel(role)) {
      editingLabels.delete(role);
      renderRoleCard();
      return;
    }
    editingLabels.set(role, { ...edit, saving: true, error: null });
    updateEditLabel(role, { saving: true });
    try {
      await api.roles.labels.update(role, trimmed);
      editingLabels.delete(role);
      renderRoleCard();
      toast('Nombre del rol actualizado', 'success', 1800);
    } catch (e) {
      const msg = e?.message || 'No se pudo actualizar el nombre';
      updateEditLabel(role, { saving: false, error: msg });
      queueMicrotask(() => {
        const input = roleCard.querySelector(`[data-role-label-input="${role}"]`);
        if (input) input.focus();
      });
    }
  }

  function cancelEditLabel(role) {
    if (!editingLabels.has(role)) return;
    editingLabels.delete(role);
    renderRoleCard();
  }

  // Fila individual de permiso. Tres columnas visuales: nombre+descripción
  // (izq), impacto y estado (centro), toggle + delete (der).
  function renderPermRow({ role, perm, perms, currentPerms }) {
    const isOn = !!perms[perm];
    const wasOn = !!currentPerms[perm];
    const changed = isOn !== wasOn;
    const isCritical = CRITICAL_PERMS.has(perm);
    const label = PERMISSION_LABELS[perm] || perm;
    const desc = PERMISSION_DESCRIPTIONS[perm] || '';

    return h('div.flex.items-start.gap-3.px-3.py-3.rounded-md.border.border-surface-border\\/70.bg-white', {
      class: changed ? 'ring-2 ring-amber-200' : '',
      'data-perm-row': perm,
    }, [
      // Col izq: label + descripción + badges
      h('div.flex-1.min-w-0', {}, [
        h('div.flex.items-center.gap-2.flex-wrap', {}, [
          h('div.text-sm.font-semibold.text-brand-ink', {}, label),
          isCritical ? h('span.badge.bg-accent\\/10.text-accent.text-\\[10px\\]', {}, 'Crítico') : null,
          changed ? h('span.badge.bg-amber-100.text-amber-800.text-\\[10px\\]', {}, wasOn ? 'Se desactiva' : 'Se activa') : null,
        ]),
        h('p.text-xs.text-slate-500.mt-1', {}, desc),
      ]),
      // Col der: toggle + delete
      h('div.flex.items-center.gap-2.flex-none', {}, [
        h('div.text-\\[11px\\].text-slate-500.w-20.text-right', {}, isOn ? 'Permiso activo' : 'Inactivo'),
        renderToggle({ role, perm, isOn, changed, wasOn }),
        h('button.btn-icon-sm.text-slate-400.hover\\:text-accent.hover\\:bg-accent\\/10', {
          type: 'button',
          'aria-label': `Eliminar permiso ${label}`,
          title: 'Eliminar este permiso (próximamente)',
          disabled: 'disabled',
          onclick: (e) => { e.preventDefault(); },
        }, [svg(h, ICON.trash, 'w-4 h-4')]),
      ]),
    ]);
  }

  // Toggle switch accesible. Estructura: button role=switch + track + thumb.
  // Hit-area invisible 44×28 con `before:absolute before:inset-y-0 before:-inset-x-2`
  // para cumplir WCAG 2.5.5 (44×44) sin alterar el visual.
  function renderToggle({ role, perm, isOn, changed, wasOn }) {
    const bgClass = isOn ? 'bg-brand-navy' : 'bg-slate-300';
    return h('button.relative.inline-flex.items-center.w-9.h-5.rounded-full.transition-colors.focus\\:outline-none.focus\\:ring-2.focus\\:ring-brand-ocean\\/60.focus\\:ring-offset-1.before\\:absolute.before\\:inset-y-0.before\\:-inset-x-2.before\\:content-[""]', {
      role: 'switch',
      type: 'button',
      'aria-checked': String(isOn),
      'aria-label': `${PERMISSION_LABELS[perm]} para ${getRoleLabel(role)}`,
      title: changed
        ? `${PERMISSION_LABELS[perm]}: ${wasOn ? 'sí' : 'no'} → ${isOn ? 'sí' : 'no'} (cambio sin guardar)`
        : `${PERMISSION_LABELS[perm]}: ${isOn ? 'sí' : 'no'}`,
      class: [bgClass, changed ? 'ring-2 ring-amber-400 ring-offset-1' : ''],
      onclick: () => togglePerm(role, perm),
    }, [
      h('span.inline-block.w-4.h-4.bg-white.rounded-full.shadow-soft.transform.transition-transform', {
        style: { transform: isOn ? 'translateX(18px)' : 'translateX(2px)' },
      }),
    ]);
  }

  function togglePerm(role, perm) {
    if (!pending[role]) pending[role] = {};
    pending[role][perm] = !pending[role][perm];
    // Re-render quirúrgico: la fila cambió y el panel de cambios también.
    // Re-renderizamos la card completa (es barata) y el panel.
    renderRoleCard();
    renderPending();
  }

  function disableRole(role) {
    const perms = pending[role] || {};
    const enabledCount = PERMISSION_KEYS.filter((p) => perms[p]).length;
    if (enabledCount === 0) return;
    confirmModal({
      title: `Apagar todos los permisos de ${getRoleLabel(role)}`,
      message: `Vas a desactivar los <b>${enabledCount}</b> permisos activos de este rol. Los usuarios con este rol perderán esas capacidades hasta que guardes los cambios.`,
      confirmText: 'Apagar todo',
      danger: true,
      onConfirm: () => {
        pending[role] = Object.fromEntries(PERMISSION_KEYS.map((p) => [p, false]));
        renderRoleCard();
        renderPending();
        toast(`Permisos de "${getRoleLabel(role)}" apagados. Guarda para aplicar.`, 'info', 2500);
      },
    });
  }

  function resetRole(role) {
    pending[role] = { ...(current[role] || {}) };
    renderRoleCard();
    renderPending();
    toast(`Permisos de ${getRoleLabel(role)} restaurados.`, 'success', 1800);
  }

  // Estado de UI: error visible y flag de guardado.
  let saving = false;
  let loadedAt = null;
  const errEl = h('div.hidden.m-3.mt-0.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', {
    role: 'alert',
  });

  // ── Render: panel de cambios pendientes ────────────────────────────────
  function renderPending() {
    pendingCard.innerHTML = '';
    const changes = pendingChanges();
    const dirty = changes.length > 0;
    const affected = totalAffected();

    pendingCard.appendChild(h('div.p-4.border-b.border-surface-border', {}, [
      h('div.flex.items-center.justify-between', {}, [
        h('div', {}, [
          h('div.label.text-slate-500', {}, 'Cambios pendientes'),
          h('div.text-base.font-semibold.text-brand-ink', {}, dirty
            ? `${changes.length} ${changes.length === 1 ? 'cambio' : 'cambios'} · ${affected} ${affected === 1 ? 'persona afectada' : 'personas afectadas'}`
            : 'Sin cambios pendientes'),
        ]),
        dirty ? h('span.badge.bg-amber-100.text-amber-800', {}, 'Sin guardar') : h('span.badge.bg-emerald-100.text-emerald-800', {}, 'Sincronizado'),
      ]),
    ]));

    const list = h('div.p-3.flex-1.overflow-y-auto', { style: { maxHeight: '420px' } });
    if (!dirty) {
      list.appendChild(h('div.empty-state-compact', {}, [
        h('div.text-sm.text-slate-500', {}, 'No hay cambios por aplicar. Los permisos del sistema están al día con el backend.'),
      ]));
    } else {
      const byRole = new Map();
      for (const c of changes) {
        if (!byRole.has(c.role)) byRole.set(c.role, []);
        byRole.get(c.role).push(c);
      }
      for (const role of ROLE_ORDER) {
        const list_ = byRole.get(role);
        if (!list_) continue;
        list.appendChild(h('div.mb-3.last\\:mb-0', {}, [
          h('div.text-\\[11px\\].uppercase.tracking-wider.text-slate-500.font-semibold.mb-1.5', {}, getRoleLabel(role)),
          ...list_.map((c) => {
            const isCritical = CRITICAL_PERMS.has(c.perm);
            return h('div.flex.items-start.gap-2.py-1.text-sm', {}, [
              h('span', { class: `mt-1 w-1.5 h-1.5 rounded-full flex-none ${c.to ? 'bg-emerald-500' : isCritical ? 'bg-accent' : 'bg-slate-400'}` }),
              h('div.flex-1.min-w-0', {}, [
                h('div.text-brand-ink', {}, [
                  h('span', {}, c.to ? 'Activar' : 'Desactivar'),
                  h('span.text-slate-500', {}, ' · '),
                  h('span.font-medium', {}, PERMISSION_LABELS[c.perm]),
                ]),
                h('div.text-\\[11px\\].text-slate-500', {}, c.affectedUsers === 0
                  ? 'Aplica al definir; aún no hay usuarios con este rol.'
                  : `Afecta a ${c.affectedUsers} ${c.affectedUsers === 1 ? 'persona' : 'personas'}.`),
              ]),
            ]);
          }),
        ]));
      }
    }
    pendingCard.appendChild(list);

    // Acciones
    const actions = h('div.p-3.border-t.border-surface-border.flex.gap-2', {});
    const discardBtn = h('button.btn.btn-ghost.flex-1', {
      onclick: discard,
      disabled: !dirty,
    }, 'Descartar');
    const saveBtn = h('button.btn.flex-1', {
      class: [dirty ? 'btn-accent' : 'btn-primary', 'opacity-100'],
      onclick: save,
      disabled: !dirty || saving,
    }, saving
      ? [svg(h, ICON.spinner, 'w-4 h-4 animate-spin'), h('span', {}, 'Guardando…')]
      : 'Guardar cambios');
    actions.appendChild(discardBtn);
    actions.appendChild(saveBtn);
    pendingCard.appendChild(actions);

    if (!errEl.classList.contains('hidden')) {
      pendingCard.appendChild(errEl);
    }
  }

  // ── Render: footer ─────────────────────────────────────────────────────
  function renderFooter() {
    const last = lastModifiedAt();
    if (!last) {
      footer.textContent = 'Permisos en estado por defecto. Aún no se han personalizado desde esta pantalla.';
      return;
    }
    footer.textContent = `Última modificación local: ${last}`;
  }

  function lastModifiedAt() {
    return loadedAt ? loadedAt.toLocaleString('es-ES') : null;
  }

  // ── Acciones: save / discard / refresh ─────────────────────────────────
  async function save() {
    if (!isDirty() || saving) return;
    saving = true;
    errEl.classList.add('hidden');
    renderPending();
    try {
      const rolesChanged = new Set(pendingChanges().map((c) => c.role));
      // CRÍTICO — anti-borrado: cada PATCH envía los 6 permisos del estado
      // pendiente, no sólo los modificados. Así el backend nunca recibe un
      // body parcial que pueda sobrescribir permisos no enviados.
      const patches = [...rolesChanged].map((role) => ({
        role,
        perms: pending[role],
      }));
      const results = await Promise.allSettled(
        patches.map((p) => api.roles.update(p.role, p.perms))
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length) {
        const msg = failed[0].reason?.message || 'Error al guardar permisos';
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
        toast('No se pudieron guardar todos los cambios', 'error');
        renderPending();
        return;
      }
      for (const p of patches) current[p.role] = { ...p.perms };
      conflictBanner.classList.add('hidden');
      conflictBanner.innerHTML = '';
      conflictBanner.className = 'hidden';
      loadedAt = new Date();
      renderTabs();
      renderRoleCard();
      renderPending();
      renderFooter();
      toast(`Permisos actualizados: ${patches.length} ${patches.length === 1 ? 'rol modificado' : 'roles modificados'}`, 'success');
    } catch (e) {
      errEl.textContent = e.message || 'Error inesperado';
      errEl.classList.remove('hidden');
      renderPending();
    } finally {
      saving = false;
    }
  }

  function discard() {
    if (!isDirty()) return;
    pending = JSON.parse(JSON.stringify(current));
    conflictBanner.classList.add('hidden');
    conflictBanner.innerHTML = '';
    conflictBanner.className = 'hidden';
    errEl.classList.add('hidden');
    renderRoleCard();
    renderPending();
    toast('Cambios descartados', 'info', 1800);
  }

  async function refresh() {
    if (isDirty()) {
      if (!confirm('Tienes cambios sin guardar. ¿Recargar y perderlos?')) return;
    }
    roleCard.innerHTML = '';
    roleCard.appendChild(renderLoading('Recargando permisos…'));
    try {
      await loadAll();
      conflictBanner.classList.add('hidden');
      conflictBanner.innerHTML = '';
      conflictBanner.className = 'hidden';
      loadedAt = new Date();
      renderTabs();
      renderRoleCard();
      renderPending();
      renderFooter();
      toast('Permisos recargados', 'info', 1800);
    } catch (e) {
      toast(e.message || 'No se pudo recargar', 'error');
      roleCard.innerHTML = '';
      roleCard.appendChild(emptyState({
        title: 'No se pudo cargar la matriz',
        message: e.message || 'Error desconocido',
        icon: ICON.alert,
      }));
    }
  }

  // ── Boot ───────────────────────────────────────────────────────────────
  try {
    await loadAll();
    loadedAt = new Date();
    renderTabs();
    renderRoleCard();
    renderPending();
    renderFooter();
  } catch (e) {
    roleCard.innerHTML = '';
    roleCard.appendChild(emptyState({
      title: 'No se pudieron cargar los permisos',
      message: e.message || 'Error desconocido',
      icon: ICON.alert,
    }));
  }

  root._gcmCleanup = () => {
    window.removeEventListener('gcm:realtime', onRealtime);
    document.removeEventListener('keydown', onKey);
    if (typeof unsubscribeRoleLabel === 'function') unsubscribeRoleLabel();
    if (typeof unsubscribeUsersCache === 'function') unsubscribeUsersCache();
  };

  return root;
}

function renderLoading(message) {
  return h('div.flex.items-center.justify-center.gap-2.py-10.text-sm.text-slate-600', {
    role: 'status',
    'aria-live': 'polite',
  }, [
    h('svg.animate-spin.w-4.h-4.text-brand-ocean', {
      fill: 'none', viewBox: '0 0 24 24', aria-hidden: 'true',
      html: '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>',
    }),
    h('span', {}, message),
  ]);
}

// ── Wizard de reasignación ─────────────────────────────────────────────────
// Encapsula el modal de 2 pasos para "Eliminar rol" o "Eliminar permiso".
// En esta fase la acción es simulada (muestra toast "Acción simulada —
// requiere migración del backend"). Cuando el backend soporte los endpoints
// DELETE, reemplazar la sección marcada con TODO.
function openReassignWizard({ type, target }) {
  // type: 'role' | 'permission'
  // target: role string o perm key
  const isRole = type === 'role';
  const targetLabel = isRole ? getRoleLabel(target) : (PERMISSION_LABELS[target] || target);
  // Afectados: usuarios con el rol (role) o roles que tienen el permiso activo (permission).
  const affected = isRole ? usersWithRole(target) : rolesUsingPerm(target).map((r) => ({ id: r, full_name: getRoleLabel(r), role: r, isRole: true }));
  // Alternativas: todos los roles/permisos excepto el target.
  const alternatives = isRole
    ? ROLE_ORDER.filter((r) => r !== target)
    : PERMISSION_KEYS.filter((p) => p !== target);

  let step = 1;
  let chosen = null; // alternativa elegida en paso 1

  // ── Render del paso ────────────────────────────────────────────────────
  const stepIndicator = (n) => h('span.font-mono.text-\\[10px\\].text-slate-500.tabular-nums', {}, `0${n}`);
  const step1 = h('div', {});
  const step2 = h('div.hidden', {});

  function renderStep1() {
    step1.innerHTML = '';
    step1.appendChild(h('div.text-sm.text-slate-600.mb-4', {}, [
      isRole
        ? `${affected.length} ${affected.length === 1 ? 'usuario tiene' : 'usuarios tienen'} el rol «${escapeHtml(targetLabel)}». Reasígnalos antes de eliminarlo.`
        : `${affected.length} ${affected.length === 1 ? 'rol usa' : 'roles usan'} el permiso «${escapeHtml(targetLabel)}». Decide qué permisos alternativos quedan activos.`,
    ]));

    // Tabla compacta de afectados
    if (affected.length === 0) {
      step1.appendChild(emptyState({
        icon: isRole ? 'users' : 'shield',
        title: isRole ? 'Sin usuarios asignados' : 'Ningún rol usa este permiso',
        message: isRole
          ? 'Puedes eliminar este rol sin reasignar a nadie.'
          : 'Puedes eliminar este permiso sin afectar a ningún rol.',
        className: 'py-6',
      }));
    } else {
      const table = h('div.table-wrap', {});
      const rows = affected.map((u) => `
        <tr>
          <td class="font-medium">${escapeHtml(u.full_name || u.id)}</td>
          ${isRole ? `<td>${escapeHtml(AREA_LABEL[u.area] || u.area || '—')}</td>` : ''}
          <td>${isRole ? `<span class="badge bg-brand/10 text-brand">${escapeHtml(getRoleLabel(u.role))}</span>` : `<span class="text-xs text-slate-500">${escapeHtml(PERMISSION_LABELS[(current[u.role] || {})] ? '' : '')}</span>`}</td>
        </tr>
      `).join('');
      table.innerHTML = `
        <table class="table">
          <thead><tr>
            <th>${isRole ? 'Usuario' : 'Rol'}</th>
            ${isRole ? '<th>Área</th>' : ''}
            <th>${isRole ? 'Rol actual' : 'Permisos activos'}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      step1.appendChild(table);
    }

    // Selector de destino
    if (affected.length > 0) {
      step1.appendChild(h('div.mt-4', {}, [
        h('label.label', { for: 'gcm-reassign-target' }, isRole ? 'Reasignar usuarios a' : 'Mantener permiso activo (reemplazo)'),
        h('select.input.mt-2', {
          id: 'gcm-reassign-target',
          onchange: (e) => { chosen = e.target.value; updateContinueEnabled(); },
        }, [
          h('option', { value: '' }, isRole ? '— Selecciona un rol —' : '— Selecciona un permiso —'),
          ...alternatives.map((a) => h('option', { value: a }, isRole ? getRoleLabel(a) : (PERMISSION_LABELS[a] || a))),
        ]),
        chosen ? null : h('p.text-xs.text-amber-700.mt-2', {}, isRole ? 'Selecciona un rol para poder continuar.' : 'Selecciona un permiso para poder continuar.'),
      ]));
    }
  }

  function renderStep2() {
    step2.innerHTML = '';
    step2.appendChild(h('div.flex.items-start.gap-3.p-3.rounded-md.bg-amber-50.border.border-amber-200.mb-4', {}, [
      svg(h, ICON.alert, 'w-5 h-5 text-amber-600 flex-none mt-0.5'),
      h('div.text-sm.text-amber-800', {}, isRole
        ? `Esta acción no se puede deshacer. Los ${affected.length} ${affected.length === 1 ? 'usuario reasignado' : 'usuarios reasignados'} quedarán con el rol «${escapeHtml(getRoleLabel(chosen))}» y perderán cualquier capacidad específica de «${escapeHtml(targetLabel)}».`
        : `Esta acción no se puede deshacer. Los ${affected.length} ${affected.length === 1 ? 'rol afectado' : 'roles afectados'} perderán el permiso «${escapeHtml(targetLabel)}» y se les asignará «${escapeHtml(PERMISSION_LABELS[chosen] || chosen)}» en su lugar.`),
    ]));
    step2.appendChild(h('div.text-sm.text-slate-600', {}, [
      h('div.font-semibold.text-brand-ink.mb-2', {}, 'Resumen'),
      h('ul.list-disc.list-inside.text-sm.text-slate-600.space-y-1', {}, [
        isRole
          ? h('li', {}, `${affected.length} ${affected.length === 1 ? 'usuario reasignado' : 'usuarios reasignados'} a «${escapeHtml(getRoleLabel(chosen))}».`)
          : h('li', {}, `${affected.length} ${affected.length === 1 ? 'rol actualizado' : 'roles actualizados'} (sustitución de permiso).`),
        isRole
          ? h('li', {}, `El rol «${escapeHtml(targetLabel)}» será desactivado y no podrá asignarse a nuevos usuarios.`)
          : h('li', {}, `El permiso «${escapeHtml(targetLabel)}» será eliminado del sistema.`),
        // TODO(backend): cuando se implemente DELETE /api/roles/:role y
        // DELETE /api/permissions/:key, conectar aquí la llamada real.
        h('li.italic.text-slate-500', {}, 'Acción simulada en esta versión: requiere migración del backend.'),
      ]),
    ]));
  }

  function updateContinueEnabled() {
    const btns = step1.querySelectorAll('[data-wizard-action]');
    btns.forEach((b) => {
      if (b.dataset.wizardAction === 'continue') {
        if (affected.length === 0) {
          b.disabled = false;
          b.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
          const ok = !!chosen;
          b.disabled = !ok;
          b.classList.toggle('opacity-50', !ok);
          b.classList.toggle('cursor-not-allowed', !ok);
        }
      }
    });
  }

  // ── Modal: acciones y construcción ───────────────────────────────────
  const titleEl1 = h('h3#gcm-modal-title.text-base.font-semibold.text-slate-800', {}, '');
  titleEl1.textContent = `Eliminar «${targetLabel}»`;
  // Reemplazamos el title por nuestro header enriquecido (paso indicator + título).
  // openModal usa h3#gcm-modal-title para aria-labelledby, así que tenemos
  // que respetarlo: pasamos como title un nodo con #gcm-modal-title.
  const titleNode = h('div.flex.items-center.gap-3', {}, [
    stepIndicator(1),
    h('h3#gcm-modal-title.text-base.font-semibold.text-slate-800', {}, `Eliminar «${targetLabel}»`),
  ]);

  function goToStep(n) {
    step = n;
    if (n === 1) {
      step1.classList.remove('hidden');
      step2.classList.add('hidden');
      titleNode.innerHTML = '';
      titleNode.append(stepIndicator(1));
      titleNode.append(h('h3#gcm-modal-title.text-base.font-semibold.text-slate-800', {}, `Eliminar «${targetLabel}» — Paso 1 de 2`));
    } else {
      step1.classList.add('hidden');
      step2.classList.remove('hidden');
      titleNode.innerHTML = '';
      titleNode.append(stepIndicator(2));
      titleNode.append(h('h3#gcm-modal-title.text-base.font-semibold.text-slate-800', {}, `Eliminar «${targetLabel}» — Confirmar`));
      renderStep2();
    }
  }

  // Render inicial
  renderStep1();

  const body = h('div.flex.flex-col.gap-4', {}, [step1, step2]);

  const actions = (close) => [
    h('button.btn.btn-secondary', { onclick: close, type: 'button' }, 'Cancelar'),
    h('button.btn.btn-ghost', {
      type: 'button',
      'data-wizard-action': 'back',
      class: 'hidden',
      onclick: () => goToStep(1),
    }, '← Atrás'),
    h('button.btn.btn-accent', {
      type: 'button',
      'data-wizard-action': 'continue',
      onclick: () => goToStep(2),
    }, affected.length === 0 ? 'Continuar →' : 'Continuar →'),
    h('button.btn.btn-accent', {
      type: 'button',
      'data-wizard-action': 'confirm',
      class: 'hidden',
      onclick: () => {
        // TODO(backend): reemplazar por la llamada real cuando esté.
        // Por ahora: toast informativo.
        const verb = isRole ? 'Rol' : 'Permiso';
        const reasign = isRole
          ? `${affected.length} ${affected.length === 1 ? 'usuario reasignado a' : 'usuarios reasignados a'} «${getRoleLabel(chosen)}»`
          : `${affected.length} ${affected.length === 1 ? 'rol actualizado' : 'roles actualizados'}`;
        toast(`${verb} «${targetLabel}» — acción simulada (${reasign}).`, 'info', 5000);
        toast('Requiere migración del backend: DELETE /api/roles/:role y DELETE /api/permissions/:key.', 'warn', 6000);
        close();
      },
    }, isRole ? 'Reasignar y eliminar' : 'Reemplazar y eliminar'),
  ];

  const { cleanup } = openModal({
    title: titleNode,
    body,
    actions,
    size: 'xl',
    onClose: () => { /* noop */ },
  });

  // Mostrar/ocultar botones según el paso
  const observer = new MutationObserver(() => {
    const buttons = document.querySelectorAll('[data-wizard-action]');
    buttons.forEach((b) => {
      const act = b.dataset.wizardAction;
      if (act === 'back')    b.classList.toggle('hidden', step === 1);
      if (act === 'continue') b.classList.toggle('hidden', step !== 1);
      if (act === 'confirm')  b.classList.toggle('hidden', step !== 2);
    });
  });
  // Observar cambios de clase en step1/step2
  observer.observe(step1, { attributes: true, attributeFilter: ['class'] });
  observer.observe(step2, { attributes: true, attributeFilter: ['class'] });

  // Estado inicial de los botones
  updateContinueEnabled();
}

/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { getRoleLabel, subscribe as subscribeRoleLabel } from '../utils/role-labels.js';
import { usersCache } from '../utils/users-cache.js';
import { AREA_LABEL } from '../utils/format.js';
import { ICON, svg } from '../utils/icons.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';

const ROLE_ORDER = ['sac', 'jefe_inmediato', 'admin_area', 'supervisor_campo'];

const ROLE_DESCRIPTIONS = {
  sac:              'Administra el sistema, configura permisos y es el último eslabón antes del cliente.',
  jefe_inmediato:   'Cierra y reabre tickets. Tiene la última palabra sobre los casos del área.',
  admin_area:       'Ejecuta y resuelve los tickets asignados a su área.',
  supervisor_campo: 'Levanta tickets en campo sobre lo que ve en operación.',
};

let CRITICAL_PERMS = new Set(['manageUsers', 'assign', 'createTicket']);

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

const GROUP_ICON = {
  Tickets: ICON.ticket,
  Administración: ICON.users,
  Reportes: ICON.report,
};

let current = null;
let pending = null;
const editingLabels = new Map();
let activeRole = ROLE_ORDER[0];

/**
 * Carga desde la API la matriz de roles/permisos vigente y el catálogo de usuarios, e inicializa el estado pendiente de edición.
 * @returns {Promise<void>}
 */
async function loadAll() {
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
  pending = JSON.parse(JSON.stringify(current));
}

/**
 * Filtra el caché de usuarios devolviendo solo los que tienen el rol dado.
 * @param {string} role - clave del rol
 * @returns {Array<Object>} usuarios con ese rol
 */
function usersWithRole(role) {
  return usersCache.get().filter((u) => u.role === role);
}

/**
 * Determina si hay diferencias sin guardar entre los permisos actuales y los pendientes de edición.
 * @returns {boolean} true si existe al menos un cambio pendiente
 */
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

/**
 * Calcula la lista de cambios de permisos pendientes de guardar, comparando estado actual contra el editado.
 * @returns {Array<Object>} cambios con { role, perm, from, to, affectedUsers }
 */
function pendingChanges() {
  if (!current || !pending)
    return [];
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

/**
 * Cuenta cuántos usuarios en total quedan afectados por los cambios de permisos pendientes.
 * @returns {number} cantidad de usuarios afectados
 */
function totalAffected() {
  const roles = new Set(pendingChanges().map((c) => c.role));
  let n = 0;
  for (const r of roles) n += usersWithRole(r).length;
  return n;
}

/**
 * Determina qué roles tienen activo un permiso dado, según el estado actual (guardado) del sistema.
 * @param {string} perm - clave del permiso
 * @returns {Array<string>} roles que tienen ese permiso activo
 */
function rolesUsingPerm(perm) {
  if (!current)
    return [];
  return ROLE_ORDER.filter((r) => !!(current[r] || {})[perm]);
}

/**
 * Punto de entrada de la vista Roles y permisos: arma las pestañas por rol, la matriz de permisos editable
 * y el panel de cambios pendientes, con guardado, descarte, atajos de teclado y sincronización en tiempo real.
 * @param {Object} params - parámetros de la vista
 * @param {Object} params.user - usuario autenticado
 * @returns {Promise<HTMLElement>} nodo raíz de la vista
 */
export async function renderRoles({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  const conflictBanner = h('div.hidden', { role: 'alert' });
  root.appendChild(conflictBanner);

  root.appendChild(h('div.flex.flex-wrap.items-start.justify-between.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Roles y permisos'),
      h('p.text-sm.text-slate-500', {}, 'Define qué puede hacer cada rol. Los cambios se aplican en vivo.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
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

  const main = h('div.grid.grid-cols-1.gap-4', { class: 'lg:grid-cols-[1fr_360px]' });
  root.appendChild(main);

  const primary = h('div.flex.flex-col.gap-3', {});
  main.appendChild(primary);

  const tabsBar = h('div.flex.gap-2.overflow-x-auto.pb-1', {
    role: 'tablist',
    'aria-label': 'Roles',
  });
  primary.appendChild(tabsBar);

  const roleCard = h('div', {});
  primary.appendChild(roleCard);

  const pendingCard = h('div.card.flex.flex-col', {
    style: { position: 'sticky', top: '16px' },
  });
  main.appendChild(pendingCard);

  const footer = h('div.text-xs.text-slate-500', {}, '');
  root.appendChild(footer);

  roleCard.appendChild(renderLoading('Cargando roles y permisos…'));

  /**
   * Handler de eventos realtime de roles: sincroniza cambios de nombre o permisos hechos por otros usuarios,
   * mostrando un banner de conflicto si hay ediciones locales sin guardar que colisionan.
   * @param {CustomEvent} e - evento 'gcm:realtime' recibido
   * @returns {void}
   */
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
          h('button.btn.btn-ghost.btn-sm.py-2', { class: 'min-h-[36px]', onclick: () => cancelEditLabel(role) }, 'Descartar'),
          h('button.btn.btn-primary.btn-sm.py-2', { class: 'min-h-[36px]', onclick: refresh }, 'Recargar'),
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
        h('button.btn.btn-ghost.btn-sm.py-2', { class: 'min-h-[36px]', onclick: discard }, 'Descartar'),
        h('button.btn.btn-primary.btn-sm.py-2', { class: 'min-h-[36px]', onclick: refresh }, 'Recargar'),
      ]));
    }
  };
  window.addEventListener('gcm:realtime', onRealtime);

  const unsubscribeRoleLabel = subscribeRoleLabel((e) => {
    const role = e?.detail?.role;
    if (!role) return;
    if (editingLabels.has(role)) return;
    renderTabs();
    if (role === activeRole) {
      const head = roleCard.querySelector(`[data-role-label="${role}"]`)?.parentElement;
      if (head) {
        const fresh = renderLabelBlock(role);
        head.replaceWith(fresh);
      }
    }
  });

  /**
   * Actualiza los contadores de usuarios por rol mostrados en las pestañas y en la tarjeta del rol activo.
   * @returns {void}
   */
  const refreshCountBadges = () => {
    const usersLoaded = usersCache.isLoaded();
    for (const role of ROLE_ORDER) {
      const tab = tabsBar.querySelector(`[data-tab-role="${role}"] [data-role-count]`);
      if (tab) {
        const count = usersLoaded ? usersCache.countByRole(role) : null;
        tab.textContent = usersLoaded ? String(count) : '…';
        tab.title = usersLoaded
          ? `${count} ${count === 1 ? 'usuario' : 'usuarios'} con este rol`
          : 'Cargando usuarios…';
      }
      const cardBadge = roleCard.querySelector(`[data-role-count="${role}"]`);
      if (cardBadge) {
        const count = usersLoaded ? usersCache.countByRole(role) : null;
        cardBadge.textContent = '';
        cardBadge.append(usersLoaded ? String(count) : '…');
        cardBadge.append(' ');
        cardBadge.append(usersLoaded ? (count === 1 ? 'usuario' : 'usuarios') : 'usuarios');
      }
    }
    renderPending();
  };
  const unsubscribeUsersCache = usersCache.subscribe(() => {
    if (!current) return;
    renderTabs();
    renderRoleCard();
    refreshCountBadges();
  });

  /**
   * Handler global de teclado: Ctrl/Cmd+S guarda los cambios pendientes, Escape los descarta (si no hay foco en un input ni modal abierto).
   * @param {KeyboardEvent} e - evento de teclado
   * @returns {void}
   */
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

  /**
   * Redibuja la barra de pestañas de roles, marcando la pestaña activa y el contador de usuarios de cada rol.
   * @returns {void}
   */
  function renderTabs() {
    tabsBar.innerHTML = '';
    const usersLoaded = usersCache.isLoaded();
    for (const role of ROLE_ORDER) {
      const isActive = role === activeRole;
      const count = usersLoaded ? usersCache.countByRole(role) : null;
      const tab = h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': String(isActive),
        'data-tab-role': role,
        class: [
          'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition whitespace-nowrap flex-none',
          isActive
            ? 'bg-brand text-white font-bold shadow-card'
            : 'bg-surface-alt text-slate-600 font-medium hover:bg-surface-border',
        ],
        onclick: () => {
          if (editingLabels.has(role))
            return;
          activeRole = role;
          renderTabs();
          renderRoleCard();
        },
      }, [
        h('span', {}, getRoleLabel(role)),
        h('span.rounded-full.px-2', {
          class: `py-0.5 text-[11px] ${isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`,
          'data-role-count': '',
          title: usersLoaded ? `${count} ${count === 1 ? 'usuario' : 'usuarios'} con este rol` : 'Cargando usuarios…',
        }, usersLoaded ? String(count) : '…'),
      ]);
      tabsBar.appendChild(tab);
    }
  }

  /**
   * Redibuja la tarjeta principal del rol activo: cabecera con nombre editable, contador de usuarios,
   * resumen de permisos activos y las acciones "Apagar todo" / "Restaurar".
   * @returns {void}
   */
  function renderRoleCard() {
    roleCard.innerHTML = '';
    if (!current) {
      roleCard.appendChild(renderLoading('Cargando…'));
      return;
    }
    const role = activeRole;
    const perms = pending[role] || {};
    const currentPerms = current[role] || {};
    const usersLoaded = usersCache.isLoaded();
    const count = usersLoaded ? usersWithRole(role).length : null;
    const enabledCount = PERMISSION_KEYS.filter((p) => perms[p]).length;

    const card = h('div.card.p-0.overflow-hidden', {}, [
      h(
        'div.px-5.py-4.border-b.border-surface-border',
        { class: 'bg-surface/40' },
        [
          h('div.flex.items-start.justify-between.gap-3', {}, [
            h('div.min-w-0.flex-1', {}, [
              h('div.flex.items-center.gap-2.flex-wrap', {}, [
                renderLabelBlock(role),
                h('span.badge.bg-surface-alt.text-brand-ink', { 'data-role-count': role }, [
                  usersLoaded ? String(count) : '…',
                  ' ',
                  usersLoaded
                    ? count === 1 ? 'usuario' : 'usuarios'
                    : 'usuarios',
                ]),
                h('span.badge', { class: 'bg-brand-ocean/10 text-brand-ocean' }, [
                  `${enabledCount}/${PERMISSION_KEYS.length} permisos`,
                ]),
              ]),
              h('p.text-xs.text-slate-500.mt-1', {}, ROLE_DESCRIPTIONS[role] || ''),
            ]),
          ]),
          h('div.flex.items-center.gap-1.mt-3.flex-wrap', {}, [
            h('button.flex.items-center.rounded-lg.text-sm.font-medium.text-brand-ocean.transition', {
              class: 'gap-1.5 px-3 py-1.5 hover:bg-brand-ocean/10',
              type: 'button',
              onclick: () => disableRole(role),
              title: 'Apagar todos los permisos de este rol — cambio sin guardar',
            }, [
              svg(h, ICON.alert, 'w-4 h-4'),
              h('span', {}, 'Apagar todo'),
            ]),
            h('button.flex.items-center.rounded-lg.text-sm.font-medium.text-brand-ocean.transition', {
              class: 'gap-1.5 px-3 py-1.5 hover:bg-brand-ocean/10',
              type: 'button',
              onclick: () => resetRole(role),
              title: 'Restaurar los permisos al estado actual del servidor',
            }, [
              svg(h, ICON.refresh, 'w-4 h-4'),
              h('span', {}, 'Restaurar'),
            ]),
          ]),
        ]
      ),
      h(
        'div.p-5.flex.flex-col.gap-5',
        {},
        renderPermissionGroups(role, perms, currentPerms)
      ),
    ]);
    roleCard.appendChild(card);
  }

  /**
   * Arma los grupos de permisos (Tickets, Administración, Reportes y "Otros" para permisos sin categoría) de un rol.
   * @param {string} role - clave del rol
   * @param {Object} perms - permisos pendientes de edición del rol
   * @param {Object} currentPerms - permisos actuales (guardados) del rol
   * @returns {Array<HTMLElement>} nodos de cada grupo de permisos
   */
  function renderPermissionGroups(role, perms, currentPerms) {
    const listed = new Set(PERMISSION_GROUPS.flatMap((g) => g.perms));
    const orphans = PERMISSION_KEYS.filter((p) => !listed.has(p));
    const groups = [...PERMISSION_GROUPS];
    if (orphans.length) {
      groups.push({ title: 'Otros', description: 'Permisos sin categoría asignada.', perms: orphans });
    }
    return groups.map((g) => h('div', {}, [
      h('div.flex.items-center.gap-2.pb-2.mb-2.border-b.border-surface-border', {}, [
        svg(h, GROUP_ICON[g.title] || ICON.tag, 'w-5 h-5 text-brand flex-none'),
        h('h3.font-bold.text-brand-ink', {}, g.title),
      ]),
      h('p.text-xs.text-slate-500.mb-2.-mt-1', {}, g.description),
      h('div.flex.flex-col.gap-1.role-perm-zebra', {},
        g.perms.map((p) => renderPermRow({ role, perm: p, perms, currentPerms })),
      ),
    ]));
  }

  const LABEL_MAX = 80;

  /**
   * Renderiza el nombre del rol: en modo lectura muestra el texto con botón de editar; en modo edición muestra
   * un input con botones de guardar/cancelar.
   * @param {string} role - clave del rol
   * @returns {HTMLElement} nodo del bloque de nombre del rol
   */
  function renderLabelBlock(role) {
    const edit = editingLabels.get(role);
    if (!edit) {
      return h('div.flex.items-center.gap-1', {}, [
        h('h2.text-base.font-semibold.text-brand-ink', { 'data-role-label': role }, getRoleLabel(role)),
        h('button.btn.btn-ghost.btn-sm.p-1', {
          class: 'min-h-[36px] min-w-[36px]',
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
        h('button.btn.btn-primary.btn-sm.py-2', {
          class: 'min-h-[36px]',
          type: 'button',
          'aria-label': 'Guardar nombre del rol',
          disabled: edit.saving,
          onclick: () => saveEditLabel(role),
        }, edit.saving
          ? [svg(h, ICON.spinner, 'w-4 h-4 animate-spin')]
          : [svg(h, ICON.check, 'w-4 h-4')]),
        h('button.btn.btn-ghost.btn-sm.py-2', {
          class: 'min-h-[36px]',
          type: 'button',
          'aria-label': 'Cancelar edición',
          disabled: edit.saving,
          onclick: () => cancelEditLabel(role),
        }, [svg(h, ICON.close, 'w-4 h-4')]),
      ]),
      edit.error ? h('p.text-xs.text-red-600', { id: `gcm-role-err-${role}`, role: 'alert' }, edit.error) : null,
    ]);
  }

  /**
   * Inicia la edición en línea del nombre de un rol: guarda el estado de edición y enfoca el input recién creado.
   * @param {string} role - clave del rol
   * @returns {void}
   */
  function startEditLabel(role) {
    editingLabels.set(role, { value: getRoleLabel(role), error: null, saving: false });
    renderTabs();
    renderRoleCard();
    queueMicrotask(() => {
      const input = roleCard.querySelector(`[data-role-label-input="${role}"]`);
      if (input) { input.focus(); input.select(); }
    });
  }

  /**
   * Actualiza el estado de edición del nombre de un rol y refresca el bloque en pantalla, preservando el foco y el cursor.
   * @param {string} role - clave del rol
   * @param {Object} patch - cambios parciales al estado de edición (value, error, saving)
   * @returns {void}
   */
  function updateEditLabel(role, patch) {
    const cur = editingLabels.get(role);
    if (!cur) return;
    editingLabels.set(role, { ...cur, ...patch });
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

  /**
   * Valida y guarda el nuevo nombre de un rol contra la API, mostrando errores de validación o del servidor.
   * @param {string} role - clave del rol
   * @returns {Promise<void>}
   */
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

  /**
   * Cancela la edición en línea del nombre de un rol, descartando los cambios no guardados.
   * @param {string} role - clave del rol
   * @returns {void}
   */
  function cancelEditLabel(role) {
    if (!editingLabels.has(role)) return;
    editingLabels.delete(role);
    renderRoleCard();
  }

  /**
   * Renderiza la fila de un permiso individual dentro de un grupo: etiqueta, descripción, badges de crítico/cambio
   * y el interruptor (toggle) para activarlo o desactivarlo.
   * @param {Object} params - datos de la fila
   * @param {string} params.role - clave del rol
   * @param {string} params.perm - clave del permiso
   * @param {Object} params.perms - permisos pendientes de edición del rol
   * @param {Object} params.currentPerms - permisos actuales (guardados) del rol
   * @returns {HTMLElement} nodo de la fila de permiso
   */
  function renderPermRow({ role, perm, perms, currentPerms }) {
    const isOn = !!perms[perm];
    const wasOn = !!currentPerms[perm];
    const changed = isOn !== wasOn;
    const isCritical = CRITICAL_PERMS.has(perm);
    const label = PERMISSION_LABELS[perm] || perm;
    const desc = PERMISSION_DESCRIPTIONS[perm] || '';

    return h('div.flex.items-start.gap-3.px-3.py-3.rounded-md.transition-colors', {
      class: changed ? 'ring-2 ring-amber-200' : '',
      'data-perm-row': perm,
    }, [
      h('div.flex-1.min-w-0', {}, [
        h('div.flex.items-center.gap-2.flex-wrap', {}, [
          h('div.text-sm.font-semibold.text-brand-ink', {}, label),
          isCritical ? h('span.badge.font-bold', { class: 'bg-accent/10 text-accent text-[10px]' }, [svg(h, ICON.alert, 'w-3 h-3'), h('span', {}, 'Crítico')]) : null,
          changed ? h('span.badge', { class: 'bg-amber-100 text-amber-800 text-[10px]' }, wasOn ? 'Se desactiva' : 'Se activa') : null,
        ]),
        h('p.text-xs.text-slate-500.mt-1', {}, desc),
      ]),
      h('div.flex.items-center.gap-2.flex-none', {}, [
        h('div.text-slate-500.w-20.text-right', { class: 'text-[11px]' }, isOn ? 'Permiso activo' : 'Inactivo'),
        renderToggle({ role, perm, isOn, changed, wasOn }),
        h('button.btn-icon-sm.text-slate-400', {
          class: 'hover:text-accent hover:bg-accent/10',
          type: 'button',
          'aria-label': `Eliminar permiso ${label}`,
          title: 'Eliminar este permiso y reemplazarlo en los roles que lo usan',
          onclick: () => openReassignWizard({ type: 'permission', target: perm }),
        }, [svg(h, ICON.trash, 'w-4 h-4')]),
      ]),
    ]);
  }

  /**
   * Renderiza el interruptor visual (switch) de un permiso, reflejando su estado y si tiene cambios sin guardar.
   * @param {Object} params - datos del interruptor
   * @param {string} params.role - clave del rol
   * @param {string} params.perm - clave del permiso
   * @param {boolean} params.isOn - estado pendiente (editado) del permiso
   * @param {boolean} params.changed - si el estado pendiente difiere del actual guardado
   * @param {boolean} params.wasOn - estado actual (guardado) del permiso
   * @returns {HTMLElement} nodo del interruptor
   */
  function renderToggle({ role, perm, isOn, changed, wasOn }) {
    const bgClass = isOn ? 'bg-brand-navy' : 'bg-slate-300';
    return h('button.relative.inline-flex.items-center.w-9.h-5.rounded-full.transition-colors', {
      role: 'switch',
      type: 'button',
      'aria-checked': String(isOn),
      'aria-label': `${PERMISSION_LABELS[perm]} para ${getRoleLabel(role)}`,
      title: changed
        ? `${PERMISSION_LABELS[perm]}: ${wasOn ? 'sí' : 'no'} → ${isOn ? 'sí' : 'no'} — cambio sin guardar`
        : `${PERMISSION_LABELS[perm]}: ${isOn ? 'sí' : 'no'}`,
      class: [
        bgClass,
        changed ? 'ring-2 ring-amber-400 ring-offset-1' : '',
        'focus:outline-none focus:ring-2 focus:ring-brand-ocean/60 focus:ring-offset-1',
        "before:absolute before:inset-y-0 before:-inset-x-2 before:content-['']",
      ],
      onclick: () => togglePerm(role, perm),
    }, [
      h('span.inline-block.w-4.h-4.bg-white.rounded-full.shadow-soft.transform.transition-transform', {
        style: { transform: isOn ? 'translateX(18px)' : 'translateX(2px)' },
      }),
    ]);
  }

  /**
   * Invierte el estado pendiente (encendido/apagado) de un permiso para un rol y redibuja la tarjeta y el panel de cambios.
   * @param {string} role - clave del rol
   * @param {string} perm - clave del permiso
   * @returns {void}
   */
  function togglePerm(role, perm) {
    if (!pending[role]) pending[role] = {};
    pending[role][perm] = !pending[role][perm];
    renderRoleCard();
    renderPending();
  }

  /**
   * Pide confirmación y, si se acepta, apaga (en el estado pendiente) todos los permisos activos de un rol.
   * @param {string} role - clave del rol
   * @returns {void}
   */
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

  /**
   * Restaura los permisos pendientes de un rol al último estado guardado en el servidor, descartando ediciones locales.
   * @param {string} role - clave del rol
   * @returns {void}
   */
  function resetRole(role) {
    pending[role] = { ...(current[role] || {}) };
    renderRoleCard();
    renderPending();
    toast(`Permisos de ${getRoleLabel(role)} restaurados.`, 'success', 1800);
  }

  let saving = false;
  let loadedAt = null;
  const errEl = h('div.hidden.m-3.mt-0.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', {
    role: 'alert',
  });

  /**
   * Redibuja el panel lateral de cambios pendientes: resumen de usuarios/cambios afectados, lista detallada
   * agrupada por rol, y los botones de guardar/descartar.
   * @returns {void}
   */
  function renderPending() {
    pendingCard.innerHTML = '';
    const changes = pendingChanges();
    const dirty = changes.length > 0;
    const affected = totalAffected();

    pendingCard.appendChild(h('div.p-4.border-b.border-surface-border', {}, [
      h('div.flex.items-center.gap-2.mb-3', {}, [
        svg(h, ICON.clock, 'w-5 h-5 text-brand'),
        h('h4.font-bold.text-brand-ink', {}, 'Cambios pendientes'),
      ]),
      h('div.rounded-lg.p-3.border', { class: 'bg-brand/5 border-brand/10' }, [
        h('div.flex.justify-between.items-center.mb-1', {}, [
          h('span.text-sm.font-medium.text-slate-500', {}, 'Usuarios afectados'),
          h('span.font-bold.text-brand-ink', {}, String(affected)),
        ]),
        h('div.flex.justify-between.items-center', {}, [
          h('span.text-sm.font-medium.text-slate-500', {}, 'Total cambios'),
          h('span.font-bold.text-brand-ink', {}, String(changes.length)),
        ]),
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
      let firstGroup = true;
      for (const role of ROLE_ORDER) {
        const list_ = byRole.get(role);
        if (!list_) continue;
        list.appendChild(h('div.mb-3', {
          class: firstGroup ? '' : 'pt-3 border-t border-surface-border/50',
        }, [
          h('p.font-bold.uppercase.tracking-wider.text-slate-500', { class: 'text-[11px] mb-1.5' }, `Rol: ${getRoleLabel(role)}`),
          ...list_.map((c) => {
            const isCritical = CRITICAL_PERMS.has(c.perm);
            return h('div.bg-white.p-2.rounded-lg.border.border-surface-border.shadow-soft.flex.items-start.gap-2', { class: 'mt-1.5' }, [
              svg(h, c.to ? ICON.check : ICON.x, `w-4 h-4 flex-none mt-0.5 ${c.to ? 'text-emerald-600' : isCritical ? 'text-accent' : 'text-slate-400'}`),
              h('div.min-w-0', {}, [
                h('p.font-bold.text-sm.text-brand-ink', {}, `${c.to ? 'Activar' : 'Desactivar'} ${PERMISSION_LABELS[c.perm]}`),
                h('p.text-slate-500', { class: 'text-[11px]' }, c.affectedUsers === 0
                  ? 'Aún no hay usuarios con este rol.'
                  : `Afecta a ${c.affectedUsers} ${c.affectedUsers === 1 ? 'persona' : 'personas'}.`),
              ]),
            ]);
          }),
        ]));
        firstGroup = false;
      }
    }
    pendingCard.appendChild(list);

    const actions = h('div.p-3.border-t.border-surface-border.flex.gap-2', {});
    const discardBtn = h('button.btn.btn-ghost.flex-1', {
      onclick: discard,
      disabled: !dirty,
    }, 'Descartar todo');
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

    pendingCard.appendChild(h('div.rounded-xl.border.p-3.mt-3', { class: 'bg-brand-ocean/10 border-brand-ocean/20' }, [
      h('div.flex.gap-2', {}, [
        svg(h, ICON.help, 'w-4 h-4 text-brand-ocean flex-none mt-0.5'),
        h('p.text-xs.text-brand-ink', {}, 'Los cambios guardados se aplican de inmediato para todos los usuarios del rol. Se recomienda avisar antes de aplicar cambios críticos.'),
      ]),
    ]));
  }

  /**
   * Redibuja el pie de página con la fecha de la última modificación local de permisos.
   * @returns {void}
   */
  function renderFooter() {
    const last = lastModifiedAt();
    if (!last) {
      footer.textContent = 'Permisos en estado por defecto. Aún no se han personalizado desde esta pantalla.';
      return;
    }
    footer.textContent = `Última modificación local: ${last}`;
  }

  /**
   * Formatea la fecha de la última carga/modificación de permisos en formato local.
   * @returns {string|null} fecha formateada, o null si aún no se registró ninguna
   */
  function lastModifiedAt() {
    return loadedAt ? loadedAt.toLocaleString('es-ES') : null;
  }

  /**
   * Envía a la API los cambios de permisos pendientes (uno por cada rol modificado) y actualiza el estado local
   * si todos se guardan correctamente; muestra error si alguno falla.
   * @returns {Promise<void>}
   */
  async function save() {
    if (!isDirty() || saving) return;
    saving = true;
    errEl.classList.add('hidden');
    renderPending();
    try {
      const rolesChanged = new Set(pendingChanges().map((c) => c.role));
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

  /**
   * Descarta todos los cambios de permisos pendientes, restaurando el estado editado al último guardado.
   * @returns {void}
   */
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

  /**
   * Recarga los roles y permisos desde el servidor, pidiendo confirmación si hay cambios locales sin guardar.
   * @returns {Promise<void>}
   */
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

/**
 * Renderiza un indicador de carga (spinner + mensaje) usado mientras se obtienen datos.
 * @param {string} message - texto a mostrar junto al spinner
 * @returns {HTMLElement} nodo del indicador de carga
 */
function renderLoading(message) {
  return h('div.flex.items-center.justify-center.gap-2.py-10.text-sm.text-slate-600', {
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

/**
 * Abre el asistente modal de 2 pasos para eliminar un rol o un permiso, reasignando los usuarios/roles afectados
 * a una alternativa antes de confirmar la eliminación irreversible.
 * @param {Object} params - datos del elemento a eliminar
 * @param {string} params.type - 'role' o 'permission'
 * @param {string} params.target - clave del rol o permiso a eliminar
 * @returns {void}
 */
function openReassignWizard({ type, target }) {
  const isRole = type === 'role';
  const targetLabel = isRole ? getRoleLabel(target) : (PERMISSION_LABELS[target] || target);
  const affected = isRole ? usersWithRole(target) : rolesUsingPerm(target).map((r) => ({ id: r, full_name: getRoleLabel(r), role: r, isRole: true }));
  const alternatives = isRole
    ? ROLE_ORDER.filter((r) => r !== target)
    : PERMISSION_KEYS.filter((p) => p !== target);

  let step = 1;
  let chosen = null;

  /**
   * Renderiza el indicador numérico de paso del asistente (ej. "01", "02").
   * @param {number} n - número de paso
   * @returns {HTMLElement} nodo del indicador de paso
   */
  const stepIndicator = (n) => h('span.font-mono.text-slate-500.tabular-nums', { class: 'text-[10px]' }, `0${n}`);
  const step1 = h('div', {});
  const step2 = h('div.hidden', {});

  /**
   * Renderiza el paso 1 del asistente: lista de usuarios o roles afectados por la eliminación y el selector
   * de la alternativa a la que se reasignarán.
   * @returns {void}
   */
  function renderStep1() {
    step1.innerHTML = '';
    step1.appendChild(h('div.text-sm.text-slate-600.mb-4', {}, [
      isRole
        ? `${affected.length} ${affected.length === 1 ? 'usuario tiene' : 'usuarios tienen'} el rol «${escapeHtml(targetLabel)}». Reasígnalos antes de eliminarlo.`
        : `${affected.length} ${affected.length === 1 ? 'rol usa' : 'roles usan'} el permiso «${escapeHtml(targetLabel)}». Decide qué permisos alternativos quedan activos.`,
    ]));

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
      const rows = affected.map((u) => {
        const cell = isRole
          ? `<span class="badge bg-brand-ocean/10 text-brand-ocean">${escapeHtml(getRoleLabel(u.role))}</span>`
          : (() => {
              const permsList = PERMISSION_KEYS
                .filter((p) => (current[u.role] || {})[p])
                .map((p) => PERMISSION_LABELS[p] || p)
                .join(', ') || '—';
              return `<span class="text-xs text-slate-500">${escapeHtml(permsList)}</span>`;
            })();
        return `
        <tr>
          <td class="font-medium">${escapeHtml(u.full_name || u.id)}</td>
          ${isRole ? `<td>${escapeHtml(AREA_LABEL[u.area] || u.area || '—')}</td>` : ''}
          <td>${cell}</td>
        </tr>
      `;
      }).join('');
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

    if (affected.length > 0) {
      step1.appendChild(h('div.mt-4', {}, [
        h('label.label', { for: 'gcm-reassign-target' }, isRole ? 'Reasignar usuarios a' : 'Mantener permiso activo — reemplazo'),
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

  /**
   * Renderiza el paso 2 del asistente: aviso de acción irreversible y resumen de lo que se va a aplicar.
   * @returns {void}
   */
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
          ? h('li', {}, `El rol «${escapeHtml(targetLabel)}» será eliminado y no podrá asignarse a nuevos usuarios.`)
          : h('li', {}, `El permiso «${escapeHtml(targetLabel)}» será eliminado del sistema.`),
        h('li.italic.text-slate-500', {}, 'Esta acción no se puede deshacer.'),
      ]),
    ]));
  }

  /**
   * Habilita o deshabilita el botón "Continuar" del paso 1 según si ya se eligió una alternativa de reasignación.
   * @returns {void}
   */
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

  const titleNode = h('div.flex.items-center.gap-3', {}, [
    stepIndicator(1),
    h('h3#gcm-modal-title.text-base.font-semibold.text-slate-800', {}, `Eliminar «${targetLabel}»`),
  ]);

  /**
   * Cambia el paso activo del asistente (1 o 2), actualizando la visibilidad de los pasos y el título del modal.
   * @param {number} n - número de paso al que navegar (1 o 2)
   * @returns {void}
   */
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
      onclick: async (e) => {
        const verb = isRole ? 'Rol' : 'Permiso';
        const reasign = isRole
          ? `${affected.length} ${affected.length === 1 ? 'usuario reasignado a' : 'usuarios reasignados a'} «${getRoleLabel(chosen)}»`
          : `${affected.length} ${affected.length === 1 ? 'rol actualizado' : 'roles actualizados'}`;
        const confirmBtn = e.currentTarget;
        const restoreBtn = () => {
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = isRole ? 'Reasignar y eliminar' : 'Reemplazar y eliminar';
          }
        };
        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Eliminando…';
        }
        try {
          if (isRole) {
            await api.roles.delete(target, { reassignTo: chosen });
          } else {
            await api.roles.permissions.remove(target, { replacement: chosen });
          }
          toast(`${verb} «${targetLabel}» eliminado. ${reasign}.`, 'success', 4000);
          close();
          await refresh();
        } catch (err) {
          const msg = err?.message || 'No se pudo eliminar';
          toast(msg, 'error', 5000);
          restoreBtn();
        }
      },
    }, isRole ? 'Reasignar y eliminar' : 'Reemplazar y eliminar'),
  ];

  const { cleanup } = openModal({
    title: titleNode,
    body,
    actions,
    size: 'xl',
    onClose: () => {},
  });

  const observer = new MutationObserver(() => {
    const buttons = document.querySelectorAll('[data-wizard-action]');
    buttons.forEach((b) => {
      const act = b.dataset.wizardAction;
      if (act === 'back')    b.classList.toggle('hidden', step === 1);
      if (act === 'continue') b.classList.toggle('hidden', step !== 1);
      if (act === 'confirm')  b.classList.toggle('hidden', step !== 2);
    });
  });
  observer.observe(step1, { attributes: true, attributeFilter: ['class'] });
  observer.observe(step2, { attributes: true, attributeFilter: ['class'] });

  updateContinueEnabled();
}


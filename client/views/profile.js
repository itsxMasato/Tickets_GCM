/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { api } from '../api.js';
import { setState } from '../store.js';
import { toast } from '../utils/toast.js';
import { renderAvatar } from '../utils/avatar.js';
import { getRoleLabel } from '../utils/role-labels.js';
import { AREA_LABEL, formatDate } from '../utils/format.js';
import { backButton } from '../components/back-button.js';
import { ICON, svg } from '../utils/icons.js';

const AVATAR_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_CLASS = 'w-32 h-32 rounded-full text-3xl font-semibold text-white flex items-center justify-center flex-none border-4 border-white shadow-card';

/**
 * Arma la vista de "Mi perfil": tarjeta de avatar editable y tarjeta con los datos de la cuenta del usuario.
 * @param {Object} params - parámetros de la ruta
 * @param {Object} params.user - usuario autenticado
 * @returns {Promise<HTMLElement>} nodo raíz de la vista
 */
export async function renderProfile({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});
  draw(root, user);
  return root;
}

/**
 * Limpia el contenedor raíz y vuelve a dibujar el encabezado, el layout de tarjetas y (si aplica) la tarjeta de empresas.
 * @param {HTMLElement} root - contenedor raíz de la vista
 * @param {Object} user - usuario autenticado
 * @returns {void}
 */
function draw(root, user) {
  root.innerHTML = '';

  root.appendChild(h('div.flex.items-center.gap-2.text-sm.text-slate-500', {}, [
    backButton({ href: '/dashboard', label: 'Volver' }),
  ]));
  root.appendChild(h('div', {}, [
    h('h1.text-2xl.font-bold.text-slate-900', { class: 'md:text-3xl' }, 'Mi perfil'),
    h('p.text-sm.text-slate-500.mt-1', {}, 'Tu foto y los datos de tu cuenta en el sistema.'),
  ]));

  const layout = h('div.grid.grid-cols-1.gap-4', { class: 'lg:grid-cols-12' });
  const left = h('div', { class: 'lg:col-span-4' }, [renderAvatarCard(user, (updated) => draw(root, updated))]);
  const right = h('div.flex.flex-col.gap-4', { class: 'lg:col-span-8' }, [renderInfoCard(user)]);
  if (Array.isArray(user.memberships) && user.memberships.length > 0) {
    right.appendChild(renderCompaniesCard(user));
  }
  layout.appendChild(left);
  layout.appendChild(right);
  root.appendChild(layout);
}

/**
 * Arma la tarjeta con el avatar del usuario y el flujo de cambio de foto de perfil (selección, validación y subida).
 * @param {Object} user - usuario autenticado
 * @param {Function} onUpdated - callback invocado con el usuario actualizado tras subir la foto
 * @returns {HTMLElement} tarjeta de avatar
 */
function renderAvatarCard(user, onUpdated) {
  const card = h('div.card.flex.flex-col.items-center.text-center.p-lg', {});
  const avatarWrap = h('div.relative', {}, [renderAvatar(user, { className: AVATAR_CLASS })]);

  const fileInput = h('input.hidden', { type: 'file', accept: AVATAR_ACCEPT });
  const changeBtn = h('button.absolute.-bottom-1.-right-1.w-9.h-9.rounded-full.bg-brand.text-white.flex.items-center.justify-center.shadow-pop.border-2.border-white.transition', {
    class: 'hover:opacity-90',
    type: 'button',
    title: 'Cambiar foto de perfil',
    'aria-label': 'Cambiar foto de perfil',
    onclick: () => fileInput.click(),
  }, [svg(h, ICON.camera, 'w-4 h-4')]);
  avatarWrap.appendChild(changeBtn);
  avatarWrap.appendChild(fileInput);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('La foto tiene que ser una imagen.', 'error');
      fileInput.value = '';
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast('La imagen no puede superar los 5MB.', 'error');
      fileInput.value = '';
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    changeBtn.disabled = true;
    changeBtn.classList.add('opacity-60');
    try {
      const { user: updated } = await api.auth.uploadAvatar(fd);
      setState({ user: updated });
      toast('Foto de perfil actualizada.', 'success');
      onUpdated(updated);
    } catch (e) {
      toast(e.message || 'No se pudo subir la foto.', 'error');
      changeBtn.disabled = false;
      changeBtn.classList.remove('opacity-60');
    }
  });

  card.appendChild(avatarWrap);
  card.appendChild(h('div.mt-6', {}, [
    h('h2.text-lg.font-semibold.text-slate-900', {}, user.full_name),
    h('p.text-sm.text-slate-500', {}, getRoleLabel(user.role) || user.role),
  ]));
  card.appendChild(h('button.w-full.mt-6.py-2.border.border-brand-ocean.text-brand-ocean.rounded-lg.text-sm.font-medium.transition', {
    class: 'hover:bg-brand-ocean/5',
    type: 'button',
    onclick: () => fileInput.click(),
  }, 'Cambiar foto'));
  if (user.created_at) {
    card.appendChild(h('div.mt-6.pt-4.border-t.border-slate-100.w-full.text-left', {}, [
      h('p.text-xs.text-slate-500.uppercase.tracking-wide', {}, 'Miembro desde'),
      h('p.text-sm.text-slate-800.mt-1', {}, formatDate(user.created_at)),
    ]));
  }
  return card;
}

/**
 * Arma la tarjeta con los datos de la cuenta del usuario (nombre, usuario, correo, rol, área, estado).
 * @param {Object} user - usuario autenticado
 * @returns {HTMLElement} tarjeta de información de cuenta
 */
function renderInfoCard(user) {
  /**
   * Arma una fila etiqueta/valor para la tarjeta de datos de la cuenta.
   * @param {string} label - etiqueta del campo
   * @param {string} value - valor a mostrar (o "—" si está vacío)
   * @returns {HTMLElement} fila del formulario de solo lectura
   */
  const row = (label, value) => h('div.flex.flex-col.gap-1.py-2.border-b.border-slate-100', { class: 'last:border-0' }, [
    h('span.text-xs.text-slate-500.uppercase.tracking-wide', {}, label),
    h('span.text-sm.font-medium.text-slate-800', {}, value || '—'),
  ]);
  return h('div.card', {}, [
    h('div.flex.items-center.gap-2.mb-4', {}, [
      svg(h, ICON.user, 'w-5 h-5 text-brand-ocean'),
      h('h3.text-sm.font-semibold.text-slate-700', {}, 'Datos de la cuenta'),
    ]),
    h('div.grid.grid-cols-1.gap-x-6', { class: 'md:grid-cols-2' }, [
      row('Nombre completo', user.full_name),
      row('Usuario', user.username),
      row('Correo', user.email),
      row('Rol', getRoleLabel(user.role) || user.role),
      row('Área', user.area ? (AREA_LABEL[user.area] || user.area) : null),
      row('Estado', user.active === false || user.active === 0 ? 'Inactivo' : 'Activo'),
    ]),
    h('p.text-xs.text-slate-400.mt-4', {}, 'Estos datos los administra tu SAC. Si algo está mal, pedile que lo corrija desde Usuarios.'),
  ]);
}

/**
 * Arma la tarjeta con las empresas a las que pertenece el usuario, marcando la empresa activa.
 * @param {Object} user - usuario autenticado (con user.memberships)
 * @returns {HTMLElement} tarjeta de empresas asignadas
 */
function renderCompaniesCard(user) {
  const rows = user.memberships.map((m) => h('div.flex.items-center.justify-between.gap-3.py-2.border-b.border-slate-100', { class: 'last:border-0' }, [
    h('div.flex.items-center.gap-2.min-w-0', {}, [
      h('span.inline-block.w-2.h-2.rounded-full.flex-none', {
        style: { backgroundColor: m.company?.color || '#0b1e3a' },
        'aria-hidden': 'true',
      }),
      h('span.text-sm.font-medium.text-slate-800.truncate', {}, m.company?.name || `Empresa #${m.company_id}`),
    ]),
    h('div.flex.items-center.gap-2.flex-none', {}, [
      String(m.company_id) === String(user.active_company_id)
        ? h('span.font-semibold.text-brand-ocean.px-2.rounded-full', { class: 'text-[10px] bg-brand-ocean/10 py-0.5' }, 'Activa')
        : null,
      h('span.text-xs.text-slate-500', {}, getRoleLabel(m.role) || m.role),
    ]),
  ]));
  return h('div.card', {}, [
    h('div.flex.items-center.gap-2.mb-4', {}, [
      svg(h, ICON.users, 'w-5 h-5 text-brand-ocean'),
      h('h3.text-sm.font-semibold.text-slate-700', {}, 'Empresas asignadas'),
    ]),
    h('div.flex.flex-col', {}, rows),
    user.memberships.length > 1
      ? h('p.text-xs.text-slate-400.mt-3', {}, 'Podés alternar entre ellas desde el selector de empresa en la barra superior.')
      : null,
  ]);
}


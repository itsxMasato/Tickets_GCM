import { h, escapeHtml } from '../utils/dom.js';
import { attachmentThumb } from './attachments.js';
import { relativeFromNow, formatDateTime, ROLE_LABEL } from '../utils/format.js';
import { sameId } from '../utils/ids.js';

function avatarColor(seed) {
  const colors = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#db2777', '#14b8a6', '#7c3aed', '#f97316'];
  return colors[(seed || 0) % colors.length];
}
function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

function avatarOf(user) {
  if (!user) return h('span.avatar', { style: { backgroundColor: 'var(--color-slate-400, #94a3b8)' } }, '?');
  return h('span.avatar', { style: { backgroundColor: avatarColor(user.id) } }, initials(user.full_name));
}

// SVG iconos inline (24x24, stroke 1.8, currentColor) — sin emojis
const SVG = {
  created:   'M12 4v16m8-8H4',
  assigned:  'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  reassign:  'M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-3M20 14a8 8 0 01-14 3',
  status:    'M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-3M20 14a8 8 0 01-14 3',
  paperclip: 'M21 12.8l-8.5 8.5a5.5 5.5 0 11-7.8-7.8l8.5-8.5a3.7 3.7 0 015.2 5.2L10 18.7',
};

function svgIcon(name, cls = 'w-3.5 h-3.5') {
  return h(`svg.${cls}`, {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    viewBox: '0 0 24 24', 'aria-hidden': 'true',
    html: `<path stroke-linecap="round" stroke-linejoin="round" d="${SVG[name]}" />`,
  });
}

function eventNode({ icon, text, when }) {
  const wrap = h('div.chat-event', {}, [
    h('span.inline-flex.items-center.gap-1\\.5.px-2\\.5.py-0\\.5.bg-white.border.border-surface-border.rounded-full.text-xs.text-slate-600.shadow-soft', {}, [
      svgIcon(icon),
      // text-slate-500 — WCAG AA: el timestamp relativo en eventos de chat es texto.
      h('span', { html: `${escapeHtml(text)} · <span class="text-slate-500">${escapeHtml(relativeFromNow(when))}</span>` }),
    ]),
  ]);
  return wrap;
}

/**
 * Renderiza un timeline estilo chat a partir de { comments, assignments, attachments }.
 * Devuelve un nodo DOM.
 */
export function renderChat({ ticket, user, onRefresh }) {
  const me = user;
  const root = h('div.flex.flex-col.gap-3.p-3.bg-slate-50.rounded-lg', { style: { minHeight: '400px' } });

  // 1) Construir lista unificada de eventos en orden
  const events = [];
  if (ticket.created_at) {
    events.push({ t: ticket.created_at, kind: 'created', payload: { who: ticket.created_by_name } });
  }
  for (const a of ticket.assignments || []) {
    events.push({ t: a.assigned_at, kind: 'assigned', payload: a });
  }
  for (const c of ticket.comments || []) {
    events.push({ t: c.created_at, kind: 'comment', payload: c });
    if (c.attachment_id) {
      const att = (ticket.attachments || []).find((x) => x.id === c.attachment_id);
      if (att) events.push({ t: c.created_at, kind: 'attachment', payload: { att, by: c.user_name, when: c.created_at } });
    }
  }
  // Adjuntos sin comentario
  for (const a of ticket.attachments || []) {
    const isMentioned = events.some((e) => e.kind === 'attachment' && e.payload.att.id === a.id);
    if (!isMentioned) events.push({ t: a.uploaded_at, kind: 'attachment', payload: { att: a, by: a.user_name, when: a.uploaded_at } });
  }
  events.sort((x, y) => new Date(x.t) - new Date(y.t));

  if (events.length === 0) {
    root.appendChild(h('p.text-sm.text-slate-500.text-center.py-12', {}, 'Sin actividad aún. Sé el primero en comentar.'));
    return root;
  }

  for (const e of events) {
    if (e.kind === 'created') {
      root.appendChild(eventNode({ icon: 'created', text: `${e.payload.who || 'Sistema'} creó el ticket`, when: ticket.created_at }));
    } else if (e.kind === 'assigned') {
      const a = e.payload;
      const text = a.from_user_name
        ? `Reasignado de ${a.from_user_name} → ${a.to_user_name}` + (a.assigned_by_name ? ` (por ${a.assigned_by_name})` : '')
        : `Asignado a ${a.to_user_name}` + (a.assigned_by_name ? ` (por ${a.assigned_by_name})` : '');
      root.appendChild(eventNode({ icon: a.from_user_name ? 'reassign' : 'assigned', text, when: a.assigned_at }));
      if (a.notes) {
        root.appendChild(h('div.text-center.text-xs.text-slate-500.mb-2.px-4', {}, `"${a.notes}"`));
      }
    } else if (e.kind === 'comment') {
      const c = e.payload;
      const mine = me && sameId(c.user_id, me.id);
      const author = c.user_name || 'Usuario';
      const wrap = h('div.flex.items-start.gap-2', { class: mine ? 'flex-row-reverse' : '' }, [
        avatarOf({ id: c.user_id, full_name: author }),
        h('div.flex.flex-col.gap-1.max-w-\\[80%\\]', { class: mine ? 'items-end' : '' }, [
          h('div.flex.items-center.gap-2.text-xs.text-slate-500', { class: mine ? 'flex-row-reverse' : '' }, [
            h('span.font-medium.text-slate-700', {}, author),
            h('span.px-1\\.5.py-0\\.5.bg-slate-100.rounded.text-\\[10px\\].text-slate-600', {}, ROLE_LABEL[c.user_role] || c.user_role),
            h('span', { title: formatDateTime(c.created_at) }, relativeFromNow(c.created_at)),
          ]),
          h('div.chat-bubble', { class: mine ? 'chat-bubble-me' : 'chat-bubble-other' }, c.comment),
        ]),
      ]);
      root.appendChild(wrap);
    } else if (e.kind === 'attachment') {
      const a = e.payload;
      const wrap = h('div.flex.items-start.gap-2.justify-center.my-1', {}, [
        h('div.flex.items-center.gap-2.px-3.py-2.rounded-md.bg-white.border.border-slate-200.text-xs.text-slate-600', {}, [
          svgIcon('paperclip', 'w-4 h-4 text-slate-400'),
          h('span', {}, `${escapeHtml(a.by)} adjuntó`),
          attachmentThumb(a.att, ticket.id),
        ]),
      ]);
      root.appendChild(wrap);
    }
  }

  return root;
}

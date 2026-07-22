/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
// Componente data-list — patrón card-list (mobile) / tabla (desktop).
//
// API:
//   mountDataList({
//     wrapper,           // HTMLElement donde montar (se hace wrapper.innerHTML = '')
//     items,             // array de datos (puede ser [])
//     loading,           // boolean — si true, renderiza skeleton
//     columns,           // [{ key, label, align? }] para la tabla desktop
//     renderRow,         // (item) => string HTML de <tr>…</tr> para la tabla
//     renderMobileCard,  // (item) => HTMLElement para la lista de cards mobile
//     emptyState,        // HTMLElement cuando items.length === 0
//     skeleton,          // HTMLElement (opcional) mientras loading
//     rowKey,            // (item) => string|number para keys (default: item.id)
//     onMatchMediaChange // (isMobile) => void, hook opcional
//   })
//
// Internamente:
//   1. Detecta mobile con matchMedia('(max-width: 767.95px)').matches
//   2. Renderiza wrapper.gcm-data-list-mobile (cards) o .gcm-data-list-desktop (tabla)
//   3. Escucha matchMedia change → re-renderiza sólo si cruza el breakpoint
//
// Devuelve { update({ items, loading, emptyState }) } para refrescar sin
// re-llamar a mountDataList. El cleanup expone removeEventListener.

import { h } from '../utils/dom.js';

const MOBILE_MQ = '(max-width: 767.95px)';

function isMobile() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_MQ).matches;
}

export function mountDataList(opts) {
  const {
    wrapper,
    rowKey = (it) => it?.id,
  } = opts;

  if (!wrapper) throw new Error('mountDataList: wrapper is required');

  let state = {
    items: opts.items || [],
    loading: !!opts.loading,
    emptyState: opts.emptyState || null,
  };

  let mq = null;
  let onChange = null;

  function paint() {
    const mobile = isMobile();
    wrapper.innerHTML = '';

    // Loading: skeleton cubre ambos viewports. Usamos la versión desktop
    // (tabla) porque la card list es muy parecida y consume casi igual;
    // un skeleton genérico de cards sería más código sin valor.
    if (state.loading) {
      if (opts.skeleton) {
        wrapper.appendChild(opts.skeleton);
        return;
      }
      wrapper.appendChild(defaultSkeleton(mobile));
      return;
    }

    // Empty
    if (!state.items.length) {
      const empty = h('div.card', {}, [
        state.emptyState || h('p.text-sm.text-slate-500.text-center.py-10', {}, 'Sin datos.'),
      ]);
      wrapper.appendChild(empty);
      return;
    }

    if (mobile) {
      const list = h('div.gcm-data-list-mobile.flex.flex-col.gap-2', {});
      for (const item of state.items) {
        try {
          const card = opts.renderMobileCard(item);
          if (card) list.appendChild(card);
        } catch (e) {
          console.error('[data-list] renderMobileCard error', e, item);
        }
      }
      wrapper.appendChild(list);
    } else {
      const wrap = h('div.gcm-data-list-desktop.table-wrap', {});
      const table = h('table.table');
      const thead = h('thead', {}, [
        h('tr', {}, (opts.columns || []).map((c) =>
          h(`th${c.align ? `.text-${c.align}` : ''}`, { scope: 'col' }, c.label)
        )),
      ]);
      const tbody = h('tbody', {});
      for (const item of state.items) {
        try {
          const rowHtml = opts.renderRow(item);
          // Inserción segura: usamos DOMParser para validar que la celda
          // no inyecte HTML malicioso. Los call-sites actuales usan
          // escapeHtml() antes, pero la doble verificación no hace daño.
          tbody.insertAdjacentHTML('beforeend', rowHtml);
        } catch (e) {
          console.error('[data-list] renderRow error', e, item);
        }
      }
      table.appendChild(thead);
      table.appendChild(tbody);
      wrap.appendChild(table);
      wrapper.appendChild(wrap);
    }
  }

  function defaultSkeleton(mobile) {
    // 5 filas placeholder mientras carga.
    if (mobile) {
      const list = h('div.gcm-data-list-mobile.flex.flex-col.gap-2', {});
      for (let i = 0; i < 5; i++) {
        list.appendChild(h('div.card.flex.flex-col.gap-2.p-4', { 'aria-hidden': 'true' }, [
          h('div.h-3.w-1\\/4.bg-slate-200.rounded.animate-pulse'),
          h('div.h-4.w-3\\/4.bg-slate-200.rounded.animate-pulse'),
          h('div.flex.gap-2', {}, [
            h('div.h-5.w-16.bg-slate-200.rounded-full.animate-pulse'),
            h('div.h-5.w-20.bg-slate-200.rounded-full.animate-pulse'),
          ]),
        ]));
      }
      return list;
    }
    const wrap = h('div.gcm-data-list-desktop.table-wrap', {});
    const table = h('table.table', { 'aria-busy': 'true' });
    const thead = h('thead', {}, [
      h('tr', {}, (opts.columns || []).map((c) => h('th', { scope: 'col' }, c.label))),
    ]);
    const tbody = h('tbody', {});
    const cell = () => '<div class="h-3 bg-slate-200 rounded animate-pulse w-3/4"></div>';
    for (let i = 0; i < 5; i++) {
      tbody.insertAdjacentHTML('beforeend',
        `<tr aria-hidden="true">${(opts.columns || []).map(() => `<td class="py-3">${cell()}</td>`).join('')}</tr>`);
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function handleMatchMedia(e) {
    paint();
    if (typeof opts.onMatchMediaChange === 'function') {
      try { opts.onMatchMediaChange(e.matches); } catch {}
    }
  }

  // Inicial
  paint();
  if (typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia(MOBILE_MQ);
    // addEventListener es la API moderna; addListener es legacy fallback.
    if (mq.addEventListener) {
      mq.addEventListener('change', handleMatchMedia);
      onChange = () => mq.removeEventListener('change', handleMatchMedia);
    } else if (mq.addListener) {
      mq.addListener(handleMatchMedia);
      onChange = () => mq.removeListener(handleMatchMedia);
    }
  }

  return {
    update(partial) {
      state = { ...state, ...partial };
      paint();
    },
    destroy() {
      if (typeof onChange === 'function') onChange();
      wrapper.innerHTML = '';
    },
  };
}

export default mountDataList;

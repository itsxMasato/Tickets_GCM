/* Documentado por: Miguel Flores */
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

    if (state.loading) {
      if (opts.skeleton) {
        wrapper.appendChild(opts.skeleton);
        return;
      }
      wrapper.appendChild(defaultSkeleton(mobile));
      return;
    }

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
    if (mobile) {
      const list = h('div.gcm-data-list-mobile.flex.flex-col.gap-2', {});
      for (let i = 0; i < 5; i++) {
        list.appendChild(h('div.card.flex.flex-col.gap-2.p-4', { 'aria-hidden': 'true' }, [
          h('div.h-3.bg-slate-200.rounded.animate-pulse', { class: 'w-1/4' }),
          h('div.h-4.bg-slate-200.rounded.animate-pulse', { class: 'w-3/4' }),
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

  paint();
  if (typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia(MOBILE_MQ);
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


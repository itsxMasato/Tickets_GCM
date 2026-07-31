/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';

const MOBILE_MQ = '(max-width: 767.95px)';

/**
 * Indica si el viewport actual corresponde a tamaño móvil.
 * @returns {boolean} true si el ancho de pantalla es de móvil
 */
function isMobile() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_MQ).matches;
}

/**
 * Monta una lista de datos responsive dentro de un wrapper: renderiza tarjetas en
 * móvil y una tabla en escritorio, con soporte de estado de carga (skeleton),
 * estado vacío y repintado automático al cruzar el breakpoint móvil/escritorio.
 * @param {Object} opts - opciones de configuración
 * @param {HTMLElement} opts.wrapper - contenedor donde se monta la lista
 * @param {Function} [opts.rowKey] - función para obtener la key única de cada item
 * @param {Array} [opts.items] - items iniciales a renderizar
 * @param {boolean} [opts.loading] - estado inicial de carga
 * @param {HTMLElement} [opts.emptyState] - nodo a mostrar cuando no hay items
 * @param {HTMLElement} [opts.skeleton] - nodo de carga personalizado
 * @param {Array} [opts.columns] - definición de columnas para la vista de escritorio
 * @param {Function} [opts.renderMobileCard] - renderiza una tarjeta para la vista móvil
 * @param {Function} [opts.renderRow] - devuelve el HTML de una fila para la vista de escritorio
 * @param {Function} [opts.onMatchMediaChange] - callback al cambiar entre móvil y escritorio
 * @returns {{update: Function, destroy: Function}} controlador con métodos update (mergea estado y repinta) y destroy (limpia listeners y contenido)
 */
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

  /**
   * Repinta el contenido del wrapper según el estado actual (loading, vacío,
   * o lista de items en formato tarjeta móvil o tabla de escritorio).
   * @returns {void}
   */
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

  /**
   * Genera un esqueleto de carga (placeholders animados) por defecto, en formato
   * tarjetas para móvil o tabla para escritorio.
   * @param {boolean} mobile - true para generar el esqueleto en formato móvil
   * @returns {HTMLElement} elemento con el esqueleto de carga
   */
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

  /**
   * Repinta la lista cuando cambia el breakpoint móvil/escritorio y notifica
   * el cambio mediante el callback opts.onMatchMediaChange.
   * @param {MediaQueryListEvent} e - evento de cambio de media query
   * @returns {void}
   */
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
    /**
     * Combina el estado actual con los cambios recibidos y vuelve a pintar la lista.
     * @param {Object} partial - cambios parciales de estado (items, loading, emptyState)
     * @returns {void}
     */
    update(partial) {
      state = { ...state, ...partial };
      paint();
    },
    /**
     * Elimina el listener de media query y vacía el contenido del wrapper.
     * @returns {void}
     */
    destroy() {
      if (typeof onChange === 'function') onChange();
      wrapper.innerHTML = '';
    },
  };
}

export default mountDataList;


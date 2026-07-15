// Utilidades para crear nodos DOM con hiperscript ligero y escapar HTML
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * h('div.cls#id', {onclick: fn, dataset: {x:1}}, [h('span', 'hola')])
 * Acepta string, node o array como hijos.
 */
export function h(selector, props = {}, children = []) {
  const idMatch = selector.match(/#([\w-]+)/);
  const classMatch = selector.match(/\.([\w-]+)/g) || [];
  const tag = selector.split(/[.#]/)[0] || 'div';
  const svgTags = new Set(['svg','path','circle','rect','line','polyline','polygon','g','defs','linearGradient','stop','mask','ellipse','text']);

  const el = svgTags.has(tag)
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
  if (idMatch) el.id = idMatch[1];
  for (const c of classMatch) el.classList.add(c.slice(1));

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') {
        (Array.isArray(v) ? v : [v]).forEach((c) => c && el.classList.add(...String(c).split(/\s+/).filter(Boolean)));
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k === 'dataset' && typeof v === 'object') {
        for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'html') {
        el.innerHTML = v;
      } else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
        el.value = v;
      } else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'autofocus') {
        if (v) el.setAttribute(k, '');
      } else {
        el.setAttribute(k, v);
      }
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  if (children === null || children === undefined || children === false) return;
  if (Array.isArray(children)) {
    for (const c of children) appendChildren(el, c);
    return;
  }
  if (children instanceof Node) {
    el.appendChild(children);
  } else {
    el.appendChild(document.createTextNode(String(children)));
  }
}

// Reemplaza el contenido de un contenedor con un nodo o string
export function mount(container, node) {
  container.innerHTML = '';
  if (node) container.appendChild(node);
}

// Devuelve el primer nodo a partir de un template HTML
export function html(strings, ...values) {
  const tpl = document.createElement('template');
  tpl.innerHTML = strings.reduce((acc, s, i) => acc + s + (i < values.length ? escapeHtml(values[i] ?? '') : ''), '').trim();
  return tpl.content.firstElementChild;
}

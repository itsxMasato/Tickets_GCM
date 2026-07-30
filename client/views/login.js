/* Documentado por: Miguel Flores */
import { h } from '../utils/dom.js';
import { api } from '../api.js';
import { svg } from '../utils/icons.js';
import { signInWithFirebaseEmail } from '../firebase.js';
import {
  BrandLockup,
  LoginField,
  PasswordField,
  LoginCheckbox,
  PrimaryButton,
  Banner,
  Capability,
  SystemStatus,
  SupportRow,
} from '../components/login.js';

const ERROR_COPY = {
  invalid_credentials: 'Usuario o contraseña incorrectos. Verifica los datos e intenta de nuevo.',
  not_found: 'No encontramos una cuenta con ese usuario o correo.',
  network_error: 'No se pudo contactar al servidor. Revisa tu conexión a la red.',
  rate_limited: 'Demasiados intentos. Espera un momento antes de volver a intentar.',
  server_error: 'El servicio no responde en este momento. Intenta de nuevo en unos minutos.',
};

function describeError(err) {
  if (!err) return ERROR_COPY.server_error;
  if (err.status === 401) return ERROR_COPY.invalid_credentials;
  if (err.status === 404) return ERROR_COPY.not_found;
  if (err.status === 429) return ERROR_COPY.rate_limited;
  if (err.status >= 500) return ERROR_COPY.server_error;
  if (err.code && ERROR_COPY[err.code]) return ERROR_COPY[err.code];
  if (!navigator.onLine) return ERROR_COPY.network_error;
  return err.message || ERROR_COPY.server_error;
}

export async function renderLogin({ params, query, onLogin }) {
  const nextUrl = typeof query?.next === 'string' ? query.next : null;
  const root = h('div.login-root', {});

  const videoWrapper = h('div.login-video-bg', { 'aria-hidden': 'true' });
  const videoElement = h('video.login-bg-video', {
    muted: true,
    autoplay: true,
    loop: true,
    playsinline: true,
    preload: 'metadata',
    poster: '/img/Logo.png',
    'aria-hidden': 'true',
  });
  videoElement.addEventListener('error', () => {
    root.setAttribute('data-video-failed', 'true');
  });
  const videoSource = h('source', {
    src: '/videos/DJI_0495.mp4',
    type: 'video/mp4',
  });
  videoElement.appendChild(videoSource);
  const videoOverlay = h('div.login-video-overlay', {});
  videoWrapper.appendChild(videoElement);
  videoWrapper.appendChild(videoOverlay);
  root.appendChild(videoWrapper);

  const grid = h('div.login-grid', {});

  const aside = h('div.login-aside.login-glass-panel', {});
  const asideInner = h('div.login-aside-inner', {});

  asideInner.appendChild(BrandLockup({
    name: 'GCM Tickets',
    tagline: 'Sala de control',
    location: 'Acceso corporativo seguro',
  }));

  const formGroup = h('div.flex.flex-col.gap-6.max-w-md', {});
  const cardHead = h('div.login-form-head', {}, [
    h('div.eyebrow', {}, 'Acceso corporativo'),
    h('h2', {}, 'Iniciar sesión'),
    h('p', {}, 'Ingresa con tus credenciales corporativas para gestionar tickets, reportes y asignaciones.'),
  ]);
  formGroup.appendChild(cardHead);

  const state = { attempts: 0, busy: false };

  const form = h('form.flex.flex-col.gap-4', {
    onsubmit: onSubmit,
    autocomplete: 'on',
    novalidate: true,
  });

  const { node: userNode, input: userInput } = LoginField({
    id: 'username',
    label: 'Usuario o correo',
    type: 'text',
    icon: 'user',
    autocomplete: 'username',
    placeholder: 'jperez · juan@gcm.com',
    autofocus: true,
    inputmode: 'text',
    helper: 'Tu usuario o tu correo corporativo.',
  });
  form.appendChild(userNode);

  const { node: passNode, input: passInput } = PasswordField({
    id: 'password',
    label: 'Contraseña',
    autofocus: false,
  });
  form.appendChild(passNode);

  const errorBox = h('div.hidden', {});
  form.appendChild(errorBox);

  const hintBox = h('div.hidden', {});
  form.appendChild(hintBox);

  const submit = PrimaryButton({ label: 'Ingresar', loadingLabel: 'Verificando…' });
  form.appendChild(submit);

  const foot = h('div.login-form-foot', {}, [
    h('span.lock-dot', { 'aria-hidden': 'true' }),
    h('span', {}, [
      'Conexión cifrada TLS · La sesión caduca a los 7 días. ',
      h('a', { href: '/legal/privacidad' }, 'Privacidad'),
      ' · ',
      h('a', { href: '/legal/terminos' }, 'Términos'),
      '.',
    ]),
  ]);
  form.appendChild(foot);

  formGroup.appendChild(form);
  const formCenter = h('div.flex-1.flex.flex-col.justify-center.min-h-0', {});
  formCenter.appendChild(formGroup);
  asideInner.appendChild(formCenter);

  const since = window.__GCM_CONFIG__?.serviceSince;
  const asideFoot = h('div.login-aside-foot', {}, [
    SystemStatus({ status: 'ok', since }),
    SupportRow({ helpHref: '/ayuda' }),
  ]);
  asideInner.appendChild(asideFoot);

  aside.appendChild(asideInner);
  grid.appendChild(aside);

  const side = h('div.login-side', {});
  const sideInner = h('div.login-side-inner', {});

  const sideHead = h('div', {}, [
    h('span.login-side-eyebrow', {}, 'Operación'),
    h('h2', {}, 'Del reporte en planta al cierre, sin perder el hilo.'),
    h('p.login-side-lede', {}, 'Reporta, asigna y da seguimiento a cada solicitud con el respaldo del historial completo. Nada se resuelve a ciegas.'),
  ]);
  sideInner.appendChild(sideHead);

  const capList = h('div.flex.flex-col.gap-1.max-w-md', {}, [
    Capability({
      icon: 'pin',
      title: 'Reporta en segundos, incluso sin señal',
      subtitle: 'Levanta una incidencia desde el campo y queda lista para asignarse en cuanto haya conexión.',
    }),
    Capability({
      icon: 'send',
      title: 'Llega a quien debe resolverla',
      subtitle: 'Cada solicitud se dirige directo al área responsable, sin cadenas de correos ni llamadas cruzadas.',
    }),
    Capability({
      icon: 'link',
      title: 'Nada se pierde en el camino',
      subtitle: 'Cada cambio, comentario y archivo queda ligado a su ticket, del primer reporte al cierre.',
    }),
    Capability({
      icon: 'report',
      title: 'Datos listos para decidir',
      subtitle: 'Exporta reportes en Excel o PDF con la información real al momento del cierre.',
    }),
  ]);
  sideInner.appendChild(capList);

  const sideFoot = h('div.login-side-foot', {}, [
    h('div.flex.items-center.gap-2.normal-case.tracking-normal', {}, [
      svg(h, 'shield', 'w-3.5 h-3.5 text-white/40'),
      h('span.normal-case.tracking-normal', { class: 'text-[11px] text-white/65' }, 'Plataforma de tickets · v1'),
    ]),
  ]);
  sideInner.appendChild(sideFoot);

  side.appendChild(sideInner);
  grid.appendChild(side);

  root.appendChild(grid);

  root.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(input|textarea|select)$/i.test(document.activeElement?.tagName)) {
      e.preventDefault();
      userInput.focus();
    }
  });

  async function onSubmit(e) {
    e.preventDefault();
    if (state.busy) return;

    hideError();
    hideHint();

    const user = userInput.value.trim();
    const pass = passInput.value;
    if (!user || !pass) return;

    setBusy(true);
    try {
      let authenticatedUser;
      try {
        const { user: localUser } = await api.auth.login({ username: user, password: pass });
        authenticatedUser = localUser;
      } catch (localErr) {
        const status = localErr?.status;
        if (status !== 401 && status !== 404 && status !== 400) {
          throw localErr;
        }
        const { email: loginEmail } = await api.auth.resolveLogin({ identifier: user });
        const { idToken } = await signInWithFirebaseEmail(loginEmail, pass);
        const { user: firebaseUser } = await api.auth.firebase({ idToken });
        authenticatedUser = firebaseUser;
      }

      if (nextUrl) {
        try { sessionStorage.setItem('gcm:postLoginNext', nextUrl); } catch {}
      }
      onLogin?.(authenticatedUser);
    } catch (err) {
      state.attempts += 1;
      const code = err.code || '';
      let mapped = err;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        mapped = Object.assign(new Error('invalid_credentials'), { status: 401 });
      } else if (code === 'auth/too-many-requests') {
        mapped = Object.assign(new Error('rate_limited'), { status: 429 });
      } else if (code === 'auth/network-request-failed') {
        mapped = Object.assign(new Error('network_error'), {});
      } else if (!err.status && code.startsWith('auth/')) {
        mapped = Object.assign(new Error('invalid_credentials'), { status: 401 });
      }
      showError(describeError(mapped));
      if (mapped.status === 401) {
        passInput.focus();
        try { passInput.select(); } catch {}
      }
      if (state.attempts >= 3) {
        showHint('Si no recuerdas tu contraseña, usa "Olvidé mi acceso" o contacta a soporte para restablecerla.');
      }
    } finally {
      setBusy(false);
    }
  }

  function setBusy(b) {
    state.busy = b;
    submit.setAttribute('aria-busy', b ? 'true' : 'false');
    submit.disabled = b;
    submit.innerHTML = '';
    if (b) {
      const NS = 'http://www.w3.org/2000/svg';
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('class', 'spinner w-4 h-4 animate-spin');
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '2');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('d', 'M21 12a9 9 0 11-6.2-8.55');
      s.appendChild(p);
      submit.appendChild(s);
    } else {
      const NS = 'http://www.w3.org/2000/svg';
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('class', 'w-4 h-4');
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '1.8');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('d', 'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3');
      s.appendChild(p);
      submit.appendChild(s);
    }
    const text = h('span', { class: 'tracking-[0.005em]' }, b ? 'Verificando…' : 'Ingresar');
    submit.appendChild(text);
  }

  function showError(message) {
    errorBox.innerHTML = '';
    errorBox.appendChild(Banner({ message, variant: 'error' }));
    errorBox.classList.remove('hidden');
  }
  function hideError() {
    errorBox.innerHTML = '';
    errorBox.classList.add('hidden');
  }
  function showHint(message) {
    hintBox.innerHTML = '';
    hintBox.appendChild(Banner({ message, variant: 'warning' }));
    hintBox.classList.remove('hidden');
  }
  function hideHint() {
    hintBox.innerHTML = '';
    hintBox.classList.add('hidden');
  }

  return root;
}


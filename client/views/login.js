/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
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

// ───────────────────────────────────────────────────────────────────────
// Copy localizado (Honduras · es-HN)
// ───────────────────────────────────────────────────────────────────────
const ERROR_COPY = {
  invalid_credentials: 'Usuario o contraseña incorrectos. Verifica los datos e intenta de nuevo.',
  network_error: 'No se pudo contactar al servidor. Revisa tu conexión a la red.',
  rate_limited: 'Demasiados intentos. Espera un momento antes de volver a intentar.',
  server_error: 'El servicio no responde en este momento. Intenta de nuevo en unos minutos.',
};

function describeError(err) {
  if (!err) return ERROR_COPY.server_error;
  if (err.status === 401) return ERROR_COPY.invalid_credentials;
  if (err.status === 429) return ERROR_COPY.rate_limited;
  if (err.status >= 500) return ERROR_COPY.server_error;
  if (err.code && ERROR_COPY[err.code]) return ERROR_COPY[err.code];
  if (!navigator.onLine) return ERROR_COPY.network_error;
  return err.message || ERROR_COPY.server_error;
}

// ───────────────────────────────────────────────────────────────────────
// Vista
// ───────────────────────────────────────────────────────────────────────
export async function renderLogin({ params, query, onLogin }) {
  const nextUrl = typeof query?.next === 'string' ? query.next : null;
  const root = h('div.login-root', {});

  // ── Background — video siempre activo, con transparencia ───────────
  // El video de producción (public/videos/DJI_0495.mp4) es la superficie de
  // contexto del login. Se muestra en loop, autoplay, silenciado. El CSS del
  // overlay aplica una capa navy translúcida encima para que el card glass
  // tenga contraste sin tapar el footage. Si la decodificación del MP4 falla,
  // el listener `error` activa el fallback CSS (fondo brand sólido).
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

  // ── Grid principal ─────────────────────────────────────────────────
  const grid = h('div.login-grid', {});

  // ── Panel de tarea (60% en desktop) ─────────────────────────────────
  const aside = h('div.login-aside', {});
  const asideInner = h('div.login-aside-inner', {});

  // Brand arriba — sin ubicación específica.
  asideInner.appendChild(BrandLockup({
    name: 'GCM Tickets',
    tagline: 'Sala de control',
    location: 'Acceso corporativo seguro',
  }));

  // Card glass con el form
  const card = h('div.login-card.p-7.sm\\:p-9', {});
  const cardHead = h('div.login-card-head', {}, [
    h('div.eyebrow', {}, 'Acceso corporativo'),
    h('h2', {}, 'Iniciar sesión'),
    h('p', {}, 'Ingresa con tus credenciales corporativas para gestionar tickets, reportes y asignaciones.'),
  ]);
  card.appendChild(cardHead);

  const state = { attempts: 0, busy: false };

  const form = h('form.flex.flex-col.gap-4', {
    onsubmit: onSubmit,
    autocomplete: 'on',
    novalidate: true,
  });

  // Username
  const { node: userNode, input: userInput } = LoginField({
    id: 'username',
    label: 'Usuario o correo',
    type: 'text',
    icon: 'user',
    autocomplete: 'username',
    placeholder: 'jperez · juan@empresa.com',
    autofocus: true,
    inputmode: 'text',
    helper: 'Tu usuario de red o tu correo corporativo.',
  });
  form.appendChild(userNode);

  // Password
  const { node: passNode, input: passInput } = PasswordField({
    id: 'password',
    label: 'Contraseña',
    autofocus: false,
  });
  form.appendChild(passNode);

  // Opciones (recordarme + olvidé mi acceso)
  const optionsRow = h('div.login-form-row', {});
  optionsRow.appendChild(LoginCheckbox({ id: 'remember', label: 'Recordarme en este dispositivo' }));
  optionsRow.appendChild(h('a.login-link.inline-flex.items-center.gap-1', {
    href: '/recuperar',
    tabindex: '0',
  }, ['Olvidé mi acceso']));
  form.appendChild(optionsRow);

  // Banner de error (oculto al inicio)
  const errorBox = h('div.hidden', {});
  form.appendChild(errorBox);

  // Banner de pista tras 3 intentos
  const hintBox = h('div.hidden', {});
  form.appendChild(hintBox);

  // Submit
  const submit = PrimaryButton({ label: 'Ingresar', loadingLabel: 'Verificando…' });
  form.appendChild(submit);

  // Foot del card: cifrado + caducidad + términos
  const foot = h('div.login-card-foot', {}, [
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

  card.appendChild(form);
  asideInner.appendChild(card);

  // Pie del aside: status del sistema + atajo al centro de ayuda.
  // Sin teléfono ni correo: el usuario ya está en una sesión autenticable,
  // no necesita canales de soporte pre-login que filtren datos de contacto.
  const since = window.__GCM_CONFIG__?.serviceSince;
  const asideFoot = h('div.login-aside-foot', {}, [
    SystemStatus({ status: 'ok', since }),
    SupportRow({ helpHref: '/ayuda' }),
  ]);
  asideInner.appendChild(asideFoot);

  aside.appendChild(asideInner);
  grid.appendChild(aside);

  // ── Panel de contexto (40%, solo ≥ lg) ─────────────────────────────
  const side = h('div.login-side', {});
  const sideInner = h('div.login-side-inner', {});

  const sideHead = h('div', {}, [
    h('span.login-side-eyebrow', {}, 'Operación'),
    h('h2', {}, 'Una vista del ciclo completo de tickets.'),
    h('p.login-side-lede', {}, 'Tiempos claros, flujo visible y trazabilidad por ticket. Diseñado para que cada rol vea solo lo que le corresponde.'),
  ]);
  sideInner.appendChild(sideHead);

  const capList = h('div.flex.flex-col.gap-1.max-w-md', {}, [
    Capability({
      title: 'Cuatro roles con vistas dedicadas',
      subtitle: 'Triage, ejecución, auditoría y captura. Cada equipo ve solo lo que le corresponde.',
    }),
    Capability({
      title: 'Trazabilidad completa del ciclo',
      subtitle: 'Estados, comentarios y adjuntos quedan registrados en el historial del ticket.',
    }),
    Capability({
      title: 'Reportes y exportación',
      subtitle: 'Excel y PDF con los datos vivos al momento del cierre.',
    }),
    Capability({
      title: 'Respaldo y cifrado',
      subtitle: 'Conexión cifrada TLS y caducidad de sesión a los 7 días.',
    }),
  ]);
  sideInner.appendChild(capList);

  // Pie del side: línea de producto neutra. Sin build SHA ni reloj local
  // (filtrarían entorno y zona); sin nombre de equipo interno.
  const sideFoot = h('div.login-side-foot', {}, [
    h('div.flex.items-center.gap-2.normal-case.tracking-normal', {}, [
      svg(h, 'shield', 'w-3.5 h-3.5 text-white\\/40'),
      h('span.normal-case.tracking-normal.text-\\[11px\\].text-white\\/65', {}, 'Plataforma de tickets · v1'),
    ]),
  ]);
  sideInner.appendChild(sideFoot);

  side.appendChild(sideInner);
  grid.appendChild(side);

  root.appendChild(grid);

  // Atajo "/" para mover foco a username si no hay foco en un input.
  root.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(input|textarea|select)$/i.test(document.activeElement?.tagName)) {
      e.preventDefault();
      userInput.focus();
    }
  });

  // ── Submit ─────────────────────────────────────────────────────────
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
      // Flujo Firebase Auth + canje por sesión local.
      // 1) Autenticar contra Firebase Auth (cliente).
      // 2) Canjear el ID token por una cookie de sesión en el backend.
      // El endpoint /api/auth/firebase vive en src/routes/auth.routes.js y
      // mapea el email verificado contra el usuario local en Firestore.
      const { idToken } = await signInWithFirebaseEmail(user, pass);
      const { user: u } = await api.auth.firebase({ idToken });
      if (nextUrl) {
        try { sessionStorage.setItem('gcm:postLoginNext', nextUrl); } catch {}
      }
      onLogin?.(u);
    } catch (err) {
      state.attempts += 1;
      // Mapear errores específicos de Firebase Auth a mensajes legibles.
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
      // icono login (mismo path que el componente)
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
    const text = h('span.tracking-\\[0\\.005em\\]', {}, b ? 'Verificando…' : 'Ingresar');
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

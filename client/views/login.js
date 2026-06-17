import { h } from '../utils/dom.js';
import { api } from '../api.js';

export async function renderLogin({ onLogin }) {
  const root = h('div.min-h-screen.flex.flex-col.lg:flex-row.bg-slate-50', {});

  const leftSection = h('div.flex-1.flex.items-center.justify-center.p-6.sm:p-10.lg:p-14', {});
  const formContainer = h('div.w-full.max-w-xl.space-y-10', {});

  formContainer.appendChild(h('div.space-y-4', {}, [
    h('div.flex.items-center.gap-3', {}, [
      h('img.w-12.h-12.rounded-full.object-cover.shadow-sm', { src: '/img/Logo.png', alt: 'Logo' }),
      h('div', {}, [
        h('p.text-xs.font-semibold.uppercase.tracking-[0.3em].text-brand-ink/70', {}, 'GCM'),
        h('h1.text-3xl.sm:text-4xl.font-bold.text-slate-900', {}, 'Bienvenido al panel ejecutivo'),
      ]),
    ]),
    h('p.text-sm.text-slate-600.max-w-2xl', {}, 'Accede a tu entorno de tickets, inventario y reportes con seguridad corporativa. Gestiona solicitudes, estados y prioridades desde un panel centralizado.'),
  ]));

  const card = h('div.card.bg-white.p-8.space-y-6', {});
  const form = h('form.flex.flex-col.gap-5', { onsubmit: onSubmit });

  const userInputWrapper = h('div.space-y-2', {});
  userInputWrapper.appendChild(h('label.label', { for: 'username' }, 'Usuario'));
  const userInputContainer = h('div.relative', {});
  const userIcon = h('span.material-symbols-outlined.absolute.left-3.top-1/2.-translate-y-1/2.text-slate-400.login-input-icon', {}, 'person');
  const userInput = h('input.input.pl-10', {
    type: 'text',
    id: 'username',
    placeholder: 'usuario@empresa.com',
    autocomplete: 'username',
    required: true,
    autofocus: true,
  });
  userInputContainer.appendChild(userIcon);
  userInputContainer.appendChild(userInput);
  userInputWrapper.appendChild(userInputContainer);
  form.appendChild(userInputWrapper);

  const passInputWrapper = h('div.space-y-2', {});
  passInputWrapper.appendChild(h('label.label', { for: 'password' }, 'Contraseña'));
  const passInputContainer = h('div.relative', {});
  const passIcon = h('span.material-symbols-outlined.absolute.left-3.top-1/2.-translate-y-1/2.text-slate-400.login-input-icon', {}, 'lock');
  const passInput = h('input.input.pl-10', {
    type: 'password',
    id: 'password',
    placeholder: '••••••••',
    autocomplete: 'current-password',
    required: true,
  });
  passInputContainer.appendChild(passIcon);
  passInputContainer.appendChild(passInput);
  passInputWrapper.appendChild(passInputContainer);
  form.appendChild(passInputWrapper);

  const optionsRow = h('div.flex.items-center.justify-between.flex-wrap.gap-3', {});
  const rememberLabel = h('label.flex.items-center.space-x-2.cursor-pointer', {});
  rememberLabel.appendChild(h('input.w-4.h-4.rounded.border-slate-300.text-brand.focus\:ring-brand-ocean', { type: 'checkbox' }));
  rememberLabel.appendChild(h('span.text-sm.text-slate-600', {}, 'Recordarme'));
  optionsRow.appendChild(rememberLabel);
  optionsRow.appendChild(h('a.text-sm.font-semibold.text-brand.hover:underline', { href: '#' }, 'Olvidé mi acceso'));
  form.appendChild(optionsRow);

  const error = h('div.hidden.text-sm.text-red-600.bg-red-50.px-3.py-2.rounded-md.border.border-red-200', { role: 'alert', 'aria-live': 'polite' });
  form.appendChild(error);

  const submitBtn = h('button.btn.btn-primary.w-full.py-3.flex.items-center.justify-center.space-x-2', { type: 'submit' }, [
    h('span', {}, 'Ingresar'),
    h('span.material-symbols-outlined', {}, 'chevron_right'),
  ]);
  form.appendChild(submitBtn);

  card.appendChild(form);
  card.appendChild(h('div.text-xs.text-slate-500', {}, 'Inicia sesión con tu cuenta corporativa para ver tickets asignados, crear solicitudes y revisar métricas en tiempo real.'));
  formContainer.appendChild(card);

  formContainer.appendChild(h('div.flex.items-center.justify-between.text-xs.text-slate-500', {}, [
    h('span', {}, 'SISTEMA OPERACIONAL'),
    h('span', {}, 'v4.12.0-STABLE'),
  ]));

  leftSection.appendChild(formContainer);
  root.appendChild(leftSection);

  const rightSection = h('div.hidden.lg:flex.flex-1.relative.login-hero.overflow-hidden.items-center.justify-center.p-12', {});
  rightSection.appendChild(h('div.absolute.inset-0.opacity-80', {}));
  rightSection.appendChild(h('div.absolute.left-0.top-0.w-72.h-72.rounded-full.bg-brand-ocean/20.blur-3xl', {}));
  rightSection.appendChild(h('div.absolute.right-0.bottom-10.w-64.h-64.rounded-full.bg-accent/20.blur-3xl', {}));

  const brandingContent = h('div.relative.z-10.max-w-xl.space-y-6.text-white', {});
  brandingContent.appendChild(h('div.inline-flex.items-center.gap-2.rounded-full.bg-white/10.px-3.py-1.text-xs.font-semibold.uppercase.tracking-[0.3em]', {}, [
    h('span.material-symbols-outlined.text-lg', {}, 'trending_up'),
    'Control total',
  ]));
  brandingContent.appendChild(h('h2.text-4xl.font-bold.leading-tight', {}, 'Monitorea tickets y operaciones desde una sola vista')); 
  brandingContent.appendChild(h('p.text-base.text-slate-200.leading-relaxed', {}, 'Optimiza tiempos de respuesta, reduce cuellos de botella y controla el flujo de trabajo con una experiencia clara, rápida y confiable.'));

  const statsGrid = h('div.grid.grid-cols-3.gap-4.pt-8', {});
  statsGrid.appendChild(createStatItem('99.98%', 'Uptime')); 
  statsGrid.appendChild(createStatItem('12.4M', 'Registros activos'));
  statsGrid.appendChild(createStatItem('< 40ms', 'Latencia')); 
  brandingContent.appendChild(statsGrid);

  rightSection.appendChild(brandingContent);
  root.appendChild(rightSection);

  function createStatItem(value, label) {
    return h('div.space-y-1', {}, [
      h('div.text-2xl.font-bold.text-white', {}, value),
      h('div.text-xs.font-semibold.uppercase.tracking-wider.text-slate-200/80', {}, label),
    ]);
  }

  async function onSubmit(e) {
    e.preventDefault();
    error.classList.add('hidden');
    submitBtn.disabled = true;
    const originalHTML = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span><span>Ingresando…</span>';

    try {
      const { user } = await api.auth.login({
        username: userInput.value.trim(),
        password: passInput.value,
      });
      onLogin?.(user);
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHTML;
    }
  }

  userInput.addEventListener('focus', () => userIcon.classList.add('text-brand'));
  userInput.addEventListener('blur', () => userIcon.classList.remove('text-brand'));
  passInput.addEventListener('focus', () => passIcon.classList.add('text-brand'));
  passInput.addEventListener('blur', () => passIcon.classList.remove('text-brand'));

  return root;
}

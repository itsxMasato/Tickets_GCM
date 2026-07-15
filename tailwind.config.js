/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./client/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa GCM
        brand: {
          DEFAULT: '#071D4C', // Azul marino corporativo
          deep:    '#44497B', // Azul profundo suavizado
          ocean:   '#16ACE4', // Azul océano (hover / detalles)
          ink:     '#243447', // Texto principal
        },
        accent: {
          DEFAULT: '#CF301D', // Rojo camarón (botones / acciones críticas)
          hover:   '#A8261A',
        },
        surface: {
          DEFAULT: '#F7F9FC', // Fondo principal
          alt:     '#E1D9DB', // Fondo secciones
          border:  '#D6DEE8', // Bordes / separadores
          'border-strong': '#B6C2D2', // Bordes con mayor peso (dots, scrollbar hover)
        },
        // Mantener compatibilidad con clases previas
        sac: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'soft':   '0 1px 2px 0 rgba(7, 29, 76, 0.05)',
        'card':   '0 1px 3px 0 rgba(7, 29, 76, 0.06), 0 1px 2px -1px rgba(7, 29, 76, 0.06)',
        'pop':    '0 8px 24px -6px rgba(7, 29, 76, 0.18)',
        'sidebar':'4px 0 24px -8px rgba(7, 29, 76, 0.18)',
      },
    },
  },
  plugins: [],
};

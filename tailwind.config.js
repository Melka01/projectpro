/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Roboto', 'SF Pro Text', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#4DB748',
          dark: '#2E7D32',
          light: '#81D78A',
        },
        accent: {
          blue: '#2563EB',
          indigo: '#6366F1',
          purple: '#7C3AED',
        },
        phase: {
          discover: '#0EA5E9',
          design: '#6366F1',
          develop: '#7C3AED',
          drive: '#4DB748',
        },
        status: {
          open: '#6B7280',
          wip: '#2563EB',
          done: '#10B981',
          blocked: '#EF4444',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#F8FAFC',
        },
        sidebar: {
          bg: '#F1F5F9',
        },
        text: {
          primary: '#0F172A',
          secondary: '#334155',
        },
      },
      spacing: {
        'sidebar': '272px',
      },
      borderRadius: {
        'card': '12px',
      },
      boxShadow: {
        'card': '0 1px 2px rgba(2, 6, 23, 0.06), 0 8px 20px rgba(2, 6, 23, 0.06)',
        'modal': '0 12px 32px rgba(2, 6, 23, 0.18)',
      },
    },
  },
  plugins: [],
}

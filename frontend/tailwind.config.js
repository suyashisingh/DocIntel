/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink:     '#0D0D0D',
        paper:   '#F5F2EC',
        accent:  '#E84E2A',
        muted:   '#8C8A85',
        surface: '#FFFDF9',
        border:  '#E2DDD6',
        glow: 'rgba(232,78,42,0.15)',
        'glow-strong': 'rgba(232,78,42,0.25)',
        'indigo-soft': '#F0EFFE',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'display-2xl': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '800' }],
        'display-xl':  ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.025em', fontWeight: '800' }],
        'display-lg':  ['2rem',   { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md':  ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '700' }],
        'display-sm':  ['1.25rem',{ lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '700' }],
        'display-xs':  ['1.125rem',{ lineHeight: '1.35', letterSpacing: '-0.005em', fontWeight: '600' }],
        'label':       ['0.6875rem', { lineHeight: '1', letterSpacing: '0.07em', fontWeight: '500' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'sm': '0 1px 4px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card': '0 0 0 1px rgb(226 221 214 / 1), 0 2px 8px 0 rgb(0 0 0 / 0.04)',
        'float': '0 4px 24px rgba(0,0,0,0.06)',
        'float-lg': '0 8px 40px rgba(0,0,0,0.08)',
        'glow': '0 0 40px rgba(232,78,42,0.12)',
        'glow-lg': '0 0 60px rgba(232,78,42,0.18)',
        'elevated': '0 4px 16px 0 rgb(0 0 0 / 0.08), 0 1px 4px 0 rgb(0 0 0 / 0.04)',
        'overlay': '0 8px 32px 0 rgb(0 0 0 / 0.12), 0 2px 8px 0 rgb(0 0 0 / 0.06)',
      },
      borderRadius: {
        'sm': '6px',
        DEFAULT: '8px',
        'md': '10px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'slide-down': 'slideDown 150ms ease-out',
        'scale-in': 'scaleIn 150ms ease-out',
        'shimmer': 'shimmer 1.5s infinite linear',
        'pulse-gentle': 'pulseGentle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
        'float-reverse': 'floatReverse 8s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGentle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-22px)' },
        },
        floatReverse: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(18px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.8', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
    },
  },
  plugins: [],
}

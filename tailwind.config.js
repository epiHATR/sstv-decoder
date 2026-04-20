/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        border: 'var(--border)',
        surface: 'var(--surface)',
        'surface-inset': 'var(--surface-inset)',
        'surface-button': 'var(--surface-button)',
        'surface-button-hover': 'var(--surface-button-hover)',
        muted: 'var(--muted)',
        'tab-hover': 'var(--tab-hover)',
        info: 'var(--info)',
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        danger: 'var(--danger)',
        'danger-hover': 'var(--danger-hover)',
        'warn-bg': 'var(--warn-bg)',
        'warn-border': 'var(--warn-border)',
        'warn-text': 'var(--warn-text)',
        'err-bg': 'var(--err-bg)',
        'err-border': 'var(--err-border)',
        'err-text': 'var(--err-text)',
        'snr-bad': 'var(--snr-bad)',
        'snr-warn': 'var(--snr-warn)',
        'snr-good': 'var(--snr-good)',
        'accent-muted': 'var(--accent-muted)',
        'accent-border': 'var(--accent-border)',
        'accent-text': 'var(--accent-text)',
        'accent-hover-bg': 'var(--accent-hover-bg)',
        'accent-hover-border': 'var(--accent-hover-border)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [],
}

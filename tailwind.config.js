/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'discord-dark': 'var(--discord-dark)',
        'discord-sidebar': 'var(--discord-sidebar)',
        'discord-channel': 'var(--discord-channel)',
        'discord-text': 'var(--discord-text)',
        'discord-text-muted': 'var(--discord-text-muted)',
        'discord-primary': 'var(--discord-primary)',
        'discord-primary-hover': 'var(--discord-primary-hover)',
        'discord-secondary': 'var(--discord-secondary)',
        'discord-secondary-hover': 'var(--discord-secondary-hover)',
        'discord-highlight': 'var(--discord-highlight)',
      },
      animation: {
        'fadeIn': 'fadeIn 0.3s ease-in-out',
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      typography: (theme) => ({
        invert: {
          css: {
            '--tw-prose-body': theme('colors.gray[300]'),
            '--tw-prose-headings': theme('colors.white'),
            '--tw-prose-links': theme('colors.indigo[400]'),
            '--tw-prose-bold': theme('colors.white'),
            '--tw-prose-code': theme('colors.indigo[300]'),
            '--tw-prose-quotes': theme('colors.gray[100]'),
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
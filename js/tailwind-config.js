tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          sans: ['"Plus Jakarta Sans"', 'sans-serif'],
          display: ['"Outfit"', '"Plus Jakarta Sans"', 'sans-serif'],
        },
        colors: {
          darkBg: 'rgb(var(--c-darkBg) / <alpha-value>)',
          panelBg: 'rgb(var(--c-panelBg) / <alpha-value>)',
          panelBorder: 'rgb(var(--c-panelBorder) / <alpha-value>)',
          sidebarBg: 'rgb(var(--c-sidebarBg) / <alpha-value>)',
          textMain: 'rgb(var(--c-textMain) / <alpha-value>)',
          textMuted: 'rgb(var(--c-textMuted) / <alpha-value>)',
          neonPurple: '#a855f7', neonCyan: '#06b6d4',
          neonGreen: '#10b981', neonPink: '#ec4899',
        }
      }
    }
  }

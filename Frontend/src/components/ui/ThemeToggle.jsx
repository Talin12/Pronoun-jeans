import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

const ThemeToggle = () => {
  const { isDark, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative w-9 h-9 flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] hover:border-accent/40 transition-colors"
    >
      <span
        key={isDark ? 'moon' : 'sun'}
        style={{ animation: 'iconPop 0.2s ease' }}
      >
        {isDark
          ? <Sun  className="w-4 h-4 text-accent" />
          : <Moon className="w-4 h-4 text-accent" />
        }
      </span>

      <style>{`
        @keyframes iconPop {
          from { opacity: 0; transform: scale(0.6) rotate(-15deg); }
          to   { opacity: 1; transform: scale(1)   rotate(0deg);   }
        }
      `}</style>
    </button>
  );
};

export default ThemeToggle;

import { ThemeConfig } from './theme.types';

export class ThemePresets {
  static readonly CS_BRAND: ThemeConfig = {
    id: 'cs-brand',
    name: 'CS Brand Theme',
    preset: 'cs-brand',
    fonts: {
      base: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'Consolas, "Courier New", monospace',
    },
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    animations: {
      duration: '300ms',
      easing: 'ease-in-out',
      custom: `
        @keyframes cs-brand-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(147, 24, 108, 0.3); }
          50% { box-shadow: 0 0 30px rgba(147, 24, 108, 0.5); }
        }
        
        .cs-brand-glow {
          animation: cs-brand-glow 2s ease-in-out infinite;
        }
      `,
    },
    minify: true,
  };

  static readonly DARK: ThemeConfig = {
    id: 'cs-dark',
    name: 'CS Dark Theme',
    preset: 'dark',
    fonts: {
      base: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'Consolas, "Courier New", monospace',
    },
    customColors: {
      primary: '#D13A9C',
      primaryLight: '#E95BAB',
      primaryDark: '#B91C84',
    },
    animations: {
      duration: '300ms',
      easing: 'ease-in-out',
      custom: `
        @keyframes cs-dark-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        
        .cs-dark-pulse {
          animation: cs-dark-pulse 3s ease-in-out infinite;
        }
      `,
    },
    minify: true,
  };

  static readonly LIGHT: ThemeConfig = {
    id: 'cs-light',
    name: 'CS Light Theme',
    preset: 'light',
    fonts: {
      base: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      heading: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      mono: '"JetBrains Mono", Consolas, monospace',
    },
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    minify: true,
  };

  static readonly HIGH_CONTRAST: ThemeConfig = {
    id: 'cs-high-contrast',
    name: 'CS High Contrast Theme',
    preset: 'high-contrast',
    fonts: {
      base: 'Arial, sans-serif',
      heading: 'Arial Black, sans-serif',
      mono: 'Consolas, monospace',
    },
    animations: {
      duration: '0ms',
      easing: 'none',
      custom: '',
    },
    minify: true,
  };

  static readonly PRINT: ThemeConfig = {
    id: 'cs-print',
    name: 'CS Print Theme',
    preset: 'print',
    fonts: {
      base: 'Georgia, serif',
      heading: 'Georgia, serif',
      mono: 'Courier, monospace',
    },
    animations: {
      duration: '0ms',
      easing: 'none',
      custom: '',
    },
    minify: true,
  };

  static readonly EXECUTIVE: ThemeConfig = {
    id: 'cs-executive',
    name: 'CS Executive Dashboard',
    preset: 'cs-brand',
    customColors: {
      primary: '#7B1450',
      primaryLight: '#93186C',
      primaryDark: '#5A0F3A',

      bgPrimary: '#FAFAFA',
      bgSecondary: '#F5F5F5',
      bgCard: '#FFFFFF',

      textPrimary: '#1A1A1A',
      textSecondary: '#4A4A4A',
      textHeading: '#0A0A0A',
    },
    fonts: {
      base: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      heading: 'Georgia, "Times New Roman", serif',
      mono: 'Monaco, Consolas, monospace',
    },
    animations: {
      duration: '500ms',
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      custom: `
        @keyframes cs-executive-slide {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        .cs-executive-animate {
          animation: cs-executive-slide 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `,
    },
    minify: true,
  };

  static readonly DEVELOPER: ThemeConfig = {
    id: 'cs-developer',
    name: 'CS Developer Theme',
    preset: 'dark',
    customColors: {
      primary: '#00FF00',
      primaryLight: '#33FF33',
      primaryDark: '#00CC00',

      secondary: '#00FFFF',
      secondaryLight: '#33FFFF',
      secondaryDark: '#00CCCC',

      bgPrimary: '#0A0A0A',
      bgSecondary: '#1A1A1A',
      bgCard: '#1F1F1F',

      textPrimary: '#00FF00',
      textSecondary: '#00CC00',
      textBody: '#33FF33',

      success: '#00FF00',
      error: '#FF0066',
      warning: '#FFCC00',
      info: '#00CCFF',
    },
    fonts: {
      base: '"Fira Code", "JetBrains Mono", Consolas, monospace',
      heading: '"Fira Code", "JetBrains Mono", Consolas, monospace',
      mono: '"Fira Code", "JetBrains Mono", Consolas, monospace',
    },
    animations: {
      duration: '150ms',
      easing: 'linear',
      custom: `
        @keyframes cs-terminal-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        
        .cs-terminal-cursor::after {
          content: '_';
          animation: cs-terminal-blink 1s infinite;
        }
        
        @keyframes cs-matrix-rain {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `,
    },
    minify: true,
  };

  static readonly MINIMAL: ThemeConfig = {
    id: 'cs-minimal',
    name: 'CS Minimal Theme',
    preset: 'light',
    customColors: {
      primary: '#000000',
      primaryLight: '#333333',
      primaryDark: '#000000',

      secondary: '#FFFFFF',
      secondaryLight: '#FFFFFF',
      secondaryDark: '#F0F0F0',

      bgPrimary: '#FFFFFF',
      bgSecondary: '#FAFAFA',
      bgCard: '#FFFFFF',

      borderColor: '#E0E0E0',
      borderColorLight: '#F0F0F0',

      shadowColor: 'rgba(0, 0, 0, 0.04)',
      shadowColorLight: 'rgba(0, 0, 0, 0.02)',

      success: '#000000',
      error: '#000000',
      warning: '#000000',
      info: '#000000',
    },
    fonts: {
      base: 'system-ui, -apple-system, sans-serif',
      heading: 'system-ui, -apple-system, sans-serif',
      mono: 'ui-monospace, monospace',
    },
    animations: {
      duration: '200ms',
      easing: 'ease',
      custom: '',
    },
    minify: true,
  };

  static readonly VIBRANT: ThemeConfig = {
    id: 'cs-vibrant',
    name: 'CS Vibrant Theme',
    preset: 'cs-brand',
    customColors: {
      primary: '#FF006E',
      primaryLight: '#FF4081',
      primaryDark: '#C9005A',

      secondary: '#8338EC',
      secondaryLight: '#9D4EFF',
      secondaryDark: '#6927D3',

      accent: '#FB5607',
      accentLight: '#FF6B35',
      accentDark: '#E24502',

      bgPrimary: '#FFFBFE',
      bgSecondary: '#FFF0FA',
      bgCard: '#FFFFFF',

      success: '#06FFB4',
      error: '#FF006E',
      warning: '#FFBE0B',
      info: '#3A86FF',

      gradientStart: '#FF006E',
      gradientEnd: '#8338EC',
    },
    fonts: {
      base: '"DM Sans", -apple-system, sans-serif',
      heading: '"Space Grotesk", -apple-system, sans-serif',
      mono: '"Space Mono", monospace',
    },
    animations: {
      duration: '400ms',
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      custom: `
        @keyframes cs-vibrant-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        .cs-vibrant-gradient {
          background: linear-gradient(45deg, var(--cs-gradient-start), var(--cs-gradient-end));
          background-size: 200% 200%;
          animation: cs-vibrant-gradient 3s ease infinite;
        }
        
        @keyframes cs-vibrant-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        
        .cs-vibrant-bounce {
          animation: cs-vibrant-bounce 1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
        }
      `,
    },
    minify: true,
  };

  static readonly RETRO: ThemeConfig = {
    id: 'cs-retro',
    name: 'CS Retro Theme',
    preset: 'light',
    customColors: {
      primary: '#FF6B6B',
      primaryLight: '#FF8787',
      primaryDark: '#FF5252',

      secondary: '#4ECDC4',
      secondaryLight: '#6FD8D0',
      secondaryDark: '#3CBAB2',

      accent: '#FFE66D',
      accentLight: '#FFEB84',
      accentDark: '#FFE052',

      bgPrimary: '#FFF8E7',
      bgSecondary: '#FFF3D6',
      bgCard: '#FFFBF3',

      textPrimary: '#2D3436',
      textSecondary: '#636E72',
      textBody: '#2D3436',

      borderColor: '#FFE66D',
      borderColorLight: '#FFF3D6',
    },
    fonts: {
      base: '"Rubik", -apple-system, sans-serif',
      heading: '"Bebas Neue", sans-serif',
      mono: '"Courier Prime", monospace',
    },
    animations: {
      duration: '250ms',
      easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      custom: `
        @keyframes cs-retro-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        
        .cs-retro-shake {
          animation: cs-retro-shake 0.5s ease-in-out;
        }
        
        .cs-retro-shadow {
          box-shadow: 3px 3px 0 var(--cs-primary), 6px 6px 0 var(--cs-secondary);
        }
      `,
    },
    minify: true,
  };

  static readonly OCEAN: ThemeConfig = {
    id: 'cs-ocean',
    name: 'CS Ocean Theme',
    preset: 'light',
    customColors: {
      primary: '#006BA6',
      primaryLight: '#0084CC',
      primaryDark: '#005280',

      secondary: '#0496FF',
      secondaryLight: '#3FADFF',
      secondaryDark: '#0380E0',

      accent: '#00D9FF',
      accentLight: '#33E2FF',
      accentDark: '#00C2E6',

      bgPrimary: '#E8F4F8',
      bgSecondary: '#D1E9F0',
      bgCard: '#F5FAFE',

      success: '#00BFA5',
      error: '#FF5252',
      warning: '#FFB74D',
      info: '#0496FF',
    },
    fonts: {
      base: '"Lato", -apple-system, sans-serif',
      heading: '"Montserrat", -apple-system, sans-serif',
      mono: '"Source Code Pro", monospace',
    },
    animations: {
      duration: '600ms',
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      custom: `
        @keyframes cs-ocean-wave {
          0%, 100% { transform: translateY(0) scaleY(1); }
          50% { transform: translateY(-20px) scaleY(0.8); }
        }
        
        .cs-ocean-wave {
          animation: cs-ocean-wave 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        
        @keyframes cs-ocean-ripple {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(4); opacity: 0; }
        }
        
        .cs-ocean-ripple {
          animation: cs-ocean-ripple 1s ease-out;
        }
      `,
    },
    minify: true,
  };

  static readonly FOREST: ThemeConfig = {
    id: 'cs-forest',
    name: 'CS Forest Theme',
    preset: 'light',
    customColors: {
      primary: '#2D5016',
      primaryLight: '#3E6B1F',
      primaryDark: '#1C3A0F',

      secondary: '#5C821A',
      secondaryLight: '#74A31E',
      secondaryDark: '#4A6A15',

      accent: '#A0C334',
      accentLight: '#B4D348',
      accentDark: '#8CAF20',

      bgPrimary: '#F7F9F3',
      bgSecondary: '#EFF4E6',
      bgCard: '#FAFBF8',

      textPrimary: '#1A2409',
      textSecondary: '#3E4E2A',
      textBody: '#2D3A1F',
    },
    fonts: {
      base: '"Nunito Sans", -apple-system, sans-serif',
      heading: '"Oswald", -apple-system, sans-serif',
      mono: '"Inconsolata", monospace',
    },
    animations: {
      duration: '400ms',
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      custom: `
        @keyframes cs-forest-sway {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
        
        .cs-forest-sway {
          transform-origin: bottom center;
          animation: cs-forest-sway 4s ease-in-out infinite;
        }
        
        @keyframes cs-forest-grow {
          0% { transform: scaleY(0); transform-origin: bottom; }
          100% { transform: scaleY(1); }
        }
        
        .cs-forest-grow {
          animation: cs-forest-grow 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `,
    },
    minify: true,
  };

  static getAllPresets(): ThemeConfig[] {
    return [
      this.CS_BRAND,
      this.DARK,
      this.LIGHT,
      this.HIGH_CONTRAST,
      this.PRINT,
      this.EXECUTIVE,
      this.DEVELOPER,
      this.MINIMAL,
      this.VIBRANT,
      this.RETRO,
      this.OCEAN,
      this.FOREST,
    ];
  }

  static getPresetById(id: string): ThemeConfig | undefined {
    return this.getAllPresets().find(preset => preset.id === id);
  }

  static getPresetOptions(): Array<{ id: string; name: string; description: string }> {
    return [
      { id: 'cs-brand', name: 'CS Brand', description: 'Default CS brand theme with primary color #93186C' },
      { id: 'cs-dark', name: 'Dark Mode', description: 'Dark theme optimized for low-light environments' },
      { id: 'cs-light', name: 'Light Mode', description: 'Clean and professional light theme' },
      { id: 'cs-high-contrast', name: 'High Contrast', description: 'WCAG AAA compliant for maximum accessibility' },
      { id: 'cs-print', name: 'Print', description: 'Optimized for printing reports' },
      { id: 'cs-executive', name: 'Executive', description: 'Sophisticated theme for executive dashboards' },
      { id: 'cs-developer', name: 'Developer', description: 'Terminal-inspired theme for developers' },
      { id: 'cs-minimal', name: 'Minimal', description: 'Minimalist black and white theme' },
      { id: 'cs-vibrant', name: 'Vibrant', description: 'Colorful and energetic theme' },
      { id: 'cs-retro', name: 'Retro', description: 'Nostalgic retro-inspired theme' },
      { id: 'cs-ocean', name: 'Ocean', description: 'Calm blue ocean-inspired theme' },
      { id: 'cs-forest', name: 'Forest', description: 'Natural green forest theme' },
    ];
  }

  static createCustomTheme(basePreset: string, customizations: Partial<ThemeConfig>): ThemeConfig {
    const base = this.getPresetById(basePreset) ?? this.CS_BRAND;

    return {
      ...base,
      ...customizations,
      id: customizations.id ?? `custom-${Date.now()}`,
      name: customizations.name ?? `Custom ${base.name}`,
      fonts: {
        ...base.fonts,
        ...customizations.fonts,
      },
      customColors: {
        ...base.customColors,
        ...customizations.customColors,
      },
      animations: {
        ...base.animations,
        ...customizations.animations,
      },
      breakpoints: {
        ...base.breakpoints,
        ...customizations.breakpoints,
      },
    };
  }

  static validateTheme(theme: ThemeConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!theme.id) errors.push('Theme ID is required');
    if (!theme.name) errors.push('Theme name is required');
    if (!theme.preset) errors.push('Base preset is required');

    if (theme.fonts) {
      if (!theme.fonts.base) errors.push('Base font is required');
      if (!theme.fonts.heading) errors.push('Heading font is required');
      if (!theme.fonts.mono) errors.push('Monospace font is required');
    }

    if (theme.customColors) {
      Object.entries(theme.customColors).forEach(([key, value]) => {
        if (typeof value === 'string' && !this.isValidColor(value)) {
          errors.push(`Invalid color format for ${key}: ${value}`);
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }

  private static isValidColor(color: string): boolean {
    if (/^#[0-9A-F]{3}$/i.test(color)) return true;
    if (/^#[0-9A-F]{6}$/i.test(color)) return true;
    if (/^#[0-9A-F]{8}$/i.test(color)) return true;

    if (/^rgba?\([\d\s,%.]+\)$/i.test(color)) return true;

    if (/^hsla?\([\d\s,%]+\)$/i.test(color)) return true;

    const cssColors = ['transparent', 'currentColor', 'inherit', 'initial', 'unset'];
    if (cssColors.includes(color.toLowerCase())) return true;

    return false;
  }

  static exportTheme(theme: ThemeConfig): string {
    return JSON.stringify(theme, null, 2);
  }

  static importTheme(json: string): ThemeConfig {
    const theme = JSON.parse(json) as ThemeConfig;
    const validation = this.validateTheme(theme);

    if (!validation.valid) {
      throw new Error(`Invalid theme configuration: ${validation.errors.join(', ')}`);
    }

    return theme;
  }
}

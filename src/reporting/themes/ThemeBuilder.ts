/**
 * Theme Builder
 * Dynamically generates CSS themes for reports with brand customization
 * Supports light, dark, and custom color schemes with full CSS generation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../../core/utils/Logger';
import { FileUtils } from '../../core/utils/FileUtils';
import {
  ThemeConfig,
  ColorPalette,
  ThemePreset,
  ComponentStyle,
  AnimationConfig,
  ResponsiveBreakpoints,
  ThemeOutput,
  CSSVariable,
  FontConfig,
  IconSet,
} from './theme.types';

export class ThemeBuilder {
  private static instance: ThemeBuilder;
  private themePath: string = './themes';
  private generatedThemes: Map<string, ThemeOutput> = new Map();
  private cssVariables: Map<string, CSSVariable> = new Map();
  private componentStyles: Map<string, ComponentStyle> = new Map();

  // CS Brand Colors
  private readonly brandColors = {
    primary: '#93186C',
    primaryLight: '#B91C84',
    primaryDark: '#6B1250',
    primaryContrast: '#FFFFFF',
    secondary: '#FFFFFF',
    secondaryDark: '#F5F5F5',
    secondaryContrast: '#000000',
  };

  private constructor() {}

  static getInstance(): ThemeBuilder {
    if (!ThemeBuilder.instance) {
      ThemeBuilder.instance = new ThemeBuilder();
    }
    return ThemeBuilder.instance;
  }

  async initialize(outputPath: string = './themes'): Promise<void> {
    this.themePath = outputPath;
    await FileUtils.ensureDir(this.themePath);

    // Initialize CSS variables
    this.initializeCSSVariables();

    // Initialize component styles
    this.initializeComponentStyles();

    Logger.getInstance('ThemeBuilder').info('ThemeBuilder initialized', {
      outputPath: this.themePath,
    });
  }

  async buildTheme(config: ThemeConfig): Promise<ThemeOutput> {
    const themeId = config.id ?? this.generateThemeId(config.name);

    Logger.getInstance('ThemeBuilder').info(`Building theme: ${config.name}`, {
      themeId,
      preset: config.preset,
    });

    try {
      // Start with preset if specified
      let colorPalette: ColorPalette;
      if (config.preset) {
        colorPalette = this.getPresetPalette(config.preset);
      } else {
        colorPalette = this.createCustomPalette(config);
      }

      // Override with custom colors if provided
      if (config.customColors) {
        colorPalette = { ...colorPalette, ...config.customColors };
      }

      // Generate CSS
      const css = this.generateCSS(config, colorPalette);

      // Generate component styles
      const components = this.generateComponentStyles(config, colorPalette);

      // Generate animations
      const animations = this.generateAnimations(config.animations);

      // Generate responsive styles
      const responsive = this.generateResponsiveStyles(config.breakpoints);

      // Generate print styles
      const printStyles = this.generatePrintStyles(colorPalette);

      // Combine all CSS
      const fullCSS = this.combineCSS({
        base: css,
        components,
        animations,
        responsive,
        print: printStyles,
      });

      // Minify if production
      const finalCSS = config.minify ? this.minifyCSS(fullCSS) : fullCSS;

      // Create theme output
      const themeOutput: ThemeOutput = {
        id: themeId,
        name: config.name,
        css: finalCSS,
        colorPalette,
        ...(config.fonts && { fonts: config.fonts }),
        ...(config.icons && { icons: config.icons }),
        metadata: {
          created: new Date().toISOString(),
          version: '1.0.0',
          checksum: this.generateChecksum(finalCSS),
        },
      };

      // Save theme files
      await this.saveTheme(themeOutput);

      // Cache generated theme
      this.generatedThemes.set(themeId, themeOutput);

      Logger.getInstance('ThemeBuilder').info(`Theme built successfully: ${config.name}`, {
        themeId,
        cssSize: `${(finalCSS.length / 1024).toFixed(2)} KB`,
      });

      return themeOutput;
    } catch (error) {
      Logger.getInstance('ThemeBuilder').error('Error building theme', error as Error, {
        themeName: config.name,
      });
      throw error;
    }
  }

  private initializeCSSVariables(): void {
    // Color variables
    this.cssVariables.set('--cs-primary', {
      name: '--cs-primary',
      value: this.brandColors.primary,
      category: 'color',
      description: 'Primary brand color',
    } as CSSVariable);

    this.cssVariables.set('--cs-primary-light', {
      name: '--cs-primary-light',
      value: this.brandColors.primaryLight,
      category: 'color',
    } as CSSVariable);

    this.cssVariables.set('--cs-primary-dark', {
      name: '--cs-primary-dark',
      value: this.brandColors.primaryDark,
      category: 'color',
    } as CSSVariable);

    // Typography variables
    this.cssVariables.set('--cs-font-family', {
      name: '--cs-font-family',
      value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      category: 'typography',
    } as CSSVariable);

    this.cssVariables.set('--cs-font-size-base', {
      name: '--cs-font-size-base',
      value: '16px',
      category: 'typography',
    } as CSSVariable);

    // Spacing variables
    const spacingSizes = [0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 5];
    spacingSizes.forEach(size => {
      this.cssVariables.set(`--cs-spacing-${size}`, {
        name: `--cs-spacing-${size}`,
        value: `${size}rem`,
        category: 'spacing',
      } as CSSVariable);
    });

    // Border radius
    this.cssVariables.set('--cs-border-radius', {
      name: '--cs-border-radius',
      value: '0.375rem',
      category: 'border',
    } as CSSVariable);

    // Shadows
    this.cssVariables.set('--cs-shadow-sm', {
      name: '--cs-shadow-sm',
      value: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      category: 'shadow',
    } as CSSVariable);

    this.cssVariables.set('--cs-shadow', {
      name: '--cs-shadow',
      value: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      category: 'shadow',
    } as CSSVariable);

    this.cssVariables.set('--cs-shadow-lg', {
      name: '--cs-shadow-lg',
      value: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      category: 'shadow',
    } as CSSVariable);

    // Transitions
    this.cssVariables.set('--cs-transition', {
      name: '--cs-transition',
      value: 'all 0.3s ease',
      category: 'animation',
    } as CSSVariable);

    this.cssVariables.set('--cs-transition-fast', {
      name: '--cs-transition-fast',
      value: 'all 0.15s ease',
      category: 'animation',
    } as CSSVariable);
  }

  private initializeComponentStyles(): void {
    // Button styles
    this.componentStyles.set('button', {
      base: `
        .cs-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: var(--cs-spacing-0.5) var(--cs-spacing-1);
          font-family: var(--cs-font-family);
          font-size: var(--cs-font-size-base);
          font-weight: 500;
          line-height: 1.5;
          border-radius: var(--cs-border-radius);
          border: 1px solid transparent;
          cursor: pointer;
          transition: var(--cs-transition);
          text-decoration: none;
          outline: none;
          position: relative;
          overflow: hidden;
        }
        
        .cs-button:hover {
          transform: translateY(-1px);
          box-shadow: var(--cs-shadow);
        }
        
        .cs-button:active {
          transform: translateY(0);
        }
        
        .cs-button:focus-visible {
          box-shadow: 0 0 0 3px rgba(147, 24, 108, 0.3);
        }
        
        .cs-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
      `,
      variants: {
        primary: `
          .cs-button-primary {
            background-color: var(--cs-primary);
            color: var(--cs-primary-contrast);
            border-color: var(--cs-primary);
          }
          
          .cs-button-primary:hover {
            background-color: var(--cs-primary-dark);
            border-color: var(--cs-primary-dark);
          }
        `,
        secondary: `
          .cs-button-secondary {
            background-color: var(--cs-secondary);
            color: var(--cs-secondary-contrast);
            border-color: var(--cs-gray-300);
          }
          
          .cs-button-secondary:hover {
            background-color: var(--cs-gray-100);
          }
        `,
        outline: `
          .cs-button-outline {
            background-color: transparent;
            color: var(--cs-primary);
            border-color: var(--cs-primary);
          }
          
          .cs-button-outline:hover {
            background-color: var(--cs-primary);
            color: var(--cs-primary-contrast);
          }
        `,
      },
      sizes: {
        sm: `
          .cs-button-sm {
            padding: var(--cs-spacing-0.25) var(--cs-spacing-0.5);
            font-size: 0.875rem;
          }
        `,
        md: `
          .cs-button-md {
            padding: var(--cs-spacing-0.5) var(--cs-spacing-1);
            font-size: 1rem;
          }
        `,
        lg: `
          .cs-button-lg {
            padding: var(--cs-spacing-1) var(--cs-spacing-2);
            font-size: 1.125rem;
          }
        `,
      },
    });

    // Card styles
    this.componentStyles.set('card', {
      base: `
        .cs-card {
          background-color: var(--cs-bg-card);
          border: 1px solid var(--cs-border-color);
          border-radius: var(--cs-border-radius);
          box-shadow: var(--cs-shadow-sm);
          transition: var(--cs-transition);
          overflow: hidden;
        }
        
        .cs-card:hover {
          box-shadow: var(--cs-shadow);
        }
        
        .cs-card-header {
          padding: var(--cs-spacing-1) var(--cs-spacing-1.5);
          border-bottom: 1px solid var(--cs-border-color);
          background-color: var(--cs-bg-muted);
        }
        
        .cs-card-body {
          padding: var(--cs-spacing-1.5);
        }
        
        .cs-card-footer {
          padding: var(--cs-spacing-1) var(--cs-spacing-1.5);
          border-top: 1px solid var(--cs-border-color);
          background-color: var(--cs-bg-muted);
        }
      `,
      variants: {
        elevated: `
          .cs-card-elevated {
            box-shadow: var(--cs-shadow-lg);
            border: none;
          }
        `,
        flat: `
          .cs-card-flat {
            box-shadow: none;
            border: none;
            background-color: var(--cs-bg-muted);
          }
        `,
        bordered: `
          .cs-card-bordered {
            box-shadow: none;
            border-width: 2px;
          }
        `,
      },
    });

    // Table styles
    this.componentStyles.set('table', {
      base: `
        .cs-table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--cs-font-size-base);
          background-color: var(--cs-bg-card);
        }
        
        .cs-table thead {
          background-color: var(--cs-bg-muted);
        }
        
        .cs-table th {
          padding: var(--cs-spacing-1);
          font-weight: 600;
          text-align: left;
          border-bottom: 2px solid var(--cs-border-color);
          color: var(--cs-text-heading);
        }
        
        .cs-table td {
          padding: var(--cs-spacing-1);
          border-bottom: 1px solid var(--cs-border-color);
          color: var(--cs-text-body);
        }
        
        .cs-table tbody tr:hover {
          background-color: var(--cs-bg-hover);
        }
        
        .cs-table tbody tr:last-child td {
          border-bottom: none;
        }
      `,
      variants: {
        striped: `
          .cs-table-striped tbody tr:nth-child(odd) {
            background-color: var(--cs-bg-stripe);
          }
        `,
        bordered: `
          .cs-table-bordered {
            border: 1px solid var(--cs-border-color);
          }
          
          .cs-table-bordered th,
          .cs-table-bordered td {
            border: 1px solid var(--cs-border-color);
          }
        `,
        compact: `
          .cs-table-compact th,
          .cs-table-compact td {
            padding: var(--cs-spacing-0.5);
          }
        `,
      },
    });

    // Chart container styles
    this.componentStyles.set('chart', {
      base: `
        .cs-chart-container {
          position: relative;
          width: 100%;
          height: 400px;
          background-color: var(--cs-bg-card);
          border-radius: var(--cs-border-radius);
          padding: var(--cs-spacing-1);
        }
        
        .cs-chart-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--cs-text-heading);
          margin-bottom: var(--cs-spacing-1);
        }
        
        .cs-chart-legend {
          display: flex;
          flex-wrap: wrap;
          gap: var(--cs-spacing-1);
          margin-top: var(--cs-spacing-1);
          font-size: 0.875rem;
        }
        
        .cs-chart-legend-item {
          display: flex;
          align-items: center;
          gap: var(--cs-spacing-0.25);
        }
        
        .cs-chart-legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }
      `,
      variants: {
        fullHeight: `
          .cs-chart-container-full {
            height: 100%;
            min-height: 400px;
          }
        `,
        compact: `
          .cs-chart-container-compact {
            height: 200px;
          }
        `,
      },
    });

    // Alert/notification styles
    this.componentStyles.set('alert', {
      base: `
        .cs-alert {
          padding: var(--cs-spacing-1) var(--cs-spacing-1.5);
          border-radius: var(--cs-border-radius);
          border: 1px solid transparent;
          display: flex;
          align-items: flex-start;
          gap: var(--cs-spacing-0.5);
        }
        
        .cs-alert-icon {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
        }
        
        .cs-alert-content {
          flex: 1;
        }
        
        .cs-alert-title {
          font-weight: 600;
          margin-bottom: var(--cs-spacing-0.25);
        }
        
        .cs-alert-description {
          font-size: 0.875rem;
        }
      `,
      variants: {
        success: `
          .cs-alert-success {
            background-color: var(--cs-success-bg);
            border-color: var(--cs-success-border);
            color: var(--cs-success-text);
          }
        `,
        error: `
          .cs-alert-error {
            background-color: var(--cs-error-bg);
            border-color: var(--cs-error-border);
            color: var(--cs-error-text);
          }
        `,
        warning: `
          .cs-alert-warning {
            background-color: var(--cs-warning-bg);
            border-color: var(--cs-warning-border);
            color: var(--cs-warning-text);
          }
        `,
        info: `
          .cs-alert-info {
            background-color: var(--cs-info-bg);
            border-color: var(--cs-info-border);
            color: var(--cs-info-text);
          }
        `,
      },
    });

    // Badge styles
    this.componentStyles.set('badge', {
      base: `
        .cs-badge {
          display: inline-flex;
          align-items: center;
          padding: var(--cs-spacing-0.25) var(--cs-spacing-0.5);
          font-size: 0.75rem;
          font-weight: 500;
          border-radius: 9999px;
          white-space: nowrap;
        }
      `,
      variants: {
        primary: `
          .cs-badge-primary {
            background-color: var(--cs-primary);
            color: var(--cs-primary-contrast);
          }
        `,
        success: `
          .cs-badge-success {
            background-color: var(--cs-success);
            color: white;
          }
        `,
        error: `
          .cs-badge-error {
            background-color: var(--cs-error);
            color: white;
          }
        `,
        warning: `
          .cs-badge-warning {
            background-color: var(--cs-warning);
            color: var(--cs-gray-900);
          }
        `,
        info: `
          .cs-badge-info {
            background-color: var(--cs-info);
            color: white;
          }
        `,
      },
    });

    // Progress bar styles
    this.componentStyles.set('progress', {
      base: `
        .cs-progress {
          width: 100%;
          height: 8px;
          background-color: var(--cs-bg-muted);
          border-radius: 9999px;
          overflow: hidden;
          position: relative;
        }
        
        .cs-progress-bar {
          height: 100%;
          background-color: var(--cs-primary);
          border-radius: 9999px;
          transition: width 0.5s ease;
          position: relative;
          overflow: hidden;
        }
        
        .cs-progress-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.3),
            transparent
          );
          animation: cs-progress-shine 2s linear infinite;
        }
        
        @keyframes cs-progress-shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `,
      variants: {
        striped: `
          .cs-progress-bar-striped {
            background-image: linear-gradient(
              45deg,
              rgba(255, 255, 255, 0.15) 25%,
              transparent 25%,
              transparent 50%,
              rgba(255, 255, 255, 0.15) 50%,
              rgba(255, 255, 255, 0.15) 75%,
              transparent 75%,
              transparent
            );
            background-size: 1rem 1rem;
            animation: cs-progress-stripes 1s linear infinite;
          }
          
          @keyframes cs-progress-stripes {
            0% { background-position: 1rem 0; }
            100% { background-position: 0 0; }
          }
        `,
        lg: `
          .cs-progress-lg {
            height: 16px;
          }
        `,
        sm: `
          .cs-progress-sm {
            height: 4px;
          }
        `,
      },
    });

    // Navigation styles
    this.componentStyles.set('nav', {
      base: `
        .cs-nav {
          display: flex;
          background-color: var(--cs-bg-nav);
          box-shadow: var(--cs-shadow);
          position: sticky;
          top: 0;
          z-index: 1000;
        }
        
        .cs-nav-brand {
          display: flex;
          align-items: center;
          padding: var(--cs-spacing-1) var(--cs-spacing-2);
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--cs-primary);
          text-decoration: none;
        }
        
        .cs-nav-menu {
          display: flex;
          align-items: center;
          list-style: none;
          margin: 0;
          padding: 0;
          flex: 1;
        }
        
        .cs-nav-item {
          position: relative;
        }
        
        .cs-nav-link {
          display: flex;
          align-items: center;
          padding: var(--cs-spacing-1) var(--cs-spacing-1.5);
          color: var(--cs-text-nav);
          text-decoration: none;
          transition: var(--cs-transition);
          position: relative;
        }
        
        .cs-nav-link:hover {
          color: var(--cs-primary);
          background-color: var(--cs-bg-hover);
        }
        
        .cs-nav-link.active {
          color: var(--cs-primary);
        }
        
        .cs-nav-link.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: var(--cs-spacing-1.5);
          right: var(--cs-spacing-1.5);
          height: 3px;
          background-color: var(--cs-primary);
          border-radius: 3px 3px 0 0;
        }
      `,
      variants: {
        vertical: `
          .cs-nav-vertical {
            flex-direction: column;
            width: 250px;
            height: 100%;
            border-right: 1px solid var(--cs-border-color);
          }
          
          .cs-nav-vertical .cs-nav-menu {
            flex-direction: column;
            width: 100%;
          }
          
          .cs-nav-vertical .cs-nav-item {
            width: 100%;
          }
          
          .cs-nav-vertical .cs-nav-link {
            width: 100%;
          }
          
          .cs-nav-vertical .cs-nav-link.active::after {
            top: var(--cs-spacing-1);
            bottom: var(--cs-spacing-1);
            left: 0;
            right: auto;
            width: 3px;
            height: auto;
            border-radius: 0 3px 3px 0;
          }
        `,
        tabs: `
          .cs-nav-tabs {
            border-bottom: 1px solid var(--cs-border-color);
            background-color: transparent;
            box-shadow: none;
          }
          
          .cs-nav-tabs .cs-nav-link {
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
          }
          
          .cs-nav-tabs .cs-nav-link.active {
            border-bottom-color: var(--cs-primary);
          }
          
          .cs-nav-tabs .cs-nav-link.active::after {
            display: none;
          }
        `,
      },
    });
  }

  private getPresetPalette(preset: ThemePreset): ColorPalette {
    switch (preset) {
      case 'cs-brand':
        return this.createCSBrandPalette();

      case 'dark':
        return this.createDarkPalette();

      case 'light':
        return this.createLightPalette();

      case 'high-contrast':
        return this.createHighContrastPalette();

      case 'print':
        return this.createPrintPalette();

      default:
        return this.createCSBrandPalette();
    }
  }

  private createCSBrandPalette(): ColorPalette {
    return {
      // Core colors required by ColorPalette interface
      background: '#FFFFFF',
      surface: '#FFFFFF',
      text: '#212529',
      border: '#DEE2E6',
      shadow: 'rgba(0, 0, 0, 0.1)',

      // Primary colors
      primary: this.brandColors.primary,
      primaryLight: this.brandColors.primaryLight,
      primaryDark: this.brandColors.primaryDark,
      primaryContrast: this.brandColors.primaryContrast,

      // Secondary colors
      secondary: this.brandColors.secondary,
      secondaryLight: '#FFFFFF',
      secondaryDark: this.brandColors.secondaryDark,
      secondaryContrast: this.brandColors.secondaryContrast,

      // Status colors
      success: '#28A745',
      successLight: '#48B461',
      successDark: '#1E7E34',

      error: '#DC3545',
      errorLight: '#E4606D',
      errorDark: '#BD2130',

      warning: '#FFC107',
      warningLight: '#FFCD39',
      warningDark: '#E0A800',

      info: '#17A2B8',
      infoLight: '#3AB0C3',
      infoDark: '#138496',

      // Neutral colors
      gray100: '#F8F9FA',
      gray200: '#E9ECEF',
      gray300: '#DEE2E6',
      gray400: '#CED4DA',
      gray500: '#ADB5BD',
      gray600: '#6C757D',
      gray700: '#495057',
      gray800: '#343A40',
      gray900: '#212529',

      // Background colors
      bgPrimary: '#FFFFFF',
      bgSecondary: '#F8F9FA',
      bgTertiary: '#E9ECEF',
      bgCard: '#FFFFFF',
      bgMuted: '#F8F9FA',
      bgHover: 'rgba(147, 24, 108, 0.05)',
      bgStripe: 'rgba(0, 0, 0, 0.02)',
      bgNav: '#FFFFFF',

      // Text colors
      textPrimary: '#212529',
      textSecondary: '#6C757D',
      textMuted: '#ADB5BD',
      textHeading: '#212529',
      textBody: '#495057',
      textNav: '#495057',
      textLink: this.brandColors.primary,
      textLinkHover: this.brandColors.primaryDark,

      // Border colors
      borderColor: '#DEE2E6',
      borderColorLight: '#E9ECEF',
      borderColorDark: '#CED4DA',

      // Shadow colors
      shadowColor: 'rgba(0, 0, 0, 0.1)',
      shadowColorLight: 'rgba(0, 0, 0, 0.05)',
      shadowColorDark: 'rgba(0, 0, 0, 0.15)',
    };
  }

  private createDarkPalette(): ColorPalette {
    return {
      // Core colors required by ColorPalette interface
      background: '#1A1A1A',
      surface: '#2B2B2B',
      text: '#F4F4F4',
      border: '#3A3A3A',
      shadow: 'rgba(0, 0, 0, 0.3)',

      // Primary colors (adjusted for dark theme)
      primary: '#B91C84',
      primaryLight: '#D13A9C',
      primaryDark: '#93186C',
      primaryContrast: '#FFFFFF',

      // Secondary colors
      secondary: '#2B2B2B',
      secondaryLight: '#3A3A3A',
      secondaryDark: '#1A1A1A',
      secondaryContrast: '#FFFFFF',

      // Status colors (adjusted for dark backgrounds)
      success: '#48B461',
      successLight: '#5BC073',
      successDark: '#28A745',

      error: '#E4606D',
      errorLight: '#E97681',
      errorDark: '#DC3545',

      warning: '#FFCD39',
      warningLight: '#FFD451',
      warningDark: '#FFC107',

      info: '#3AB0C3',
      infoLight: '#52B9CB',
      infoDark: '#17A2B8',

      // Neutral colors (inverted)
      gray100: '#1A1A1A',
      gray200: '#2B2B2B',
      gray300: '#3A3A3A',
      gray400: '#4A4A4A',
      gray500: '#6C6C6C',
      gray600: '#8E8E8E',
      gray700: '#B0B0B0',
      gray800: '#D2D2D2',
      gray900: '#F4F4F4',

      // Background colors
      bgPrimary: '#1A1A1A',
      bgSecondary: '#2B2B2B',
      bgTertiary: '#3A3A3A',
      bgCard: '#2B2B2B',
      bgMuted: '#3A3A3A',
      bgHover: 'rgba(185, 28, 132, 0.1)',
      bgStripe: 'rgba(255, 255, 255, 0.02)',
      bgNav: '#2B2B2B',

      // Text colors
      textPrimary: '#F4F4F4',
      textSecondary: '#B0B0B0',
      textMuted: '#8E8E8E',
      textHeading: '#FFFFFF',
      textBody: '#D2D2D2',
      textNav: '#D2D2D2',
      textLink: '#D13A9C',
      textLinkHover: '#E95BAB',

      // Border colors
      borderColor: '#3A3A3A',
      borderColorLight: '#4A4A4A',
      borderColorDark: '#2B2B2B',

      // Shadow colors
      shadowColor: 'rgba(0, 0, 0, 0.3)',
      shadowColorLight: 'rgba(0, 0, 0, 0.2)',
      shadowColorDark: 'rgba(0, 0, 0, 0.4)',
    };
  }

  private createLightPalette(): ColorPalette {
    // Similar to CS brand but with lighter tones
    const base = this.createCSBrandPalette();

    return {
      ...base,
      bgPrimary: '#FFFFFF',
      bgSecondary: '#FAFBFC',
      bgTertiary: '#F5F7FA',
      bgCard: '#FFFFFF',
      bgMuted: '#FAFBFC',
      bgHover: 'rgba(147, 24, 108, 0.03)',

      borderColor: '#E1E4E8',
      borderColorLight: '#EBEEF1',
      borderColorDark: '#D1D5DB',

      shadowColor: 'rgba(0, 0, 0, 0.08)',
      shadowColorLight: 'rgba(0, 0, 0, 0.04)',
      shadowColorDark: 'rgba(0, 0, 0, 0.12)',
    };
  }

  private createHighContrastPalette(): ColorPalette {
    return {
      // Core colors required by ColorPalette interface
      background: '#FFFFFF',
      surface: '#FFFFFF',
      text: '#000000',
      border: '#000000',
      shadow: 'transparent',

      // High contrast colors
      primary: '#000000',
      primaryLight: '#333333',
      primaryDark: '#000000',
      primaryContrast: '#FFFFFF',

      secondary: '#FFFFFF',
      secondaryLight: '#FFFFFF',
      secondaryDark: '#F0F0F0',
      secondaryContrast: '#000000',

      // Status colors with maximum contrast
      success: '#00FF00',
      successLight: '#33FF33',
      successDark: '#00CC00',

      error: '#FF0000',
      errorLight: '#FF3333',
      errorDark: '#CC0000',

      warning: '#FFFF00',
      warningLight: '#FFFF33',
      warningDark: '#CCCC00',

      info: '#00FFFF',
      infoLight: '#33FFFF',
      infoDark: '#00CCCC',

      // Black and white only
      gray100: '#FFFFFF',
      gray200: '#FFFFFF',
      gray300: '#FFFFFF',
      gray400: '#CCCCCC',
      gray500: '#999999',
      gray600: '#666666',
      gray700: '#333333',
      gray800: '#000000',
      gray900: '#000000',

      // High contrast backgrounds
      bgPrimary: '#FFFFFF',
      bgSecondary: '#FFFFFF',
      bgTertiary: '#FFFFFF',
      bgCard: '#FFFFFF',
      bgMuted: '#F0F0F0',
      bgHover: '#E0E0E0',
      bgStripe: '#F5F5F5',
      bgNav: '#000000',

      // High contrast text
      textPrimary: '#000000',
      textSecondary: '#000000',
      textMuted: '#666666',
      textHeading: '#000000',
      textBody: '#000000',
      textNav: '#FFFFFF',
      textLink: '#0000FF',
      textLinkHover: '#000080',

      // High contrast borders
      borderColor: '#000000',
      borderColorLight: '#666666',
      borderColorDark: '#000000',

      // No shadows in high contrast
      shadowColor: 'transparent',
      shadowColorLight: 'transparent',
      shadowColorDark: 'transparent',
    };
  }

  private createPrintPalette(): ColorPalette {
    return {
      // Core colors required by ColorPalette interface
      background: '#FFFFFF',
      surface: '#FFFFFF',
      text: '#000000',
      border: '#000000',
      shadow: 'transparent',

      // Print-friendly colors
      primary: '#000000',
      primaryLight: '#333333',
      primaryDark: '#000000',
      primaryContrast: '#FFFFFF',

      secondary: '#FFFFFF',
      secondaryLight: '#FFFFFF',
      secondaryDark: '#F0F0F0',
      secondaryContrast: '#000000',

      // Grayscale status colors for print
      success: '#666666',
      successLight: '#999999',
      successDark: '#333333',

      error: '#000000',
      errorLight: '#333333',
      errorDark: '#000000',

      warning: '#999999',
      warningLight: '#CCCCCC',
      warningDark: '#666666',

      info: '#666666',
      infoLight: '#999999',
      infoDark: '#333333',

      // Grayscale
      gray100: '#FFFFFF',
      gray200: '#F5F5F5',
      gray300: '#E0E0E0',
      gray400: '#CCCCCC',
      gray500: '#999999',
      gray600: '#666666',
      gray700: '#333333',
      gray800: '#1A1A1A',
      gray900: '#000000',

      // White backgrounds for print
      bgPrimary: '#FFFFFF',
      bgSecondary: '#FFFFFF',
      bgTertiary: '#FFFFFF',
      bgCard: '#FFFFFF',
      bgMuted: '#FFFFFF',
      bgHover: '#FFFFFF',
      bgStripe: '#F5F5F5',
      bgNav: '#FFFFFF',

      // Black text for print
      textPrimary: '#000000',
      textSecondary: '#333333',
      textMuted: '#666666',
      textHeading: '#000000',
      textBody: '#000000',
      textNav: '#000000',
      textLink: '#000000',
      textLinkHover: '#000000',

      // Black borders for print
      borderColor: '#000000',
      borderColorLight: '#CCCCCC',
      borderColorDark: '#000000',

      // No shadows for print
      shadowColor: 'transparent',
      shadowColorLight: 'transparent',
      shadowColorDark: 'transparent',
    };
  }

  private createCustomPalette(config: ThemeConfig): ColorPalette {
    // Start with brand palette as base
    const base = this.createCSBrandPalette();

    // Override with any custom colors
    if (config.customColors) {
      return { ...base, ...config.customColors };
    }

    return base;
  }

  private generateCSS(config: ThemeConfig, palette: ColorPalette): string {
    const css: string[] = [];

    // CSS Reset
    css.push(this.generateReset());

    // Root variables
    css.push(':root {');

    // Color variables
    Object.entries(palette).forEach(([key, value]) => {
      const cssVarName = `--cs-${this.camelToKebab(key)}`;
      css.push(`  ${cssVarName}: ${value};`);
    });

    // Add all other CSS variables
    this.cssVariables.forEach(variable => {
      if (!variable.name.includes('color') && !variable.name.includes('primary')) {
        css.push(`  ${variable.name}: ${variable.value};`);
      }
    });

    // Font variables
    if (config.fonts) {
      css.push(`  --cs-font-family-base: ${config.fonts.base ?? 'system-ui, -apple-system, sans-serif'};`);
      css.push(`  --cs-font-family-heading: ${config.fonts.heading ?? 'var(--cs-font-family-base)'};`);
      css.push(`  --cs-font-family-mono: ${config.fonts.mono ?? 'Consolas, Monaco, monospace'};`);
    }

    css.push('}');

    // Base styles
    css.push(this.generateBaseStyles(palette));

    // Typography
    css.push(this.generateTypography(config.fonts));

    // Layout
    css.push(this.generateLayout());

    // Utilities
    css.push(this.generateUtilities());

    return css.join('\n');
  }

  private generateReset(): string {
    return `
/* CSS Reset */
*, *::before, *::after {
  box-sizing: border-box;
}

* {
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  min-height: 100vh;
  line-height: 1.5;
  font-family: var(--cs-font-family-base);
  color: var(--cs-text-body);
  background-color: var(--cs-bg-primary);
}

img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
  height: auto;
}

input, button, textarea, select {
  font: inherit;
  color: inherit;
}

p, h1, h2, h3, h4, h5, h6 {
  overflow-wrap: break-word;
}

a {
  color: var(--cs-text-link);
  text-decoration: none;
}

a:hover {
  color: var(--cs-text-link-hover);
  text-decoration: underline;
}

table {
  border-collapse: collapse;
  border-spacing: 0;
}

ol, ul {
  list-style: none;
}
`;
  }

  private generateBaseStyles(_palette: ColorPalette): string {
    return `
/* Base Styles */
.cs-report {
  font-family: var(--cs-font-family-base);
  font-size: var(--cs-font-size-base);
  line-height: 1.5;
  color: var(--cs-text-body);
  background-color: var(--cs-bg-primary);
  min-height: 100vh;
}

.cs-container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--cs-spacing-1);
}

.cs-container-fluid {
  width: 100%;
  padding: 0 var(--cs-spacing-1);
}

.cs-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.cs-header {
  background-color: var(--cs-bg-nav);
  border-bottom: 1px solid var(--cs-border-color);
  position: sticky;
  top: 0;
  z-index: 1000;
}

.cs-main {
  flex: 1;
  padding: var(--cs-spacing-2) 0;
}

.cs-footer {
  background-color: var(--cs-bg-muted);
  border-top: 1px solid var(--cs-border-color);
  padding: var(--cs-spacing-2) 0;
  margin-top: auto;
}

/* Status Colors */
.cs-success { color: var(--cs-success); }
.cs-error { color: var(--cs-error); }
.cs-warning { color: var(--cs-warning); }
.cs-info { color: var(--cs-info); }

.cs-bg-success { background-color: var(--cs-success-bg); }
.cs-bg-error { background-color: var(--cs-error-bg); }
.cs-bg-warning { background-color: var(--cs-warning-bg); }
.cs-bg-info { background-color: var(--cs-info-bg); }

/* Focus Styles */
:focus-visible {
  outline: 2px solid var(--cs-primary);
  outline-offset: 2px;
}

/* Selection */
::selection {
  background-color: var(--cs-primary);
  color: var(--cs-primary-contrast);
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

::-webkit-scrollbar-track {
  background: var(--cs-bg-muted);
}

::-webkit-scrollbar-thumb {
  background: var(--cs-gray-400);
  border-radius: 6px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--cs-gray-500);
}
`;
  }

  private generateTypography(_fonts?: FontConfig): string {
    return `
/* Typography */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--cs-font-family-heading);
  font-weight: 600;
  line-height: 1.2;
  color: var(--cs-text-heading);
  margin-bottom: var(--cs-spacing-0.5);
}

h1 { font-size: 2.5rem; }
h2 { font-size: 2rem; }
h3 { font-size: 1.75rem; }
h4 { font-size: 1.5rem; }
h5 { font-size: 1.25rem; }
h6 { font-size: 1rem; }

p {
  margin-bottom: var(--cs-spacing-1);
}

.cs-lead {
  font-size: 1.25rem;
  font-weight: 300;
  color: var(--cs-text-secondary);
}

.cs-text-sm { font-size: 0.875rem; }
.cs-text-xs { font-size: 0.75rem; }
.cs-text-lg { font-size: 1.125rem; }
.cs-text-xl { font-size: 1.25rem; }

.cs-text-muted { color: var(--cs-text-muted); }
.cs-text-primary { color: var(--cs-primary); }
.cs-text-secondary { color: var(--cs-text-secondary); }

.cs-font-normal { font-weight: 400; }
.cs-font-medium { font-weight: 500; }
.cs-font-semibold { font-weight: 600; }
.cs-font-bold { font-weight: 700; }

.cs-italic { font-style: italic; }
.cs-underline { text-decoration: underline; }
.cs-line-through { text-decoration: line-through; }

.cs-uppercase { text-transform: uppercase; }
.cs-lowercase { text-transform: lowercase; }
.cs-capitalize { text-transform: capitalize; }

.cs-text-left { text-align: left; }
.cs-text-center { text-align: center; }
.cs-text-right { text-align: right; }
.cs-text-justify { text-align: justify; }

.cs-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs-break-words {
  word-wrap: break-word;
  word-break: break-word;
}

code, pre {
  font-family: var(--cs-font-family-mono);
}

code {
  background-color: var(--cs-bg-muted);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
}

pre {
  background-color: var(--cs-bg-muted);
  padding: var(--cs-spacing-1);
  border-radius: var(--cs-border-radius);
  overflow-x: auto;
  margin-bottom: var(--cs-spacing-1);
}

pre code {
  background-color: transparent;
  padding: 0;
}

blockquote {
  border-left: 4px solid var(--cs-primary);
  padding-left: var(--cs-spacing-1);
  margin: var(--cs-spacing-1) 0;
  font-style: italic;
  color: var(--cs-text-secondary);
}

hr {
  border: none;
  border-top: 1px solid var(--cs-border-color);
  margin: var(--cs-spacing-2) 0;
}
`;
  }

  private generateLayout(): string {
    return `
/* Layout */
.cs-row {
  display: flex;
  flex-wrap: wrap;
  margin-left: calc(var(--cs-spacing-1) * -1);
  margin-right: calc(var(--cs-spacing-1) * -1);
}

.cs-col {
  flex: 1 0 0%;
  padding-left: var(--cs-spacing-1);
  padding-right: var(--cs-spacing-1);
}

/* Column sizes */
.cs-col-auto { flex: 0 0 auto; width: auto; }
.cs-col-1 { flex: 0 0 8.333333%; max-width: 8.333333%; }
.cs-col-2 { flex: 0 0 16.666667%; max-width: 16.666667%; }
.cs-col-3 { flex: 0 0 25%; max-width: 25%; }
.cs-col-4 { flex: 0 0 33.333333%; max-width: 33.333333%; }
.cs-col-5 { flex: 0 0 41.666667%; max-width: 41.666667%; }
.cs-col-6 { flex: 0 0 50%; max-width: 50%; }
.cs-col-7 { flex: 0 0 58.333333%; max-width: 58.333333%; }
.cs-col-8 { flex: 0 0 66.666667%; max-width: 66.666667%; }
.cs-col-9 { flex: 0 0 75%; max-width: 75%; }
.cs-col-10 { flex: 0 0 83.333333%; max-width: 83.333333%; }
.cs-col-11 { flex: 0 0 91.666667%; max-width: 91.666667%; }
.cs-col-12 { flex: 0 0 100%; max-width: 100%; }

/* Grid */
.cs-grid {
  display: grid;
  gap: var(--cs-spacing-1);
}

.cs-grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.cs-grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cs-grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.cs-grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cs-grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.cs-grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }

/* Flexbox utilities */
.cs-flex { display: flex; }
.cs-inline-flex { display: inline-flex; }
.cs-flex-row { flex-direction: row; }
.cs-flex-col { flex-direction: column; }
.cs-flex-wrap { flex-wrap: wrap; }
.cs-flex-nowrap { flex-wrap: nowrap; }

.cs-justify-start { justify-content: flex-start; }
.cs-justify-end { justify-content: flex-end; }
.cs-justify-center { justify-content: center; }
.cs-justify-between { justify-content: space-between; }
.cs-justify-around { justify-content: space-around; }
.cs-justify-evenly { justify-content: space-evenly; }

.cs-items-start { align-items: flex-start; }
.cs-items-end { align-items: flex-end; }
.cs-items-center { align-items: center; }
.cs-items-baseline { align-items: baseline; }
.cs-items-stretch { align-items: stretch; }

.cs-flex-1 { flex: 1 1 0%; }
.cs-flex-auto { flex: 1 1 auto; }
.cs-flex-initial { flex: 0 1 auto; }
.cs-flex-none { flex: none; }

/* Gap utilities */
.cs-gap-0 { gap: 0; }
.cs-gap-1 { gap: var(--cs-spacing-1); }
.cs-gap-2 { gap: var(--cs-spacing-2); }
.cs-gap-3 { gap: var(--cs-spacing-3); }
.cs-gap-4 { gap: var(--cs-spacing-4); }
.cs-gap-5 { gap: var(--cs-spacing-5); }

/* Position */
.cs-static { position: static; }
.cs-fixed { position: fixed; }
.cs-absolute { position: absolute; }
.cs-relative { position: relative; }
.cs-sticky { position: sticky; }

.cs-top-0 { top: 0; }
.cs-right-0 { right: 0; }
.cs-bottom-0 { bottom: 0; }
.cs-left-0 { left: 0; }
.cs-inset-0 { top: 0; right: 0; bottom: 0; left: 0; }

/* Z-index */
.cs-z-0 { z-index: 0; }
.cs-z-10 { z-index: 10; }
.cs-z-20 { z-index: 20; }
.cs-z-30 { z-index: 30; }
.cs-z-40 { z-index: 40; }
.cs-z-50 { z-index: 50; }
.cs-z-auto { z-index: auto; }

/* Display */
.cs-block { display: block; }
.cs-inline-block { display: inline-block; }
.cs-inline { display: inline; }
.cs-hidden { display: none; }

/* Overflow */
.cs-overflow-auto { overflow: auto; }
.cs-overflow-hidden { overflow: hidden; }
.cs-overflow-visible { overflow: visible; }
.cs-overflow-scroll { overflow: scroll; }
.cs-overflow-x-auto { overflow-x: auto; overflow-y: visible; }
.cs-overflow-y-auto { overflow-x: visible; overflow-y: auto; }
`;
  }

  private generateUtilities(): string {
    return `
/* Spacing Utilities */
${this.generateSpacingUtilities()}

/* Width & Height */
.cs-w-full { width: 100%; }
.cs-w-screen { width: 100vw; }
.cs-w-auto { width: auto; }
.cs-w-1\\/2 { width: 50%; }
.cs-w-1\\/3 { width: 33.333333%; }
.cs-w-2\\/3 { width: 66.666667%; }
.cs-w-1\\/4 { width: 25%; }
.cs-w-3\\/4 { width: 75%; }

.cs-h-full { height: 100%; }
.cs-h-screen { height: 100vh; }
.cs-h-auto { height: auto; }

.cs-max-w-none { max-width: none; }
.cs-max-w-xs { max-width: 20rem; }
.cs-max-w-sm { max-width: 24rem; }
.cs-max-w-md { max-width: 28rem; }
.cs-max-w-lg { max-width: 32rem; }
.cs-max-w-xl { max-width: 36rem; }
.cs-max-w-2xl { max-width: 42rem; }
.cs-max-w-3xl { max-width: 48rem; }
.cs-max-w-4xl { max-width: 56rem; }
.cs-max-w-5xl { max-width: 64rem; }
.cs-max-w-6xl { max-width: 72rem; }
.cs-max-w-full { max-width: 100%; }

/* Border */
.cs-border { border-width: 1px; }
.cs-border-0 { border-width: 0; }
.cs-border-2 { border-width: 2px; }
.cs-border-4 { border-width: 4px; }

.cs-border-solid { border-style: solid; }
.cs-border-dashed { border-style: dashed; }
.cs-border-dotted { border-style: dotted; }
.cs-border-none { border-style: none; }

.cs-border-primary { border-color: var(--cs-primary); }
.cs-border-secondary { border-color: var(--cs-secondary); }
.cs-border-success { border-color: var(--cs-success); }
.cs-border-error { border-color: var(--cs-error); }
.cs-border-warning { border-color: var(--cs-warning); }
.cs-border-info { border-color: var(--cs-info); }

/* Border Radius */
.cs-rounded-none { border-radius: 0; }
.cs-rounded-sm { border-radius: 0.125rem; }
.cs-rounded { border-radius: var(--cs-border-radius); }
.cs-rounded-md { border-radius: 0.375rem; }
.cs-rounded-lg { border-radius: 0.5rem; }
.cs-rounded-xl { border-radius: 0.75rem; }
.cs-rounded-2xl { border-radius: 1rem; }
.cs-rounded-full { border-radius: 9999px; }

/* Shadow */
.cs-shadow-none { box-shadow: none; }
.cs-shadow-sm { box-shadow: var(--cs-shadow-sm); }
.cs-shadow { box-shadow: var(--cs-shadow); }
.cs-shadow-lg { box-shadow: var(--cs-shadow-lg); }

/* Opacity */
.cs-opacity-0 { opacity: 0; }
.cs-opacity-25 { opacity: 0.25; }
.cs-opacity-50 { opacity: 0.5; }
.cs-opacity-75 { opacity: 0.75; }
.cs-opacity-100 { opacity: 1; }

/* Cursor */
.cs-cursor-auto { cursor: auto; }
.cs-cursor-default { cursor: default; }
.cs-cursor-pointer { cursor: pointer; }
.cs-cursor-wait { cursor: wait; }
.cs-cursor-move { cursor: move; }
.cs-cursor-not-allowed { cursor: not-allowed; }

/* User Select */
.cs-select-none { user-select: none; }
.cs-select-text { user-select: text; }
.cs-select-all { user-select: all; }
.cs-select-auto { user-select: auto; }

/* Visibility */
.cs-visible { visibility: visible; }
.cs-invisible { visibility: hidden; }

/* Backdrop Filter */
.cs-backdrop-blur { backdrop-filter: blur(8px); }
.cs-backdrop-blur-sm { backdrop-filter: blur(4px); }
.cs-backdrop-blur-lg { backdrop-filter: blur(16px); }
`;
  }

  private generateSpacingUtilities(): string {
    const utilities: string[] = [];
    const sizes = [0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 5];
    const properties = {
      p: 'padding',
      m: 'margin',
      pt: 'padding-top',
      pr: 'padding-right',
      pb: 'padding-bottom',
      pl: 'padding-left',
      px: ['padding-left', 'padding-right'],
      py: ['padding-top', 'padding-bottom'],
      mt: 'margin-top',
      mr: 'margin-right',
      mb: 'margin-bottom',
      ml: 'margin-left',
      mx: ['margin-left', 'margin-right'],
      my: ['margin-top', 'margin-bottom'],
    };

    Object.entries(properties).forEach(([prefix, property]) => {
      sizes.forEach(size => {
        const className = `.cs-${prefix}-${size}`;
        const value = `var(--cs-spacing-${size})`;

        if (Array.isArray(property)) {
          utilities.push(`${className} { ${property.map(p => `${p}: ${value}`).join('; ')}; }`);
        } else {
          utilities.push(`${className} { ${property}: ${value}; }`);
        }
      });
    });

    return utilities.join('\n');
  }

  private generateComponentStyles(_config: ThemeConfig, _palette: ColorPalette): string {
    const components: string[] = [];

    this.componentStyles.forEach((component, name) => {
      components.push(`/* ${name.charAt(0).toUpperCase() + name.slice(1)} Component */`);
      if (component?.['base']) {
        const baseStyle = component['base'];
        if (typeof baseStyle === 'string') {
          components.push(baseStyle);
        }
      }

      if (component?.['variants']) {
        Object.values(component['variants']).forEach(variant => {
          if (typeof variant === 'string') {
            components.push(variant);
          }
        });
      }

      if (component?.['sizes']) {
        Object.values(component['sizes']).forEach(size => {
          if (typeof size === 'string') {
            components.push(size);
          }
        });
      }
    });

    return components.join('\n\n');
  }

  private generateAnimations(animations?: AnimationConfig): string {
    const defaultAnimations = `
/* Animations */
@keyframes cs-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes cs-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes cs-slide-in-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes cs-slide-in-down {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes cs-slide-in-left {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes cs-slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes cs-scale-in {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes cs-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes cs-ping {
  75%, 100% {
    transform: scale(2);
    opacity: 0;
  }
}

@keyframes cs-pulse {
  50% { opacity: 0.5; }
}

@keyframes cs-bounce {
  0%, 100% {
    transform: translateY(-25%);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: none;
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
}

/* Animation Classes */
.cs-animate-fade-in { animation: cs-fade-in 0.5s ease-out; }
.cs-animate-fade-out { animation: cs-fade-out 0.5s ease-out; }
.cs-animate-slide-in-up { animation: cs-slide-in-up 0.5s ease-out; }
.cs-animate-slide-in-down { animation: cs-slide-in-down 0.5s ease-out; }
.cs-animate-slide-in-left { animation: cs-slide-in-left 0.5s ease-out; }
.cs-animate-slide-in-right { animation: cs-slide-in-right 0.5s ease-out; }
.cs-animate-scale-in { animation: cs-scale-in 0.3s ease-out; }
.cs-animate-spin { animation: cs-spin 1s linear infinite; }
.cs-animate-ping { animation: cs-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite; }
.cs-animate-pulse { animation: cs-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.cs-animate-bounce { animation: cs-bounce 1s infinite; }

/* Loading States */
.cs-loading {
  position: relative;
  pointer-events: none;
  opacity: 0.6;
}

.cs-loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  border: 2px solid var(--cs-primary);
  border-right-color: transparent;
  border-radius: 50%;
  animation: cs-spin 0.8s linear infinite;
}

/* Skeleton Loading */
.cs-skeleton {
  background: linear-gradient(
    90deg,
    var(--cs-bg-muted) 25%,
    var(--cs-bg-secondary) 50%,
    var(--cs-bg-muted) 75%
  );
  background-size: 200% 100%;
  animation: cs-skeleton-loading 1.5s ease-in-out infinite;
}

@keyframes cs-skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

    // Add custom animations if provided
    if (animations?.custom) {
      return defaultAnimations + '\n' + animations.custom;
    }

    return defaultAnimations;
  }

  private generateResponsiveStyles(breakpoints?: ResponsiveBreakpoints): string {
    const defaultBreakpoints = {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    };

    const points = breakpoints ?? defaultBreakpoints;
    const styles: string[] = [];

    Object.entries(points).forEach(([name, value]) => {
      styles.push(`
/* ${name.toUpperCase()} Breakpoint - ${value} */
@media (min-width: ${value}) {
  .cs-container {
    max-width: ${value};
  }
  
  /* Responsive Columns */
  .cs-${name}\\:col-auto { flex: 0 0 auto; width: auto; }
  .cs-${name}\\:col-1 { flex: 0 0 8.333333%; max-width: 8.333333%; }
  .cs-${name}\\:col-2 { flex: 0 0 16.666667%; max-width: 16.666667%; }
  .cs-${name}\\:col-3 { flex: 0 0 25%; max-width: 25%; }
  .cs-${name}\\:col-4 { flex: 0 0 33.333333%; max-width: 33.333333%; }
  .cs-${name}\\:col-5 { flex: 0 0 41.666667%; max-width: 41.666667%; }
  .cs-${name}\\:col-6 { flex: 0 0 50%; max-width: 50%; }
  .cs-${name}\\:col-7 { flex: 0 0 58.333333%; max-width: 58.333333%; }
  .cs-${name}\\:col-8 { flex: 0 0 66.666667%; max-width: 66.666667%; }
  .cs-${name}\\:col-9 { flex: 0 0 75%; max-width: 75%; }
  .cs-${name}\\:col-10 { flex: 0 0 83.333333%; max-width: 83.333333%; }
  .cs-${name}\\:col-11 { flex: 0 0 91.666667%; max-width: 91.666667%; }
  .cs-${name}\\:col-12 { flex: 0 0 100%; max-width: 100%; }
  
  /* Responsive Grid */
  .cs-${name}\\:grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
  .cs-${name}\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cs-${name}\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cs-${name}\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .cs-${name}\\:grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .cs-${name}\\:grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  
  /* Responsive Display */
  .cs-${name}\\:block { display: block; }
  .cs-${name}\\:inline-block { display: inline-block; }
  .cs-${name}\\:inline { display: inline; }
  .cs-${name}\\:flex { display: flex; }
  .cs-${name}\\:hidden { display: none; }
  
  /* Responsive Text */
  .cs-${name}\\:text-sm { font-size: 0.875rem; }
  .cs-${name}\\:text-base { font-size: 1rem; }
  .cs-${name}\\:text-lg { font-size: 1.125rem; }
  .cs-${name}\\:text-xl { font-size: 1.25rem; }
  .cs-${name}\\:text-2xl { font-size: 1.5rem; }
  .cs-${name}\\:text-3xl { font-size: 1.875rem; }
}
`);
    });

    return styles.join('\n');
  }

  private generatePrintStyles(_palette: ColorPalette): string {
    return `
/* Print Styles */
@media print {
  body {
    background: white;
    color: black;
  }
  
  .cs-report {
    background: white;
    color: black;
  }
  
  /* Hide non-printable elements */
  .cs-no-print,
  .cs-nav,
  .cs-sidebar,
  .cs-footer,
  .cs-button,
  .cs-animate-spin,
  .cs-loading {
    display: none !important;
  }
  
  /* Ensure proper page breaks */
  .cs-page-break {
    page-break-after: always;
  }
  
  .cs-no-break {
    page-break-inside: avoid;
  }
  
  /* Reset colors for print */
  * {
    color: black !important;
    background: white !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  
  /* Links */
  a {
    text-decoration: underline;
  }
  
  a[href^="http"]:after {
    content: " (" attr(href) ")";
    font-size: 0.875em;
  }
  
  /* Tables */
  table {
    border-collapse: collapse !important;
  }
  
  table, th, td {
    border: 1px solid black !important;
  }
  
  th {
    font-weight: bold;
    background-color: #f0f0f0 !important;
  }
  
  /* Images */
  img {
    max-width: 100% !important;
    page-break-inside: avoid;
  }
  
  /* Ensure charts are printable */
  .cs-chart-container {
    page-break-inside: avoid;
  }
  
  /* Headers and footers */
  @page {
    margin: 1cm;
    
    @top-center {
      content: "CS Test Automation Report";
      font-family: sans-serif;
      font-size: 10pt;
      color: #666;
    }
    
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-family: sans-serif;
      font-size: 10pt;
      color: #666;
    }
  }
}
`;
  }

  private combineCSS(sections: {
    base: string;
    components: string;
    animations: string;
    responsive: string;
    print: string;
  }): string {
    const header = `
/**
 * CS Test Automation Framework - Generated Theme
 * Generated: ${new Date().toISOString()}
 * Version: 1.0.0
 */
`;

    return [header, sections.base, sections.components, sections.animations, sections.responsive, sections.print].join(
      '\n\n',
    );
  }

  private minifyCSS(css: string): string {
    // Remove comments
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove unnecessary whitespace
    css = css.replace(/\s+/g, ' ');

    // Remove whitespace around selectors
    css = css.replace(/\s*([{}:;,])\s*/g, '$1');

    // Remove trailing semicolons
    css = css.replace(/;}/g, '}');

    // Remove quotes from font names
    css = css.replace(/"([^"]+)"/g, (match: string, p1: string): string => {
      if (p1.includes(' ')) return match;
      return p1;
    });

    // Remove units from zero values
    css = css.replace(/:\s*0(px|em|rem|%)/g, ':0');

    // Shorten hex colors
    css = css.replace(/#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3/g, '#$1$2$3');

    return css.trim();
  }

  private async saveTheme(theme: ThemeOutput): Promise<void> {
    const themePath = path.join(this.themePath, theme.id);
    await FileUtils.ensureDir(themePath);

    // Save CSS file
    const cssPath = path.join(themePath, `${theme.id}.css`);
    await fs.promises.writeFile(cssPath, theme.css, 'utf-8');

    // Save minified version
    const minPath = path.join(themePath, `${theme.id}.min.css`);
    const minified = this.minifyCSS(theme.css);
    await fs.promises.writeFile(minPath, minified, 'utf-8');

    // Save theme metadata
    const metaPath = path.join(themePath, 'theme.json');
    await fs.promises.writeFile(
      metaPath,
      JSON.stringify(
        {
          id: theme.id,
          name: theme.name,
          colorPalette: theme.colorPalette,
          fonts: theme.fonts,
          metadata: theme.metadata,
          files: {
            css: `${theme.id}.css`,
            minified: `${theme.id}.min.css`,
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    // Generate color palette preview
    if (theme.colorPalette) {
      const previewPath = path.join(themePath, 'palette.html');
      const preview = this.generatePalettePreview(theme.colorPalette);
      await fs.promises.writeFile(previewPath, preview, 'utf-8');
    }

    Logger.getInstance('ThemeBuilder').info('Theme saved', {
      themeId: theme.id,
      path: themePath,
      cssSize: `${(theme.css.length / 1024).toFixed(2)} KB`,
      minSize: `${(minified.length / 1024).toFixed(2)} KB`,
    });
  }

  private generatePalettePreview(palette: ColorPalette): string {
    const colorGroups = {
      Primary: ['primary', 'primaryLight', 'primaryDark'],
      Secondary: ['secondary', 'secondaryLight', 'secondaryDark'],
      Status: ['success', 'error', 'warning', 'info'],
      Grays: ['gray100', 'gray200', 'gray300', 'gray400', 'gray500', 'gray600', 'gray700', 'gray800', 'gray900'],
      Backgrounds: ['bgPrimary', 'bgSecondary', 'bgTertiary', 'bgCard', 'bgMuted'],
      Text: ['textPrimary', 'textSecondary', 'textMuted', 'textHeading', 'textBody'],
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Theme Color Palette</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 2rem;
      background: #f5f5f5;
      margin: 0;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      margin: 0 0 2rem 0;
      color: #333;
    }
    .color-group {
      margin-bottom: 2rem;
    }
    .color-group h2 {
      font-size: 1.25rem;
      margin: 0 0 1rem 0;
      color: #666;
    }
    .color-swatches {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 1rem;
    }
    .color-swatch {
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .color-preview {
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 500;
      text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    .color-info {
      padding: 0.75rem;
      background: white;
      border-top: 1px solid #eee;
    }
    .color-name {
      font-weight: 500;
      font-size: 0.875rem;
      margin-bottom: 0.25rem;
    }
    .color-value {
      font-family: monospace;
      font-size: 0.75rem;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Theme Color Palette</h1>
    ${Object.entries(colorGroups)
      .map(
        ([groupName, colors]) => `
      <div class="color-group">
        <h2>${groupName}</h2>
        <div class="color-swatches">
          ${colors
            .filter(name => palette[name as keyof ColorPalette])
            .map(name => {
              const value = palette[name as keyof ColorPalette];
              if (!value || typeof value !== 'string') return '';
              const isLight = this.isLightColor(value);
              return `
              <div class="color-swatch">
                <div class="color-preview" style="background-color: ${value}; color: ${isLight ? '#000' : '#fff'}">
                  ${isLight ? 'Aa' : 'Aa'}
                </div>
                <div class="color-info">
                  <div class="color-name">${this.camelToTitle(name)}</div>
                  <div class="color-value">${value}</div>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    `,
      )
      .join('')}
  </div>
</body>
</html>
`;
  }

  private isLightColor(color: string): boolean {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.5;
  }

  private camelToKebab(str: string): string {
    return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
  }

  private camelToTitle(str: string): string {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private generateThemeId(name: string): string {
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(`${name}-${timestamp}`).digest('hex').substring(0, 8);

    return `theme-${this.camelToKebab(name)}-${hash}`;
  }

  private generateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async getTheme(themeId: string): Promise<ThemeOutput | null> {
    // Check cache first
    if (this.generatedThemes.has(themeId)) {
      return this.generatedThemes.get(themeId)!;
    }

    // Try to load from disk
    const themePath = path.join(this.themePath, themeId);
    const metaPath = path.join(themePath, 'theme.json');

    if (await FileUtils.exists(metaPath)) {
      const metadata = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8')) as {
        id: string;
        name: string;
        colorPalette: ColorPalette;
        fonts?: FontConfig;
        icons?: IconSet;
        metadata: {
          created: string;
          version: string;
          checksum: string;
        };
        files: {
          css: string;
          minified: string;
        };
      };
      const cssPath = path.join(themePath, metadata.files.css);
      const css = await fs.promises.readFile(cssPath, 'utf-8');

      const theme: ThemeOutput = {
        id: metadata.id,
        name: metadata.name,
        css,
        colorPalette: metadata.colorPalette,
        ...(metadata.fonts && { fonts: metadata.fonts }),
        ...(metadata.icons && { icons: metadata.icons }),
        metadata: metadata.metadata,
      };

      // Cache it
      this.generatedThemes.set(themeId, theme);

      return theme;
    }

    return null;
  }

  async listThemes(): Promise<Array<{ id: string; name: string; created: string }>> {
    const themes: Array<{ id: string; name: string; created: string }> = [];

    if (await FileUtils.exists(this.themePath)) {
      const dirs = await fs.promises.readdir(this.themePath);

      for (const dir of dirs) {
        const metaPath = path.join(this.themePath, dir, 'theme.json');
        if (await FileUtils.exists(metaPath)) {
          const metadata = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8')) as {
            id: string;
            name: string;
            metadata: {
              created: string;
            };
          };
          themes.push({
            id: metadata.id,
            name: metadata.name,
            created: metadata.metadata.created,
          });
        }
      }
    }

    return themes;
  }
}

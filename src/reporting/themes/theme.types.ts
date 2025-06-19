/**
 * Theme Types
 * Shared type definitions for the theme system
 */

export interface ThemeConfig {
  id?: string;
  name: string;
  preset?: ThemePreset;
  palette?: ColorPalette;
  fonts?: FontConfig;
  animations?: AnimationConfig;
  responsive?: ResponsiveBreakpoints;
  breakpoints?: ResponsiveBreakpoints;
  customCSS?: string;
  components?: ComponentStyles;
  customColors?: Partial<ColorPalette>;
  minify?: boolean;
  icons?: IconSet;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  tertiary?: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  shadow: string;
  [key: string]: string | undefined;
}

export type ThemePreset =
  | 'default'
  | 'dark'
  | 'corporate'
  | 'minimal'
  | 'vibrant'
  | 'custom'
  | 'cs-brand'
  | 'light'
  | 'high-contrast'
  | 'print';

export interface ComponentStyle {
  base?: string | Record<string, unknown>;
  variants?: Record<string, string | Record<string, unknown>>;
  sizes?: Record<string, string | Record<string, unknown>>;
}

export interface ComponentStyles {
  header?: ComponentStyle;
  sidebar?: ComponentStyle;
  card?: ComponentStyle;
  table?: ComponentStyle;
  chart?: ComponentStyle;
  button?: ComponentStyle;
  badge?: ComponentStyle;
  tooltip?: ComponentStyle;
  modal?: ComponentStyle;
  nav?: ComponentStyle;
  alert?: ComponentStyle;
  progress?: ComponentStyle;
  [key: string]: ComponentStyle | undefined;
}

export interface AnimationConfig {
  enabled?: boolean;
  duration?: number | string;
  easing?: string;
  transitions?: Record<string, string>;
  custom?: string;
}

export interface ResponsiveBreakpoints {
  mobile?: number | string;
  tablet?: number | string;
  desktop?: number | string;
  wide?: number | string;
  sm?: string;
  md?: string;
  lg?: string;
  xl?: string;
  '2xl'?: string;
  [key: string]: number | string | undefined;
}

export interface ThemeOutput {
  id: string;
  name: string;
  css: string;
  variables?: Record<string, string>;
  components?: Record<string, string>;
  responsive?: Record<string, string>;
  timestamp?: Date;
  hash?: string;
  colorPalette?: ColorPalette;
  fonts?: FontConfig;
  icons?: IconSet;
  metadata?: {
    created: string;
    version: string;
    checksum: string;
  };
}

export interface CSSVariable {
  name: string;
  value: string;
  fallback?: string;
  scope?: string;
  category?: string;
  description?: string;
}

export interface FontConfig {
  primary?: string;
  secondary?: string;
  monospace?: string;
  base?: string;
  heading?: string;
  mono?: string;
  sizes?: {
    xs?: string;
    sm?: string;
    base?: string;
    lg?: string;
    xl?: string;
    xxl?: string;
  };
  weights?: {
    light?: number;
    regular?: number;
    medium?: number;
    semibold?: number;
    bold?: number;
  };
  lineHeights?: {
    tight?: number;
    normal?: number;
    relaxed?: number;
  };
}

export interface IconSet {
  success: string;
  error: string;
  warning: string;
  info: string;
  [key: string]: string;
}

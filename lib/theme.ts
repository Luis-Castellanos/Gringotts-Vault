export type Theme = 'light' | 'dark';
export type Scheme = 'default' | 'monarch' | 'fidelity' | 'vanguard';
export type RailColor = 'blue' | 'indigo' | 'slate' | 'emerald' | 'burgundy';

export const THEME_STORAGE_KEY = 'vault:theme';
export const SCHEME_STORAGE_KEY = 'vault:scheme';
export const RAIL_STORAGE_KEY = 'vault:rail';
export const DEFAULT_THEME: Theme = 'dark';
export const DEFAULT_SCHEME: Scheme = 'default';
export const DEFAULT_RAIL: RailColor = 'blue';

// Color schemes override the accent token family (everything accent-tinted —
// active nav, primary buttons, highlights — picks these up). Light/dark surfaces
// are unchanged; a scheme is layered on top via data-scheme on <html>. The
// default scheme follows the Chase-inspired blue cleanup direction.
export const SCHEMES: { id: Scheme; label: string; swatch: string }[] = [
  { id: 'default', label: 'Vault', swatch: '#5aa9ff' },
  { id: 'monarch', label: 'Monarch', swatch: '#15a87a' },
  { id: 'fidelity', label: 'Fidelity', swatch: '#3f8f2e' },
  { id: 'vanguard', label: 'Vanguard', swatch: '#a01722' },
];

export const RAIL_COLORS: { id: RailColor; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Chase Blue', swatch: '#1f55d6' },
  { id: 'indigo', label: 'Indigo', swatch: '#4f46e5' },
  { id: 'slate', label: 'Slate', swatch: '#334155' },
  { id: 'emerald', label: 'Emerald', swatch: '#047857' },
  { id: 'burgundy', label: 'Burgundy', swatch: '#8f1d2c' },
];

// Inline script that runs before first paint to set data-theme + data-scheme on
// <html>, avoiding a flash of the wrong theme/scheme/rail on load.
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME}';document.documentElement.setAttribute('data-theme',t);var s=localStorage.getItem('${SCHEME_STORAGE_KEY}')||'${DEFAULT_SCHEME}';document.documentElement.setAttribute('data-scheme',s);var r=localStorage.getItem('${RAIL_STORAGE_KEY}')||'${DEFAULT_RAIL}';document.documentElement.setAttribute('data-rail',r);}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');document.documentElement.setAttribute('data-scheme','${DEFAULT_SCHEME}');document.documentElement.setAttribute('data-rail','${DEFAULT_RAIL}');}})();`;

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'vault:theme';
export const DEFAULT_THEME: Theme = 'dark';

// Inline script that runs before first paint to set data-theme on <html>.
// Avoids a flash of the wrong theme when the user has previously chosen light.
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME}';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');}})();`;

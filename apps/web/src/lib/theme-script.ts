// Server-safe (no React import): used by the root layout's <head>.

export const THEME_STORAGE_KEY = "theme";

/**
 * Inline <head> script: sets <html data-theme> before the first paint (no flash).
 * Stored choice, else the OS setting. Must stay equivalent to `resolveTheme()` in theme.ts.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

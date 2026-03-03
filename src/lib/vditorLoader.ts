type VditorInstance = {
  setValue: (value: string) => void;
  setTheme: (theme: string) => void;
  destroy: () => void;
};

type VditorConstructor = new (element: HTMLElement, options: Record<string, unknown>) => VditorInstance;

declare global {
  interface Window {
    Vditor?: VditorConstructor;
  }
}

const VDITOR_CSS_URL = 'https://unpkg.com/vditor/dist/index.css';
const VDITOR_JS_URL = 'https://unpkg.com/vditor/dist/index.min.js';
const VDITOR_CSS_ID = 'vditor-css-resource';
const VDITOR_SCRIPT_ID = 'vditor-js-resource';

let vditorLoadPromise: Promise<VditorConstructor> | null = null;

const ensureStylesheet = () => new Promise<void>((resolve, reject) => {
  if (document.getElementById(VDITOR_CSS_ID)) {
    resolve();
    return;
  }

  const link = document.createElement('link');
  link.id = VDITOR_CSS_ID;
  link.rel = 'stylesheet';
  link.href = VDITOR_CSS_URL;
  link.onload = () => resolve();
  link.onerror = () => reject(new Error('Failed to load Vditor stylesheet.'));
  document.head.appendChild(link);
});

const ensureScript = () => new Promise<void>((resolve, reject) => {
  if (window.Vditor) {
    resolve();
    return;
  }

  const existingScript = document.getElementById(VDITOR_SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    existingScript.addEventListener('load', () => resolve(), { once: true });
    existingScript.addEventListener('error', () => reject(new Error('Failed to load Vditor script.')), { once: true });
    return;
  }

  const script = document.createElement('script');
  script.id = VDITOR_SCRIPT_ID;
  script.src = VDITOR_JS_URL;
  script.async = true;
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Failed to load Vditor script.'));
  document.body.appendChild(script);
});

export const loadVditor = async (): Promise<VditorConstructor> => {
  if (typeof window === 'undefined') {
    throw new Error('Vditor can only be loaded in browser environments.');
  }

  if (window.Vditor) {
    await ensureStylesheet();
    return window.Vditor;
  }

  if (!vditorLoadPromise) {
    vditorLoadPromise = (async () => {
      await ensureStylesheet();
      await ensureScript();

      if (!window.Vditor) {
        throw new Error('Vditor script loaded but constructor is unavailable.');
      }

      return window.Vditor;
    })();
  }

  return vditorLoadPromise;
};

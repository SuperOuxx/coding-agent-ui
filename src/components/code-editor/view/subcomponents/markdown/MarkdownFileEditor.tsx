import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../../../../contexts/ThemeContext';
import { loadVditor } from '../../../../../lib/vditorLoader';

type ThemeContextValue = {
  isDarkMode: boolean;
};

type MarkdownFileEditorProps = {
  content: string;
  onChange: (value: string) => void;
};

const vditorThemeStyle = `
.vditor-theme-shell-dark .vditor-toolbar {
  background-color: #111827 !important;
  border-color: #1f2937 !important;
}

.vditor-theme-shell-dark .vditor-toolbar__item,
.vditor-theme-shell-dark .vditor-toolbar svg {
  color: #e5e7eb !important;
}

.vditor-theme-shell-dark .vditor-content,
.vditor-theme-shell-dark .vditor-ir,
.vditor-theme-shell-dark .vditor-reset {
  background-color: #111827 !important;
  color: #e5e7eb !important;
}

.vditor-theme-shell-dark .vditor-reset h1,
.vditor-theme-shell-dark .vditor-reset h2,
.vditor-theme-shell-dark .vditor-reset h3,
.vditor-theme-shell-dark .vditor-reset h4,
.vditor-theme-shell-dark .vditor-reset h5,
.vditor-theme-shell-dark .vditor-reset h6 {
  color: #f9fafb !important;
}

.vditor-theme-shell-dark .vditor-reset table,
.vditor-theme-shell-dark .vditor-ir table,
.vditor-theme-shell-dark .vditor-content table,
.vditor-theme-shell-dark .vditor-reset th,
.vditor-theme-shell-dark .vditor-reset td {
  border-color: #374151 !important;
  background-color: #111827 !important;
  color: #e5e7eb !important;
}

.vditor-theme-shell-dark .vditor-reset thead,
.vditor-theme-shell-dark .vditor-reset tbody,
.vditor-theme-shell-dark .vditor-reset tr,
.vditor-theme-shell-dark .vditor-ir thead,
.vditor-theme-shell-dark .vditor-ir tbody,
.vditor-theme-shell-dark .vditor-ir tr,
.vditor-theme-shell-dark .vditor-content thead,
.vditor-theme-shell-dark .vditor-content tbody,
.vditor-theme-shell-dark .vditor-content tr {
  background-color: #111827 !important;
}

.vditor-theme-shell-dark .vditor-reset tr:nth-child(2n),
.vditor-theme-shell-dark .vditor-ir tr:nth-child(2n),
.vditor-theme-shell-dark .vditor-content tr:nth-child(2n) {
  background-color: #0f172a !important;
}

.vditor-theme-shell-dark .vditor-reset tr:nth-child(2n) td,
.vditor-theme-shell-dark .vditor-reset tr:nth-child(2n) th,
.vditor-theme-shell-dark .vditor-ir tr:nth-child(2n) td,
.vditor-theme-shell-dark .vditor-ir tr:nth-child(2n) th,
.vditor-theme-shell-dark .vditor-content tr:nth-child(2n) td,
.vditor-theme-shell-dark .vditor-content tr:nth-child(2n) th {
  background-color: #0f172a !important;
  color: #e5e7eb !important;
}

.vditor-theme-shell-dark .vditor-reset th {
  background-color: #1f2937 !important;
  color: #f9fafb !important;
}

.vditor-theme-shell-dark .vditor-reset pre,
.vditor-theme-shell-dark .vditor-reset code {
  background-color: #0b1220 !important;
  color: #e5e7eb !important;
}
`;

export default function MarkdownFileEditor({ content, onChange }: MarkdownFileEditorProps) {
  const { isDarkMode } = useTheme() as ThemeContextValue;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const vditorRef = useRef<any>(null);
  const externalSyncRef = useRef(false);
  const lastValueRef = useRef(content);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initializeVditor = async () => {
      if (!containerRef.current) {
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const Vditor = await loadVditor();
        if (cancelled || !containerRef.current) {
          return;
        }

        const instance = new Vditor(containerRef.current, {
          width: '100%',
          height: '100%',
          mode: 'ir',
          theme: isDarkMode ? 'dark' : 'classic',
          value: content,
          cache: {
            enable: false,
          },
          input: (value: string) => {
            if (externalSyncRef.current) {
              return;
            }

            lastValueRef.current = value;
            onChange(value);
          },
          after: () => {
            if (!cancelled) {
              setIsLoading(false);
            }
          },
        });

        vditorRef.current = instance;
        lastValueRef.current = content;
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setIsLoading(false);
        }
      }
    };

    void initializeVditor();

    return () => {
      cancelled = true;
      if (vditorRef.current) {
        vditorRef.current.destroy();
        vditorRef.current = null;
      }
    };
  }, [onChange]);

  useEffect(() => {
    const instance = vditorRef.current;
    if (!instance || content === lastValueRef.current) {
      return;
    }

    externalSyncRef.current = true;
    instance.setValue(content);
    lastValueRef.current = content;
    externalSyncRef.current = false;
  }, [content]);

  useEffect(() => {
    const instance = vditorRef.current;
    if (!instance) {
      return;
    }

    instance.setTheme(isDarkMode ? 'dark' : 'classic');
  }, [isDarkMode]);

  if (errorMessage) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-red-700 dark:text-red-300">
        Failed to initialize Vditor: {errorMessage}
      </div>
    );
  }

  return (
    <div className={`relative h-full ${isDarkMode ? 'vditor-theme-shell-dark' : 'vditor-theme-shell-light'}`}>
      <style>{vditorThemeStyle}</style>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
          Loading Vditor...
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

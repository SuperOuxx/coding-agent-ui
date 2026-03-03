import { Check, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedFetch } from '../../../../../utils/api';
import { Button } from '../../../../ui/button';
import { Input } from '../../../../ui/input';

type SettingsConfigResponse = {
  success?: boolean;
  error?: string;
  config?: {
    workspacesRoot?: string | null;
    resolvedWorkspacesRoot?: string;
  };
};

async function getResponseError(response: Response) {
  try {
    const data = await response.json() as SettingsConfigResponse;
    return data.error || 'Request failed';
  } catch {
    return 'Request failed';
  }
}

function getConfigValues(data: SettingsConfigResponse) {
  return {
    workspacesRoot: data.config?.workspacesRoot || '',
    resolvedWorkspacesRoot: data.config?.resolvedWorkspacesRoot || '',
  };
}

function getMessageFromError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

export default function WorkspaceSettingsTab() {
  const { t } = useTranslation('settings');
  const [workspacesRoot, setWorkspacesRoot] = useState('');
  const [resolvedWorkspacesRoot, setResolvedWorkspacesRoot] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const applyConfigValues = useCallback((data: SettingsConfigResponse) => {
    const configValues = getConfigValues(data);
    setWorkspacesRoot(configValues.workspacesRoot);
    setResolvedWorkspacesRoot(configValues.resolvedWorkspacesRoot);
  }, []);

  const loadServerConfig = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await authenticatedFetch('/api/settings/config');
      if (!response.ok) {
        throw new Error(await getResponseError(response));
      }

      const data = await response.json() as SettingsConfigResponse;
      applyConfigValues(data);
    } catch (error) {
      setErrorMessage(getMessageFromError(error, 'Failed to load settings'));
      setSaveStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [applyConfigValues]);

  const saveWorkspacesRoot = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus(null);
    setErrorMessage('');

    try {
      const response = await authenticatedFetch('/api/settings/config', {
        method: 'POST',
        body: JSON.stringify({
          workspacesRoot,
        }),
      });

      if (!response.ok) {
        throw new Error(await getResponseError(response));
      }

      const data = await response.json() as SettingsConfigResponse;
      applyConfigValues(data);
      setSaveStatus('success');
    } catch (error) {
      setErrorMessage(getMessageFromError(error, 'Failed to save settings'));
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [applyConfigValues, workspacesRoot]);

  useEffect(() => {
    void loadServerConfig();
  }, [loadServerConfig]);

  const isBusy = isLoading || isSaving;
  let displayErrorMessage = errorMessage;
  if (saveStatus === 'error') {
    displayErrorMessage = t('workspaceSettings.status.error', { message: errorMessage });
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="h-5 w-5" />
          <h3 className="text-lg font-semibold">{t('workspaceSettings.title')}</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">{t('workspaceSettings.description')}</p>

        <div className="p-4 border rounded-lg bg-card space-y-4">
          <div>
            <label htmlFor="settings-workspaces-root" className="block text-sm font-medium text-foreground mb-2">
              {t('workspaceSettings.inputLabel')}
            </label>
            <Input
              id="settings-workspaces-root"
              type="text"
              value={workspacesRoot}
              onChange={(event) => setWorkspacesRoot(event.target.value)}
              placeholder={t('workspaceSettings.rootPlaceholder')}
              disabled={isBusy}
              className="w-full"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('workspaceSettings.inputHelp')}</p>
          </div>

          <div>
            <div className="block text-sm font-medium text-foreground mb-2">
              {t('workspaceSettings.resolvedLabel')}
            </div>
            <code className="block text-xs p-2 rounded bg-muted border border-border break-all">
              {resolvedWorkspacesRoot || '-'}
            </code>
            <p className="mt-1 text-xs text-muted-foreground">{t('workspaceSettings.resolvedHelp')}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={saveWorkspacesRoot} disabled={isBusy}>
              {isSaving ? t('workspaceSettings.actions.saving') : t('workspaceSettings.actions.save')}
            </Button>

            {saveStatus === 'success' && (
              <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                <Check className="w-4 h-4" />
                {t('workspaceSettings.status.success')}
              </div>
            )}
          </div>

          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {displayErrorMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

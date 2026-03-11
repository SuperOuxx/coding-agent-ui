import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

const AUTH_TOKEN_STORAGE_KEY = 'auth-token';
const E2E_USERNAME = 'playwright_user';
const E2E_PASSWORD = 'playwright_pass_123';
const CONNECTION_LOST_MESSAGE =
  'Connection lost before request was sent. Please wait for reconnect and retry.';
const WORKSPACES_ROOT = path.resolve(process.cwd(), 'tmp', 'e2e', 'workspaces');

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureAuthenticatedToken(request: APIRequestContext): Promise<string> {
  const authStatusResponse = await request.get('/api/auth/status');
  expect(authStatusResponse.ok()).toBeTruthy();
  const authStatus = await authStatusResponse.json();

  let sessionResponse;
  if (authStatus?.needsSetup) {
    sessionResponse = await request.post('/api/auth/register', {
      data: {
        username: E2E_USERNAME,
        password: E2E_PASSWORD,
      },
    });
  } else {
    sessionResponse = await request.post('/api/auth/login', {
      data: {
        username: E2E_USERNAME,
        password: E2E_PASSWORD,
      },
    });
  }

  expect(sessionResponse.ok()).toBeTruthy();
  const sessionPayload = await sessionResponse.json();
  const token = sessionPayload?.token as string | undefined;
  expect(token).toBeTruthy();

  const completeOnboardingResponse = await request.post('/api/user/complete-onboarding', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(completeOnboardingResponse.ok()).toBeTruthy();

  return token!;
}

type ListedProject = {
  name: string;
};

async function clearProjects(request: APIRequestContext, token: string): Promise<void> {
  const projectsResponse = await request.get('/api/projects', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(projectsResponse.ok()).toBeTruthy();

  const projects = (await projectsResponse.json()) as ListedProject[];
  for (const project of projects) {
    const deleteResponse = await request.delete(
      `/api/projects/${encodeURIComponent(project.name)}?force=true`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    expect(deleteResponse.ok()).toBeTruthy();
  }
}

async function ensureWorkspace(
  request: APIRequestContext,
  token: string,
  testInfo: TestInfo,
): Promise<string> {
  const entropy = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const workspaceName = `pw-${slugify(testInfo.title)}-${testInfo.retry}-${entropy}`;
  const workspacePath = path.join(WORKSPACES_ROOT, workspaceName);
  await fs.mkdir(workspacePath, { recursive: true });

  const response = await request.post('/api/projects/create', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      path: workspacePath,
    },
  });

  if (!response.ok()) {
    const errorText = await response.text();
    if (errorText.includes('already configured')) {
      return workspacePath;
    }
    throw new Error(`Failed to create workspace: ${response.status()} ${errorText}`);
  }
  return workspacePath;
}

async function bootstrapSession(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
): Promise<string> {
  const token = await ensureAuthenticatedToken(request);
  await clearProjects(request, token);
  const workspacePath = await ensureWorkspace(request, token, testInfo);

  await page.addInitScript(
    ({ storageKey, storageToken }) => {
      localStorage.setItem(storageKey, storageToken);
    },
    { storageKey: AUTH_TOKEN_STORAGE_KEY, storageToken: token },
  );

  await page.addInitScript(({ selectedProvider }) => {
    localStorage.setItem('selected-provider', selectedProvider);
  }, { selectedProvider: 'claude' });
  return workspacePath;
}

async function openReadyChat(page: Page, workspacePath: string): Promise<void> {
  const workspaceName = path.basename(workspacePath);
  await page.goto('/');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const agentationOverlay = buttons.find((button) =>
      (button.textContent || '').includes('/agentation'),
    );
    if (agentationOverlay instanceof HTMLElement) {
      agentationOverlay.style.pointerEvents = 'none';
      agentationOverlay.style.opacity = '0';
    }
  });

  const chooseProjectHeading = page.getByRole('heading', { name: 'Choose Your Project' });
  if (await chooseProjectHeading.isVisible().catch(() => false)) {
    const projectButton = page
      .getByRole('button', { name: new RegExp(escapeRegExp(workspaceName), 'i') })
      .first();
    await expect(projectButton).toBeVisible();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await projectButton.click({ force: true });
      await page.waitForTimeout(300);
      if (!(await chooseProjectHeading.isVisible().catch(() => false))) {
        break;
      }
    }
  }

  await expect(chooseProjectHeading).toBeHidden();
  await expect(page.locator('textarea:visible').first()).toBeVisible();
}

test.describe('Chat resilience e2e', () => {
  test('offline websocket path shows connection-lost error after submit', async ({
    page,
    request,
  }, testInfo) => {
    const workspacePath = await bootstrapSession(page, request, testInfo);

    await page.addInitScript(() => {
      class ClosedWebSocket extends EventTarget {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        url;
        readyState = ClosedWebSocket.CONNECTING;
        onopen = null;
        onmessage = null;
        onerror = null;
        onclose = null;
        bufferedAmount = 0;
        extensions = '';
        protocol = '';
        binaryType = 'blob';

        constructor(url: string) {
          super();
          this.url = url;
          this.readyState = ClosedWebSocket.CLOSED;
          queueMicrotask(() => {
            const closeEvent = new CloseEvent('close');
            this.dispatchEvent(closeEvent);
            this.onclose?.(closeEvent);
          });
        }

        send() {
          throw new DOMException(
            'WebSocket is already in CLOSING or CLOSED state.',
            'InvalidStateError',
          );
        }

        close() {
          this.readyState = ClosedWebSocket.CLOSED;
          const closeEvent = new CloseEvent('close');
          this.dispatchEvent(closeEvent);
          this.onclose?.(closeEvent);
        }
      }

      // @ts-expect-error override for e2e fault injection
      window.WebSocket = ClosedWebSocket;
    });

    await openReadyChat(page, workspacePath);

    const input = page.locator('textarea:visible').first();
    await input.fill('playwright offline message');
    await input.press('Enter');

    await expect(page.getByText(CONNECTION_LOST_MESSAGE)).toBeVisible();
  });

  test('online websocket path does not hit client-side connection-lost branch', async ({
    page,
    request,
  }, testInfo) => {
    const workspacePath = await bootstrapSession(page, request, testInfo);
    await openReadyChat(page, workspacePath);

    const input = page.locator('textarea:visible').first();
    await input.fill('playwright online message');
    await input.press('Enter');

    await expect(page.getByText('playwright online message')).toBeVisible();
    await expect(page.getByText(CONNECTION_LOST_MESSAGE)).toHaveCount(0);
  });
});

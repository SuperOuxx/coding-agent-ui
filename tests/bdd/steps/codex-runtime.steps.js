import assert from 'node:assert/strict';
import { After, Before, Given, Then, When } from '@cucumber/cucumber';
import { Codex } from '@openai/codex-sdk';
import {
  abortCodexSession,
  isCodexSessionActive,
  queryCodex,
} from '../../../server/openai-codex.js';

function createAbortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

function createVirtualClock() {
  let now = 0;
  let nextTimerId = 1;
  const intervals = new Map();

  const originalDateNow = Date.now;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  Date.now = () => now;
  globalThis.setInterval = (callback, intervalMs, ...args) => {
    const timerId = nextTimerId;
    nextTimerId += 1;
    intervals.set(timerId, {
      callback,
      intervalMs,
      nextRunAt: now + intervalMs,
      args,
    });
    return timerId;
  };
  globalThis.clearInterval = (timerId) => {
    intervals.delete(timerId);
  };

  function advance(milliseconds) {
    const target = now + milliseconds;

    while (true) {
      let selectedId = null;
      let selectedTimer = null;

      for (const [timerId, timer] of intervals.entries()) {
        if (timer.nextRunAt > target) {
          continue;
        }
        if (!selectedTimer || timer.nextRunAt < selectedTimer.nextRunAt) {
          selectedId = timerId;
          selectedTimer = timer;
        }
      }

      if (!selectedTimer || selectedId === null) {
        break;
      }

      now = selectedTimer.nextRunAt;
      selectedTimer.callback(...selectedTimer.args);

      const activeTimer = intervals.get(selectedId);
      if (activeTimer) {
        activeTimer.nextRunAt = now + activeTimer.intervalMs;
      }
    }

    now = target;
  }

  function restore() {
    Date.now = originalDateNow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }

  return { advance, restore };
}

function installCodexThreadStub(world, threadFactory) {
  if (!world.originalCodexMethods) {
    world.originalCodexMethods = {
      startThread: Codex.prototype.startThread,
      resumeThread: Codex.prototype.resumeThread,
    };
  }

  Codex.prototype.startThread = function startThreadStub(options) {
    return threadFactory({ sessionId: `generated-${Date.now()}`, options, resume: false });
  };

  Codex.prototype.resumeThread = function resumeThreadStub(sessionId, options) {
    return threadFactory({ sessionId, options, resume: true });
  };
}

function restoreCodexThreadStub(world) {
  if (!world.originalCodexMethods) {
    return;
  }

  Codex.prototype.startThread = world.originalCodexMethods.startThread;
  Codex.prototype.resumeThread = world.originalCodexMethods.resumeThread;
}

Before({ tags: '@codex' }, function () {
  this.messages = [];
  this.queryPromise = null;
  this.lastErrorMessage = null;

  this.writer = {
    isWebSocketWriter: true,
    send: (message) => {
      this.messages.push(message);
    },
  };
});

After({ tags: '@codex' }, async function () {
  if (this.queryPromise) {
    try {
      await this.queryPromise;
    } catch {
      // The scenarios assert message behavior; swallow here to keep cleanup deterministic.
    }
  }

  for (const restoreFn of this.restoreFns ?? []) {
    restoreFn();
  }
  this.restoreFns = [];

  if (this.clock) {
    this.clock.restore();
    this.clock = null;
  }

  restoreCodexThreadStub(this);
});

Given('CODEX_STREAM_IDLE_TIMEOUT_MS is {string}', function (value) {
  const originalValue = process.env.CODEX_STREAM_IDLE_TIMEOUT_MS;
  process.env.CODEX_STREAM_IDLE_TIMEOUT_MS = value;
  this.restoreFns.push(() => {
    if (originalValue === undefined) {
      delete process.env.CODEX_STREAM_IDLE_TIMEOUT_MS;
      return;
    }
    process.env.CODEX_STREAM_IDLE_TIMEOUT_MS = originalValue;
  });
});

Given('codex stream never emits events', function () {
  installCodexThreadStub(this, ({ sessionId }) => ({
    id: sessionId,
    async runStreamed(_command, { signal }) {
      return {
        events: (async function* neverEndingEvents() {
          await new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                reject(createAbortError());
              },
              { once: true },
            );
          });
        })(),
      };
    },
  }));
});

Given('codex stream emits a completed turn event', function () {
  installCodexThreadStub(this, ({ sessionId }) => ({
    id: sessionId,
    async runStreamed() {
      return {
        events: (async function* completedTurnEvents() {
          yield {
            type: 'turn.completed',
            usage: {
              input_tokens: 120,
              output_tokens: 30,
            },
          };
        })(),
      };
    },
  }));
});

When('I start a codex query for session {string}', async function (sessionId) {
  this.sessionId = sessionId;
  this.clock = createVirtualClock();
  this.restoreFns.push(() => this.clock?.restore());

  this.queryPromise = queryCodex(
    'hello from bdd',
    {
      sessionId,
      cwd: process.cwd(),
      projectPath: process.cwd(),
      model: 'gpt-5-codex',
      permissionMode: 'default',
    },
    this.writer,
  ).catch((error) => {
    this.lastErrorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  });

  await Promise.resolve();
});

When('I advance test clock by {int} milliseconds', async function (milliseconds) {
  assert.ok(this.clock, 'Virtual clock is not initialized');
  this.clock.advance(milliseconds);
  await Promise.resolve();
});

When('I abort codex session {string}', function (sessionId) {
  const aborted = abortCodexSession(sessionId);
  assert.equal(aborted, true, `Expected abortCodexSession(${sessionId}) to return true`);
});

Then('codex query should finish', async function () {
  assert.ok(this.queryPromise, 'Query promise is not initialized');
  await this.queryPromise;
});

Then('message type {string} should be emitted', function (messageType) {
  const found = this.messages.some((message) => message?.type === messageType);
  assert.equal(found, true, `Expected message type "${messageType}" to be emitted`);
});

Then('message type {string} should not be emitted', function (messageType) {
  const found = this.messages.some((message) => message?.type === messageType);
  assert.equal(found, false, `Expected message type "${messageType}" to not be emitted`);
});

Then('emitted codex error should be {string}', function (expectedError) {
  const errorMessage = this.messages.find((message) => message?.type === 'codex-error');
  assert.ok(errorMessage, 'Expected codex-error message to exist');
  assert.equal(errorMessage.error, expectedError);
});

Then('codex session {string} should be inactive', function (sessionId) {
  assert.equal(isCodexSessionActive(sessionId), false);
});

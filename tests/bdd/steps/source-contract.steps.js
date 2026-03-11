import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Then } from '@cucumber/cucumber';

const sourceCache = new Map();

function readSource(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!sourceCache.has(resolvedPath)) {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    sourceCache.set(resolvedPath, content);
  }
  return sourceCache.get(resolvedPath);
}

Then('file {string} should contain text {string}', function (filePath, expectedText) {
  const content = readSource(filePath);
  assert.ok(
    content.includes(expectedText),
    `Expected ${filePath} to contain text: ${expectedText}`,
  );
});

Then(
  'in file {string} text {string} should appear before text {string}',
  function (filePath, firstText, secondText) {
    const content = readSource(filePath);
    const firstIndex = content.indexOf(firstText);
    const secondIndex = content.indexOf(secondText);

    assert.notEqual(firstIndex, -1, `Did not find first text in ${filePath}: ${firstText}`);
    assert.notEqual(secondIndex, -1, `Did not find second text in ${filePath}: ${secondText}`);
    assert.ok(
      firstIndex < secondIndex,
      `Expected "${firstText}" to appear before "${secondText}" in ${filePath}`,
    );
  },
);

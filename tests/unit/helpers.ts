import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect } from 'vitest';

export const FIXED_NOW = new Date('2026-10-24T12:00:00Z');

export function loadFixture(rel: string): Document {
  const html = readFileSync(join('tests/fixtures', rel), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Compares against tests/golden/<rel>; run with UPDATE_GOLDEN=1 to rewrite after reviewing a change. */
export function expectGolden(rel: string, actual: string): void {
  const path = join('tests/golden', rel);
  if (process.env.UPDATE_GOLDEN || !existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual);
  }
  expect(actual).toBe(readFileSync(path, 'utf8'));
}

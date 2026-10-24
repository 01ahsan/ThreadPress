import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { VERSION } from '../../src/version';

it('src/version.ts matches package.json', () => {
  expect(VERSION).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
});

// Fuzz: thousands of random chats through the reader and every exporter, inside real browser
// engines (Chromium, Firefox, WebKit). FUZZ_RUNS sets the count (default 300 per engine);
// FUZZ_SEED replays a failure.

import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

const RUNS = Number(process.env.FUZZ_RUNS ?? 300);
const SEED = Number(process.env.FUZZ_SEED ?? 1);
let bundle = '';

test.beforeAll(async () => {
  const out = await build({
    entryPoints: ['tests/stress/harness.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'Fuzz',
    write: false,
    charset: 'ascii',
    target: ['chrome109', 'firefox115', 'safari16'],
  });
  bundle = out.outputFiles[0]!.text;
});

test(`random chats: nothing lost, nothing leaked, every file valid (${RUNS} chats)`, async ({
  page,
}, info) => {
  test.setTimeout(Math.max(120_000, RUNS * 400));
  await page.setContent('<!doctype html><html><head><title>fuzz</title></head><body></body></html>');
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(
    ([seed, runs]) =>
      (window as unknown as { Fuzz: { runFuzz: (s: number, r: number) => unknown } }).Fuzz.runFuzz(
        seed,
        runs,
      ),
    [SEED, RUNS] as const,
  );
  const { failures, ms, checked } = result as {
    failures: { seed: number; check: string; detail: string }[];
    ms: number;
    checked: number;
  };
  info.annotations.push({ type: 'fuzz', description: `${checked} exports checked in ${ms} ms` });
  console.log(`[${info.project.name}] ${checked} exports checked in ${ms} ms, ${failures.length} failures`);
  expect(
    failures,
    failures
      .slice(0, 15)
      .map((f) => `seed ${f.seed} · ${f.check}: ${f.detail}`)
      .join('\n'),
  ).toEqual([]);
});

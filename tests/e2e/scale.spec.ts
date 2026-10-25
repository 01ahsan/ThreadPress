// Scale limits inside real browsers: huge chats, huge messages, deep nesting, with time budgets.
import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

let bundle = '';
test.beforeAll(async () => {
  const out = await build({
    entryPoints: ['tests/stress/harness.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'Fuzz',
    write: false,
    charset: 'ascii',
  });
  bundle = out.outputFiles[0]!.text;
});

test('huge and deeply nested chats export within budget', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.setContent('<!doctype html><html><head><title>scale</title></head><body></body></html>');
  await page.addScriptTag({ content: bundle });
  const results = (await page.evaluate(() =>
    (window as unknown as { Fuzz: { runScale: () => unknown } }).Fuzz.runScale(),
  )) as { name: string; ms: number; ok: boolean; detail: string }[];
  for (const r of results) {
    console.log(
      `[${info.project.name}] ${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(26)} ${String(r.ms).padStart(6)} ms  ${r.detail}`,
    );
  }
  expect(results.filter((r) => !r.ok)).toEqual([]);
});

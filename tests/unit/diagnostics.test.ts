import { expect, it } from 'vitest';
import { layoutReport } from '../../src/diagnostics';
import { loadFixture } from './helpers';

it('describes the page structure without any chat text, links or names', () => {
  const doc = loadFixture('chatgpt/layout-2026.html');
  // Render the fixture into the live test document so computed styles are available.
  document.body.replaceWith(document.importNode(doc.body, true));
  const report = layoutReport(
    document,
    new URL('https://chatgpt.com/c/0f0e0d0c-1111-2222-3333-444455556666'),
  );
  expect(report).toContain('<section .group/turn.group.relative>');
  expect(report).toContain('"You said:"');
  expect(report).toContain('.thread-scroll-container');
  expect(report).toContain('/c/:id');
  for (const secret of ['Solve', 'x = 2', 'private chat', '0f0e0d0c', '/c/x'])
    expect(report).not.toContain(secret);
});

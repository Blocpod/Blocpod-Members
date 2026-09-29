import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RichContent from '../src/components/RichContent';
test('rich content embeds only explicit approved video hosts and does not execute raw HTML', () => {
  const render = (children: string) =>
    renderToStaticMarkup(createElement(RichContent, { children }));
  assert.match(
    render('[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ "embed")'),
    /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
  );
  assert.match(
    render('[Video](https://vimeo.com/12345678 "embed")'),
    /player\.vimeo\.com\/video\/12345678/,
  );
  assert.doesNotMatch(
    render(
      '[Video](https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ "embed")',
    ),
    /<iframe/,
  );
  assert.doesNotMatch(
    render('[Ordinary link](https://www.youtube.com/watch?v=dQw4w9WgXcQ)'),
    /<iframe/,
  );
  assert.doesNotMatch(
    render('<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))'),
    /<script|href="javascript:/,
  );
});

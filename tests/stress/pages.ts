// Hostile test pages for scroll and UI stress. Each page is plain HTML with an inline script
// that imitates a chat site behaving badly (slow, flaky, recycling elements, still streaming).
// All randomness is seeded, so failures reproduce.

const RNG = `function rng(a){return function(){a=(a+0x6d2b79f5)>>>0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}`;

const shell = (title: string, css: string, body: string, script: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title} - ChatGPT</title><style>body{margin:0;font:15px sans-serif}${css}</style></head><body>${body}<script>${RNG}\n${script}</script></body></html>`;

/** Message element in the reader's ChatGPT layout. */
const MSG = `function msg(i, el){
  el = el || document.createElement('div');
  var role = i % 2 ? 'assistant' : 'user';
  el.setAttribute('data-message-author-role', role);
  el.setAttribute('data-message-id', 'm' + i);
  el.replaceChildren();
  var inner = document.createElement('div');
  inner.className = role === 'user' ? 'whitespace-pre-wrap' : 'markdown';
  if (role === 'user') inner.textContent = 'Question ' + i;
  else { var p = document.createElement('p'); p.textContent = 'Answer ' + i; inner.append(p); }
  el.append(inner);
  return el;
}`;

/** Virtual list: only visible rows exist; rows render after a random delay; heights vary. */
export function virtualJitter(n: number, seed: number): string {
  return shell(
    'Virtual jitter',
    '#sc{height:700px;overflow-y:auto} #list{position:relative}',
    '<div id="sc" class="thread-scroll-container"><div id="list"></div></div>',
    `${MSG}
// (Not "top": that is the read-only window.top in browsers.)
var r = rng(${seed}), N = ${n}, tops = [0], h = [];
for (var i = 0; i < N; i++) { h[i] = 40 + Math.floor(r() * 90); tops[i + 1] = tops[i] + h[i]; }
var sc = document.getElementById('sc'), list = document.getElementById('list');
list.style.height = tops[N] + 'px';
var pending;
function render(){
  clearTimeout(pending);
  pending = setTimeout(function(){
    var y = sc.scrollTop, s = 0;
    while (s < N - 1 && tops[s + 1] < y) s++;
    var e = s; while (e < N && tops[e] < y + sc.clientHeight) e++;
    s = Math.max(0, s - 2); e = Math.min(N, e + 2);
    var rows = [];
    for (var i = s; i < e; i++) { var el = msg(i); el.style.cssText = 'position:absolute;left:0;right:0;top:' + tops[i] + 'px;height:' + h[i] + 'px'; rows.push(el); }
    list.replaceChildren.apply(list, rows);
  }, Math.floor(r() * 60));
}
sc.addEventListener('scroll', render);
sc.scrollTop = tops[N]; render();`,
  );
}

/** Older messages load on scroll near the top, with random latency; some loads silently fail. */
export function flakyLazy(n: number, batch: number, seed: number, minMs = 100, maxMs = 1200): string {
  return shell(
    'Flaky lazy',
    '#sc{height:700px;overflow-y:auto;display:flex;flex-direction:column-reverse}',
    '<main><div id="sc" class="thread-scroll-container"><div id="thread"></div></div></main>',
    `${MSG}
var r = rng(${seed}), N = ${n}, B = ${batch}, oldest = N - B, loading = false;
var sc = document.getElementById('sc'), thread = document.getElementById('thread');
for (var i = oldest; i < N; i++) thread.append(msg(i));
window.__loads = 0; window.__failed = 0;
sc.addEventListener('scroll', function(){
  var fromTop = sc.scrollTop + sc.scrollHeight - sc.clientHeight;
  if (fromTop > 150 || loading || oldest <= 0) return;
  loading = true; window.__loads++;
  var fails = r() < 0.12;
  setTimeout(function(){
    loading = false;
    if (fails) { window.__failed++; return; }
    var from = Math.max(0, oldest - B), frag = document.createDocumentFragment();
    for (var i = from; i < oldest; i++) frag.append(msg(i));
    thread.prepend(frag); oldest = from;
  }, ${minMs} + Math.floor(r() * ${maxMs - minMs}));
});`,
  );
}

/** A pool of 20 elements reused for different messages as the list scrolls (keys move). */
export function recycled(n: number): string {
  return shell(
    'Recycled',
    '#sc{height:600px;overflow-y:auto} #list{position:relative}',
    '<div id="sc" class="thread-scroll-container"><div id="list"></div></div>',
    `${MSG}
var N = ${n}, H = 70, sc = document.getElementById('sc'), list = document.getElementById('list'), pool = [];
list.style.height = N * H + 'px';
for (var k = 0; k < 20; k++) { var el = document.createElement('div'); el.style.cssText = 'position:absolute;left:0;right:0;height:' + H + 'px'; pool.push(el); list.append(el); }
function render(){
  var s = Math.max(0, Math.floor(sc.scrollTop / H) - 3);
  pool.forEach(function(el, k){ var i = s + k; if (i < N) { msg(i, el); el.style.top = i * H + 'px'; el.hidden = false; } else el.hidden = true; });
}
sc.addEventListener('scroll', render);
sc.scrollTop = N * H; render();`,
  );
}

/** A finished chat plus a reply that keeps streaming (and new messages arriving) during export. */
export function streaming(n: number): string {
  return shell(
    'Streaming',
    '',
    '<main><div id="thread"></div></main>',
    `${MSG}
var thread = document.getElementById('thread'), N = ${n};
for (var i = 0; i < N; i++) thread.append(msg(i));
// The reply being written is always an answer (odd index), whatever N is.
var live = msg(N % 2 ? N : N + 1); thread.append(live);
var p = live.querySelector('p'), ticks = 0;
setInterval(function(){
  p.textContent += ' word' + (ticks++);
  if (ticks % 40 === 0) { thread.append(msg(N + 1 + ticks)); }
}, 25);`,
  );
}

/** Messages with identical text and no ids. */
export function duplicates(n: number): string {
  let html = '';
  for (let i = 0; i < n; i++) {
    const role = i % 2 ? 'assistant' : 'user';
    html += `<div data-message-author-role="${role}"><div class="${role === 'user' ? 'whitespace-pre-wrap' : 'markdown'}">${role === 'user' ? 'Same question' : '<p>Same answer</p>'}</div></div>`;
  }
  return shell('Duplicates', '', `<main>${html}</main>`, '');
}

/** A chat that switches to another chat without reloading (single-page app navigation). */
export function spa(): string {
  return shell(
    'First chat',
    '',
    '<main><div id="thread"></div></main>',
    `${MSG}
var thread = document.getElementById('thread');
for (var i = 0; i < 4; i++) thread.append(msg(i));
window.__go = function(){
  history.pushState({}, '', '/c/second-chat');
  document.title = 'Second chat - ChatGPT';
  thread.replaceChildren();
  for (var i = 100; i < 110; i++) thread.append(msg(i));
};`,
  );
}

/** A supported site's page with no conversation open. */
export function empty(): string {
  return shell('ChatGPT', '', '<main><p>What can I help with?</p></main>', '');
}

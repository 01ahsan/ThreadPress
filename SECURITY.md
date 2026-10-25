# Security policy

## Reporting a vulnerability

Please report security problems privately using GitHub's **Report a vulnerability** button on the [Security tab](https://github.com/01ahsan/ThreadPress/security/advisories/new). Don't open a public issue for them.

Include the browser and ThreadPress version, the steps to reproduce, and what an attacker could achieve. You should get a reply within 7 days.

## What ThreadPress guarantees

- No network requests, `eval`, dynamic code, cookie access or site storage access. The build fails if the bundle contains any of them.
- Page HTML is never copied into exports. Conversations are converted into a typed structure first, and exports are built from that.
- Links are limited to `http`, `https` and `mailto`, and images to `http(s)` and raster `data:` URLs.
- Maths copied into LaTeX files cannot run file or shell commands when compiled.
- The extension requests no permissions.

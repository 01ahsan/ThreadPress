# Building ThreadPress from source

These steps produce exact copies of the published packages (the build is reproducible).

## Requirements

- Operating system: Windows, macOS or Linux. Release builds run on Ubuntu (GitHub Actions `ubuntu-latest`); also tested on Windows 10.
- [Node.js](https://nodejs.org/) **22.12 or newer** (tested with 22 and 26), which includes npm 10 or newer. Install it from nodejs.org or with your system's package manager.
- An internet connection for `npm ci` (downloads the pinned packages listed in `package-lock.json`).

## Build

From the folder containing this file:

```
npm ci
npm run build
```

`npm run build` runs `scripts/build.mjs`, which bundles and minifies the TypeScript sources in `src/` with esbuild and writes:

| File                             | Use                                                     |
| -------------------------------- | ------------------------------------------------------- |
| `dist/store/firefox.zip`         | Firefox Add-ons package                                 |
| `dist/store/chrome-edge.zip`     | Chrome Web Store and Microsoft Edge Add-ons package     |
| `dist/ThreadPress-extension.zip` | The download on GitHub (works in all of these browsers) |
| `dist/extension/`                | The same, unpacked                                      |

## Check the result

The packages are byte-for-byte reproducible. Compare your `dist/store/firefox.zip` with the `firefox.zip` attached to the GitHub release of the same version, for example:

```
sha256sum dist/store/firefox.zip        # Linux / macOS
certutil -hashfile dist\store\firefox.zip SHA256   # Windows
```

## Third-party code

The only bundled library is [Preact](https://preactjs.com) (MIT), installed by `npm ci`. Its licence is shipped in `THIRD_PARTY_NOTICES.txt` inside every package.

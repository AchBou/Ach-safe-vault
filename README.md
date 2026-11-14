# Ach's Safe Vault

A small Electron password manager with a Lord of the Rings sense of humour: press **Enter** on the
login screen and the Gatekeeper tells you *you shall not pass*. There is exactly one way in.

> **Live demo:** _add your hosted URL here_ (runs in the browser with fake data, never enter real passwords).

## Features

- Encrypted vault file (AES-256-GCM, key derived from the master password with scrypt)
- Add, edit and delete entries; search as you type
- Passwords stay out of the page until you reveal them; copy to clipboard auto-clears after 20 seconds
- Auto-lock after 2 minutes of inactivity; login attempts are throttled after 3 failures
- Export / import of the encrypted vault file (move it between devices), change master password
- Windows installer via electron-builder

## Security design

| Concern | How it is handled |
|---|---|
| Storage | One file, `vault.enc`, in the user-data folder. Format: `{ v, salt, iv, tag, ct }` (hex). No plaintext, no password hash: a wrong password simply fails GCM authentication. |
| Key | `scrypt(masterPassword, salt)` (N=2^15, r=8, p=1) gives a 256-bit key. Held only in the main process while unlocked, zeroed on lock. |
| Trust boundary | Renderers never see the key or the file. All vault operations are IPC calls handled in the main process, which refuses them before login. |
| Renderer hardening | `contextIsolation`, `sandbox`, no `nodeIntegration`; strict CSP on every page; popups and external navigation blocked; IPC accepted only from the app's own files. |
| XSS | Vault values are rendered with `textContent`, never `innerHTML`. |
| Clipboard | Copying happens in the main process; it is cleared after 20 s only if it still holds the copied value. |

Not covered: malware on the machine, a weak master password (a strength hint is shown, but nothing enforces it
beyond 8 characters), recovery of a forgotten master password (there is none by design).

## Develop

```bash
npm install
npm start          # run the desktop app
npm test           # unit tests (vault crypto, entry rules, strength hint)
```

## Build the Windows installer

```bash
npm run dist       # dist/Ach Safe Vault Setup <version>.exe
npm run pack       # unpacked build only, faster for testing
```

The installer is unsigned, so Windows SmartScreen will show an "unknown publisher" warning.

## Web demo

The `demo/` folder turns the desktop UI into a static site. The pages only talk to `window.mainWindow`,
`window.homeWindow` and `window.alertWindow` (exposed by `preload.js` in the desktop app); `demo/shim.js`
provides the same API in the browser:

| Desktop | Demo |
|---|---|
| Node `crypto` | WebCrypto AES-GCM + scrypt compiled to WebAssembly (hash-wasm), same parameters and file format, so a vault exported from the demo opens in the desktop app |
| `vault.enc` on disk | `localStorage` |
| Native save/open dialogs | file download / file picker |
| "Shall not pass" window | the real popup page in an iframe overlay |

```bash
npm run demo:build   # writes ./demo-dist
npm run demo:serve   # build + serve on http://localhost:8080
```

Host the `demo-dist/` folder on any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
The demo starts with a pre-filled account; the password is shown in a collapsed "Demo hints" box on the login page.
Use `?reset` to restore the demo data and `?setup` to try the first-run flow.

**Demo only:** a web page has no equivalent of the main process's memory, so the demo keeps the derived key in
`sessionStorage` for the length of the tab. That is fine for fake data and is exactly why it must not be used for real passwords.

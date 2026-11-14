// Builds the static web demo into ./demo-dist (host that folder anywhere).
//   node demo/build.js
// It reuses the real app's HTML/CSS/page scripts and adds demo/shim.js, which stands in for Electron.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'demo-dist');
const rel = (...p) => path.join(root, ...p);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function copy(from, to = from) {
    fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
    fs.cpSync(rel(from), path.join(out, to), { recursive: true });
}

// ---- static assets used by the real pages ----
['style.css', 'theme.css', 'renderer.js', 'strength.js'].forEach((f) => copy(f));
['Poppins-Regular.ttf', 'Poppins-SemiBold.ttf'].forEach((f) => copy(`resources/fonts/Poppins/${f}`));
copy('resources/fonts/fanjofey/fanjofey.ttf');
copy('resources/images');
copy('screens/main-screen/main-screen.css');
copy('screens/main-screen/main-screen.js');
copy('windows/alert-window/unauth-message.css');
copy('windows/alert-window/unauth-message.js');
copy('build/icon.png', 'icon.png');

// bootstrap-icons font (under vendor/ because some hosts ignore node_modules)
const icons = rel('node_modules/bootstrap-icons/font');
fs.mkdirSync(path.join(out, 'vendor/bootstrap-icons/font/fonts'), { recursive: true });
fs.copyFileSync(path.join(icons, 'bootstrap-icons.css'), path.join(out, 'vendor/bootstrap-icons/font/bootstrap-icons.css'));
for (const f of ['bootstrap-icons.woff2', 'bootstrap-icons.woff']) {
    fs.copyFileSync(path.join(icons, 'fonts', f), path.join(out, 'vendor/bootstrap-icons/font/fonts', f));
}

// ---- demo-only files ----
fs.mkdirSync(path.join(out, 'demo'), { recursive: true });
fs.copyFileSync(rel('demo/shim.js'), path.join(out, 'demo/shim.js'));
fs.copyFileSync(rel('demo/demo.css'), path.join(out, 'demo/demo.css'));
fs.copyFileSync(rel('node_modules/hash-wasm/dist/scrypt.umd.min.js'), path.join(out, 'demo/scrypt.umd.min.js'));

// entries.js is a CommonJS module; expose it as window.Entries for the browser
const entriesSrc = fs.readFileSync(rel('entries.js'), 'utf8');
fs.writeFileSync(
    path.join(out, 'demo/entries.js'),
    `window.Entries = (function () {\n  const module = { exports: {} };\n${entriesSrc}\n  return module.exports;\n})();\n`
);

// same as the app's CSP, plus WebAssembly (needed by the scrypt library)
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

function transform(srcFile, dstFile) {
    let html = fs.readFileSync(rel(srcFile), 'utf8');
    const depth = dstFile.split('/').length - 1;
    const prefix = '../'.repeat(depth);

    html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, `<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
    html = html.replace(/node_modules\/bootstrap-icons\/font\//g, 'vendor/bootstrap-icons/font/');
    html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1">');
    html = html.replace('</head>', `    <link rel="icon" href="${prefix}icon.png">\n    <link rel="stylesheet" href="${prefix}demo/demo.css">\n</head>`);

    const inject =
        `<script src="${prefix}demo/scrypt.umd.min.js"></script>\n` +
        `    <script src="${prefix}demo/entries.js"></script>\n` +
        `    <script src="${prefix}demo/shim.js" data-root="${prefix}"></script>\n    `;
    const i = html.indexOf('<script');
    if (i === -1) throw new Error('no script tag in ' + srcFile);
    html = html.slice(0, i) + inject + html.slice(i);

    fs.mkdirSync(path.dirname(path.join(out, dstFile)), { recursive: true });
    fs.writeFileSync(path.join(out, dstFile), html);
}

transform('index.html', 'index.html');
transform('screens/main-screen/main-screen.html', 'screens/main-screen/main-screen.html');
transform('windows/alert-window/unauth-message.html', 'windows/alert-window/unauth-message.html');

fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Demo built in', path.relative(process.cwd(), out) || out);

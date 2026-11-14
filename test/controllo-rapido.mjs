/* Il controllo che gira PRIMA di ogni pubblicazione, su Cloudflare.
 *
 * E' nel wrangler.jsonc come build.command: se esce con un errore il
 * deploy non parte e online resta la versione di prima.
 *
 * Esiste perche' il 14 novembre 2026 e' andato online un sw.js vuoto: un
 * comando l'aveva troncato, e per quaranta minuti chi apriva l'app si
 * prendeva un service worker che non mostrava piu' le notifiche. Il test
 * che se ne sarebbe accorto c'era, ma lanciarlo dipendeva da chi
 * pubblicava. Questo no.
 *
 * Deve restare senza dipendenze e senza browser: gira dove gira wrangler.
 * Guarda solo le cose la cui mancanza rompe l'app per tutti; il resto lo
 * fa la serie completa (test/prova.js), che parte da .githooks/pre-push.
 */
import fs from 'fs';
import path from 'path';

const RADICE = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');
const guasti = [];
const deve = (vero, cosa) => { if (!vero) guasti.push(cosa); };

// ── Il service worker: senza, niente notifiche ──────────────────────────────
let sw = '';
try { sw = leggi('sw.js'); } catch (_) {}
deve(sw.length > 3000, `sw.js è di ${sw.length} caratteri: vuoto o troncato`);
for (const evento of ['install', 'activate', 'fetch', 'push', 'notificationclick'])
  deve(sw.includes(`addEventListener('${evento}'`), `sw.js non ascolta più "${evento}"`);
deve(/showNotification\(/.test(sw), 'sw.js non mostra più le notifiche (showNotification)');
const vSw = (/const CACHE = 'campobase-v(\d+)'/.exec(sw) || [])[1];
deve(!!vSw, 'sw.js non ha più la versione della cache');

// ── L'app ───────────────────────────────────────────────────────────────────
let html = '';
try { html = leggi('index.html'); } catch (_) {}
deve(html.length > 500000, `index.html è di ${html.length} caratteri: troncato`);
deve(/<\/html>\s*$/.test(html), 'index.html non finisce con </html>: troncato');
const vApp = (/const CB_VERSIONE = '1\.(\d+)'/.exec(html) || [])[1];
deve(!!vApp, 'index.html non ha più CB_VERSIONE');
deve(!vSw || !vApp || vSw === vApp, `versioni diverse: app 1.${vApp}, service worker ${vSw} — i telefoni non si aggiornerebbero`);
deve(html.includes("serviceWorker"), 'index.html non registra più il service worker');

try { JSON.parse(leggi('manifest.json')); } catch (e) { guasti.push('manifest.json non è JSON valido: ' + e.message); }

// ── Il Worker: un errore di sintassi lo spegne tutto, posta compresa ────────
const dirW = path.join(RADICE, 'worker');
const fileW = fs.existsSync(dirW) ? fs.readdirSync(dirW).filter(f => f.endsWith('.js')) : [];
deve(fileW.includes('index.js'), 'manca worker/index.js');
/* Si caricano davvero. "node --check" sui moduli ES non serve: lascia
   passare anche un file con le graffe sbagliate (provato). Caricandoli,
   un errore di sintassi o un import che non esiste piu' saltano fuori. */
for (const f of fileW) {
  const p = path.join(dirW, f);
  deve(fs.statSync(p).size > 200, `worker/${f} è quasi vuoto`);
  try { await import(p); }
  catch (e) { guasti.push(`worker/${f} non si carica: ` + String(e && e.message || e).split('\n')[0].slice(0, 160)); }
}
try { new Function('self', 'caches', 'fetch', sw); }
catch (e) { guasti.push('sw.js non è JavaScript valido: ' + e.message); }

if (guasti.length) {
  console.error('\nPUBBLICAZIONE FERMATA — ' + guasti.length + ' problemi:\n' + guasti.map(g => '  ✗ ' + g).join('\n') + '\n');
  process.exit(1);
}
console.log(`controllo rapido: a posto (app 1.${vApp}, service worker ${vSw}, ${fileW.length} file del Worker)`);

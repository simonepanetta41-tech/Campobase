/* La firma VAPID.
 * Apple e Google accettano una notifica solo se e' firmata con la chiave
 * privata che corrisponde alla pubblica consegnata al telefono. Qui si
 * firma davvero e si ricontrolla la firma con la pubblica: se questo passa,
 * la firma e' valida, e quello che resta fra noi e il telefono e' solo la
 * rete. */
import { readFile } from 'node:fs/promises';
import nodeCrypto from 'node:crypto';

const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const src = await readFile(RADICE + '/worker/push.js', 'utf8');
const taglio = src.indexOf('// ── Il database');
const mod = new Function('requireUser','readJson','json',
  src.slice(0, taglio).replace(/^\s*import .*$/gm, '').replace(/^\s*export /gm, '')
  + '\nreturn {autorizzazione, VAPID_PUBBLICA, b64u, daB64u};')(null, null, null);

let ko = 0;
const ok = (n, v) => { if (!v) ko++; console.log(`  ${v ? 'ok ' : 'KO '} ${n}`); };

const PRIVATA = 'woQ2JLSHiHdgAJQzBzmqSTt8O7FTeTXjePDUGT8rlNQ';
const env = { VAPID_PRIVATA: PRIVATA };

const intestazione = await mod.autorizzazione('https://web.push.apple.com/abc123', env);
ok('comincia con vapid', /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/.test(intestazione));

const [, jwt] = /t=([^,]+)/.exec(intestazione);
const [testa, corpo, firma] = jwt.split('.');
const dec = s => JSON.parse(Buffer.from(s, 'base64url').toString());
ok('algoritmo ES256',        dec(testa).alg === 'ES256');
ok('il pubblico è Apple',    dec(corpo).aud === 'https://web.push.apple.com');
ok('scade fra dodici ore',   Math.abs(dec(corpo).exp - (Date.now()/1000 + 43200)) < 60);
ok('niente indirizzi miei',  dec(corpo).sub === 'mailto:push@campobase.dev');
ok('firma di 64 byte',       Buffer.from(firma, 'base64url').length === 64);

/* La prova vera: la firma si verifica con la chiave pubblica. */
const p = Buffer.from(mod.VAPID_PUBBLICA, 'base64url');
const pubblica = nodeCrypto.createPublicKey({ key: {
  kty: 'EC', crv: 'P-256',
  x: p.subarray(1, 33).toString('base64url'),
  y: p.subarray(33, 65).toString('base64url')
}, format: 'jwk' });
ok('la firma regge', nodeCrypto.verify('sha256', Buffer.from(testa + '.' + corpo),
  { key: pubblica, dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url')));
ok('e un testo cambiato no', !nodeCrypto.verify('sha256', Buffer.from(testa + '.' + corpo + 'x'),
  { key: pubblica, dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url')));

// La pubblica e la privata devono essere la stessa coppia.
const dallaPrivata = nodeCrypto.createPublicKey({ key: {
  kty:'EC', crv:'P-256', d: PRIVATA,
  x: p.subarray(1,33).toString('base64url'), y: p.subarray(33,65).toString('base64url')
}, format:'jwk' }).export({format:'jwk'});
ok('la coppia è coerente', dallaPrivata.x === p.subarray(1,33).toString('base64url'));

let errore = null;
try { await mod.autorizzazione('https://web.push.apple.com/x', {}); } catch (e) { errore = e.message; }
ok('senza il secret lo dice chiaro', /VAPID_PRIVATA/.test(errore || ''));

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);

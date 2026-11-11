/* La cifratura del contenuto (RFC 8291).
 *
 * Contro Apple non la posso provare, ma posso fare la parte del telefono:
 * mi fabbrico una coppia di chiavi come fa iOS quando si iscrive, cifro
 * col codice del Worker, e poi decifro con la chiave privata del finto
 * telefono. Se il testo torna identico, la cifratura e' giusta — perche'
 * questo e' esattamente il conto che fa il telefono.
 */
import { readFile } from 'node:fs/promises';
import nodeCrypto from 'node:crypto';

const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const src = await readFile(RADICE + '/worker/push.js', 'utf8');
const taglio = src.indexOf('// ── Il database');
const mod = new Function(
  src.slice(0, taglio).replace(/^\s*import .*$/gm, '').replace(/^\s*export /gm, '')
  + '\nreturn {cifra, daB64u, b64u};')();

let ko = 0;
const ok = (n, v, extra='') => { if (!v) ko++; console.log(`  ${v ? 'ok ' : 'KO '} ${String(n).padEnd(46)} ${extra}`); };
const b64u = b => Buffer.from(b).toString('base64url');

// ── Il finto telefono ───────────────────────────────────────────────────────
function telefono() {
  const coppia = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = coppia.publicKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]),
    Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return { privata: coppia.privateKey, p256dh: pub.toString('base64url'),
           auth: nodeCrypto.randomBytes(16).toString('base64url') };
}

/* Quello che fa iOS quando riceve il pacchetto. */
function decifra(pacchetto, tel) {
  const b = Buffer.from(pacchetto);
  const sale = b.subarray(0, 16);
  const record = b.readUInt32BE(16);
  const lunghezza = b[20];
  const miaPub = b.subarray(21, 21 + lunghezza);
  const cifrato = b.subarray(21 + lunghezza);

  const condiviso = nodeCrypto.diffieHellman({
    privateKey: tel.privata,
    publicKey: nodeCrypto.createPublicKey({ key: {
      kty: 'EC', crv: 'P-256',
      x: miaPub.subarray(1, 33).toString('base64url'),
      y: miaPub.subarray(33, 65).toString('base64url') }, format: 'jwk' })
  });

  const ua = Buffer.from(tel.p256dh, 'base64url');
  const info = Buffer.concat([Buffer.from('WebPush: info'), Buffer.from([0]), ua, miaPub]);
  const ikm = nodeCrypto.hkdfSync('sha256', condiviso, Buffer.from(tel.auth, 'base64url'), info, 32);
  const chiave = nodeCrypto.hkdfSync('sha256', Buffer.from(ikm), sale,
    Buffer.concat([Buffer.from('Content-Encoding: aes128gcm'), Buffer.from([0])]), 16);
  const numero = nodeCrypto.hkdfSync('sha256', Buffer.from(ikm), sale,
    Buffer.concat([Buffer.from('Content-Encoding: nonce'), Buffer.from([0])]), 12);

  const dec = nodeCrypto.createDecipheriv('aes-128-gcm', Buffer.from(chiave), Buffer.from(numero));
  dec.setAuthTag(cifrato.subarray(cifrato.length - 16));
  const chiaro = Buffer.concat([dec.update(cifrato.subarray(0, cifrato.length - 16)), dec.final()]);
  return { testo: chiaro.subarray(0, chiaro.length - 1).toString(), coda: chiaro[chiaro.length - 1], record };
}

console.log('\n── il telefono decifra quello che il Worker ha cifrato ──');
const tel = telefono();
const messaggio = JSON.stringify({ testo: 'Stefano è lì fra 10 minuti per il pick up!' });
const pacchetto = await mod.cifra(messaggio, tel.p256dh, tel.auth);
const letto = decifra(pacchetto, tel);
ok('il testo torna identico', letto.testo === messaggio, JSON.stringify(letto.testo));
ok('con il nome accentato intero', JSON.parse(letto.testo).testo.includes('è lì'));
ok('marcato come ultimo pezzo', letto.coda === 2, String(letto.coda));
ok('misura del record dichiarata', letto.record === 4096, String(letto.record));

console.log('\n── ogni notifica ha il suo sale e la sua coppia ──');
/* Riusare sale o chiavi vorrebbe dire che due notifiche identiche
   producono lo stesso pacchetto, e con AES-GCM riusare chiave e numero
   insieme rompe la cifratura, non solo la riservatezza. */
const a = await mod.cifra(messaggio, tel.p256dh, tel.auth);
const b2 = await mod.cifra(messaggio, tel.p256dh, tel.auth);
ok('due pacchetti diversi', Buffer.compare(Buffer.from(a), Buffer.from(b2)) !== 0);
ok('sale diverso', Buffer.compare(Buffer.from(a).subarray(0,16), Buffer.from(b2).subarray(0,16)) !== 0);
ok('coppia usa-e-getta diversa',
   Buffer.compare(Buffer.from(a).subarray(21,86), Buffer.from(b2).subarray(21,86)) !== 0);
ok('ma entrambi si decifrano', decifra(a, tel).testo === messaggio && decifra(b2, tel).testo === messaggio);

console.log('\n── un altro telefono non lo legge ──');
const altro = telefono();
let fallito = false;
try { decifra(pacchetto, altro); } catch (_) { fallito = true; }
ok('la cifratura tiene', fallito);

console.log('\n── un testo lungo come una notifica vera ──');
const lungo = JSON.stringify({ testo: 'Nuovo ordine del giorno! ' + 'x'.repeat(300) });
ok('passa intero', decifra(await mod.cifra(lungo, tel.p256dh, tel.auth), tel).testo === lungo);

console.log('\n── chiavi malformate si fermano subito ──');
for (const [n, p, u] of [
  ['p256dh corta',  b64u(Buffer.alloc(10)), tel.auth],
  ['p256dh senza il 4 davanti', b64u(Buffer.alloc(65)), tel.auth],
  ['auth di misura sbagliata',  tel.p256dh, b64u(Buffer.alloc(8))]
]) {
  let msg = null;
  try { await mod.cifra('x', p, u); } catch (e) { msg = e.message; }
  ok(n, !!msg, msg || '(nessun errore!)');
}

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);

/*
 * Un lettore di MIME scritto a mano.
 *
 * Perche' non una libreria: il deploy gira `npx wrangler deploy` su un repo
 * senza package.json, e aggiungerne uno vuol dire aggiungere un passo di
 * installazione al deploy — cioe' una cosa in piu' che si puo' rompere
 * quando nessuno guarda. Di un messaggio di produzione serve poco: gli
 * allegati, l'oggetto, il mittente. Quel poco sta in trecento righe.
 *
 * Si lavora sui byte, non su una stringa di testo. Convertire tutto in
 * UTF-8 prima di aver tolto il base64 rovina gli allegati: un PDF letto
 * cosi' torna indietro pieno di U+FFFD e non si apre piu'.
 *
 * Pero' una copia in latin1 si tiene, ed e' quella che fa la differenza
 * fra funzionare e no. In latin1 un byte e' un carattere: le posizioni
 * nella stringa e nei byte sono le stesse, quindi si puo' cercare con
 * indexOf — che e' codice nativo — invece che con un ciclo scritto a
 * mano, e poi tagliare i byte veri alle posizioni trovate.
 *
 * Non e' un dettaglio di stile. Il primo pacchetto da otto megabyte era
 * costato un secondo di CPU; il secondo, piu' grosso, ha sforato il
 * limite di Cloudflare e la mail e' stata respinta. Il ciclo byte per
 * byte ripassava il messaggio da capo a ogni pezzo cercato, e sono
 * decine di passaggi su megabyte.
 */

const LATIN1 = new TextDecoder('latin1');

// Lo stesso messaggio, visto come stringa. Un byte, un carattere.
function comeTesto(buf) {
  return LATIN1.decode(buf);
}

function testo(buf, da, a) {
  return LATIN1.decode(buf.subarray(da, a));
}

/*
 * RFC 2047: =?UTF-8?B?...?= e =?UTF-8?Q?...?=
 *
 * Serve davvero, non e' zelo: un allegato italiano si chiama
 * "Ordine del giorno n° 20 — lunedì.pdf" e senza questo arriva come
 * "=?utf-8?Q?Ordine=20del=20giorno..." dentro il nome del file.
 */
function decodificaParole(s) {
  if (!s || s.indexOf('=?') < 0) return s || '';
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s*(?==\?))?/g, (_, set, tipo, dato) => {
    try {
      let byte;
      if (tipo.toUpperCase() === 'B') {
        const bin = atob(dato.replace(/\s+/g, ''));
        byte = Uint8Array.from(bin, c => c.charCodeAt(0));
      } else {
        // Nel Q encoding l'underscore e' uno spazio. Solo qui, non nel QP
        // normale: e' la differenza che si dimentica sempre.
        const t = dato.replace(/_/g, ' ');
        const out = [];
        for (let i = 0; i < t.length; i++) {
          if (t[i] === '=' && /[0-9A-Fa-f]{2}/.test(t.substr(i + 1, 2))) {
            out.push(parseInt(t.substr(i + 1, 2), 16)); i += 2;
          } else out.push(t.charCodeAt(i));
        }
        byte = Uint8Array.from(out);
      }
      return new TextDecoder(set.toLowerCase().replace(/^utf8$/, 'utf-8'), { fatal: false }).decode(byte);
    } catch (_) { return _; }
  });
}

/*
 * Le intestazioni ripiegate su piu' righe si rimettono in fila: una riga che
 * comincia con spazio o tab e' la continuazione di quella sopra. Il nome di
 * un allegato lungo arriva quasi sempre cosi'.
 */
function leggiIntestazioni(blocco) {
  const righe = blocco.replace(/\r\n/g, '\n').split('\n');
  const map = new Map();
  let corrente = null;
  for (const r of righe) {
    if (/^[ \t]/.test(r) && corrente) { map.set(corrente, map.get(corrente) + ' ' + r.trim()); continue; }
    const i = r.indexOf(':');
    if (i < 0) continue;
    corrente = r.slice(0, i).toLowerCase().trim();
    const v = r.slice(i + 1).trim();
    // Received: compare molte volte. Si tiene la prima, le altre non servono.
    map.set(corrente, map.has(corrente) ? map.get(corrente) : v);
  }
  return map;
}

/*
 * Il valore e i suoi parametri: "application/pdf; name=x.pdf".
 *
 * Gestisce anche RFC 2231, il modo in cui i nomi lunghi o accentati si
 * spezzano su piu' righe (name*0*=utf-8''Ordine%20del...). Outlook lo usa
 * appena il nome supera una certa lunghezza, cioe' sempre.
 */
function leggiParametri(valore) {
  const v = String(valore || '');
  const fine = v.indexOf(';');
  const base = (fine < 0 ? v : v.slice(0, fine)).trim().toLowerCase();
  const par = {};
  const pezzi2231 = {};

  const resto = fine < 0 ? '' : v.slice(fine + 1);
  const re = /([^=;\s]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g;
  let m;
  while ((m = re.exec(resto))) {
    let chiave = m[1].trim().toLowerCase();
    let val = m[2].trim().replace(/^"|"$/g, '').replace(/\\(.)/g, '$1');
    const esteso = /\*$/.test(chiave);
    chiave = chiave.replace(/\*$/, '');
    const spezzato = chiave.match(/^(.+)\*(\d+)$/);
    if (spezzato) {
      (pezzi2231[spezzato[1]] ||= [])[+spezzato[2]] = { val, esteso };
    } else {
      par[chiave] = esteso ? decodifica2231(val) : val;
    }
  }
  for (const k of Object.keys(pezzi2231)) {
    const pezzi = pezzi2231[k].filter(Boolean);
    const unito = pezzi.map(p => p.val).join('');
    par[k] = pezzi.some(p => p.esteso) ? decodifica2231(unito) : unito;
  }
  return { tipo: base, par };
}

// utf-8''Ordine%20del%20giorno.pdf
function decodifica2231(s) {
  const p = String(s).split("'");
  const set = p.length >= 3 ? p[0] : 'utf-8';
  const dato = p.length >= 3 ? p.slice(2).join("'") : s;
  try {
    const byte = [];
    for (let i = 0; i < dato.length; i++) {
      if (dato[i] === '%' && /[0-9A-Fa-f]{2}/.test(dato.substr(i + 1, 2))) {
        byte.push(parseInt(dato.substr(i + 1, 2), 16)); i += 2;
      } else byte.push(dato.charCodeAt(i));
    }
    return new TextDecoder(set.toLowerCase() || 'utf-8', { fatal: false }).decode(Uint8Array.from(byte));
  } catch (_) { return dato; }
}

function daBase64(buf, da, a) {
  /* Prima questa riga costruiva la stringa un carattere per volta: per un
     allegato da cinque megabyte sono cinque milioni di concatenazioni, ed
     era il pezzo piu' caro di tutto il Worker. */
  const pulito = LATIN1.decode(buf.subarray(da, a)).replace(/[^A-Za-z0-9+/=]+/g, '');
  const bin = atob(pulito);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function daQuotedPrintable(buf, da, a) {
  const out = [];
  for (let i = da; i < a; i++) {
    if (buf[i] === 61) {                               // '='
      // '=' a fine riga e' una riga spezzata, non un carattere.
      if (buf[i + 1] === 13 && buf[i + 2] === 10) { i += 2; continue; }
      if (buf[i + 1] === 10) { i += 1; continue; }
      const h = testo(buf, i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(h)) { out.push(parseInt(h, 16)); i += 2; continue; }
    }
    out.push(buf[i]);
  }
  return Uint8Array.from(out);
}

function corpoDecodificato(buf, da, a, codifica) {
  const c = String(codifica || '').toLowerCase().trim();
  if (c === 'base64')           return daBase64(buf, da, a);
  if (c === 'quoted-printable') return daQuotedPrintable(buf, da, a);
  return buf.slice(da, a);
}

/*
 * Un pezzo per volta, scendendo dentro i multipart.
 *
 * message/rfc822 si apre come fosse un messaggio normale: e' il caso
 * dell'inoltro fatto a mano da Outlook, dove il pacchetto vero sta dentro
 * un allegato che e' a sua volta una mail. Senza questo, di un inoltro si
 * vedrebbe un solo allegato .eml e zero PDF.
 */
function scendi(buf, txt, da, a, raccolto, profondita = 0) {
  if (profondita > 12) return;
  const segna = (t, n) => raccolto.struttura.push(
    '  '.repeat(profondita) + t + (n ? ' «' + n + '»' : ''));

  /* Le intestazioni finiscono alla prima riga vuota. Si cerca con indexOf
     sulla copia in latin1 e con un limite: prima si scorreva fino in
     fondo al messaggio anche per un pezzo lungo tre righe. */
  let fineInt = txt.indexOf('\r\n\r\n', da);
  let salto = 4;
  if (fineInt < 0 || fineInt > a) { fineInt = txt.indexOf('\n\n', da); salto = 2; }
  if (fineInt < 0 || fineInt > a) { fineInt = a; salto = 0; }

  const int = leggiIntestazioni(txt.slice(da, fineInt));
  const inizioCorpo = Math.min(fineInt + salto, a);

  const ct = leggiParametri(int.get('content-type') || 'text/plain');
  const cd = leggiParametri(int.get('content-disposition') || '');
  const codifica = int.get('content-transfer-encoding');

  if (profondita === 0) raccolto.intestazioni = int;

  if (ct.tipo.startsWith('multipart/') && ct.par.boundary) {
    segna(ct.tipo);
    const sep = '--' + ct.par.boundary;
    let p = txt.indexOf(sep, inizioCorpo);
    while (p >= 0 && p < a) {
      // Dopo il separatore c'e' un a capo, oppure '--' e il multipart finisce.
      let q = p + sep.length;
      if (buf[q] === 45 && buf[q + 1] === 45) break;
      while (buf[q] === 13 || buf[q] === 10) q++;
      const prossimo = txt.indexOf(sep, q);
      const fine = prossimo < 0 || prossimo > a ? a : prossimo;
      // L'a capo prima del separatore appartiene al separatore, non al pezzo.
      let f = fine;
      if (buf[f - 1] === 10) f--;
      if (buf[f - 1] === 13) f--;
      scendi(buf, txt, q, f, raccolto, profondita + 1);
      p = prossimo;
    }
    return;
  }

  if (ct.tipo === 'message/rfc822') {
    segna(ct.tipo);
    const dentro = corpoDecodificato(buf, inizioCorpo, a, codifica);
    scendi(dentro, comeTesto(dentro), 0, dentro.length, raccolto, profondita + 1);
    return;
  }

  const nome = decodificaParole(cd.par.filename || ct.par.name || '');
  const allegato = cd.tipo === 'attachment' || (!!nome && ct.tipo !== 'text/plain' && ct.tipo !== 'text/html');

  segna(ct.tipo, nome);

  if (allegato) {
    const byte = corpoDecodificato(buf, inizioCorpo, a, codifica);
    raccolto.allegati.push({ nome: nome || 'senza-nome', tipo: ct.tipo, byte });
    return;
  }

  if (ct.tipo === 'text/plain' && raccolto.testo.length < 20000) {
    const byte = corpoDecodificato(buf, inizioCorpo, a, codifica);
    const set = (ct.par.charset || 'utf-8').toLowerCase();
    let t;
    try { t = new TextDecoder(set, { fatal: false }).decode(byte); }
    catch (_) { t = new TextDecoder('utf-8', { fatal: false }).decode(byte); }
    // Gli a capo della posta sono CRLF. Qui dentro non servono a niente e
    // sporcano tutto quello che legge il testo dopo.
    raccolto.testo += t.replace(/\r\n/g, '\n') + '\n';
  }
}

export function leggiMessaggio(buf) {
  const raccolto = { allegati: [], testo: '', intestazioni: new Map(), struttura: [] };
  scendi(buf, comeTesto(buf), 0, buf.length, raccolto);
  const int = raccolto.intestazioni;
  return {
    oggetto:   decodificaParole(int.get('subject') || ''),
    da:        decodificaParole(int.get('from') || ''),
    a:         decodificaParole(int.get('to') || ''),
    data:      int.get('date') || '',
    messageId: (int.get('message-id') || '').replace(/^<|>$/g, ''),
    testo:     raccolto.testo.trim(),
    allegati:  raccolto.allegati,
    /* L'albero dei pezzi, uno per riga. Serve a capire cosa e' arrivato
       davvero quando un pacchetto non da' gli allegati che dovrebbe: ogni
       produzione impacchetta la posta a modo suo, e senza questo si
       tirerebbe a indovinare. */
    struttura: raccolto.struttura,
    intestazione: n => int.get(String(n).toLowerCase()) || ''
  };
}

export const _prova = { decodificaParole, leggiParametri, daQuotedPrintable, decodifica2231 };

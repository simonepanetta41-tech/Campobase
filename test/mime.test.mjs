const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// Il percorso si calcola, quindi l'import e' dinamico: uno statico non
// accetta un'espressione.
const { leggiMessaggio, _prova } = await import(RADICE + '/worker/mime.js');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(104) + ` atteso ${JSON.stringify(exp)}`); };

const B = s => Buffer.from(s, 'binary');
const pdf = Buffer.from('%PDF-1.4\nORDINE DEL GIORNO N.20\n%%EOF\n', 'utf8');
const b64 = pdf.toString('base64').replace(/(.{76})/g, '$1\r\n');

// Un inoltro come lo fa Outlook: multipart/mixed, corpo in quoted-printable,
// dentro un message/rfc822 col pacchetto vero.
const dentro = [
  'From: Produzione <produzione@filmfinto.it>',
  'To: simone.panetta@filmfinto.it',
  'Subject: =?utf-8?Q?Ordine_del_giorno_n=C2=B0_20_=E2=80=94_luned=C3=AC?=',
  'Date: Mon, 9 Nov 2026 19:12:04 +0100',
  'Message-ID: <abc123@filmfinto.it>',
  'Content-Type: multipart/mixed; boundary="INT"',
  '',
  '--INT',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'In allegato l=E2=80=99ordine del giorno di domani.',
  'Partenza ore 07=2E00.',
  '',
  '--INT',
  'Content-Type: application/pdf',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment;',
  " filename*0*=utf-8''Ordine%20del%20giorno%20n%C2%B0%2020%20;",
  " filename*1*=%E2%80%94%20luned%C3%AC.pdf",
  '',
  b64,
  '--INT',
  'Content-Type: image/png; name="logo.png"',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment; filename="logo.png"',
  '',
  Buffer.from('PNGFINTO').toString('base64'),
  '--INT--',
  ''
].join('\r\n');

const fuori = [
  'From: "Panetta, Simone" <simone.panetta@filmfinto.it>',
  'To: 9f3a2b1c8d7e6f50@campobase.dev',
  'Subject: FW: Ordine del giorno',
  'Message-ID: <inoltro@outlook.com>',
  'Date: Mon, 9 Nov 2026 19:20:00 +0100',
  'Content-Type: multipart/mixed; boundary="EST"',
  '',
  '--EST',
  'Content-Type: text/plain; charset="utf-8"',
  '',
  'Inoltrato.',
  '',
  '--EST',
  'Content-Type: message/rfc822',
  'Content-Disposition: attachment; filename="Ordine del giorno.eml"',
  '',
  dentro,
  '--EST--',
  ''
].join('\r\n');

console.log('\n── un inoltro di Outlook ──');
const m = leggiMessaggio(new Uint8Array(B(fuori)));
ok('oggetto di fuori', m.oggetto, 'FW: Ordine del giorno');
ok('a chi era',        m.a, '9f3a2b1c8d7e6f50@campobase.dev');
ok('message-id senza parentesi', m.messageId, 'inoltro@outlook.com');
ok('apre la mail dentro e trova i PDF', m.allegati.map(a => a.nome),
   ['Ordine del giorno n° 20 — lunedì.pdf', 'logo.png']);
ok('il PDF e\' intatto', Buffer.from(m.allegati[0].byte).toString('utf8'), pdf.toString('utf8'));
ok('e il tipo giusto',  m.allegati[0].tipo, 'application/pdf');
ok('il corpo di dentro, con gli apostrofi veri',
   /l’ordine del giorno di domani/.test(m.testo), true);
ok('e il punto non diventa =2E', /Partenza ore 07\.00\./.test(m.testo), true);

console.log('\n── un messaggio semplice, senza multipart ──');
const piano = B(['From: a@b.it','Subject: Prova','Content-Type: text/plain; charset=utf-8','','Due righe.','E basta.',''].join('\r\n'));
const s = leggiMessaggio(new Uint8Array(piano));
ok('niente allegati', s.allegati.length, 0);
ok('il testo c\'e\'',  s.testo, 'Due righe.\nE basta.');

console.log('\n── un solo allegato, niente corpo ──');
const solo = B(['From: a@b.it','Subject: X','Content-Type: application/pdf','Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment; filename="piano.pdf"','', Buffer.from('%PDF-solo').toString('base64'),''].join('\r\n'));
const u = leggiMessaggio(new Uint8Array(solo));
ok('lo prende lo stesso', u.allegati.map(a => a.nome), ['piano.pdf']);
ok('con dentro il file',  Buffer.from(u.allegati[0].byte).toString('utf8'), '%PDF-solo');

console.log('\n── intestazioni ripiegate e parole codificate ──');
const rip = B(['From: a@b.it','Subject: =?utf-8?B?T3JkaW5lIGRlbCBnaW9ybm8=?=',
  ' =?utf-8?B?IG7CsCAyMQ==?=','Content-Type: text/plain','','x',''].join('\r\n'));
ok('rimesse in fila', leggiMessaggio(new Uint8Array(rip)).oggetto, 'Ordine del giorno n° 21');
ok('Q encoding: _ e\' spazio', _prova.decodificaParole('=?utf-8?Q?due_parole?='), 'due parole');
ok('2231 con accenti', _prova.decodifica2231("utf-8''Reggia%20di%20Caserta%20%E2%80%94%20D20.pdf"),
   'Reggia di Caserta — D20.pdf');
ok('parametri tra virgolette', _prova.leggiParametri('application/pdf; name="a b.pdf"').par.name, 'a b.pdf');

console.log('\n── righe con solo LF, come le scrivono certi gateway ──');
const lf = B(['From: a@b.it','Subject: LF','Content-Type: multipart/mixed; boundary="X"','',
  '--X','Content-Type: text/plain','','ciao','--X--',''].join('\n'));
ok('letto uguale', leggiMessaggio(new Uint8Array(lf)).testo, 'ciao');

console.log('\n── l\'albero dei pezzi ──');
const alb = leggiMessaggio(new Uint8Array(B(fuori))).struttura;
ok('dice com\'e\' fatto il pacchetto', alb, [
  'multipart/mixed',
  '  text/plain',
  '  message/rfc822',
  '    multipart/mixed',
  '      text/plain',
  '      application/pdf «Ordine del giorno n° 20 — lunedì.pdf»',
  '      image/png «logo.png»'
]);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);

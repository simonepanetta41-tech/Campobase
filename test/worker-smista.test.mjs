/* Lo smistamento: capire cos'e' un allegato dal contenuto, quando il nome
 * non lo dice (worker/smista.js).
 *
 * E' la via di mezzo: coi nomi chiari non deve cambiare niente e non deve
 * costare niente. Entra solo quando c'e' un PDF che non si capisce E manca
 * qualcosa. E se sbaglia o non risponde, si resta come prima.
 */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(52)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

const BASE = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave', ANTHROPIC_API_KEY: 'sk-finta',
               VAPID_PRIVATA: 'woQ2JLSHiHdgAJQzBzmqSTt8O7FTeTXjePDUGT8rlNQ' };
const ACCESO = { ...BASE, OMBRA_SCRIVE: 'si' };

/* Un ordine del giorno di un giorno che deve ancora venire, letto bene. */
const LETTO = {
  numero: '25', data: '2099-01-10', convocazione: '12.30', prontiAGirare: '13.30', pausa: 'Continuato',
  catering: '12.45', cestini: '130', fineRiprese: '19.00', fineLavorazione: '19.30',
  ambiente: 'CHIESA PAESE', pagine: '6 6/8', meteo: 'Nuvoloso', ospedale: 'OSPEDALE SAN GIUSEPPE MOSCATI - VIA PER MARTINA FRANCA',
  dawn: '06:36', alba: '07.03', tramonto: '17.59', dusk: '18.25',
  luoghi: [{ nome: 'CB/ MEZZI TECNICI', url: 'https://maps.app.goo.gl/abc?g_st=iw', indirizzo: '' },
           { nome: 'PARCHEGGIO', url: '', indirizzo: 'senza link' }],
  contatti: [{ ruolo: 'Direttore di prod.', nome: 'Attilio Montagna', tel: '333 9973678' }],
  scene: [{ n: '58END', ie: 'I', m: 'G', ambiente: 'CHIESA PAESE', sinossi: 'Il tesoro.', ids: '1, 2', pag: '6 6/8' },
          { n: '', nota: 'TRASFERIMENTO' }],
  cast: [{ id: '1', ruolo: 'PRINCIPE COLONNA', interprete: 'ROCCO PAPALEO', scene: '58END', pickup: '11.00', set: '13.15' },
         { id: '8', ruolo: 'INVITATI', interprete: '', scene: '58END', pickup: '--', set: '14.00' }],
  troupe: [{ reparto: 'SUONO', ruolo: 'Microfonista', nome: 'S. Panetta', partenza: '', set: '12.30' },
           { reparto: 'FOTOGRAFIA', ruolo: 'Data Manager', nome: 'V. Leone', partenza: '13.30', set: '' },
           { reparto: 'COSTUMI', ruolo: 'Costumista', nome: 'R. Aprea', partenza: '', set: 'O.C.' }],
  fabbisogni: [{ reparto: 'Suono', voci: [{ scene: '58END', cosa: 'Playback' }, { scene: '', cosa: '' }] }],
  domani: { etichetta: 'MARTEDI 17', scene: [{ n: '2', ie: 'E', m: 'N' }], fabbisogni: [] },
  tratte: [
    { autista: 'Luca Cammarosano Van', tel: '339 8408475', partenza: '12.00', arrivo: '12.30', luogo: 'TURSPORT HOTEL RESIDENCE',
      destinazione: 'SET', passeggeri: ['F.Lombardi', 'D.De Angelis', 'S.Panetta'] },
    { autista: 'Luca Cammarosano', tel: '3398408475', partenza: '13.00', luogo: 'TURSPORT HOTEL RESIDENCE', passeggeri: ['V.Leone'] },
    { autista: 'Antonio Varriale', partenza: '12.30', luogo: 'SET', passeggeri: [] }]
};

// ── Il mondo finto ──────────────────────────────────────────────────────────
let T, modello, rotto, documenti, smista, smistati, indice, indici;
function mondo() {
  T = { projects: [{ id: 'f1', casella: 'abc123', titolo: 'Missione San Gennaro', user_id: 'u1', mittente: null, marcatore: null }],
        film_membri: [{ project_id: 'f1', user_id: 'u1' }, { project_id: 'f1', user_id: 'u2' }, { project_id: 'f1', user_id: 'u3' }],
        profiles: [{ id: 'u1', nome: 'Simone', cognome: 'Panetta' }, { id: 'u2', nome: 'Valerio', cognome: 'Leone' },
                   { id: 'u3', nome: 'Rossella', cognome: 'Aprea' }],
        posta: [], odg: [], push_appuntamenti: [], push_iscrizioni: [] };
  rotto = null; documenti = null; smista = []; smistati = []; indice = []; indici = 0;
  modello = () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify(LETTO) }] }), { status: 200 });
}
function passa(r, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    const [op, ...resto] = v.split('.'); const val = resto.join('.'); const c = r[k];
    if (op === 'is' && val === 'null' && c != null) return false;
    if (op === 'eq' && String(c) !== val) return false;
    if (op === 'neq' && String(c) === val) return false;
    if (op === 'in' && !val.replace(/[()"]/g, '').split(',').includes(String(c))) return false;
    if (op === 'gte' && !(c >= val)) return false;
    if (op === 'lt' && !(c != null && c < val)) return false;
  }
  return true;
}
let seq = 0;
globalThis.fetch = async (url, opz = {}) => {
  const u = new URL(url); const R = (x, s = 200) => new Response(x === null ? null : JSON.stringify(x), { status: s });
  if (u.hostname === 'api.anthropic.com') {
    const corpo = JSON.parse(opz.body);
    if (/stralci del giorno/.test(corpo.system)) {              // e' l'indice degli stralci
      indici++;
      if (indice === null) return new Response('{"error":"overloaded"}', { status: 529 });
      return new Response(JSON.stringify({ usage: {}, content: [{ type: 'text', text: typeof indice === 'string' ? indice : JSON.stringify(indice) }] }), { status: 200 });
    }
    if (/numerati/.test(corpo.system)) {                       // e' lo smistamento
      smistati.push(corpo.messages[0].content.filter(c => c.type === 'document').length);
      if (smista === null) return new Response('{"error":"overloaded"}', { status: 529 });
      return new Response(JSON.stringify({ usage: {}, content: [{ type: 'text', text: JSON.stringify(smista.map((tipo, i) => ({ n: i + 1, tipo }))) }] }), { status: 200 });
    }
    documenti = corpo.messages[0].content.filter(c => c.type === 'text').map(c => c.text.split(' (')[0] + (/\(([^)]*)\)/.exec(c.text) ? ' ' + /\(([^)]*)\)/.exec(c.text)[1] : ''));
    return modello();
  }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) return R({ signedURL: '/object/sign/x?token=t' });
  if (u.pathname.startsWith('/storage/v1/object/')) return R({ Key: 'ok' });
  const tav = u.pathname.replace('/rest/v1/', '');
  if (!(tav in T)) return R({ message: 'tavola ignota ' + tav }, 404);
  if (rotto === tav && (opz.method || 'GET') !== 'GET') return R({ message: 'guasto finto' }, 500);
  const params = [...u.searchParams.entries()];
  const met = opz.method || 'GET';
  if (met === 'GET') {
    const t = T[tav].filter(r => passa(r, params));
    if (u.searchParams.get('order') === 'ricevuta.desc') t.sort((a, b) => String(b.ricevuta).localeCompare(String(a.ricevuta)));
    return R(t.slice(0, +(u.searchParams.get('limit') || 1000)));
  }
  if (met === 'PATCH') {
    let corpo; try { corpo = JSON.parse(opz.body); } catch { return R({ message: 'invalid json' }, 400); }
    const t = T[tav].filter(r => passa(r, params)); t.forEach(r => Object.assign(r, corpo)); return R(t);
  }
  if (met === 'POST') {
    const chiave = u.searchParams.get('on_conflict');
    for (const n of [].concat(JSON.parse(opz.body))) {
      const gia = chiave && T[tav].find(r => chiave.split(',').every(k => String(r[k]) === String(n[k])));
      if (gia) Object.assign(gia, n); else T[tav].push({ id: 'n' + (++seq), ...(tav === 'posta' ? { ricevuta: new Date().toISOString(), ombra_stato: null, ombra: null, ombra_il: null } : {}), ...n });
    }
    return R(null, 201);
  }
  return R(null, 204);
};

const CONFINE = 'xxB';
function mail(nomi, oggetto = 'I: MSG - ODG #25 del 14.11.2026') {
  const pdf = Buffer.from('%PDF-1.4 finto').toString('base64');
  const corpo = ['From: simone <s@hotmail.it>', 'To: abc123@campobase.dev', 'Subject: ' + oggetto, 'Message-ID: <' + (++seq) + '@x>',
    'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${CONFINE}"`, '', `--${CONFINE}`, 'Content-Type: text/plain', '', 'ecco', ''];
  for (const n of nomi) corpo.push(`--${CONFINE}`, `Content-Type: application/pdf; name="${n}"`, 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${n}"`, '', pdf, '');
  corpo.push(`--${CONFINE}--`, '');
  const byte = new TextEncoder().encode(corpo.join('\r\n'));
  return { to: 'abc123@campobase.dev', from: 's@hotmail.it', rawSize: byte.length,
           raw: new ReadableStream({ start(c) { c.enqueue(byte); c.close(); } }), setReject() {} };
}
const ODG = 'MSG - ODG _25 del 14.11.2026.pdf', GIRI = '25 MSG - GIRI AUTO di Sabato 14.11.pdf';
const posta = await import(RADICE + '/worker/posta.js');
const { leggiInOmbra } = await import(RADICE + '/worker/ombra.js');
const { rilasciaInRitardo } = await import(RADICE + '/worker/scrive.js');
const titoli = () => T.push_appuntamenti.filter(a => a.genere === 'posta').map(a => a.testo.split('\n')[0]);


const SI = { ...BASE, OMBRA_SCRIVE: 'si', SMISTA: 'si' };
const arriva = async (nomi, env = SI) => { mondo(); await posta.riceviPosta(mail(nomi, 'I: documenti del giorno'), env, {}); return T.posta[0].stato; };
const { genereDi, dubbi } = await import(RADICE + '/worker/smista.js');
const FOGLIO = 'Foglio giovedi 16.04.pdf', MOV = 'Movimenti 16.04.pdf', LISTA = 'Lista camere.pdf';

console.log('\n── ⚠ coi nomi chiari non cambia niente e non costa niente ──');
ok('la mail aspetta il server, come prima', await arriva([ODG, GIRI]), 'al server');
ok('letta', await leggiInOmbra(SI), 'fatta');
ok('⚠ lo smistamento non è stato chiamato', smistati, []);
ok('e si leggono gli stessi due documenti', documenti, ['ORDINE DEL GIORNO ' + ODG, 'GIRI AUTO ' + GIRI]);
ok('stralci, DOOD e alloggi non sono "dubbi"', dubbi([ODG, 'Stralci Gio 16 Apr.pdf', 'MSG_DOOD.pdf', 'MSG_ACCOMMODATION.pdf', 'MSG_PDL7.pdf', 'foto.jpg']
  .map(n => ({ nome: n, tenuto: true, percorso: n, byte: 9 }))).length, 0);

console.log('\n── i giri auto con un nome qualunque ──');
ok('aspetta il server', await arriva([ODG, MOV]), 'al server');
smista = ['giri'];
ok('letta', await leggiInOmbra(SI), 'fatta');
ok('si è guardato un allegato solo: quello dubbio', smistati, [1]);
ok('ed è stato letto come giri auto', documenti, ['ORDINE DEL GIORNO ' + ODG, 'GIRI AUTO ' + MOV]);
ok('resta scritto accanto all\'allegato', T.posta[0].allegati.map(a => [a.genere || null, !!a.smistato]), [[null, false], ['giri', true]]);
ok('e l\'app lo trova fra i file del giorno', T.odg[0].dati.allegati.map(a => a.tipo), ['odg', 'giri']);

console.log('\n── ⚠ nemmeno l\'ordine del giorno ha un nome riconoscibile ──');
ok('aspetta il server, senza notifiche', [await arriva([FOGLIO, MOV, LISTA]), T.push_appuntamenti.length], ['al server', 0]);
smista = ['odg', 'giri', 'altro'];
ok('letta', await leggiInOmbra(SI), 'fatta');
ok('i tre allegati guardati insieme, una volta', smistati, [3]);
ok('letti quelli giusti, la lista camere no', documenti, ['ORDINE DEL GIORNO ' + FOGLIO, 'GIRI AUTO ' + MOV]);
ok('ordine del giorno scritto, mail chiusa', [T.odg.length, T.posta[0].stato], [1, 'fatta']);
ok('con la notifica personale', T.push_appuntamenti.filter(a => a.genere === 'posta').every(a => /^OdG 25/.test(a.testo)), true);

console.log('\n── ⚠ non era roba per il server ──');
ok('aspetta', await arriva([LISTA, 'Modulo.pdf']), 'al server');
smista = ['altro', 'altro'];
ok('guardata e lasciata', await leggiInOmbra(SI), 'saltata: smistata, al telefono');
ok('torna al telefono con la notifica di sempre, una a testa', [T.posta[0].stato, T.push_appuntamenti.map(a => a.testo.split('\n')[0])], ['nuova', Array(3).fill('Nuova posta dalla produzione')]);
ok('nessun ordine del giorno scritto', T.odg.length, 0);
ok('e al passaggio dopo non si riguarda', [await leggiInOmbra(SI), smistati.length], ['niente da leggere', 1]);
/* Un piano dal nome strano, col piano dal server spento: tocca al telefono, tutta. */
await arriva([ODG, 'Strisce novembre.pdf']); smista = ['pdl'];
ok('un piano non riconosciuto dal nome, piano spento: al telefono', [await leggiInOmbra(SI), T.posta[0].stato, T.odg.length], ['saltata: smistata, al telefono', 'nuova', 0]);
await arriva([ODG, 'Strisce novembre.pdf'], { ...SI, PIANO_SCRIVE: 'si' }); smista = ['pdl'];
await leggiInOmbra({ ...SI, PIANO_SCRIVE: 'si' });
ok('col piano acceso: ordine del giorno scritto, la mail aspetta il piano', [T.odg.length, T.posta[0].stato, genereDi(T.posta[0].allegati[1])], [1, 'al server', 'pdl']);

console.log('\n── ⚠ lo smistamento non risponde o sbaglia ──');
await arriva([ODG, MOV]); smista = null;
ok('con l\'ordine del giorno riconosciuto si va avanti lo stesso', await leggiInOmbra(SI), 'fatta');
ok('e l\'allegato dubbio va al lettore col dubbio, come prima', documenti, ['ORDINE DEL GIORNO ' + ODG, 'ALTRO ALLEGATO ' + MOV]);
await arriva([FOGLIO, MOV]); smista = null;
ok('senza ordine del giorno riconosciuto: al telefono', [await leggiInOmbra(SI), T.posta[0].stato], ['saltata: smistata, al telefono', 'nuova']);
await arriva([FOGLIO, MOV]); smista = ['odg', 'odg'];
await leggiInOmbra(SI);
ok('due "ordini del giorno": vale il primo, l\'altro non si legge', [documenti, T.posta[0].allegati.map(a => a.genere)], [['ORDINE DEL GIORNO ' + FOGLIO], ['odg', 'altro']]);
await arriva([ODG, MOV]); smista = ['odg'];
await leggiInOmbra(SI);
ok('⚠ l\'ordine del giorno riconosciuto dal nome non si scavalca', documenti[0], 'ORDINE DEL GIORNO ' + ODG);

console.log('\n── spento: tutto come prima ──');
const SPENTO = { ...BASE, OMBRA_SCRIVE: 'si' };
ok('un nome sconosciuto e basta: al telefono subito', [await arriva([FOGLIO, MOV], SPENTO), titoli()[0]], ['nuova', 'Nuova posta dalla produzione']);
await arriva([ODG, MOV], SPENTO); await leggiInOmbra(SPENTO);
ok('con l\'ordine del giorno: l\'allegato col dubbio, niente smistamento', [documenti[1], smistati], ['ALTRO ALLEGATO ' + MOV, []]);
/* Senza che il server scriva l'ordine del giorno non c'e' niente da aspettare. */
ok('smistamento acceso ma server spento: al telefono', await arriva([FOGLIO, MOV], { ...BASE, SMISTA: 'si' }), 'nuova');

console.log('\n── l\'indice degli stralci: a che pagina comincia ogni scena ──');
const { indicePulito, allegatoStralci } = await import(RADICE + '/worker/stralci.js');
const STR = 'Stralci Gio 16 Apr.pdf';
const CON = { ...BASE, OMBRA_SCRIVE: 'si', STRALCI: 'si' };
ok('pulito: numeri, pagine, intestazioni', indicePulito([{ n: '2', p: 1, testa: 'EST.  CASA ANDREA - GIORNO' }, { n: '93', p: 2, testa: 'x' }, { n: ' 65c ', p: 2 }]),
   [{ n: '2', p: 1, testa: 'EST. CASA ANDREA - GIORNO' }, { n: '93', p: 2, testa: 'x' }, { n: '65C', p: 2, testa: '' }]);
/* Sul foglio c'e' stampato "149.": e' la pagina della sceneggiatura intera, non del file. */
ok('⚠ il numero stampato sul foglio non è la pagina del file', indicePulito([{ n: '93', p: 149 }, { n: '94', p: 150 }]), []);
ok('⚠ pagine che tornano indietro: non ci si fida di niente', indicePulito([{ n: '2', p: 1 }, { n: '93', p: 5 }, { n: '94', p: 3 }]), []);
ok('una scena due volte, o senza numero: si scarta quella', indicePulito([{ n: '2', p: 1 }, { n: '2', p: 2 }, { n: 'TITOLI', p: 2 }, { n: '', p: 3 }, { n: '5', p: 'tre' }]).map(x => x.n), ['2']);
ok('una risposta che non è una lista', indicePulito({ scene: [] }), []);
ok('lo stralcio si trova dal nome', allegatoStralci([{ nome: ODG, tenuto: true, percorso: 'a' }, { nome: STR, tenuto: true, percorso: 'b' }]).nome, STR);
ok('o da quello che ha detto lo smistamento', allegatoStralci([{ nome: 'letture.pdf', tenuto: true, percorso: 'b', smistato: true, genere: 'stralci' }]).nome, 'letture.pdf');
ok('un "altro" che si chiama stralci non lo è più', allegatoStralci([{ nome: STR, tenuto: true, percorso: 'b', smistato: true, genere: 'altro' }]), null);

mondo(); await posta.riceviPosta(mail([ODG, GIRI, STR]), CON, {});
indice = [{ n: '2', p: 1, testa: 'EST. CASA ANDREA - GIORNO' }, { n: '93', p: 2, testa: 'EST/INT. CASA DI ANDREA - GIORNO' }];
ok('letta', await leggiInOmbra(CON), 'fatta');
ok('l\'indice arriva all\'app con l\'ordine del giorno', T.odg[0].dati.stralciIndice.map(x => x.n + '@' + x.p), ['2@1', '93@2']);
ok('e resta scritto accanto alla lettura', T.posta[0].ombra.info.stralci.length, 2);
mondo(); await posta.riceviPosta(mail([ODG, GIRI, STR]), CON, {}); indice = null;
ok('⚠ se l\'indice non riesce l\'ordine del giorno si scrive lo stesso', [await leggiInOmbra(CON), T.odg.length, T.odg[0].dati.stralciIndice], ['fatta', 1, undefined]);
mondo(); await posta.riceviPosta(mail([ODG, GIRI, STR]), CON, {}); indice = 'non lo so';
ok('⚠ e anche se risponde a parole', [await leggiInOmbra(CON), T.odg.length], ['fatta', 1]);
mondo(); await posta.riceviPosta(mail([ODG, GIRI]), CON, {});
ok('senza stralci nella mail non si chiede niente', [await leggiInOmbra(CON), indici], ['fatta', 0]);
mondo(); await posta.riceviPosta(mail([ODG, GIRI, STR]), { ...BASE, OMBRA_SCRIVE: 'si' }, {});
ok('spento: non si chiede niente', [await leggiInOmbra({ ...BASE, OMBRA_SCRIVE: 'si' }), indici, T.odg[0].dati.stralciIndice], ['fatta', 0, undefined]);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);

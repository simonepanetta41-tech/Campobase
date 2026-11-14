/* Il piano di lavorazione letto e scritto dal server (worker/piano.js).
 *
 * Un piano sbagliato non si vede subito come un ordine del giorno
 * sbagliato: sposta le date di un mese e ce ne si accorge tre settimane
 * dopo. Quindi qui si controlla soprattutto quando il server NON deve
 * scrivere: letture che non stanno in piedi, piani piu' vecchi di quello
 * in uso, e tutto quello che nella mail non e' il piano (DOOD, memo).
 */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(54)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

const BASE = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave', ANTHROPIC_API_KEY: 'sk-finta',
               VAPID_PRIVATA: 'woQ2JLSHiHdgAJQzBzmqSTt8O7FTeTXjePDUGT8rlNQ' };
const PIANO = { ...BASE, PIANO_SCRIVE: 'si' };
const TUTTO = { ...BASE, PIANO_SCRIVE: 'si', OMBRA_SCRIVE: 'si' };

const { genereDalNome } = await import(RADICE + '/worker/ombra.js');
const { pianoPerApp, pianoLeggibile, pianoUnisci, pianoPiuVecchio, notificaPiano, leggiPiano } = await import(RADICE + '/worker/piano.js');

console.log('\n── cosa è il piano e cosa no, dal nome ──');
for (const n of ['MSG_PDL7_03.11_1.pdf', 'MSG_PDL_5_17.10.pdf', 'MSG_-_PDL6_30.10.pdf', 'PDL8.pdf', 'IS_PDL_23.02.26.pdf',
                 'MSG - Piano di Lavorazione rev3.pdf']) ok(n, genereDalNome(n), 'pdl');
for (const n of ['MSG_DOOD_03.11.pdf', 'MSG_PDL7_DOOD.pdf', 'MSG Day Out Of Days.pdf', 'MSG_ACCOMMODATION NAPOLI.pdf',
                 'MSG - Stralci DAY _25.pdf', 'MSG_PDL7.xlsx', 'Spdl.pdf']) ok('⚠ ' + n, genereDalNome(n), null);
ok('l\'ordine del giorno resta ordine del giorno', genereDalNome('MSG - ODG _25 del 14.11.2026.pdf'), 'odg');

/* Un piano letto: tre giornate a cavallo di una fine settimana, un viaggio. */
const sc = (n, piu = {}) => ({ n, ie: 'EXT', m: 'Giorno', ambiente: 'STRADE BIANCHE', luogo: 'GINOSA', cast: ['1', '2'], pag: '1 1/8', note: '', ...piu });
const GS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MM = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
/* La riga di chiusura come la stampa il piano, col giorno della settimana giusto. */
const chiusura = (n, data, pag = '1') => { const d = new Date(data + 'T12:00:00Z');
  return `End of Day ${n} -- ${GS[d.getUTCDay()]} ${d.getUTCDate()} ${MM[d.getUTCMonth()]} ${d.getUTCFullYear()} -- ${pag} Pag --`; };
const giorno = (n, data, piu = {}) => ({ n, data, chiusura: chiusura(n, data, piu.pagine), gs: '', orario: '', inizio: '', fine: '', pagine: '1 1/8', fineSettimana: null, scene: [sc('1')], ...piu });
const LETTO = (piu = {}) => ({ titolo: 'MISSIONE SAN GENNARO', regista: '', versione: 'PdL 8 del 12 Novembre 2099',
  attori: [{ id: '1', ruolo: 'PRINCIPE COLONNA' }, { id: '2', ruolo: 'GIUSEPPE NAVARRA' }, { id: '3M', ruolo: 'PAOLINO' }, { id: '4', ruolo: 'TERESA NAVARRA' }],
  giorni: [
    giorno(25, '2099-11-14', { orario: '12 / 19', inizio: '12.00', fine: '19.00', pagine: '7/8', fineSettimana: 5,
      scene: [sc('58End', { ie: 'INT', m: 'Notte', luogo: '', ambiente: 'CHIESA PAESE', note: 'STUNT', pag: '7/8' })] }),
    giorno(26, '2099-11-17', { orario: '16 / 24 oppure 17 / 01', inizio: '16', fine: '24', pagine: '3 3/8',
      scene: [sc('2', { m: 'Alba', ie: 'I/E' }), sc('3Apt', { m: 'Tramonto', luogo: 'ASCALESI', pag: '2 2/8' }), sc('', {})] }),
    giorno(27, '2099-11-18', { orario: 'TBD', inizio: '', fine: 'TBD', pagine: '2', scene: [sc('3Pt', { pag: '2' })] })],
  viaggi: [{ data: '2099-11-16', destinazione: 'Napoli', etichetta: 'lunedì 16 novembre -- TRASFERIMENTO TROUPE A NAPOLI --' },
           { data: '2099-11-17', destinazione: 'Roma', etichetta: '' }, { data: 'boh', destinazione: 'X' }], ...piu });

console.log('\n── dalla lettura al piano dell\'app ──');
const p = pianoPerApp(LETTO(), Date.parse('2099-11-12T18:00:00Z'));
const g = p.settimane.flatMap(s => s.giorni);
ok('le settimane come le segna il piano', p.settimane.map(s => [s.numero, s.label, s.giorni.length]), [[5, 'Settimana 5', 1], [6, 'Settimana 6', 2]]);
ok('gli orari nella forma dell\'app', [g[0].ora_inizio, g[0].ora_fine], ['12:00', '19:00']);
ok('"16 / 24 oppure 17 / 01": il primo, e incerto', [g[1].ora_inizio, g[1].ora_fine, g[1].ora_incerta], ['16:00', '00:00', true]);
ok('⚠ senza orario è TBD, non un orario inventato', [g[2].ora_inizio, g[2].ora_fine], ['TBD', 'TBD']);
ok('il giorno della settimana dalla data', [g[0].giorno_settimana, g[1].giorno_settimana], ['Saturday', 'Tuesday']);
ok('giorno, notte, alba, tramonto', [g[0].scene[0].momento, g[1].scene[0].momento, g[1].scene[1].momento, g[2].scene[0].momento], ['N', 'M', 'E', 'D']);
ok('il numero di scena com\'è scritto', g.flatMap(x => x.scene.map(s => s.numero)), ['58End', '2', '3Apt', '3Pt']);
ok('una striscia senza numero non è una scena', g[1].scene.length, 2);
ok('il posto; se manca, l\'ambiente', [g[0].scene[0].location, g[1].scene[1].location], ['CHIESA PAESE', 'ASCALESI']);
ok('il posto più frequente della giornata', g[1].location_principale, 'GINOSA');
ok('lo stunt dalle note', [g[0].scene[0].stunt, g[1].scene[0].stunt], [true, false]);
ok('i totali', [p.totale_giorni, p.totale_scene, p.data_inizio, p.data_fine], [3, 4, '2099-11-14', '2099-11-18']);
ok('il viaggio, e solo in un giorno senza riprese', p.giorni_viaggio, [{ data: '2099-11-16', etichetta: 'TRASFERIMENTO NAPOLI' }]);
ok('scritto dal server, col suo timbro', [p.daServer, p.caricatoIl], [true, '2099-11-12T18:00:00.000Z']);
ok('senza settimane segnate: a sei giornate', pianoPerApp(LETTO({ giorni: Array.from({ length: 8 }, (_, i) =>
  giorno(i + 1, '2099-01-' + String(i + 1).padStart(2, '0'))) })).settimane.map(s => s.giorni.length), [6, 2]);
/* Un segno di fine settimana saltato dal modello unisce due settimane: non sposta niente. */
ok('le settimane dai segni "FINE Na SETTIMANA"', pianoPerApp(LETTO({ giorni: [1, 2, 3, 4, 5, 6, 7].map(i =>
  giorno(i, '2099-01-0' + i, { fineSettimana: i === 2 ? 3 : i === 5 ? 4 : null })) })).settimane.map(s => [s.numero, s.giorni.length]), [[3, 2], [4, 3], [5, 2]]);

console.log('\n── ⚠ la data si legge dalla riga copiata, non da quello che ha capito il modello ──');
/* Successo davvero, alla seconda lettura del PdL 5: le righe giuste
   davanti e quindici date spostate di un giorno. */
const spostato = pianoPerApp(LETTO({ giorni: LETTO().giorni.map((x, i) => i === 1 ? { ...x, data: '2099-11-16' } : x) }));
ok('la data scritta male dal modello si corregge dalla riga', spostato.settimane.flatMap(s => s.giorni)[1].data, '2099-11-17');
ok('e il piano resta buono', pianoLeggibile(spostato), null);
ok('⚠ riga e data d\'accordo ma col giorno della settimana sbagliato: no',
   pianoLeggibile(pianoPerApp(LETTO({ giorni: LETTO().giorni.map((x, i) => i === 1 ? { ...x, chiusura: 'End of Day 26 -- lunedì 17 novembre 2099 -- 3/8 Pag --' } : x) }))),
   'la giornata 26: il 2099-11-17 non è il giorno della settimana scritto sul piano');
ok('⚠ la riga di un\'altra giornata: no',
   pianoLeggibile(pianoPerApp(LETTO({ giorni: LETTO().giorni.map((x, i) => i === 1 ? { ...x, chiusura: chiusura(27, '2099-11-18') } : x) }))),
   'la chiusura della giornata 26 parla della giornata 27');
ok('⚠ niente con cui controllare la data: no',
   pianoLeggibile(pianoPerApp(LETTO({ giorni: LETTO().giorni.map(x => ({ ...x, chiusura: '', gs: '' })) }))).slice(0, 51),
   'la giornata 25 non ha il giorno della settimana per');
ok('senza riga ma col giorno della settimana giusto: sì',
   pianoLeggibile(pianoPerApp(LETTO({ giorni: LETTO().giorni.map(x => ({ ...x, chiusura: '', gs: GS[new Date(x.data + 'T12:00:00Z').getUTCDay()] })) }))), null);
/* Visto davvero: le due scene dell'ultima giornata finite in quella prima. */
ok('⚠ una scena finita nella giornata accanto: le pagine non tornano',
   pianoLeggibile(pianoPerApp(LETTO({ giorni: LETTO().giorni.map((x, i) => i === 1 ? { ...x, scene: x.scene.slice(0, 1) } : i === 2 ? { ...x, scene: [...x.scene, sc('3Apt', { pag: '2 2/8' })] } : x) }))).slice(0, 72),
   'la giornata 26: le pagine delle scene non fanno il totale della giornata');
ok('⚠ troppe giornate senza pagine da controllare', /senza pagine con cui controllare/.test(
   pianoLeggibile(pianoPerApp(LETTO({ giorni: LETTO().giorni.map(x => ({ ...x, pagine: '' })) })))), true);
ok('"I/E" è INT/EXT', g[1].scene[0].int_ext, 'INT/EXT');
ok('l\'orario dal testo copiato, anche se il modello lo sbaglia',
   (({ ora_inizio, ora_fine, ora_incerta }) => [ora_inizio, ora_fine, ora_incerta])(pianoPerApp(LETTO({ giorni: LETTO().giorni.map((x, i) =>
     i === 0 ? { ...x, orario: '13.30 / 21.30', inizio: '13.00', fine: '21.00' } : x) })).settimane[0].giorni[0]), ['13:30', '21:30', false]);

console.log('\n── ⚠ un piano che non sta in piedi non si scrive ──');
const cattivo = (piu) => pianoLeggibile(pianoPerApp(LETTO(piu)));
ok('letto bene', pianoLeggibile(p), null);
ok('una giornata sola', cattivo({ giorni: LETTO().giorni.slice(0, 1) }), 'meno di due giornate');
ok('nessuna scena', cattivo({ giorni: LETTO().giorni.map(x => ({ ...x, scene: [], pagine: '' })) }), 'nessuna scena');
ok('una giornata senza data', cattivo({ giorni: LETTO().giorni.map((x, i) => i === 1 ? { ...x, data: '17/11', chiusura: 'End of Day 26', gs: '' } : x) }), 'la giornata 26 non ha la data');
ok('la stessa giornata due volte', cattivo({ giorni: [...LETTO().giorni, giorno(27, '2099-11-19')] }), 'la giornata 27 compare due volte');
ok('date che tornano indietro', cattivo({ giorni: LETTO().giorni.map((x, i) => i === 2 ? giorno(27, '2099-11-15') : x) }), 'le giornate 26 e 27 non sono in ordine');
ok('troppe giornate vuote', cattivo({ giorni: LETTO().giorni.map((x, i) => i ? { ...x, scene: [], pagine: '' } : x) }), '2 giornate su 3 senza scene');
ok('⚠ una giornata vuota che sul piano ha delle pagine: manca qualcosa', /non fanno il totale/.test(cattivo({ giorni: LETTO().giorni.map((x, i) => i ? { ...x, scene: [] } : x) })), true);

console.log('\n── il piano nuovo sopra quello che c\'è ──');
const VECCHIO = { titolo: 'MSG', versione: 'PdL 7 del 3 Novembre 2099', totale_giorni: 4, totale_scene: 4,
  giorni_viaggio: [{ data: '2099-11-02', etichetta: 'TRASFERIMENTO TARANTO' }, { data: '2099-11-20', etichetta: 'TRASFERIMENTO ROMA' }],
  settimane: [{ numero: 1, label: 'Settimana 1', giorni: [
      { numero_giorno: 23, data: '2099-11-12', scene: [{ numero: '63Pt' }] }, { numero_giorno: 24, data: '2099-11-13', scene: [{ numero: '16' }] }] },
    { numero: 2, label: 'Settimana 2', giorni: [
      { numero_giorno: 25, data: '2099-11-14', scene: [{ numero: 'VECCHIA' }] }, { numero_giorno: 26, data: '2099-11-17', scene: [{ numero: 'VECCHIA2' }] }] }] };
const u = pianoUnisci(p, VECCHIO);
const ug = u.settimane.flatMap(s => s.giorni);
ok('le giornate già girate restano', ug.map(x => x.numero_giorno), [23, 24, 25, 26, 27]);
ok('da lì in poi vale il piano nuovo', ug[2].scene[0].numero, '58End');
ok('una settimana rimasta vuota sparisce', u.settimane.map(s => s.giorni.length), [2, 1, 2]);
ok('i totali si ricontano', [u.totale_giorni, u.totale_scene, u.data_inizio, u.data_fine], [5, 6, '2099-11-12', '2099-11-18']);
ok('i viaggi passati restano, i futuri sono i nuovi', u.giorni_viaggio.map(v => v.data), ['2099-11-02', '2099-11-16']);
ok('senza un piano prima: quello nuovo e basta', pianoUnisci(p, null).totale_giorni, 3);
ok('⚠ un piano più vecchio si riconosce dal numero', pianoPiuVecchio('PdL 6 del 30 Ottobre 2099', 'PdL 7 del 3 Novembre 2099'), true);
ok('e dalla data, se il numero non c\'è', pianoPiuVecchio('PDL del 30.10.2099', 'PDL del 03.11.2099'), true);
ok('"PDL del 30.10" non è la versione 30', pianoPiuVecchio('PDL del 30.10.2099', 'PdL 7 del 3 Novembre 2099'), true);
ok('lo stesso piano non è più vecchio', pianoPiuVecchio('PdL 7 del 3 Novembre 2099', 'PdL 7 del 3 Novembre 2099'), false);
ok('nel dubbio passa', pianoPiuVecchio('piano nuovo', 'PdL 7'), false);
/* Visto su un piano vero: "PDL 02 SETTEMBRE". Il 2 e' il giorno, non la
   versione: letto come versione, il piano del 2 ottobre sarebbe stato
   "piu' vecchio" di quello del 30 settembre. */
ok('⚠ "PDL 30 SETTEMBRE" poi "PDL 02 OTTOBRE": è più nuovo', pianoPiuVecchio('PDL 02 OTTOBRE', 'PDL 30 SETTEMBRE', '2099'), false);
ok('⚠ e al contrario è più vecchio', pianoPiuVecchio('PDL 30 SETTEMBRE', 'PDL 02 OTTOBRE', '2099'), true);
ok('data senza anno, a cavallo di capodanno', pianoPiuVecchio('PDL 08 GENNAIO', 'PDL 20 DICEMBRE', '2099'), false);
ok('"PdL 7 del 3 Novembre" resta la versione 7', pianoPiuVecchio('PdL 7 del 3 Novembre 2099', 'PdL 8 del 1 Novembre 2099'), true);
ok('la notifica', notificaPiano(u), 'Nuovo piano di lavorazione!\nPdL 8 del 12 Novembre 2099 · fino al 18 novembre');

// ── Il mondo finto ──────────────────────────────────────────────────────────
let T, risposte, rotto, chiamate;
const ODG_LETTO = { numero: '25', data: '2099-01-10', convocazione: '12.30', fineLavorazione: '19.30', catering: '',
  troupe: [{ reparto: 'SUONO', ruolo: 'Microfonista', nome: 'S. Panetta', partenza: '', set: '12.30' }], scene: [], cast: [], tratte: [] };
function mondo() {
  T = { projects: [{ id: 'f1', casella: 'abc123', titolo: 'Missione San Gennaro', user_id: 'u1', mittente: null, marcatore: null }],
        film_membri: [{ project_id: 'f1', user_id: 'u1' }, { project_id: 'f1', user_id: 'u2' }],
        profiles: [{ id: 'u1', nome: 'Simone', cognome: 'Panetta' }, { id: 'u2', nome: 'Valerio', cognome: 'Leone' }],
        analyses: [{ id: 'a1', project_id: 'f1', created_at: '2099-01-01' }],
        pdl_versions: [{ analysis_id: 'a1', user_id: 'u1', data: JSON.parse(JSON.stringify(VECCHIO)), shooting_data: { 24: { scenes: { 16: 'done' } } } }],
        cast_list: [{ id: 'c1', analysis_id: 'a1', user_id: 'u1', character_id: 1, nome: 'COLONNA', minore: false, fonte: 'provvisoria', pose_stimate: 12 }],
        posta: [], odg: [], push_appuntamenti: [], push_iscrizioni: [] };
  rotto = null; chiamate = [];
  risposte = { pdl: () => LETTO(), odg: () => ODG_LETTO, stop: 'end_turn', stato: 200 };
}
function passa(r, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    const [op, ...resto] = v.split('.'); const val = resto.join('.'); const c = r[k];
    if (op === 'is' && val === 'null' && c != null) return false;
    if (op === 'eq' && String(c) !== val) return false;
    if (op === 'neq' && String(c) === val) return false;
    if (op === 'in' && !val.replace(/[()"]/g, '').split(',').includes(String(c))) return false;
    if (op === 'ilike' && !new RegExp('^' + val.replace(/\*/g, '.*') + '$', 'i').test(String(c || ''))) return false;
    if (op === 'gte' && !(c >= val)) return false;
    if (op === 'lt' && !(c != null && c < val)) return false;
  }
  return true;
}
let seq = 0;
globalThis.fetch = async (url, opz = {}) => {
  const u = new URL(url); const R = (x, s = 200) => new Response(x === null ? null : JSON.stringify(x), { status: s });
  if (u.hostname === 'api.anthropic.com') {
    const corpo = JSON.parse(opz.body); const cosa = /PIANO DI LAVORAZIONE/.test(corpo.messages[0].content[0].text) ? 'pdl' : 'odg';
    chiamate.push(cosa);
    if (risposte.stato !== 200) return new Response('{"error":"overloaded"}', { status: risposte.stato });
    const t = risposte[cosa](); 
    return R({ stop_reason: risposte.stop, usage: {}, content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t) }] });
  }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) return R({ signedURL: '/object/sign/x?token=t' });
  if (u.pathname.startsWith('/storage/v1/object/')) return R({ Key: 'ok' });
  const tav = u.pathname.replace('/rest/v1/', '');
  if (!(tav in T)) return R({ message: 'tavola ignota ' + tav }, 404);
  const met = opz.method || 'GET';
  if (rotto === tav && met !== 'GET') return R({ message: 'guasto finto' }, 500);
  if (rotto === 'cast-nuovo' && tav === 'cast_list' && met === 'POST' && JSON.parse(opz.body).some(r => r.nome === 'LA VOLPE')) return R({ message: 'guasto finto' }, 500);
  if (met === 'DELETE') { const via = T[tav].filter(r => passa(r, [...u.searchParams.entries()])); T[tav] = T[tav].filter(r => !via.includes(r)); return R(null, 204); }
  if (rotto === 'colonne' && tav === 'posta' && /piano_stato/.test(u.search + (opz.body || ''))) return R({ code: '42703', message: 'column posta.piano_stato does not exist' }, 400);
  const params = [...u.searchParams.entries()];
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
      if (gia) Object.assign(gia, n);
      else T[tav].push({ id: 'n' + (++seq), ...(tav === 'posta' ? { ricevuta: new Date().toISOString(), ombra_stato: null, ombra: null,
        ombra_il: null, piano_stato: null, piano: null, piano_il: null } : {}), ...n });
    }
    return R(null, 201);
  }
  return R(null, 204);
};
const CONFINE = 'xxB';
function mail(nomi, oggetto = 'I: MSG - PDL 8') {
  const corpo = ['From: simone <s@hotmail.it>', 'To: abc123@campobase.dev', 'Subject: ' + oggetto, 'Message-ID: <' + (++seq) + '@x>',
    'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${CONFINE}"`, '', `--${CONFINE}`, 'Content-Type: text/plain', '', 'ecco', ''];
  for (const n of nomi) corpo.push(`--${CONFINE}`, `Content-Type: application/pdf; name="${n}"`, 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${n}"`, '', Buffer.from('%PDF-1.4 ' + n).toString('base64'), '');
  corpo.push(`--${CONFINE}--`, '');
  const byte = new TextEncoder().encode(corpo.join('\r\n'));
  return { to: 'abc123@campobase.dev', from: 's@hotmail.it', rawSize: byte.length,
           raw: new ReadableStream({ start(c) { c.enqueue(byte); c.close(); } }), setReject() {} };
}
const PDL = 'MSG_PDL8_12.11.pdf', DOOD = 'MSG_DOOD_12.11.pdf', ODG = 'MSG - ODG _25 del 14.11.2026.pdf';
const posta = await import(RADICE + '/worker/posta.js');
const { leggiInOmbra } = await import(RADICE + '/worker/ombra.js');
const { rilasciaInRitardo } = await import(RADICE + '/worker/scrive.js');
const titoli = () => T.push_appuntamenti.filter(a => a.genere === 'posta').map(a => a.testo.split('\n')[0]);
const piano = () => T.pdl_versions[0].data;
/* Il cron: prima l'ordine del giorno, e il piano solo se quello non ha letto niente. */
const cron = async (env) => { const o = await leggiInOmbra(env); return [o.split(':')[0], /^(niente da leggere|spenta|saltata|già presa)/.test(o) ? await leggiPiano(env) : '—']; };

console.log('\n── ⚠ spento: il piano lo legge il telefono, come prima ──');
mondo();
await posta.riceviPosta(mail([PDL, DOOD]), BASE, {});
ok('la mail è "nuova", con la notifica del piano', [T.posta[0].stato, titoli()[0]], ['nuova', 'Nuovo piano di lavorazione!']);
ok('il server lo legge in ombra', (await cron(BASE))[1], 'fatta');
ok('e mette la lettura accanto alla mail', [T.posta[0].piano_stato, T.posta[0].piano.letto.versione], ['fatta', 'PdL 8 del 12 Novembre 2099']);
ok('⚠ ma il piano della troupe non lo tocca', piano().versione, 'PdL 7 del 3 Novembre 2099');
ok('⚠ del DOOD non legge niente: una chiamata sola', chiamate, ['pdl']);

console.log('\n── acceso: il server scrive il piano ──');
mondo();
await posta.riceviPosta(mail([PDL, DOOD]), PIANO, {});
ok('la mail aspetta il server, senza notifiche', [T.posta[0].stato, T.push_appuntamenti.length], ['al server', 0]);
ok('letto', (await cron(PIANO))[1], 'fatta');
ok('il piano nuovo è dove i telefoni lo cercano', [piano().versione, piano().daServer], ['PdL 8 del 12 Novembre 2099', true]);
ok('con le giornate già girate', piano().settimane.flatMap(s => s.giorni).map(x => x.numero_giorno), [23, 24, 25, 26, 27]);
ok('⚠ le scene segnate a mano restano', T.pdl_versions[0].shooting_data, { 24: { scenes: { 16: 'done' } } });
ok('la mail è chiusa', [T.posta[0].stato, T.posta[0].nota], ['fatta', 'piano scritto dal server']);
ok('una notifica a testa', T.push_appuntamenti.map(a => a.testo), Array(2).fill('Nuovo piano di lavorazione!\nPdL 8 del 12 Novembre 2099 · fino al 18 novembre'));
ok('resta scritto com\'è andata', [T.posta[0].piano.scritto.scritto, T.posta[0].piano.scritto.tenute], [true, 2]);

console.log('\n── la lista del cast dalla legenda del piano ──');
const elenco = () => T.cast_list.map(c => [c.character_id, c.nome, c.minore, c.fonte]);
ok('la lista ufficiale prende il posto della provvisoria', elenco(), [[1, 'PRINCIPE COLONNA', false, 'ufficiale'], [2, 'GIUSEPPE NAVARRA', false, 'ufficiale'],
   [3, 'PAOLINO', true, 'ufficiale'], [4, 'TERESA NAVARRA', false, 'ufficiale']]);
ok('attaccata allo spoglio del film', T.cast_list.every(c => c.analysis_id === 'a1' && c.user_id === 'u1'), true);
ok('resta scritto', T.posta[0].piano.scritto.cast, { fatto: true, personaggi: 4, prima: 1 });
{ const { aggiornaCast } = await import(RADICE + '/worker/piano.js');
  const ids = T.cast_list.map(c => c.id).join();
  ok('uguale a quella che c\'è: non si tocca', [(await aggiornaCast(PIANO, 'a1', 'u1', LETTO().attori)).motivo, T.cast_list.map(c => c.id).join() === ids], ['già uguale', true]);
  ok('⚠ legenda mancante o monca: non si tocca', [(await aggiornaCast(PIANO, 'a1', 'u1', [{ id: '1', ruolo: 'X' }])).fatto, T.cast_list.length], [false, 4]);
  rotto = 'cast-nuovo';
  const r = await aggiornaCast(PIANO, 'a1', 'u1', [...LETTO().attori, { id: '5', ruolo: 'LA VOLPE' }]);
  ok('⚠ se l\'inserimento fallisce torna quella di prima', [r.fatto, !!r.errore, T.cast_list.map(c => c.nome).length], [false, true, 4]);
  rotto = null; }

console.log('\n── ⚠ il server non ce la fa: torna al telefono ──');
const cade = async (nome, prepara, motivo) => {
  mondo(); await posta.riceviPosta(mail([PDL]), PIANO, {}); prepara(); await cron(PIANO);
  ok(nome + ': torna "nuova", con la notifica di sempre', [T.posta[0].stato, titoli()], ['nuova', Array(2).fill('Nuovo piano di lavorazione!')]);
  ok(nome + ': il piano della troupe è quello di prima', piano().versione, 'PdL 7 del 3 Novembre 2099');
  if (motivo) ok(nome + ': e si sa perché', motivo.test(T.posta[0].nota), true);
};
await cade('il modello non risponde', () => { risposte.stato = 529; });
await cade('lettura troncata', () => { risposte.stop = 'max_tokens'; }, /troncata/);
await cade('risposta che non è JSON', () => { risposte.pdl = () => '{"titolo":"MSG","giorni":[{"n":1'; });
await cade('date in disordine', () => { risposte.pdl = () => LETTO({ giorni: LETTO().giorni.map((x, i) => i === 2 ? giorno(27, '2099-11-15') : x) }); }, /non sono in ordine/);
await cade('giorno della settimana che non torna', () => { risposte.pdl = () => LETTO({ giorni: LETTO().giorni.map((x, i) => i === 1 ? { ...x, chiusura: 'End of Day 26 -- lunedì 17 novembre 2099 --' } : x) }); }, /giorno della settimana/);
await cade('la scrittura fallisce', () => { rotto = 'pdl_versions'; });
await cade('il film non ha uno spoglio', () => { T.analyses = []; }, /spoglio/);

console.log('\n── ⚠ un piano più vecchio di quello in uso ──');
mondo(); await posta.riceviPosta(mail(['MSG_PDL6_30.10.pdf']), PIANO, {});
risposte.pdl = () => LETTO({ versione: 'PdL 6 del 30 Ottobre 2099' });
await cron(PIANO);
ok('non si scrive', piano().versione, 'PdL 7 del 3 Novembre 2099');
ok('la mail si chiude senza passare dal telefono', [T.posta[0].stato, /più vecchio/.test(T.posta[0].nota)], ['fatta', true]);
ok('e senza notifiche', T.push_appuntamenti.length, 0);

console.log('\n── ordine del giorno e piano nella stessa mail ──');
mondo(); await posta.riceviPosta(mail([ODG, PDL, DOOD]), TUTTO, {});
ok('aspetta il server', T.posta[0].stato, 'al server');
ok('primo minuto: l\'ordine del giorno', await cron(TUTTO), ['fatta', '—']);
ok('scritto, ma la mail resta aperta per il piano', [T.odg.length, T.posta[0].stato], [1, 'al server']);
ok('secondo minuto: il piano', await cron(TUTTO), ['niente da leggere', 'fatta']);
ok('tutti e due a posto, mail chiusa', [T.odg.length, piano().versione, T.posta[0].stato], [1, 'PdL 8 del 12 Novembre 2099', 'fatta']);
ok('due notifiche a testa, una per cosa', T.push_appuntamenti.filter(a => a.user_id === 'u1' && a.genere === 'posta').map(a => a.testo.split('\n')[0].slice(0, 9)).sort(), ['Nuovo pia', 'OdG 25 · ']);
ok('due letture, del DOOD nessuna', chiamate, ['odg', 'pdl']);
/* Con una mail cosi' i minuti sono due: non si rilascia a quattro. */
mondo(); await posta.riceviPosta(mail([ODG, PDL]), TUTTO, {});
ok('a cinque minuti aspetta ancora', await rilasciaInRitardo(TUTTO, Date.now() + 5 * 60000), 0);
ok('a nove si arrende', [await rilasciaInRitardo(TUTTO, Date.now() + 9 * 60000), T.posta[0].stato], [1, 'nuova']);

console.log('\n── ⚠ un pezzo al server e uno al telefono: tutta al telefono ──');
mondo(); await posta.riceviPosta(mail([ODG, PDL]), { ...BASE, OMBRA_SCRIVE: 'si' }, {});
ok('piano spento, ordine del giorno acceso', T.posta[0].stato, 'nuova');
mondo(); await posta.riceviPosta(mail([ODG, PDL]), PIANO, {});
ok('piano acceso, ordine del giorno spento', T.posta[0].stato, 'nuova');
mondo(); await posta.riceviPosta(mail([DOOD, 'MSG_ACCOMMODATION.pdf']), TUTTO, {});
ok('solo DOOD e alloggi: niente per il server', [T.posta[0].stato, titoli()[0]], ['nuova', 'Nuova posta dalla produzione']);

console.log('\n── il resto ──');
mondo(); await posta.riceviPosta(mail([PDL]), PIANO, {}); await cron(PIANO);
await posta.riceviPosta(mail([PDL], 'Fwd: PDL 8'), PIANO, {}); T.posta[1].ricevuta = new Date(Date.now() + 1000).toISOString();
ok('lo stesso piano inoltrato due volte: una lettura', [(await cron(PIANO))[1], chiamate.length, T.posta[1].stato], ['saltata: doppione', 1, 'fatta']);
ok('e una notifica sola a testa', T.push_appuntamenti.length, 2);
mondo(); T.posta.push({ id: 'pr', project_id: 'f1', stato: 'prova', oggetto: 'prova pdl 7', ricevuta: '2026-01-01T00:00:00Z', ombra_stato: 'saltata',
  piano_stato: null, allegati: [{ nome: 'MSG_PDL7_03.11_1.pdf', tenuto: true, percorso: 'prova/pdl/7.pdf', byte: 9 }] });
ok('una prova si legge', await leggiPiano(PIANO), 'fatta');
ok('⚠ ma non scrive niente e non avvisa nessuno', [piano().versione, T.push_appuntamenti.length, T.posta[0].piano_stato], ['PdL 7 del 3 Novembre 2099', 0, 'fatta']);
mondo(); await posta.riceviPosta(mail([ODG]), BASE, {});
ok('una mail senza piano si segna e non si riguarda', [await leggiPiano(BASE), T.posta[0].piano_stato, await leggiPiano(BASE)], ['niente da leggere', 'saltata', 'niente da leggere']);
/* sql/piano.sql non ancora lanciato: l'ordine del giorno deve andare lo stesso. */
mondo(); rotto = 'colonne'; await posta.riceviPosta(mail([ODG]), TUTTO, {});
let errore = null; const o = await leggiInOmbra(TUTTO); try { await leggiPiano(TUTTO); } catch (e) { errore = /piano_stato/.test(e.message); }
ok('⚠ senza le colonne il piano fallisce da solo', errore, true);
ok('⚠ e l\'ordine del giorno si scrive e si chiude lo stesso', [o, T.odg.length, T.posta[0].stato], ['fatta', 1, 'fatta']);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);

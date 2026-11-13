/* La lettura in ombra dell'ordine del giorno, sul Worker.
 *
 * Il Worker legge l'OdG e i giri auto appena arriva la mail e scrive il
 * risultato in una colonna a parte, che nessuno usa: serve a confrontarlo
 * con la lettura del telefono prima di fidarsi.
 *
 * Qui il modello e' finto, quindi NON si controlla se legge bene: quello
 * lo dicono solo le serate di prova con i fogli veri. Si controlla il
 * meccanismo, e soprattutto le tre cose che lo rendono innocuo:
 *   - i PDF non passano dal Worker (10 ms di CPU): al modello va un
 *     indirizzo firmato, non i byte;
 *   - due passaggi del cron non leggono la stessa mail due volte;
 *   - qualunque guasto resta scritto nella riga, e non esce da qui.
 */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ENV = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave', ANTHROPIC_API_KEY: 'sk-finta' };

let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(50)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

const fa = m => new Date(Date.now() - m * 60000).toISOString();
const LETTO = { numero: '24', data: '2026-11-13', convocazione: '13.00', fineRiprese: '20.30', fineLavorazione: '21.00',
  scene: [{ n: '16' }], cast: [], troupe: [],
  tratte: [{ partenza: '12.30', luogo: 'TURSPORT HOTEL RESIDENCE', passeggeri: ['S.Panetta', 'D.De Angelis'] }] };

let posta, chiamate, modello, firme;
function azzera(righe) {
  posta = righe; chiamate = []; firme = [];
  modello = () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 9000, output_tokens: 4000 },
    content: [{ type: 'text', text: JSON.stringify(LETTO) }] }), { status: 200 });
}
const riga = (piu = {}) => ({ id: 'p1', project_id: 'f1', oggetto: 'I: MSG - ODG #24', stato: 'nuova', ricevuta: fa(5),
  ombra: null, ombra_stato: null, ombra_il: null,
  allegati: [
    { nome: 'MSG_-_ODG_24_del_13.11.2026.pdf', tenuto: true, byte: 693900, percorso: 'f1/p1/MSG_-_ODG_24_del_13.11.2026.pdf' },
    { nome: 'MSG_-_Giri_Auto_DAY_24.pdf', tenuto: true, percorso: 'f1/p1/MSG_-_Giri_Auto_DAY_24.pdf' },
    { nome: 'MSG_-_Stralci_DAY_24.pdf', tenuto: true, percorso: 'f1/p1/MSG_-_Stralci_DAY_24.pdf' },
    { nome: 'logo.png', tenuto: false }
  ], ...piu });

/* Un PostgREST finto quanto basta: eq, is.null, in, gte, lt. */
function passa(r, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    const [op, ...resto] = v.split('.'); const val = resto.join('.');
    const campo = r[k];
    if (op === 'is' && val === 'null' && campo != null) return false;
    if (op === 'eq' && String(campo) !== val) return false;
    if (op === 'neq' && String(campo) === val) return false;
    if (op === 'in' && !val.replace(/[()"]/g, '').split(',').includes(String(campo))) return false;
    if (op === 'gte' && !(campo >= val)) return false;
    if (op === 'lt' && !(campo != null && campo < val)) return false;
  }
  return true;
}
globalThis.fetch = async (url, opz = {}) => {
  const u = new URL(url);
  if (u.hostname === 'api.anthropic.com') { chiamate.push(JSON.parse(opz.body)); return modello(); }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) {
    const via = decodeURIComponent(u.pathname.replace('/storage/v1/object/sign/', ''));
    firme.push(via);
    return new Response(JSON.stringify({ signedURL: '/object/sign/' + via + '?token=abc' }), { status: 200 });
  }
  const params = [...u.searchParams.entries()];
  const trovate = posta.filter(r => passa(r, params));
  if ((opz.method || 'GET') === 'GET') {
    if (u.searchParams.get('order') === 'oggetto.asc') trovate.sort((x, y) => String(x.oggetto).localeCompare(String(y.oggetto)));
    else trovate.sort((x, y) => String(y.ricevuta).localeCompare(String(x.ricevuta)));
    return new Response(JSON.stringify(trovate.slice(0, +(u.searchParams.get('limit') || 100))), { status: 200 });
  }
  if (opz.method === 'PATCH') {
    /* Postgres rifiuta un corpo che non e' JSON: e' cosi' che il Worker
       scopre che il modello ha risposto male, senza controllarlo lui. */
    let corpo; try { corpo = JSON.parse(opz.body); } catch { return new Response('{"message":"invalid input syntax for type json"}', { status: 400 }); }
    trovate.forEach(r => Object.assign(r, corpo));
    return new Response(JSON.stringify(trovate), { status: 200 });
  }
  return new Response('[]', { status: 200 });
};

const { leggiInOmbra, genereDalNome } = await import(RADICE + '/worker/ombra.js');

console.log('\n── che documento è, dal nome ──');
ok('ordine del giorno', genereDalNome('MSG_-_ODG_24_del_13.11.2026.pdf'), 'odg');
ok('con gli spazi',     genereDalNome('MSG - ODG _24 del 13.11.2026.pdf'), 'odg');
ok('call sheet',        genereDalNome('Call Sheet Day 12.pdf'), 'odg');
ok('giri auto',         genereDalNome('MSG_-_Giri_Auto_DAY_24.pdf'), 'giri');
ok('transport list',    genereDalNome('Transport List 12.pdf'), 'giri');
ok('gli stralci no',    genereDalNome('MSG_-_Stralci_DAY_24.pdf'), null);
ok('la mappa no',       genereDalNome('MSG - Mappa ODG 24.pdf'), null);
ok('un excel no',       genereDalNome('ODG 24.xlsx'), null);

console.log('\n── una mail con l\'ordine del giorno ──');
azzera([riga()]);
let esito = await leggiInOmbra(ENV);
ok('letta', esito, 'fatta');
ok('stato scritto nella riga', posta[0].ombra_stato, 'fatta');
ok('quello che ha letto, com\'è', posta[0].ombra.letto.fineLavorazione, '21.00');
ok('con i pick-up dei giri', posta[0].ombra.letto.tratte[0].partenza, '12.30');
ok('e come è andata', [posta[0].ombra.info.modello, posta[0].ombra.info.token_uscita, posta[0].ombra.info.file.length],
   ['claude-sonnet-5-5', 4000, 2]);

console.log('\n── ⚠ i PDF non passano dal Worker ──');
const doc = chiamate[0].messages[0].content.filter(b => b.type === 'document');
ok('due documenti: OdG e giri', doc.length, 2);
ok('per indirizzo, non per contenuto', doc.map(d => d.source.type), ['url', 'url']);
ok('indirizzi firmati di Storage', doc.every(d => /^https:\/\/finto\.supabase\.co\/storage\/v1\/object\/sign\/posta\/f1\/p1\/.+token=/.test(d.source.url)), true);
ok('gli stralci non si mandano', firme.some(f => /Stralci/.test(f)), false);
ok('nessun byte nel corpo', JSON.stringify(chiamate[0]).length < 12000, true);

console.log('\n── ⚠ due passaggi del cron non la leggono due volte ──');
azzera([riga()]);
const [a, b] = await Promise.all([leggiInOmbra(ENV), leggiInOmbra(ENV)]);
ok('una chiamata sola al modello', chiamate.length, 1);
ok('l\'altro passa oltre', [a, b].sort(), ['fatta', 'già presa']);
esito = await leggiInOmbra(ENV);
ok('e una volta fatta non si rifà', [esito, chiamate.length], ['niente da leggere', 1]);

console.log('\n── ⚠ lo stesso OdG inoltrato tre volte si legge una volta ──');
/* L'inoltro automatico, poi quello a mano: tre mail con lo stesso
   allegato. Ogni lettura e' una chiamata che si paga. */
azzera([riga({ id: 'p1', ricevuta: fa(3) }), riga({ id: 'p2', ricevuta: fa(20) }), riga({ id: 'p3', ricevuta: fa(40) })]);
const giri3 = [await leggiInOmbra(ENV), await leggiInOmbra(ENV), await leggiInOmbra(ENV), await leggiInOmbra(ENV)];
ok('una chiamata sola al modello', chiamate.length, 1);
ok('la più recente letta, le altre saltate', posta.map(r => r.ombra_stato).sort(), ['fatta', 'saltata', 'saltata']);
ok('e poi più niente', giri3[3], 'niente da leggere');
ok('si legge l\'ultima arrivata', posta.find(r => r.ombra_stato === 'fatta').id, 'p1');
/* Un OdG corretto e rimandato con lo stesso nome non e' un doppione: il
   file pesa diversamente, e quello va letto. */
const corretto = riga({ id: 'p4', ricevuta: fa(1) });
corretto.allegati = corretto.allegati.map(a => /ODG/.test(a.nome) ? { ...a, byte: 700123 } : a);
posta.push(corretto);
await leggiInOmbra(ENV);
ok('la versione corretta si legge', [posta.find(r => r.id === 'p4').ombra_stato, chiamate.length], ['fatta', 2]);

console.log('\n── le prove a mano: vecchie quanto si vuole, e per prime ──');
/* Dieci ordini del giorno gia' passati, caricati apposta per provare la
   lettura in un quarto d'ora invece che in dieci sere. */
azzera([riga({ id: 'vera', ricevuta: fa(5) }),
        riga({ id: 'pr2', stato: 'prova', oggetto: 'prova 22', ricevuta: '2026-01-01T00:00:00Z' }),
        riga({ id: 'pr1', stato: 'prova', oggetto: 'prova 20', ricevuta: '2026-01-01T00:00:00Z' })]);
await leggiInOmbra(ENV);
ok('prima la prova, in ordine di oggetto', posta.filter(r => r.ombra_stato === 'fatta').map(r => r.id), ['pr1']);
await leggiInOmbra(ENV); await leggiInOmbra(ENV);
/* Fra prove non si scartano doppioni: una prova si mette apposta. */
ok('tutte e due le prove lette', posta.filter(r => r.stato === 'prova').map(r => r.ombra_stato), ['fatta', 'fatta']);
ok('e poi tocca alla mail vera', posta.find(r => r.id === 'vera').ombra_stato, 'fatta');

console.log('\n── cosa non si legge ──');
azzera([riga({ allegati: [{ nome: 'MSG_ACCOMMODATION.pdf', tenuto: true, percorso: 'f1/p1/a.pdf' }] })]);
esito = await leggiInOmbra(ENV);
ok('una mail senza OdG: saltata, senza chiamare', [posta[0].ombra_stato, chiamate.length], ['saltata', 0]);
azzera([riga({ ricevuta: fa(60 * 48) })]);
ok('una mail di due giorni fa non si rincorre', await leggiInOmbra(ENV), 'niente da leggere');
azzera([riga({ stato: 'da verificare' })]);
ok('una mail messa da parte nemmeno', await leggiInOmbra(ENV), 'niente da leggere');
azzera([riga()]);
ok('spenta dalla variabile', await leggiInOmbra({ ...ENV, OMBRA: 'no' }), 'spenta');
ok('e non ha toccato niente', [posta[0].ombra_stato, chiamate.length], [null, 0]);

console.log('\n── ⚠ i guasti restano scritti, e non escono ──');
azzera([riga()]);
modello = () => new Response('{"error":{"message":"overloaded"}}', { status: 529 });
esito = await leggiInOmbra(ENV);
ok('il modello non risponde: errore', posta[0].ombra_stato, 'errore');
ok('col motivo', /529/.test(posta[0].ombra.errore), true);
ok('senza eccezioni fuori', /^errore/.test(esito), true);

azzera([riga()]);
modello = () => new Response(JSON.stringify({ stop_reason: 'max_tokens', usage: {},
  content: [{ type: 'text', text: '{"numero":"24","troupe":[{"nome":"A' }] }), { status: 200 });
await leggiInOmbra(ENV);
ok('risposta troncata e JSON rotto: errore', posta[0].ombra_stato, 'errore');
ok('col testo, per guardarlo', /"numero":"24"/.test(posta[0].ombra.testo || ''), true);

azzera([riga()]);
modello = () => new Response(JSON.stringify({ stop_reason: 'max_tokens', usage: {},
  content: [{ type: 'text', text: JSON.stringify(LETTO) }] }), { status: 200 });
await leggiInOmbra(ENV);
ok('fermata al tetto ma leggibile: tronca', posta[0].ombra_stato, 'tronca');

console.log('\n── una lettura rimasta a metà ──');
/* Se il cron viene chiuso mentre il modello risponde, la riga resta
   'in corso'. Dopo dieci minuti si riprova una volta. */
azzera([riga({ ombra_stato: 'in corso', ombra_il: fa(3), ombra: { tentativi: 1 } })]);
ok('da tre minuti: si lascia stare', await leggiInOmbra(ENV), 'niente da leggere');
azzera([riga({ ombra_stato: 'in corso', ombra_il: fa(15), ombra: { tentativi: 1 } })]);
ok('da un quarto d\'ora: si riprova', await leggiInOmbra(ENV), 'fatta');
azzera([riga({ ombra_stato: 'in corso', ombra_il: fa(15), ombra: { tentativi: 2 } })]);
esito = await leggiInOmbra(ENV);
ok('alla terza si dice che il tempo non basta', [posta[0].ombra_stato, chiamate.length], ['errore', 0]);
ok('e lo si scrive', /tempo scaduto/.test(posta[0].ombra.errore), true);

console.log('\n── il cron: prima le notifiche, poi l\'ombra ──');
const indice = (await import('node:fs')).readFileSync(RADICE + '/worker/index.js', 'utf8');
const corpo = indice.slice(indice.indexOf('async scheduled('), indice.indexOf('async email('));
ok('mandaScadute viene prima', corpo.indexOf('mandaScadute(env)') < corpo.indexOf('leggiInOmbra(env)'), true);
ok('e l\'ombra sta in un try suo', /try \{\s*const esito = await leggiInOmbra\(env\);/.test(corpo), true);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);

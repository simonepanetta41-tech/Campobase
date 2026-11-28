/* La conferma dell'inoltro di Gmail.
 * Chi vuole usare Campobase senza passare dall'amministrazione imposta
 * l'inoltro della sua Gmail verso la casella del film, e Gmail manda li'
 * un link da aprire. Il testo qui sotto e' quello di una mail vera, con
 * indirizzi e gettoni cambiati. */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(56)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

const VF = 'https://mail-settings.google.com/mail/vf-%5BANGjdJ_aaaaBBBB-cccc0D-eeeeFFFF_gggg%5D-kL48hhhhIIIIjjjj';
const TESTO = `collega.prova@gmail.com ha richiesto l'inoltro automatico
della posta al tuo indirizzo email 0123456789abcdef@campobase.dev.

Per consentire a collega.prova@gmail.com di inoltrare
automaticamente la posta al tuo indirizzo, fai clic sul link di
seguito per confermare la richiesta:

${VF}

Se il link non funziona, copialo e incollalo in una nuova finestra del browser.

Grazie per aver scelto Gmail.

Se hai fatto clic sul link per errore, fai clic su
questo link per annullare la verifica:
https://mail-settings.google.com/mail/uf-%5BANGjdJ-zzzz%5D-kL48hhhhIIIIjjjj

Per scoprire di più visita la pagina
http://support.google.com/mail/bin/answer.py?answer=184973.`;

let T;
globalThis.fetch = async (url, opz = {}) => {
  const u = new URL(url), tav = u.pathname.split('/').pop();
  const R = d => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (opz.method === 'POST') { (T[tav] = T[tav] || []).push(...[].concat(JSON.parse(opz.body))); return R([]); }
  return R((T[tav] || []).filter(r => [...u.searchParams.entries()].every(([k, v]) => !v.startsWith('eq.') || String(r[k]) === v.slice(3))));
};
const ENV = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave' };
const { confermaInoltro } = await import(RADICE + '/worker/posta.js');
const { avvisaConferma } = await import(RADICE + '/worker/push.js');

console.log('\n── si riconosce ──');
const G = 'Team di Gmail <forwarding-noreply@google.com>';
ok('⚠ la mail vera: il link di conferma e chi lo chiede', confermaInoltro({ mittente: 'bounce@google.com', mittente_vero: G, testo: TESTO }), { link: VF, da: 'collega.prova@gmail.com' });
ok('⚠ il link è quello che conferma, non quello che annulla', confermaInoltro({ mittente_vero: G, testo: TESTO }).link.includes('/vf-'), true);
ok('anche col mittente solo nella busta', !!confermaInoltro({ mittente: 'forwarding-noreply@google.com', testo: TESTO }), true);

console.log('\n── e non si confonde ──');
ok('⚠ stesso testo da un altro mittente: non è Gmail', confermaInoltro({ mittente_vero: 'Furbo <furbo@esempio.it>', testo: TESTO }), null);
ok('Gmail, ma senza link di conferma', confermaInoltro({ mittente_vero: G, testo: 'Inoltro attivato.' }), null);
ok('⚠ un link che somiglia ma non è di Google', confermaInoltro({ mittente_vero: G, testo: 'apri https://mail-settings.google.com.esempio.it/mail/vf-abc' }), null);
ok('la posta della produzione', confermaInoltro({ mittente_vero: 'Produzione <p@prod.it>', testo: 'In allegato ODG 35' }), null);

console.log('\n── lo viene a sapere chi ha aperto il film, e solo lui ──');
T = { film_membri: [{ user_id: 'capo', project_id: 'f1', ruolo: 'capo' }, { user_id: 'anna', project_id: 'f1', ruolo: 'membro' }] };
ok('una notifica al capo', [await avvisaConferma(ENV, { id: 'f1' }, 'collega.prova@gmail.com', 'p9'), T.push_appuntamenti.map(r => [r.user_id, r.testo, r.chiave])],
   [1, [['capo', "Gmail chiede conferma dell'inoltro\ncollega.prova@gmail.com · apri Troupe per confermare", 'capo:conferma:p9']]]);
T = { film_membri: [{ user_id: 'anna', project_id: 'f1', ruolo: 'membro' }] };
ok('film senza riga "capo": a chi l\'ha creato', [await avvisaConferma(ENV, { id: 'f1', user_id: 'io' }, '', 'p9'), T.push_appuntamenti[0].user_id], [1, 'io']);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);

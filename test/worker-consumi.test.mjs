/* Il contatore dei consumi.
 *
 * Ogni chiamata al modello lascia una riga con chi, per quale film, a che
 * scopo e quanti token. Tre cose contano:
 *   - una chiamata che parte da un telefono viene contata, con le sue etichette;
 *   - quello che arriva dal telefono (scopo, film) non si prende per buono
 *     alla cieca: un valore strano non finisce nel database;
 *   - il contatore non rompe mai niente: se la tabella non c'e', il
 *     telefono riceve la sua risposta lo stesso.
 */
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const RADICE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(56)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

const { rigaConsumo, segnaConsumo } = await import(RADICE + '/worker/consumi.js');
const { callAnthropic } = await import(RADICE + '/worker/shared.js');
const ENV = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'chiave', ANTHROPIC_API_KEY: 'k' };
const U = '11111111-1111-4111-8111-111111111111', F = '22222222-2222-4222-8222-222222222222';

let scritte = [], tabellaRotta = false, modelloRotto = false;
globalThis.fetch = async (url, opz) => {
  url = String(url);
  if (url.startsWith('https://api.anthropic.com')) {
    if (modelloRotto) return new Response(JSON.stringify({ error: { message: 'sovraccarico' } }), { status: 529 });
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ciao' }],
      usage: { input_tokens: 15900, output_tokens: 10400, cache_read_input_tokens: 300 } }), { status: 200 });
  }
  if (url === 'https://db.test/rest/v1/consumi') {
    if (tabellaRotta) return new Response('{"message":"relation \\"consumi\\" does not exist"}', { status: 404 });
    scritte.push({ riga: JSON.parse(opz.body), chiave: opz.headers.apikey }); return new Response('', { status: 201 });
  }
  throw new Error('chiamata inattesa: ' + url);
};
const chiama = async (chi, payload = { model: 'claude-sonnet-5-5', max_tokens: 100, messages: [] }) => {
  const attese = []; const r = await callAnthropic(ENV, payload, { waitUntil: p => attese.push(p) }, chi);
  const corpo = await r.text(); await Promise.all(attese); return [r.status, corpo.includes('ciao')];
};

console.log('\n── una riga pulita ──');
ok('i token e le etichette', rigaConsumo({ origine: 'server', scopo: 'odg', project_id: F, posta_id: U, modello: 'claude-sonnet-5-5',
     usage: { input_tokens: 15900, output_tokens: 10400 }, ms: 44210, esito: 'end_turn' }),
   { origine: 'server', scopo: 'odg', user_id: null, project_id: F, posta_id: U, modello: 'claude-sonnet-5-5',
     token_entrata: 15900, token_uscita: 10400, token_cache_letti: null, token_cache_scritti: null, ms: 44210, esito: 'end_turn' });
const strana = rigaConsumo({ scopo: "Spoglio'; drop table consumi;--", user_id: 'non-un-id', project_id: '<script>', usage: { input_tokens: -5, output_tokens: 'tanti' } });
ok('⚠ quello che arriva dal telefono si ripulisce', [strana.scopo, strana.user_id, strana.project_id, strana.token_entrata, strana.token_uscita, strana.origine],
   ['spogliodroptableconsumi--', null, null, null, null, 'telefono']);
ok('senza scopo: "altro"', rigaConsumo({ usage: { input_tokens: 1 } }).scopo, 'altro');

console.log('\n── ⚠ una chiamata dal telefono viene contata ──');
ok('il telefono riceve la sua risposta', await chiama({ user_id: U, rotta: 'analyze', scopo: 'spoglio', project_id: F }), [200, true]);
ok('una riga sola, con la chiave del server', [scritte.length, scritte[0].chiave], [1, 'chiave']);
ok('⚠ chi, quale film, a che scopo, quanti token', (({ origine, scopo, user_id, project_id, modello, token_entrata, token_uscita, token_cache_letti, esito }) =>
     [origine, scopo, user_id, project_id, modello, token_entrata, token_uscita, token_cache_letti, esito])(scritte[0].riga),
   ['telefono', 'spoglio', U, F, 'claude-sonnet-5-5', 15900, 10400, 300, 'end_turn']);
scritte = []; await chiama({ user_id: U, rotta: 'chat' });
ok('senza scopo dichiarato vale la rotta', scritte[0].riga.scopo, 'chat');
scritte = []; await chiama(undefined);
ok('una chiamata senza "chi" non si conta', scritte.length, 0);

console.log('\n── ⚠ il contatore non rompe niente ──');
tabellaRotta = true; scritte = [];
ok('senza la tabella, il telefono ha la risposta lo stesso', await chiama({ user_id: U, rotta: 'analyze', scopo: 'spoglio' }), [200, true]);
ok('e segnaConsumo dice solo di no', await segnaConsumo(ENV, { scopo: 'odg', usage: { input_tokens: 1 } }), false);
tabellaRotta = false;
ok('senza le chiavi del database non ci prova', await segnaConsumo({}, { scopo: 'odg', usage: { input_tokens: 1 } }), false);
ok('senza token non c\'è niente da contare', [await segnaConsumo(ENV, { scopo: 'odg', usage: {} }), scritte.length], [false, 0]);
modelloRotto = true; scritte = [];
ok('se il modello risponde con un errore, niente riga', [(await chiama({ user_id: U, rotta: 'chat' }))[0], scritte.length], [529, 0]);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);

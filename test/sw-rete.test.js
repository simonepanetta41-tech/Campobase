/* La pagina si apre anche quando la rete c'e' a meta'.
 *
 * Il service worker chiedeva sempre prima la rete e usava la copia salvata
 * solo se la richiesta falliva. Sotto terra non fallisce: resta appesa, e
 * lo schermo restava bianco.
 *   - la rete ha tre secondi; poi parte la copia salvata;
 *   - con la rete buona arriva sempre la versione nuova, come prima;
 *   - la risposta in ritardo aggiorna la copia per la volta dopo;
 *   - una pagina d'errore del server non sostituisce la copia buona;
 *   - i dati letti dal server (campobase-dati) sopravvivono a un deploy.
 * sw.js gira qui dentro con una rete e una dispensa finte.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(56)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };
const codice = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function mondo(rete) {
  const ascolti = {}, dispense = { 'campobase-vecchia': new Map(), 'campobase-apri': new Map(), 'campobase-dati': new Map() };
  const apri = n => (dispense[n] = dispense[n] || new Map());
  const R = (testo, status = 200, redirected = false) => ({ testo, body: testo, headers: {}, status, redirected, ok: status >= 200 && status < 300, clone() { return this; } });
  // Una risposta rifatta a mano: non porta piu' la traccia del reindirizzamento.
  class Risposta { constructor(body, init) { Object.assign(this, { testo: body, body, status: init.status, headers: init.headers, redirected: false, rifatta: true, ok: true }); } clone() { return this; } static error() { return R('errore', 0); } }
  const ctx = { console: { log() {}, warn() {}, error() {} }, URL, Promise, setTimeout, clearTimeout, Response: Risposta, Request: function (u) { this.url = u; },
    self: { addEventListener: (t, f) => { ascolti[t] = f; }, skipWaiting() {}, clients: { claim() {} }, location: { origin: 'https://campobase.dev' } },
    caches: { open: async n => ({ put: async (k, v) => { apri(n).set(String(k.url || k), v); }, add: async () => {}, match: async k => apri(n).get(String(k.url || k)) }),
      match: async k => { for (const m of Object.values(dispense)) if (m.has(String(k.url || k))) return m.get(String(k.url || k)); },
      keys: async () => Object.keys(dispense), delete: async n => { delete dispense[n]; return true; } },
    fetch: () => rete(R) };
  vm.createContext(ctx); vm.runInContext(codice, ctx);
  const nome = vm.runInContext('CACHE', ctx);
  const chiedi = async (indirizzo = 'https://campobase.dev/') => {
    let risposta, t = Date.now(); const attese = [];
    ascolti.fetch({ request: { method: 'GET', url: indirizzo, mode: 'navigate' }, respondWith: p => { risposta = p; }, waitUntil: p => attese.push(p) });
    try { const r = await risposta; return { testo: r.testo, redirected: r.redirected, ms: Date.now() - t, attese }; } catch (e) { return { errore: String(e.message || e), ms: Date.now() - t, attese }; }
  };
  return { chiedi, dispense, nome, apri, R, ascolti, attesa: vm.runInContext('ATTESA_RETE', ctx) };
}

(async () => {
  console.log('\n── la rete risponde ──');
  let m = mondo(R => Promise.resolve(R('nuova')));
  m.apri(m.nome).set('/index.html', m.R('salvata'));
  let r = await m.chiedi();
  ok('arriva la versione nuova, subito', [r.testo, r.ms < 200], ['nuova', true]);
  await Promise.all(r.attese); await new Promise(x => setTimeout(x, 20));
  ok('e la copia salvata si aggiorna', m.dispense[m.nome].get('/index.html').testo, 'nuova');

  console.log('\n── ⚠ la rete resta appesa ──');
  ok('l\'attesa è di tre secondi', m.attesa, 3000);
  let sblocca; m = mondo(R => new Promise(x => { sblocca = () => x(R('arrivata tardi')); }));
  m.apri(m.nome).set('/index.html', m.R('salvata'));
  r = await m.chiedi();
  ok('dopo tre secondi parte la copia salvata', [r.testo, r.ms >= 2900 && r.ms < 3600], ['salvata', true]);
  sblocca(); await Promise.all(r.attese); await new Promise(x => setTimeout(x, 20));
  ok('la risposta in ritardo aggiorna la copia per la volta dopo', m.dispense[m.nome].get('/index.html').testo, 'arrivata tardi');

  console.log('\n── la rete non c\'è ──');
  m = mondo(() => Promise.reject(new TypeError('Failed to fetch')));
  m.apri(m.nome).set('/index.html', m.R('salvata'));
  r = await m.chiedi();
  ok('la copia salvata, senza aspettare', [r.testo, r.ms < 200], ['salvata', true]);
  m = mondo(() => Promise.reject(new TypeError('Failed to fetch')));
  r = await m.chiedi();
  ok('senza copia salvata fallisce: non si inventa una pagina', !!r.errore, true);
  m = mondo(() => Promise.reject(new TypeError('Failed to fetch')));
  m.apri(m.nome).set('/index.html', m.R('app')); m.apri(m.nome).set('/admin.html', m.R('admin'));
  ok('ogni pagina ha la sua copia', [(await m.chiedi('https://campobase.dev/admin.html')).testo, (await m.chiedi('https://campobase.dev/index.html')).testo], ['admin', 'app']);

  console.log('\n── ⚠ Safari e le pagine arrivate con un reindirizzamento ──');
  /* /index.html il server lo reindirizza a /. Safari rifiuta una pagina
     salvata cosi': "Response served by service worker has redirections". */
  m = mondo(() => Promise.reject(new TypeError('Failed to fetch')));
  m.apri(m.nome).set('/index.html', m.R('salvata col giro', 200, true));
  r = await m.chiedi();
  ok('senza rete la copia si dà riconfezionata, senza il giro', [r.testo, r.redirected], ['salvata col giro', false]);
  m = mondo(R => Promise.resolve(R('pagina', 200, true)));
  let installata; m.ascolti.install({ waitUntil: p => { installata = p; } }); await installata;
  ok('e all\'installazione si mette da parte già pulita', [m.dispense[m.nome].get('/index.html').redirected, m.dispense[m.nome].get('/index.html').testo, m.dispense[m.nome].get('/').redirected], [false, 'pagina', false]);
  m = mondo(R => Promise.resolve(R('non trovata', 404)));
  m.ascolti.install({ waitUntil: p => { installata = p; } }); await installata;
  ok('un file che manca non si mette da parte al posto di quello buono', (m.dispense[m.nome] || new Map()).has('/index.html'), false);

  console.log('\n── ⚠ un errore del server ──');
  m = mondo(R => Promise.resolve(R('errore 500', 500)));
  m.apri(m.nome).set('/index.html', m.R('salvata'));
  r = await m.chiedi(); await Promise.all(r.attese); await new Promise(x => setTimeout(x, 20));
  ok('non prende il posto della copia buona', m.dispense[m.nome].get('/index.html').testo, 'salvata');

  console.log('\n── un deploy ──');
  m = mondo(R => Promise.resolve(R('x')));
  let fine; m.ascolti.activate({ waitUntil: p => { fine = p; } }); await fine;
  ok('⚠ via la versione vecchia; restano i dati salvati e il biglietto', Object.keys(m.dispense).sort(), ['campobase-apri', 'campobase-dati']);

  console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
  process.exit(ko ? 1 : 0);
})();

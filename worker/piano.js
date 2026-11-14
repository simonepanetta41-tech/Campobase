/* ══ IL PIANO DI LAVORAZIONE, LETTO DAL SERVER ═══════════════════════════
 *
 * Fin qui il piano che arriva per mail lo leggeva il primo telefono che
 * apriva l'app — e lo poteva salvare per tutti solo il telefono di chi ha
 * creato il film: quello di un collega lo leggeva e basta. Qui lo legge
 * il Worker, come fa con l'ordine del giorno (ombra.js, scrive.js).
 *
 * Due passi, e due interruttori.
 *
 *   La lettura parte da sola (si spegne con PIANO = "no"): il Worker
 *   legge ogni piano che arriva e mette quello che ha letto accanto alla
 *   mail (posta.piano), senza toccare niente. Serve a confrontarlo con il
 *   foglio prima di fidarsi.
 *
 *   Con PIANO_SCRIVE = "si" il Worker il piano lo scrive davvero, dove i
 *   telefoni lo cercano (pdl_versions), e avvisa la troupe. Se non ci
 *   riesce la mail torna al telefono, come per l'ordine del giorno.
 *
 * Le colonne sono in sql/piano.sql. Finche' non ci sono questo passaggio
 * fallisce da solo, in un try suo, e il resto del cron non se ne accorge.
 */
import { db, firma, ragionamento, genereDalNome } from './ombra.js';
import { rilascia } from './scrive.js';

const MODELLO = 'claude-sonnet-5-5';
const FINESTRA_ORE = 36;

export const PIANO_SYS = `Leggi un piano di lavorazione cinematografico (PDL) in PDF e restituisci SOLO un oggetto JSON minificato, senza testo attorno e senza backtick.

{"titolo":"","regista":"","versione":"","attori":[{"id":"1","ruolo":""}],"giorni":[{"n":16,"data":"YYYY-MM-DD","inizio":"12.00","fine":"20.00","incerto":false,"pagine":"4 4/8","settimana":4,"scene":[{"n":"37Pt","ie":"INT/EXT","m":"Giorno","ambiente":"","luogo":"","cast":["1","2"],"pag":"1 1/8","note":""}]}],"viaggi":[{"data":"YYYY-MM-DD","destinazione":"","etichetta":""}]}

Regole.
- versione: come scritta in testa al piano ("PdL 7 del 3 Novembre 2026").
- giorni: una voce per ogni giornata di riprese, nell'ordine del piano. Il piano chiude ogni giornata con una riga come "End of Day 16 -- mercoledì 4 novembre 2026 -- 4 4/8 Pag --" o "Fine del giorno #16": n, data e pagine vengono da quella riga. Tutte le scene e l'orario che stanno fra la chiusura della giornata prima e questa riga sono di questa giornata.
- inizio e fine: l'orario della giornata, sempre con ore e minuti e il punto. "orario 12 / 20" è "12.00" e "20.00"; "16 / 24" è "16.00" e "00.00"; "13.30 / 21.30"; "H: 15/01" è "15.00" e "01.00". Se l'orario manca o è "TBD": "" tutti e due. Se ci sono due orari alternativi: il primo, e incerto true. Non inventare orari.
- settimana: il numero scritto nelle righe "FINE 4a SETTIMANA". La giornata accanto a quella riga è l'ultima della settimana 4; le giornate dopo sono della 5, fino alla riga seguente. Se il piano non segna le settimane: null.
- scene, per ogni striscia di scena. n: il numero come scritto, con le sue lettere e maiuscole (37Pt, 38END, 3Apt, 35Aend). ie: INT, EXT o INT/EXT. m: come scritto (Giorno, Notte, Alba, Tramonto). ambiente: il titolo della striscia. luogo: il posto reale dove si gira (paese, masseria, via), se la striscia lo dice. cast: gli id numerici dei personaggi. pag: come scritto ("1 1/8", "6/8", "2"). note: le sigle degli effetti (VFX, SFX, STUNT) se ci sono, altrimenti "". Non riportare la sinossi.
- Una scena che il piano mette in due giornate va in tutte e due.
- Le strisce "Trasferimento" fra una scena e l'altra non sono scene: ignorale.
- viaggi: le giornate senza riprese in cui la troupe si sposta, con la loro data ("lunedì 16 novembre 2026 -- TRASFERIMENTO TROUPE A NAPOLI --": destinazione "NAPOLI", etichetta la riga com'è). I riposi non sono viaggi.
- attori: la legenda dei personaggi con il loro numero, se il piano la stampa.
- Non aggiungere, non correggere, non completare: quello che non c'è resta vuoto.`;

// ── Dalla lettura al piano dell'app ─────────────────────────────────────────

const GIORNI_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MOMENTI = [[/^(g|d|day)/i, 'D'], [/^(n)/i, 'N'], [/^(a|m)/i, 'M'], [/^(t|s|e)/i, 'E']];

function oraApp(o) {
  const m = /^\s*(\d{1,2})(?:[.:](\d{2}))?\s*$/.exec(String(o || ''));
  if (!m || +m[1] > 24) return 'TBD';
  return String(+m[1] % 24).padStart(2, '0') + ':' + (m[2] || '00');
}
const pulito = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* Il piano nella forma che l'app sa disegnare: e' quella che produce il
   suo lettore (index.html, pdlComponi), campo per campo. In piu' ci sono
   l'ambiente di ogni scena e il segno che l'ha scritto il server. */
export function pianoPerApp(letto, adesso) {
  const giorni = (letto.giorni || []).filter(g => g && Number.isFinite(+g.n)).map(g => {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(g.data || '')) ? g.data : null;
    const scene = (g.scene || []).filter(s => s && pulito(s.n)).map(s => {
      const m = pulito(s.m);
      return {
        numero: pulito(s.n),
        int_ext: pulito(s.ie).toUpperCase(),
        momento: (MOMENTI.find(x => x[0].test(m)) || [0, 'D'])[1],
        location: pulito(s.luogo) || pulito(s.ambiente),
        ambiente: pulito(s.ambiente),
        cast: (s.cast || []).map(c => pulito(c)).filter(Boolean),
        pagine: pulito(s.pag),
        stunt: /stunt|\bstu\b/i.test(String(s.note || ''))
      };
    });
    const conta = {};
    scene.forEach(s => { if (s.location) conta[s.location] = (conta[s.location] || 0) + 1; });
    return {
      numero_giorno: +g.n, data,
      giorno_settimana: data ? GIORNI_EN[new Date(data + 'T12:00:00Z').getUTCDay()] : '',
      ora_inizio: oraApp(g.inizio), ora_fine: oraApp(g.fine), ora_incerta: !!g.incerto,
      location_principale: Object.keys(conta).sort((a, b) => conta[b] - conta[a])[0] || '',
      pagine_giorno: pulito(g.pagine), unita_secondarie: [], scene,
      _sett: Number.isFinite(+g.settimana) && g.settimana != null ? +g.settimana : null
    };
  });

  // Le settimane come le segna il piano; se non le segna, a sei giornate.
  const settimane = [];
  const segnate = giorni.length && giorni.every(g => g._sett != null);
  giorni.forEach((g, i) => {
    const n = segnate ? g._sett : Math.floor(i / 6) + 1;
    let s = settimane[settimane.length - 1];
    if (!s || s.numero !== n) settimane.push(s = { numero: n, label: 'Settimana ' + n, giorni: [] });
    const { _sett, ...resto } = g;
    s.giorni.push(resto);
  });

  const viaggi = (letto.viaggi || [])
    .filter(v => v && /^\d{4}-\d{2}-\d{2}$/.test(String(v.data || '')))
    .map(v => ({ data: v.data, etichetta: pulito(v.destinazione)
      ? 'TRASFERIMENTO ' + pulito(v.destinazione).toUpperCase() : pulito(v.etichetta).toUpperCase() }))
    .filter(v => v.etichetta && !giorni.some(g => g.data === v.data));

  const p = {
    titolo: pulito(letto.titolo), regista: pulito(letto.regista), versione: pulito(letto.versione),
    totale_giorni: giorni.length, totale_scene: giorni.reduce((a, g) => a + g.scene.length, 0),
    data_inizio: (giorni.find(g => g.data) || {}).data || null,
    data_fine: ([...giorni].reverse().find(g => g.data) || {}).data || null,
    settimane, giorni_viaggio: viaggi,
    daServer: true, caricatoIl: new Date(adesso || Date.now()).toISOString()
  };
  return p;
}

const tutti = (p) => ((p && p.settimane) || []).flatMap(s => s.giorni || []);

/* Un piano letto male e' peggio di nessun piano: sposterebbe le date di
   un mese intero senza che nessuno se ne accorga. Qui si controlla che
   stia in piedi; se no, ci pensa il telefono. Torna null o il motivo. */
export function pianoLeggibile(p) {
  const g = tutti(p);
  if (g.length < 2) return 'meno di due giornate';
  if (!p.totale_scene) return 'nessuna scena';
  const visti = new Set();
  let prima = null;
  for (const x of g) {
    if (!x.data) return 'la giornata ' + x.numero_giorno + ' non ha la data';
    if (visti.has(x.numero_giorno)) return 'la giornata ' + x.numero_giorno + ' compare due volte';
    visti.add(x.numero_giorno);
    if (prima && (x.numero_giorno <= prima.numero_giorno || x.data <= prima.data))
      return 'le giornate ' + prima.numero_giorno + ' e ' + x.numero_giorno + ' non sono in ordine';
    prima = x;
  }
  const vuote = g.filter(x => !x.scene.length).length;
  if (vuote > g.length / 3) return vuote + ' giornate su ' + g.length + ' senza scene';
  return null;
}

/* Quanto e' avanti un piano: il numero della versione, o la sua data.
   Come nell'app (pdlQuantoAvanti): in "PDL del 30.10.2026" il trenta e'
   il giorno, non la versione. */
const MESI = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8,
               settembre: 9, ottobre: 10, novembre: 11, dicembre: 12 };
function quantoAvanti(v) {
  const t = String(v || '');
  const n = t.match(/PDL\s*#?\s*(\d{1,3})(?![\d.\/-])/i);
  let data = null;
  const a = t.match(/(\d{1,2})\s+([a-zà-ÿ]+)\s+(\d{4})/i);
  if (a && MESI[a[2].toLowerCase()])
    data = a[3] + '-' + String(MESI[a[2].toLowerCase()]).padStart(2, '0') + '-' + String(+a[1]).padStart(2, '0');
  else {
    const b = t.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    if (b) data = (b[3].length === 2 ? '20' + b[3] : b[3]) + '-' + String(+b[2]).padStart(2, '0') + '-' + String(+b[1]).padStart(2, '0');
  }
  return { numero: n ? +n[1] : null, data };
}
export function pianoPiuVecchio(nuovo, vecchio) {
  const a = quantoAvanti(nuovo), b = quantoAvanti(vecchio);
  if (a.numero != null && b.numero != null && a.numero !== b.numero) return a.numero < b.numero;
  if (a.data && b.data && a.data !== b.data) return a.data < b.data;
  return false;            // nel dubbio si lascia passare
}

/* Il piano nuovo sopra quello che c'e'.
 *
 * La produzione, a film cominciato, manda il piano da oggi in avanti: le
 * giornate gia' girate nel PDF non ci sono piu'. Quindi dal piano vecchio
 * si tengono le giornate prima della prima del nuovo, e da li' in poi
 * vale il nuovo. E' la stessa regola dell'app (pdlAggiorna).
 */
export function pianoUnisci(nuovo, vecchio) {
  if (!vecchio || !tutti(vecchio).length) return nuovo;
  const primo = Math.min(...tutti(nuovo).map(g => g.numero_giorno));
  const prima = (vecchio.settimane || [])
    .map(s => ({ ...s, giorni: (s.giorni || []).filter(g => g.numero_giorno < primo) }))
    .filter(s => s.giorni.length);
  const p = { ...nuovo, settimane: [...prima, ...nuovo.settimane] };
  const g = tutti(p);
  p.totale_giorni = g.length;
  p.totale_scene = g.reduce((a, x) => a + (x.scene || []).length, 0);
  p.data_inizio = (g.find(x => x.data) || {}).data || nuovo.data_inizio;
  p.data_fine = ([...g].reverse().find(x => x.data) || {}).data || nuovo.data_fine;
  // I viaggi gia' fatti restano; da li' in poi valgono quelli del piano nuovo.
  const dal = nuovo.data_inizio || '';
  p.giorni_viaggio = (vecchio.giorni_viaggio || []).filter(v => v && v.data && v.data < dal)
    .concat(nuovo.giorni_viaggio || []);
  return p;
}

const MESI_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
                 'settembre', 'ottobre', 'novembre', 'dicembre'];
export function notificaPiano(p) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.data_fine || ''));
  return 'Nuovo piano di lavorazione!\n'
    + [p.versione, d ? 'fino al ' + (+d[3]) + ' ' + MESI_IT[+d[2] - 1] : ''].filter(Boolean).join(' · ');
}

/* Scrive il piano dove i telefoni lo cercano e avvisa la troupe.
   Lancia se non riesce: chi chiama rilascia la mail al telefono. */
export async function scriviPiano(env, riga, letto, opz = {}) {
  const adesso = opz.adesso || Date.now();
  const nuovo = pianoPerApp(letto, adesso);
  const manca = pianoLeggibile(nuovo);
  if (manca) throw new Error('piano letto male: ' + manca);

  // Il piano sta attaccato allo spoglio del film (analyses), non al film.
  const an = (await db(env, `analyses?select=id&project_id=eq.${riga.project_id}&order=created_at.desc&limit=1`) || [])[0];
  if (!an) throw new Error('il film non ha uno spoglio a cui attaccare il piano');
  const c = (await db(env, `pdl_versions?select=data,user_id&analysis_id=eq.${an.id}&limit=1`) || [])[0];
  const vecchio = c && c.data && c.data.settimane ? c.data : null;

  if (vecchio && pianoPiuVecchio(nuovo.versione, vecchio.versione))
    return { scritto: false, vecchio: true, versione: nuovo.versione, inUso: vecchio.versione || null };

  let proprietario = c && c.user_id;
  if (!proprietario) {
    const film = (await db(env, `projects?select=user_id&id=eq.${riga.project_id}&limit=1`) || [])[0];
    proprietario = film && film.user_id;
  }
  if (!proprietario) throw new Error('film senza proprietario');

  const piano = pianoUnisci(nuovo, vecchio);
  // Solo `data`: le scene segnate a mano (shooting_data) restano com'erano.
  await db(env, 'pdl_versions?on_conflict=analysis_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ analysis_id: an.id, user_id: proprietario, data: piano })
  });

  let notifiche = 0, errore = null;
  try {
    const mm = await db(env, `film_membri?select=user_id&project_id=eq.${riga.project_id}`);
    const ids = [...new Set((mm || []).map(x => x.user_id).filter(Boolean))];
    if (ids.length) {
      const minuto = new Date(adesso).toISOString();
      const testo = notificaPiano(piano);
      await db(env, 'push_appuntamenti?on_conflict=chiave', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(ids.map(id => ({ user_id: id, project_id: riga.project_id, quando: minuto,
          genere: 'posta', testo, chiave: `${id}:piano:${minuto.slice(0, 16)}`, mandato: null, mostrato: null })))
      });
      notifiche = ids.length;
    }
  } catch (e) { errore = String(e && e.message || e).slice(0, 200); }

  return { scritto: true, versione: piano.versione, giorni: piano.totale_giorni, scene: piano.totale_scene,
           tenute: piano.totale_giorni - nuovo.totale_giorni, notifiche, errore };
}

// ── Il passaggio del cron ───────────────────────────────────────────────────

const FINITE = ['fatta', 'tronca', 'saltata', 'errore'];

/* La mail e' a posto se anche l'ordine del giorno, quando tocca al
   server, e' gia' stato scritto. Si chiude solo se e' ancora 'al server'. */
async function chiudi(env, riga, nota) {
  const haOdg = (riga.allegati || []).some(a => a && a.tenuto && genereDalNome(a.nome) === 'odg');
  const odgInSospeso = haOdg && String(env.OMBRA_SCRIVE || '').toLowerCase() === 'si' && !FINITE.includes(riga.ombra_stato);
  if (odgInSospeso) return false;
  await db(env, `posta?id=eq.${riga.id}&stato=eq.al%20server`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ stato: 'fatta', nota }) });
  return true;
}

async function scrivi(env, id, corpo) {
  await db(env, `posta?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: corpo });
}

/* Un passaggio: al massimo un piano. Torna una parola che dice com'e' andata. */
export async function leggiPiano(env) {
  if (String(env.PIANO || '').toLowerCase() === 'no') return 'spento';
  if (!env.ANTHROPIC_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return 'non configurato';
  const scrive = String(env.PIANO_SCRIVE || '').toLowerCase() === 'si';
  const campi = 'posta?select=id,project_id,oggetto,allegati,stato,ombra_stato';

  /* Le prove a mano prima, come per l'ordine del giorno: righe 'prova' con
     "pdl" nell'oggetto, messe apposta per far leggere al Worker dei piani
     gia' passati. Non scrivono mai niente. */
  let righe = await db(env, campi + '&piano_stato=is.null&stato=eq.prova&oggetto=ilike.*pdl*&order=oggetto.asc&limit=1');
  let riga = righe && righe[0];
  const prova = !!riga;
  const da = new Date(Date.now() - FINESTRA_ORE * 3600000).toISOString();
  if (!riga) {
    righe = await db(env, campi + '&piano_stato=is.null&stato=in.(nuova,%22in%20analisi%22,fatta,%22al%20server%22)'
      + `&ricevuta=gte.${encodeURIComponent(da)}&order=ricevuta.desc&limit=5`) || [];
    const ha = (r) => (r.allegati || []).some(a => a && a.tenuto && a.percorso && genereDalNome(a.nome) === 'pdl');
    riga = righe.find(ha);
    // Le mail senza piano si segnano in un colpo solo, e non si riguardano.
    const senza = righe.filter(r => !ha(r)).map(r => r.id);
    if (senza.length) await db(env, `posta?id=in.(${senza.join(',')})&piano_stato=is.null`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ piano_stato: 'saltata' }) });
  }
  if (!riga) return 'niente da leggere';
  const mia = scrive && !prova && riga.stato === 'al server';        // la troupe aspetta questo

  const pdl = (riga.allegati || []).find(a => a && a.tenuto && a.percorso && genereDalNome(a.nome) === 'pdl');
  if (!pdl) { await scrivi(env, riga.id, JSON.stringify({ piano_stato: 'saltata' })); return 'saltata: nessun piano'; }

  // Lo stesso piano inoltrato due volte si legge una volta sola.
  let doppione = false;
  if (!prova) {
    const altre = await db(env, `posta?select=id,allegati&project_id=eq.${riga.project_id}&id=neq.${riga.id}`
      + `&piano_stato=in.(fatta,%22in%20corso%22)&ricevuta=gte.${encodeURIComponent(da)}&limit=20`);
    doppione = (altre || []).some(r => (r.allegati || []).some(a => a && a.nome === pdl.nome && a.byte === pdl.byte));
  }

  const presa = await db(env, `posta?id=eq.${riga.id}&piano_stato=is.null`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ piano_stato: doppione ? 'saltata' : 'in corso', piano_il: new Date().toISOString(),
      piano: doppione ? { nota: 'stesso piano gia\' letto da un\'altra mail' } : null })
  });
  if (!presa || !presa.length) return 'presa da un altro passaggio';
  if (doppione) {
    if (mia) { try { await chiudi(env, riga, 'doppione: piano già letto dal server'); } catch (_) {} }
    return 'saltata: doppione';
  }

  const modello = env.OMBRA_MODELLO || MODELLO;
  const inizio = Date.now();
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modello, max_tokens: 32000,
        thinking: ragionamento(modello), output_config: { effort: 'low' },
        system: PIANO_SYS, messages: [{ role: 'user', content: [
          { type: 'text', text: 'PIANO DI LAVORAZIONE (' + pdl.nome + '):' },
          { type: 'document', source: { type: 'url', url: await firma(env, pdl.percorso) } }] }]
      })
    });
    const grezzo = await r.text();
    if (!r.ok) throw new Error('modello ' + r.status + ': ' + grezzo.slice(0, 300));
    const d = JSON.parse(grezzo);
    const testo = (d.content || []).filter(b => b && b.type === 'text').map(b => b.text || '').join('');
    const j = testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1);
    const coda = { modello, ms: Date.now() - inizio, stop: d.stop_reason || null,
      token_entrata: d.usage && d.usage.input_tokens, token_uscita: d.usage && d.usage.output_tokens, file: pdl.nome };
    const fatta = d.stop_reason === 'max_tokens' ? 'tronca' : 'fatta';
    if (!j) throw new Error('nella risposta non c\'è un oggetto JSON (' + (d.stop_reason || '?') + ')');

    /* In prova e in ombra il JSON non si apre nemmeno: si incolla nel
       corpo e, se non e' valido, lo dice Postgres. Si apre solo quando
       c'e' da scrivere il piano davvero. */
    let scritto = null;
    if (mia) {
      try {
        if (fatta !== 'fatta') throw new Error('lettura troncata');
        scritto = await scriviPiano(env, riga, JSON.parse(j));
        await chiudi(env, riga, scritto.vecchio ? 'piano più vecchio di quello in uso: lasciato stare' : 'piano scritto dal server');
      } catch (e) {
        scritto = { scritto: false, errore: String(e.message).slice(0, 200) };
        await rilascia(env, riga, 'piano: ' + scritto.errore);
      }
    }
    try {
      await scrivi(env, riga.id, '{"piano_stato":"' + fatta + '","piano":{"info":' + JSON.stringify(coda)
        + ',"scritto":' + JSON.stringify(scritto) + ',"letto":' + j + '}}');
    } catch (e) {
      await scrivi(env, riga.id, JSON.stringify({ piano_stato: 'errore',
        piano: { info: coda, errore: 'JSON non valido: ' + String(e.message).slice(0, 200), testo: testo.slice(0, 60000) } }));
      if (mia) { try { await rilascia(env, riga, 'piano: risposta non leggibile'); } catch (_) {} }
      return 'errore: JSON non valido';
    }
    console.log('piano:', fatta, JSON.stringify(coda));
    return fatta;
  } catch (e) {
    console.error('piano: non letto', e.message);
    try { await scrivi(env, riga.id, JSON.stringify({ piano_stato: 'errore',
      piano: { info: { modello, ms: Date.now() - inizio }, errore: String(e.message).slice(0, 500) } })); } catch (_) {}
    if (mia) { try { await rilascia(env, riga, 'piano: ' + String(e.message).slice(0, 120)); } catch (_) {} }
    return 'errore: ' + e.message;
  }
}

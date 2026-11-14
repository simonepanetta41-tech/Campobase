/* ══ LA LETTURA IN OMBRA ═════════════════════════════════════════════════
 *
 * Oggi l'ordine del giorno lo legge il primo telefono che apre l'app, e
 * quello che legge lui vale per tutta la troupe. Il passo dopo e' leggerlo
 * qui, una volta, appena arriva la mail: cosi' la notifica puo' dire gia'
 * pick-up, convocazione e fine lavorazione, e i telefoni scaricano un
 * risultato invece di analizzare un PDF.
 *
 * Ma prima di fidarsi bisogna vedere. Questa e' la prova: il Worker legge
 * l'ordine del giorno e i giri auto e SCRIVE IL RISULTATO IN UNA COLONNA A
 * PARTE (posta.ombra). Non lo usa nessuno. Le notifiche restano quelle di
 * sempre e l'analisi resta sul telefono. La sera si confronta quello che
 * ha letto il Worker con quello che ha letto il telefono (sql/ombra.sql);
 * quando combaciano per una settimana se ne riparla.
 *
 * Tre vincoli hanno deciso com'e' fatta.
 *
 *   1. Il Worker ha 10 ms di CPU. I PDF quindi non passano di qui: per
 *      ogni file si chiede a Storage un indirizzo firmato a scadenza e lo
 *      si da' al modello, che il file se lo va a prendere da solo. Qui non
 *      si tocca nemmeno un byte del documento.
 *
 *   2. Non deve poter rompere niente. Gira nel cron DOPO le notifiche
 *      (index.js), dentro un try suo: se sbaglia, se il modello non
 *      risponde, se la colonna non esiste ancora, il minuto finisce come
 *      se questo file non ci fosse.
 *
 *   3. Il cron passa ogni minuto e una lettura puo' durarne due. La riga
 *      si prenota prima di cominciare (ombra_stato da vuoto a 'in corso',
 *      in una sola scrittura condizionata): il passaggio dopo la trova
 *      presa e va oltre.
 *
 * Per spegnerla senza deploy: variabile OMBRA = "no" nelle impostazioni
 * del Worker. Per cambiare modello: OMBRA_MODELLO.
 */

const SECCHIO = 'posta';
const MODELLO = 'claude-sonnet-5-5';
const FINESTRA_ORE = 36;          // non si rincorrono le mail vecchie
const SCADENZA_FIRMA = 1800;      // secondi: il tempo che il modello ha per scaricare
const TEMPO_PERSO = 10;           // minuti dopo i quali una lettura 'in corso' si considera persa

export const OMBRA_SYS = `Leggi l'ordine del giorno di una produzione cinematografica italiana e, se c'è, la sua lista dei giri auto. Ti vengono dati come PDF: il primo è l'ordine del giorno, il secondo (quando c'è) sono i giri auto.

Restituisci SOLO JSON compatto, senza backtick e senza testo attorno:
{"numero":"","data":"","convocazione":"","prontiAGirare":"","pausa":"","catering":"","cestini":"","fineRiprese":"","fineLavorazione":"","ambiente":"","pagine":"",
 "scene":[{"n":"","ie":"","m":"","ambiente":"","sinossi":"","ids":"","pag":"","nota":""}],
 "cast":[{"id":"","ruolo":"","interprete":"","scene":"","pickup":"","set":""}],
 "troupe":[{"reparto":"","ruolo":"","nome":"","partenza":"","set":""}],
 "fabbisogni":[{"reparto":"","voci":[{"scene":"","cosa":""}]}],
 "tratte":[{"autista":"","tel":"","partenza":"","luogo":"","indirizzo":"","passeggeri":[""],"arrivo":"","destinazione":""}]}

numero: il numero dell'ordine del giorno ("24"). data: la data di lavorazione in formato AAAA-MM-GG.
Gli orari sempre nel formato "07.30". convocazione: la convocazione generale della troupe. prontiAGirare, pausa (come è scritta: "Rotazione 20'", "13.00-14.00"), catering (l'ora), cestini (il numero), fineRiprese, fineLavorazione. Fine riprese e fine lavorazione sono due orari diversi: non scambiarli e non copiare l'uno nell'altro. Se uno dei due non c'è, lascialo vuoto.
ambiente: l'ambiente o il set del giorno come è scritto in testa. pagine: il totale delle pagine del giorno ("6 6/8").

scene: le scene del giorno nell'ordine della tabella. n è il numero esatto con le lettere (32END, 65C, 36PT). ie: E, I oppure I/E. m: la lettera della colonna G/N come è scritta (G giorno, N notte, ma anche A alba o T tramonto): non ricondurla a G o N. ids: i numeri del cast separati da virgola. pag: le pagine di quella scena per intero, come sono scritte — "6 6/8", "1", "3/8" — compreso il numero intero davanti agli ottavi. Subito prima c'è la colonna DAY, un numero solo (la giornata del racconto): quello non fa parte delle pagine. In "1, 2 4 3 3/8" gli ID sono 1 e 2, DAY è 4 e le pagine sono "3 3/8"; la somma delle pagine delle scene deve dare il totale scritto sotto la tabella.
Una riga della tabella può essere alta e andare a capo: resta UNA scena. Una scena esiste solo dove c'è il suo numero nella colonna delle scene; il totale delle pagine e la colonna SCENE del cast ti dicono quante e quali sono. Una riga senza numero con una scritta sola (TRASFERIMENTO, PRANZO, SECOND UNIT) è uno stacco: rendila come {"n":"","nota":"TRASFERIMENTO"}.

cast: una riga per interprete convocato, comprese le figurazioni speciali. scene: i numeri di scena di quella riga. pickup: la colonna P/UP. set: l'ultima colonna, SET. id e ruolo come sono stampati: non aggiungere fra parentesi il nome della tabella (figurazione, minori, stunt) e non cambiare l'id.
troupe: tutte le persone sotto "CONVOCAZIONE TROUPE", ognuna con il reparto della sua intestazione. partenza e set sono le due colonne di orario: guarda sotto quale delle due intestazioni è stampato ogni valore e mettilo lì, lasciando vuota l'altra; "O.C.", "Vedi GA" e "--" riportali come stanno.
fabbisogni: cosa serve quel giorno, reparto per reparto, con i nomi dei reparti alla lettera. Metti una voce sotto un reparto solo se sei sicuro che sia sua; nel dubbio lasciala fuori.

tratte: dai giri auto, una per ogni viaggio — un mezzo che parte da un posto a un'ora con un gruppo di persone. Ogni produzione ordina le colonne a modo suo e lo scrive nell'intestazione: usa l'ordine che dichiara. partenza è l'ora del pick-up, arrivo quella di arrivo. passeggeri: i nomi come sono scritti sul foglio, uno per elemento, senza le annotazioni fra parentesi; un albergo, un indirizzo o un orario non sono passeggeri. autista: solo il nome, senza il tipo di mezzo (Van, Auto) che gli sta accanto. tel: sole cifre. Se al posto dell'ora di partenza c'è una scritta ("TBC"), riportala com'è. Se i giri auto non ci sono, tratte vale [].

NON INVENTARE NIENTE. Ogni orario, nome e numero che scrivi deve stare nei documenti. Un campo che non trovi o non capisci lascialo vuoto: un campo vuoto è giusto, un orario indovinato è una persona che arriva sul set all'ora sbagliata.

Rispondi SOLO con il JSON.`;

function capi(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json'
  };
}

function base(env) { return env.SUPABASE_URL.replace(/\/+$/, ''); }

async function db(env, percorso, opzioni = {}) {
  const r = await fetch(`${base(env)}/rest/v1/${percorso}`,
    { ...opzioni, headers: { ...capi(env), ...(opzioni.headers || {}) } });
  if (!r.ok) throw new Error(`${percorso.split('?')[0]} -> ${r.status} ${await r.text().catch(() => '')}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/* Che documento e', dal nome che gli ha dato la produzione. Qui il testo
   non si puo' guardare — il file non passa dal Worker — e il nome e'
   quello che c'e'. Gli stralci e il resto non servono a questa lettura. */
export function genereDalNome(nome) {
  const n = String(nome || '').toLowerCase();
  if (!/\.pdf$/.test(n)) return null;
  if (/stralc|mappa|memo|sceneggiatura|script/.test(n)) return null;
  if (/giri|transport|trasport|movement/.test(n)) return 'giri';
  if (/\bodg\b|ordine[ _-]*del[ _-]*giorno|call[ _-]*sheet/.test(n.replace(/[_-]/g, ' '))) return 'odg';
  return null;
}

async function firma(env, percorso) {
  const via = percorso.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`${base(env)}/storage/v1/object/sign/${SECCHIO}/${via}`, {
    method: 'POST', headers: capi(env), body: JSON.stringify({ expiresIn: SCADENZA_FIRMA })
  });
  if (!r.ok) throw new Error('firma ' + percorso + ': ' + r.status + ' ' + await r.text().catch(() => ''));
  const j = await r.json();
  const u = j.signedURL || j.signedUrl;
  if (!u) throw new Error('firma ' + percorso + ': risposta senza indirizzo');
  return /^https?:/.test(u) ? u : `${base(env)}/storage/v1${u.startsWith('/') ? '' : '/'}${u}`;
}

function ragionamento(modello) {
  return String(modello).startsWith('claude-sonnet-5-5') ? { type: 'between_tools' } : { type: 'disabled' };
}

async function scrivi(env, id, corpo) {
  await fetch(`${base(env)}/rest/v1/posta?id=eq.${id}`, {
    method: 'PATCH', headers: { ...capi(env), Prefer: 'return=minimal' }, body: corpo
  }).then(async r => { if (!r.ok) throw new Error('scrittura ombra: ' + r.status + ' ' + await r.text().catch(() => '')); });
}

/* Un passaggio: al massimo una mail. Torna una parola che dice com'e'
   andata, per i log e per i controlli. */
export async function leggiInOmbra(env) {
  if (String(env.OMBRA || '').toLowerCase() === 'no') return 'spenta';
  if (!env.ANTHROPIC_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return 'non configurata';

  const da = new Date(Date.now() - FINESTRA_ORE * 3600000).toISOString();
  const recenti = `&stato=in.(nuova,%22in%20analisi%22,fatta)&ricevuta=gte.${encodeURIComponent(da)}`
                + '&order=ricevuta.desc&limit=1';
  /* Le prove a mano vengono prima, e non hanno scadenza: sono righe con
     stato 'prova' messe li' apposta (sql/ombra.sql) per far leggere al
     Worker dieci ordini del giorno gia' passati in un quarto d'ora,
     invece di aspettare dieci sere. L'app non le vede: prende solo
     'nuova' e 'in analisi'. */
  let righe = await db(env, 'posta?select=id,project_id,oggetto,allegati,ombra_il,ombra'
    + '&ombra_stato=is.null&stato=eq.prova&order=oggetto.asc&limit=1');
  let riga = righe && righe[0];
  const prova = !!riga;
  if (!riga) {
    righe = await db(env, 'posta?select=id,project_id,oggetto,allegati,ombra_il,ombra&ombra_stato=is.null' + recenti);
    riga = righe && righe[0];
  }

  /* Una lettura rimasta a meta'. Se il cron viene chiuso mentre il modello
     sta ancora rispondendo, la riga resta 'in corso' e nessuno la
     riprenderebbe piu'. Dopo dieci minuti la si riprova una volta sola;
     alla seconda si scrive che il tempo non basta — che e' una cosa da
     sapere, non da nascondere riprovando all'infinito. */
  let ripresa = false;
  if (!riga) {
    const vecchia = new Date(Date.now() - TEMPO_PERSO * 60000).toISOString();
    righe = await db(env, 'posta?select=id,project_id,oggetto,allegati,ombra_il,ombra&ombra_stato=eq.in%20corso'
      + `&ombra_il=lt.${encodeURIComponent(vecchia)}` + recenti);
    riga = righe && righe[0];
    ripresa = !!riga;
  }
  if (!riga) return 'niente da leggere';
  const tentativi = ((riga.ombra && riga.ombra.tentativi) || 0) + 1;

  const file = (riga.allegati || []).filter(a => a && a.tenuto && a.percorso)
    .map(a => ({ ...a, genere: genereDalNome(a.nome) }));
  const odg = file.find(a => a.genere === 'odg');
  const giri = file.find(a => a.genere === 'giri');

  /* Lo stesso ordine del giorno arriva spesso due o tre volte: l'inoltro
     automatico, poi quello a mano dal telefono. Leggerlo una volta basta,
     e ogni lettura e' una chiamata al modello che si paga. */
  let doppione = false;
  if (odg && !ripresa && !prova) {
    const altre = await db(env, `posta?select=id,allegati&project_id=eq.${riga.project_id}`
      + `&id=neq.${riga.id}&ombra_stato=in.(fatta,tronca,%22in%20corso%22)&ricevuta=gte.${encodeURIComponent(da)}&limit=20`);
    /* Stesso nome E stessa grandezza: un ordine del giorno corretto e
       rimandato con lo stesso nome ha un altro peso, e quello si legge. */
    doppione = (altre || []).some(r => (r.allegati || [])
      .some(a => a && a.nome === odg.nome && a.byte === odg.byte));
  }

  /* La prenotazione. Scrive solo se la riga e' ancora come l'abbiamo
     letta, e si fa restituire il risultato: se torna vuoto, un altro
     passaggio del cron l'ha presa nel frattempo. */
  const troppi = ripresa && tentativi > 2;
  const stato = (!odg || doppione) ? 'saltata' : troppi ? 'errore' : 'in corso';
  const filtro = ripresa
    ? `ombra_stato=eq.in%20corso&ombra_il=eq.${encodeURIComponent(riga.ombra_il)}`
    : 'ombra_stato=is.null';
  const presa = await db(env, `posta?id=eq.${riga.id}&${filtro}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ombra_stato: stato, ombra_il: new Date().toISOString(),
      ombra: troppi ? { tentativi, errore: 'tempo scaduto: il cron si chiude prima che il modello finisca' }
           : doppione ? { nota: 'stesso ordine del giorno gia\' letto da un\'altra mail' }
           : { tentativi } })
  });
  if (!presa || !presa.length) return 'già presa';
  if (!odg) return 'saltata: nessun ordine del giorno fra gli allegati';
  if (doppione) return 'saltata: doppione';
  if (troppi) return 'errore: tempo scaduto';

  const modello = env.OMBRA_MODELLO || MODELLO;
  const inizio = Date.now();
  try {
    const contenuto = [
      { type: 'text', text: 'ORDINE DEL GIORNO (' + odg.nome + '):' },
      { type: 'document', source: { type: 'url', url: await firma(env, odg.percorso) } }
    ];
    if (giri) contenuto.push(
      { type: 'text', text: 'GIRI AUTO (' + giri.nome + '):' },
      { type: 'document', source: { type: 'url', url: await firma(env, giri.percorso) } });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY,
                 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modello, max_tokens: 16000,
        thinking: ragionamento(modello), output_config: { effort: 'low' },
        system: OMBRA_SYS, messages: [{ role: 'user', content: contenuto }]
      })
    });
    const grezzo = await r.text();
    if (!r.ok) throw new Error('modello ' + r.status + ': ' + grezzo.slice(0, 300));

    const d = JSON.parse(grezzo);
    const testo = (d.content || []).filter(b => b && b.type === 'text').map(b => b.text || '').join('');
    const j = testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1);

    const coda = {
      modello, ms: Date.now() - inizio, stop: d.stop_reason || null,
      token_entrata: d.usage && d.usage.input_tokens, token_uscita: d.usage && d.usage.output_tokens,
      file: [odg.nome].concat(giri ? [giri.nome] : [])
    };
    /* Quello che ha letto il modello si incolla com'e' dentro il corpo,
       senza passarlo da JSON.parse: sono decine di migliaia di caratteri
       e il conto della CPU e' stretto. Se non e' JSON valido lo dice
       Postgres rifiutando la scrittura, e allora lo si salva come testo,
       che e' proprio il caso in cui serve guardarlo. */
    const fatta = d.stop_reason === 'max_tokens' ? 'tronca' : 'fatta';
    try {
      if (!j) throw new Error('nella risposta non c\'e\' un oggetto JSON (' + (d.stop_reason || '?') + ')');
      await scrivi(env, riga.id,
        '{"ombra_stato":"' + fatta + '","ombra":{"info":' + JSON.stringify(coda) + ',"letto":' + j + '}}');
    } catch (e) {
      await scrivi(env, riga.id, JSON.stringify({ ombra_stato: 'errore',
        ombra: { info: coda, errore: 'JSON non valido: ' + e.message.slice(0, 200), testo: testo.slice(0, 60000) } }));
      return 'errore: JSON non valido';
    }
    console.log('ombra:', fatta, JSON.stringify(coda));
    return fatta;
  } catch (e) {
    console.error('ombra: non letta', e.message);
    try {
      await scrivi(env, riga.id, JSON.stringify({ ombra_stato: 'errore',
        ombra: { info: { modello, ms: Date.now() - inizio }, errore: String(e.message).slice(0, 500) } }));
    } catch (_) {}
    return 'errore: ' + e.message;
  }
}

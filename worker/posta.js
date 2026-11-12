/*
 * La posta che arriva.
 *
 * La catena intera: la produzione manda il pacchetto alla casella di lavoro
 * di Simone -> Outlook lo inoltra da solo a <casella>@campobase.dev -> il
 * catch-all di Cloudflare lo passa qui -> gli allegati finiscono su Supabase
 * e il film se li trova pronti.
 *
 * Qui dentro non si capisce niente di cosa c'e' nei PDF, ed e' voluto: lo
 * spoglio, l'ordine del giorno e il piano li legge gia' l'app, con codice
 * provato su documenti veri. Questo Worker fa una cosa sola — mettere al
 * sicuro quello che arriva — e la fa anche quando il formato della mail
 * cambia, cosa che succede a ogni produzione nuova.
 *
 * L'indirizzo e' una stringa casuale, non "odg@". Chi conosce l'indirizzo
 * puo' infilare documenti nel film: e' una chiave, e come tutte le chiavi
 * non si sceglie leggibile.
 */

import { leggiMessaggio } from './mime.js';
/* Questo import mancava, e la chiamata in fondo al file sollevava un
   ReferenceError che il try/catch di li' intorno si mangiava. La mail
   arrivava, gli allegati si salvavano, la riga di posta diceva "nuova" —
   e l'annuncio alla troupe non e' mai partito, nemmeno una volta. Il
   catch e' giusto, una notifica mancata non deve far rimbalzare una mail
   arrivata; ma messo attorno a un nome che non esiste rende invisibile un
   errore di programmazione. */
import { avvisaPosta, avvisaMailDaParte } from './push.js';

// Quello che vale la pena tenere. Le immagini no: nei pacchetti sono firme
// e loghi della mail, non documenti.
const BUONI = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'text/csv': '.csv'
};
const ESTENSIONI = /\.(pdf|xlsx|xls|docx|doc|csv)$/i;

const SECCHIO = 'posta';
const MAX_FILE = 20 * 1024 * 1024;

function daTenere(a) {
  return !!BUONI[a.tipo] || ESTENSIONI.test(a.nome || '');
}

// Un nome che sopravvive a un percorso di Storage senza sorprese, ma che
// resta leggibile: gli accenti si perdono, le parole no.
function nomePulito(nome) {
  return String(nome || 'allegato')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-120) || 'allegato';
}

/* ── Di quale film e' questa mail ──────────────────────────────────────
 *
 * La posta viene smistata solo per indirizzo di arrivo: la casella dice
 * il film, e basta. Finche' si gira un film solo va bene. Ma l'inoltro
 * automatico di Outlook e' una regola che resta li': quando comincia il
 * film dopo, se quella regola continua a puntare alla casella di questo,
 * l'ordine del giorno del film nuovo finisce dentro il film vecchio e
 * sessanta persone che non c'entrano niente ricevono la notifica.
 *
 * Qui si guarda dentro la mail. Dove, lo decidono i dati veri.
 *
 * Il primo tentativo era di guardare chi l'ha mandata, e sui dati veri
 * non funziona: Outlook non redirige, REINVIA. Busta e intestazione
 * From: portano sempre l'indirizzo di chi inoltra — lo stesso per tutti
 * i film, quindi non distingue niente, e un controllo appoggiato li'
 * sarebbe stato inerte o sbagliato sempre.
 *
 * Il mittente vero sta nel corpo, nel blocco che il reinvio mette in
 * testa al messaggio ("Da: Produzione <...>", oppure "Inizio messaggio
 * inoltrato:" quando l'inoltro passa dal telefono). Da quel blocco si
 * leggono gli indirizzi. Non e' un campo dichiarato, e' testo: quindi
 * non e' l'unica cosa che si guarda.
 *
 * La seconda cosa e' l'oggetto. Le produzioni mettono davanti le
 * iniziali del film — "MSG - ODG #23", "MSG_ACCOMMODATION NAPOLI" — e
 * quel prefisso lo scrive la produzione, non noi.
 *
 * Due colonne su `projects`:
 *   mittente   gli indirizzi attesi: uno intero, un dominio (@x.it), o
 *              piu' voci separate da virgola. La produzione manda da tre
 *              caselle e cambia la persona a meta' film.
 *   marcatore  cosa deve comparire nell'oggetto. Piu' voci: virgola.
 *
 * Vuote entrambe, passa tutto, come prima di questo controllo.
 *
 * E una mail si trattiene solo se TUTTI E DUE i segnali dicono no. Il
 * rischio di questo controllo e' al contrario di tutto il resto:
 * trattenere per sbaglio vuol dire un ordine del giorno che alle sei del
 * mattino non c'e', e sono sessanta persone sul set senza il foglio.
 * Lasciar passare una mail di troppo vuol dire una notifica da ignorare.
 * Non e' lo stesso prezzo, e due segnali indipendenti che sbagliano
 * insieme sono molto piu' rari di uno.
 */
const INDIRIZZO = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g;

function indirizzi(s) {
  return String(s || '').toLowerCase().match(INDIRIZZO) || [];
}

/* Gli indirizzi non hanno spazi dentro, quindi si separano anche per
   spazio. I marcatori si separano solo per virgola: "MSG - ODG" e' un
   marcatore solo, e spezzarlo lo farebbe combaciare con qualunque
   oggetto che contiene un trattino. */
function indirizziAttesi(campo) {
  return String(campo || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
}

function marcatoriAttesi(campo) {
  return String(campo || '').toLowerCase().split(/\s*[,;]\s*/)
    .map(s => s.trim()).filter(Boolean);
}

/* Un indirizzo atteso contro quelli trovati. Un dominio nudo o con la
   chiocciola prende tutta la casa; un indirizzo intero prende se stesso
   e basta — e qui serve: le produzioni stanno su gmail, e "gmail.com"
   accetterebbe qualunque film. */
function indirizzoAtteso(regole, visti) {
  return regole.some(r => {
    const dominio = r.replace(/^@/, '');
    const esatta = r.includes('@') && !r.startsWith('@');
    return visti.some(v => esatta
      ? v === r
      : v === dominio || v.endsWith('@' + dominio) || v.endsWith('.' + dominio));
  });
}

/* L'oggetto, senza i prefissi di inoltro: tre "Fwd:" in fila non dicono
   niente, e "I:" e' l'inoltro di Outlook in italiano. */
function oggettoNudo(oggetto) {
  return String(oggetto || '').toLowerCase()
    .replace(/^(\s*(?:fwd?|re|i|inoltro)\s*:\s*)+/i, '').trim();
}

export function postaDelFilm(film, mail) {
  const attesi = indirizziAttesi(film && film.mittente);
  const marcatori = marcatoriAttesi(film && film.marcatore);
  if (!attesi.length && !marcatori.length) return { suo: true };

  /* Gli indirizzi di chi ha consegnato restano nel mazzo: un giorno una
     produzione potrebbe scrivere alla casella direttamente, senza
     passare dall'inoltro, e allora il mittente vero e' li'. */
  const nelCorpo = indirizzi(mail.testo);
  const visti = [...indirizzi(mail.envelope), ...indirizzi(mail.da), ...nelCorpo];

  const perIndirizzo = attesi.length && indirizzoAtteso(attesi, visti);
  const oggetto = oggettoNudo(mail.oggetto);
  const perOggetto = marcatori.length && !!oggetto
    && marcatori.some(m => oggetto.includes(m));

  if (perIndirizzo || perOggetto) return { suo: true };

  /* Nessuno dei due ha riconosciuto il film. Prima di trattenere, si
     controlla che ci fosse qualcosa da riconoscere: un corpo senza
     nemmeno un indirizzo e un oggetto vuoto non sono una mail di un
     altro film, sono una mail che non abbiamo saputo leggere. */
  const leggibile = (attesi.length && nelCorpo.length) || (marcatori.length && oggetto);
  if (!leggibile) return { suo: true };

  return {
    suo: false,
    perche: [
      attesi.length ? 'mittente atteso ' + attesi.join('/') + ', trovati '
        + (nelCorpo.length ? nelCorpo.slice(0, 3).join(' ') : 'nessuno nel corpo') : '',
      marcatori.length ? 'oggetto senza ' + marcatori.join('/') : ''
    ].filter(Boolean).join('; ').slice(0, 400)
  };
}

function capi(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
  };
}

async function filmDallaCasella(env, casella) {
  const u = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/projects`
          + `?casella=eq.${encodeURIComponent(casella)}`
          + `&select=id,titolo,mittente,marcatore,user_id&limit=1`;
  const r = await fetch(u, { headers: capi(env) });
  if (!r.ok) throw new Error('lettura film: ' + r.status + ' ' + await r.text());
  const righe = await r.json();
  return righe[0] || null;
}

async function salvaFile(env, percorso, byte, tipo) {
  const u = `${env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${SECCHIO}/${percorso}`;
  const r = await fetch(u, {
    method: 'POST',
    headers: { ...capi(env), 'Content-Type': tipo || 'application/octet-stream', 'x-upsert': 'true' },
    body: byte
  });
  if (!r.ok) throw new Error('salvataggio ' + percorso + ': ' + r.status + ' ' + await r.text());
}

async function scriviRiga(env, riga) {
  const u = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/posta`;
  const r = await fetch(u, {
    method: 'POST',
    headers: { ...capi(env), 'Content-Type': 'application/json',
               Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(riga)
  });
  if (!r.ok) throw new Error('scrittura posta: ' + r.status + ' ' + await r.text());
}

async function tuttiIByte(stream, quanti) {
  const buf = new Uint8Array(quanti);
  const lettore = stream.getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await lettore.read();
    if (done) break;
    // Il campo rawSize e' quello dichiarato: se arrivasse piu' roba del
    // previsto si taglia invece di scrivere fuori dall'array.
    const quanto = Math.min(value.length, buf.length - n);
    buf.set(value.subarray(0, quanto), n);
    n += quanto;
    if (n >= buf.length) break;
  }
  return n === buf.length ? buf : buf.subarray(0, n);
}

export async function riceviPosta(message, env, ctx) {
  const destinatario = String(message.to || '').toLowerCase();
  const casella = destinatario.split('@')[0].trim();

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    // Senza chiavi non si puo' salvare niente: meglio un rimbalzo che un
    // silenzio: chi ha inoltrato deve sapere che non e' arrivato.
    message.setReject('Casella momentaneamente non disponibile');
    return;
  }

  let film = null;
  try {
    film = await filmDallaCasella(env, casella);
  } catch (e) {
    console.error('posta: non riesco a cercare il film', e.message);
    message.setReject('Casella momentaneamente non disponibile');
    return;
  }

  if (!film) {
    // Il catch-all fa esistere qualsiasi indirizzo @campobase.dev. Senza
    // questo rifiuto, ogni scansione automatica finirebbe nel database.
    message.setReject('Indirizzo inesistente');
    return;
  }

  const id = crypto.randomUUID();
  const riga = {
    id,
    project_id: film.id,
    casella,
    mittente: String(message.from || '').toLowerCase(),
    oggetto: '',
    message_id: null,
    allegati: [],
    testo: null,
    stato: 'nuova'
  };

  try {
    const byte = await tuttiIByte(message.raw, message.rawSize);
    const m = leggiMessaggio(byte);

    riga.oggetto      = (m.oggetto || '').slice(0, 500);
    riga.mittente_vero = (m.da || '').slice(0, 300);
    riga.message_id   = m.messageId || null;
    riga.data_invio   = m.data ? new Date(m.data).toISOString() : null;
    riga.testo        = (m.testo || '').slice(0, 8000) || null;

    const elenco = [];
    for (const a of m.allegati) {
      const tenuto = daTenere(a) && a.byte.length > 0 && a.byte.length <= MAX_FILE;
      const voce = { nome: a.nome, tipo: a.tipo, byte: a.byte.length, tenuto };
      if (tenuto) {
        const nome = nomePulito(a.nome);
        const percorso = `${film.id}/${id}/${nome}`;
        await salvaFile(env, percorso, a.byte, a.tipo);
        voce.percorso = percorso;
        voce.nome = nome;
      }
      elenco.push(voce);
    }
    riga.allegati = elenco;

    /* Una riga di diario per ogni pacchetto. Nei log di Cloudflare si vede
       cosa e' arrivato e cosa si e' tenuto, senza dover aprire il database.
       Quando non si tiene niente si stampa anche l'albero dei pezzi: e' il
       solo modo per capire come impacchetta la posta una produzione nuova,
       e succede a ogni produzione nuova. */
    console.log('posta ' + casella + ' <- ' + riga.mittente + ' | ' +
      (riga.oggetto || '(senza oggetto)') + ' | ' +
      (elenco.length ? elenco.map(v => `${v.nome} [${v.tipo} ${v.byte}B ${v.tenuto ? 'tenuto' : 'scartato'}]`).join(' + ')
                     : 'nessun allegato'));

    if (!elenco.some(v => v.tenuto)) {
      riga.stato = 'senza allegati';
      riga.nota = 'pezzi: ' + (m.struttura || []).join(' / ');
      console.log('posta: niente da tenere. Albero:\n' + (m.struttura || []).join('\n'));
    }
  } catch (e) {
    // La riga si scrive lo stesso. Una mail arrivata e non capita e' un
    // caso da guardare; una mail sparita e' un caso che non si scopre.
    console.error('posta: lettura fallita', e && e.message);
    riga.stato = 'errore';
    riga.nota = String(e && e.message || e).slice(0, 500);
  }

  /* Il controllo sta qui, e non appena si conosce la casella, perche'
     guarda il corpo e l'oggetto: roba che esiste solo dopo aver aperto
     il messaggio. Se l'apertura e' fallita lo stato e' 'errore' e non si
     trattiene niente — una mail che non si e' saputa leggere non e' una
     mail di un altro film. */
  if (riga.stato === 'nuova') {
    const giudizio = postaDelFilm(film, {
      envelope: riga.mittente, da: riga.mittente_vero,
      testo: riga.testo, oggetto: riga.oggetto
    });
    if (!giudizio.suo) {
      /* Non 'errore': non si e' rotto niente. E non 'nuova', perche'
         prendi_posta prende solo nuova, errore e in analisi — con questo
         stato il pacchetto resta nel database con tutti i suoi allegati e
         l'app non lo tocca. Per farlo analizzare basta rimetterlo a
         'nuova' a mano. */
      riga.stato = 'da verificare';
      riga.nota = 'non sembra di questo film: ' + giudizio.perche;
      console.log('posta: messa da parte, ' + riga.nota);
    }
  }

  if (!riga.data_invio) delete riga.data_invio;

  try {
    await scriviRiga(env, riga);
  } catch (e) {
    console.error('posta: scrittura fallita', e.message);
    message.setReject('Salvataggio non riuscito, riprovare');
    return;
  }

  /* Poi si avvisa la troupe.
   *
   * Cosa sia arrivato lo si indovina dal nome dei file. L'app lo sapra'
   * con certezza, perche' e' lei che li legge, ma per allora la notifica
   * e' gia' passata: qui serve adesso una parola giusta, non la verita'
   * definitiva. Quando il nome non dice niente si resta sul generico
   * invece di annunciare un ordine del giorno che non c'e'.
   */
  if (riga.stato === 'da verificare') {
    try {
      const quanti = await avvisaMailDaParte(env, film, riga.oggetto);
      console.log('posta: avvisato il capo,', quanti, 'righe');
    } catch (e) {
      console.error('posta: avviso al capo non partito', e.message);
    }
    return;
  }

  if (riga.stato === 'nuova' && (riga.allegati || []).some(v => v.tenuto)) {
    try {
      const nomi = riga.allegati.filter(v => v.tenuto).map(v => v.nome).join(' ').toLowerCase();
      const fatti = [];
      if (/\bodg\b|ordine[ _-]?del[ _-]?giorno|call[ _-]?sheet/.test(nomi)) fatti.push('odg');
      if (/\bpdl\b|piano[ _-]?di[ _-]?lavoraz/.test(nomi)) fatti.push('pdl');
      const quanti = await avvisaPosta(env, film.id, fatti, riga.oggetto);
      console.log('posta: avvisati', quanti, 'membri', fatti.length ? '(' + fatti.join('+') + ')' : '(generico)');
    } catch (e) {
      // Una notifica mancata non deve far rimbalzare una mail arrivata.
      console.error('posta: avviso non partito', e.message);
    }
  }
}

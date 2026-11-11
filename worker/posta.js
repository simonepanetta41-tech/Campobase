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

function capi(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
  };
}

async function filmDallaCasella(env, casella) {
  const u = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/projects`
          + `?casella=eq.${encodeURIComponent(casella)}&select=id,titolo,mittente&limit=1`;
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
  if (riga.stato !== 'errore' && (riga.allegati || []).some(v => v.tenuto)) {
    try {
      const nomi = riga.allegati.filter(v => v.tenuto).map(v => v.nome).join(' ').toLowerCase();
      const fatti = [];
      if (/\bodg\b|ordine[ _-]?del[ _-]?giorno|call[ _-]?sheet/.test(nomi)) fatti.push('odg');
      if (/\bpdl\b|piano[ _-]?di[ _-]?lavoraz/.test(nomi)) fatti.push('pdl');
      const quanti = await avvisaPosta(env, film.id, fatti);
      console.log('posta: avvisati', quanti, 'membri', fatti.length ? '(' + fatti.join('+') + ')' : '(generico)');
    } catch (e) {
      // Una notifica mancata non deve far rimbalzare una mail arrivata.
      console.error('posta: avviso non partito', e.message);
    }
  }
}

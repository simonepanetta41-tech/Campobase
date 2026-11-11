/*
 * Chi è questo attore.
 *
 * Su un ordine del giorno il cast è una colonna di nomi, e metà non ti
 * dicono niente finché non te li trovi davanti. La prima versione andava
 * a prendere due righe da Wikipedia, e ha mostrato il limite al primo
 * caso vero: Wikipedia copre bene i nomi noti, che sono esattamente
 * quelli per cui non serve. I caratteristi, la gente di teatro, gli
 * attori di giornata — cioè quelli che non riconosci — una voce
 * enciclopedica non ce l'hanno quasi mai.
 *
 * TMDB invece ce li ha, perché è un database di cinema e non
 * un'enciclopedia. La biografia spesso no, ma la domanda vera sul set non
 * è "chi è": è "dove l'ho già vista". E i titoli ci sono sempre.
 *
 * La chiave sta in un secret del Worker e non esce di qui: l'app chiede a
 * noi, noi chiediamo a TMDB.
 */

import { json, readJson, requireUser } from './shared.js';

const BASE = 'https://api.themoviedb.org/3';
const FOTO = 'https://image.tmdb.org/t/p/w342';

/* Quanti titoli mostrare.
   Tre righe di chip sono già una lista da leggere invece che un colpo
   d'occhio, e il quarto titolo non ha mai cambiato niente. */
const QUANTI = 6;

/* La biografia è in italiano?
 *
 * Si chiede a TMDB in it-IT, ma quando la traduzione italiana non c'è
 * TMDB restituisce l'inglese senza dirlo. Su un'app italiana per una
 * troupe italiana un paragrafo in inglese stona, e un paragrafo in
 * inglese che si presenta come la scheda italiana stona di più.
 *
 * Non serve riconoscere la lingua in generale: serve distinguere due
 * lingue, e queste due si distinguono con poche parole di servizio. Nel
 * dubbio si scarta: la biografia è il pezzo meno importante della scheda,
 * e perderne una vera costa meno che mostrarne una in inglese.
 */
const ITALIANE = /\b(è|è|di|del|della|dei|degli|nel|nella|con|per|una|un'|che|non|suo|sua|ha|hanno|dopo|anche|come|attore|attrice|regista|teatro|cinema|nato|nata|italiano|italiana)\b/gi;
const INGLESI  = /\b(is|was|the|and|his|her|he|she|born|known|actor|actress|director|italian|film|has|been)\b/gi;

export function sembraItaliano(testo) {
  const t = String(testo || '');
  if (t.trim().length < 20) return false;
  const it = (t.match(ITALIANE) || []).length;
  const en = (t.match(INGLESI)  || []).length;
  // Non basta che l'italiano vinca: deve vincere nettamente. "Toni
  // Servillo is an Italian actor and theatrical director" contiene
  // "italian" e "actor", che somigliano a parole nostre.
  return it >= 3 && it > en * 1.5;
}

/* Fra i risultati, la persona giusta.
 *
 * TMDB ordina per popolarità, e un attore di giornata non è popolare: il
 * primo risultato per "Carmen Pommella" potrebbe essere un'altra Carmen.
 * Prima il nome esatto, poi chi di mestiere recita, poi la popolarità.
 */
function nudo(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function scegli(risultati, nome) {
  const cercato = nudo(nome);
  if (!cercato) return null;
  const punteggio = (p) => {
    const suo = nudo(p.name);
    let n = 0;
    if (suo === cercato) n += 100;
    else if (suo.includes(cercato) || cercato.includes(suo)) n += 40;
    if (p.known_for_department === 'Acting') n += 20;
    n += Math.min(Number(p.popularity) || 0, 15);
    return n;
  };
  const buoni = (risultati || []).filter(p => punteggio(p) >= 40);
  if (!buoni.length) return null;
  return buoni.sort((a, b) => punteggio(b) - punteggio(a))[0];
}

/* I titoli per cui lo conosci.
 *
 * I più visti prima, non i più recenti: serve il titolo che fa scattare
 * il "ah, è quello di…". Le comparsate senza personaggio restano fuori —
 * un attore accreditato come "Uomo al bar" non te lo ricordi di certo.
 */
export function titoli(crediti) {
  const voci = [...((crediti && crediti.cast) || [])]
    .filter(c => c.character && String(c.character).trim())
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const visti = new Set();
  const out = [];
  for (const c of voci) {
    const t = (c.title || c.name || '').trim();
    if (!t || visti.has(t.toLowerCase())) continue;
    visti.add(t.toLowerCase());
    out.push(t);
    if (out.length >= QUANTI) break;
  }
  return out;
}

const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio',
              'agosto','settembre','ottobre','novembre','dicembre'];

/* TMDB scrive i luoghi in inglese, e non li traduce nemmeno chiedendo
   it-IT: "Naples, Campania, Italy". Su un'app italiana per una troupe
   italiana "Naples" stona, e si nota subito. Sono una manciata di citta':
   quelle che in inglese cambiano nome davvero. */
const CITTA = { naples:'Napoli', rome:'Roma', milan:'Milano', turin:'Torino',
  florence:'Firenze', venice:'Venezia', genoa:'Genova', padua:'Padova',
  mantua:'Mantova', syracuse:'Siracusa', leghorn:'Livorno' };

export function nascita(data, luogo) {
  const pezzi = [];
  // Il luogo prima della data: "Napoli" dice più di "1972".
  if (luogo) {
    const c = String(luogo).split(',')[0].trim();
    pezzi.push(CITTA[c.toLowerCase()] || c);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ''));
  if (m) pezzi.push(`${+m[3]} ${MESI[+m[2] - 1]} ${m[1]}`);
  return pezzi.join(' · ') || null;
}

export async function handleAttore(request, env) {
  const { error: authError } = await requireUser(request, env);
  if (authError) return authError;

  const chiave = env.TMDB_KEY;
  if (!chiave) return json({ error: 'manca il secret TMDB_KEY' }, 503);

  // POST come tutte le altre rotte di questo Worker: il router accetta
  // solo quello, e il nome viaggia nel corpo.
  const { body, error } = await readJson(request);
  if (error) return error;
  const nome = String((body && body.nome) || '').trim();
  if (nome.length < 3) return json({ error: 'nome troppo corto' }, 400);

  const chiedi = async (percorso, params) => {
    const u = new URL(BASE + percorso);
    u.searchParams.set('api_key', chiave);
    for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
    const r = await fetch(u.toString(), { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`tmdb ${percorso} -> ${r.status}`);
    return r.json();
  };

  try {
    const cerca = await chiedi('/search/person', { query: nome, language: 'it-IT' });
    const p = scegli(cerca.results, nome);
    if (!p) return json({ trovato: false });

    const d = await chiedi('/person/' + p.id, {
      language: 'it-IT', append_to_response: 'combined_credits'
    });

    const bio = sembraItaliano(d.biography) ? String(d.biography).trim() : null;
    return json({
      trovato: true,
      nome:    d.name || p.name,
      // 1 = donna, 2 = uomo: lo dice TMDB, non lo indoviniamo dal nome.
      femmina: d.gender === 1,
      nascita: nascita(d.birthday, d.place_of_birth),
      foto:    d.profile_path ? FOTO + d.profile_path : null,
      bio:     bio ? bio.split('. ').slice(0, 2).join('. ').slice(0, 340) : null,
      titoli:  titoli(d.combined_credits),
      url:     'https://www.themoviedb.org/person/' + p.id
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

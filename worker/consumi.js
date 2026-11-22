/* Il contatore dei consumi.
 *
 * Ogni chiamata al modello lascia una riga: chi, per quale film, a che
 * scopo, quanti token. Serve a sapere quanto costa davvero l'app e dove:
 * finora i token delle letture del server stavano dentro le righe della
 * posta, e quelli che partono dai telefoni (lo spoglio, l'assistente)
 * finivano in un registro che dopo qualche giorno sparisce.
 *
 * Qui si salvano i token, non i dollari: i prezzi cambiano, i token
 * restano veri. Il conto lo fa chi legge.
 *
 * Non deve mai rompere niente: se la tabella non c'e' o la scrittura
 * fallisce, la lettura e la risposta al telefono vanno avanti lo stesso.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const intero = n => (Number.isFinite(+n) && +n >= 0 ? Math.round(+n) : null);

/* Il listino, in dollari per milione di token (platform.claude.com, pagina
   dei prezzi, letto il 22 novembre 2026). Sta qui e non nel database: i
   token salvati restano veri, e se il listino cambia si corregge questa
   tabella e tutti i conti si rifanno da soli, anche quelli passati.
   Haiku 5.5 costa cinque volte tanto quando la richiesta supera i 100.000
   token in entrata: il conto si fa riga per riga per questo. */
export const PREZZI = {
  'claude-sonnet-5-5': { entrata: 2, uscita: 10, cacheLetti: 0.10, cacheScritti: 2.50 },
  'claude-haiku-5-5':  { entrata: 0.10, uscita: 0.50, cacheLetti: 0.01, cacheScritti: 0.125, soglia: 100000,
                         oltre: { entrata: 0.50, uscita: 2.50, cacheLetti: 0.05, cacheScritti: 0.625 } }
};
/* Quanto e' costata una riga, in dollari. null se il modello non e' nel
   listino: meglio dire "non lo so" che contarla zero. */
export function costo(r) {
  const nome = String(r && r.modello || '');
  const chiave = Object.keys(PREZZI).find(k => nome === k || nome.startsWith(k + '-'));
  if (!chiave) return null;
  let p = PREZZI[chiave];
  const e = +r.token_entrata || 0, u = +r.token_uscita || 0, cl = +r.token_cache_letti || 0, cs = +r.token_cache_scritti || 0;
  if (p.soglia && e + cl + cs > p.soglia) p = p.oltre;
  return (e * p.entrata + u * p.uscita + cl * p.cacheLetti + cs * p.cacheScritti) / 1e6;
}

export function rigaConsumo(c) {
  const u = (c && c.usage) || {};
  return {
    origine: c && c.origine === 'server' ? 'server' : 'telefono',
    scopo: String((c && c.scopo) || 'altro').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'altro',
    user_id: UUID.test(String(c && c.user_id || '')) ? c.user_id : null,
    project_id: UUID.test(String(c && c.project_id || '')) ? c.project_id : null,
    posta_id: UUID.test(String(c && c.posta_id || '')) ? c.posta_id : null,
    modello: String((c && c.modello) || '').slice(0, 60) || null,
    token_entrata: intero(u.input_tokens),
    token_uscita: intero(u.output_tokens),
    token_cache_letti: intero(u.cache_read_input_tokens),
    token_cache_scritti: intero(u.cache_creation_input_tokens),
    ms: intero(c && c.ms),
    esito: String((c && c.esito) || '').slice(0, 30) || null
  };
}

export async function segnaConsumo(env, c) {
  try {
    if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return false;
    const riga = rigaConsumo(c);
    if (riga.token_entrata == null && riga.token_uscita == null) return false;   // niente da contare
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/consumi`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(riga)
    });
    return !!(r && r.ok);
  } catch (_) { return false; }
}

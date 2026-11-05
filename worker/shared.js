/*
 * Parti comuni alle rotte /api/.
 *
 * Supabase si chiama via REST con fetch invece che con @supabase/supabase-js:
 * niente dipendenze npm da impacchettare, niente nodejs_compat, e una cosa in
 * meno che puo' rompersi in fase di build.
 */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

/** Legge il corpo JSON, o restituisce una risposta d'errore pronta. */
export async function readJson(request) {
  try {
    return { body: await request.json() };
  } catch {
    return { error: json({ error: 'Corpo della richiesta non valido' }, 400) };
  }
}

/**
 * Verifica il token utente contro Supabase Auth.
 * Ritorna { user } oppure { error: Response } da restituire subito.
 */
export async function requireUser(request, env) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { error: json({ error: 'Non autorizzato' }, 401) };
  }

  // Variabili mancanti: e' l'errore piu' comune dopo un trasloco, e senza
  // questo controllo si presenta come un generico "Token non valido" che
  // manda a cercare il problema dalla parte sbagliata.
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(k => !env[k]);
  if (missing.length) {
    return {
      error: json({
        error: `Configurazione incompleta: manca ${missing.join(' e ')}. ` +
               `Controlla i nomi in Settings > Variables and Secrets.`
      }, 500)
    };
  }

  const base = env.SUPABASE_URL.replace(/\/+$/, '');   // tollera la barra finale
  let r;
  try {
    r = await fetch(`${base}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${auth.slice(7)}`
      }
    });
  } catch (e) {
    return {
      error: json({
        error: `Supabase irraggiungibile all'indirizzo configurato: ${e.message}. ` +
               `Verifica SUPABASE_URL.`
      }, 502)
    };
  }

  if (!r.ok) {
    // Il corpo di Supabase dice se a non andare e' la chiave di servizio
    // o il token dell'utente. Nessuno dei due viene mai stampato.
    const detail = await r.text().catch(() => '');
    console.error('auth/v1/user ->', r.status, detail);
    return {
      error: json({
        error: `Supabase ha rifiutato la verifica (HTTP ${r.status}). ` +
               (r.status === 401
                 ? 'Di solito e\' SUPABASE_SERVICE_KEY sbagliata: serve la chiave service_role, non la anon.'
                 : detail.slice(0, 200))
      }, 401)
    };
  }

  const user = await r.json();
  if (!user?.id) return { error: json({ error: 'Token non valido' }, 401) };

  return { user };
}

/**
 * Consuma una unita' di quota in modo atomico lato DB.
 * consume_analysis_quota() salta il limite per permanent_plan = 'founder',
 * quindi per il proprietario passa sempre.
 */
export async function consumeQuota(env, userId, limit) {
  const today = new Date().toISOString().split('T')[0];

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_analysis_quota`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_user_id: userId, p_date: today, p_limit: limit })
  });

  if (!r.ok) {
    return { error: json({ error: 'Errore verifica quota: ' + await r.text() }, 500) };
  }

  const out = await r.json();
  const q = Array.isArray(out) ? out[0] : out;

  if (!q?.allowed) {
    return {
      error: json({ error: `Limite giornaliero raggiunto (${limit} analisi/giorno).` }, 429)
    };
  }

  return { quota: q };
}

/**
 * Inoltra una richiesta all'API di Anthropic.
 *
 * La risposta torna in streaming senza passare da JSON.parse: su Worker il
 * limite e' di CPU (10 ms), non di tempo, e l'attesa di rete non conta.
 * Deserializzare e riserializzare 20.000 token sarebbe l'unico punto del
 * flusso a consumare CPU davvero, quindi il corpo si gira cosi' com'e'.
 */
export function callAnthropic(env, payload) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  }).then(r => new Response(r.body, {
    status: r.status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  }));
}

/*
 * Parti comuni alle funzioni Pages.
 *
 * I file che iniziano con _ non diventano rotte: Cloudflare Pages li tratta
 * come moduli da importare, quindi questo non e' raggiungibile dall'esterno.
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

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
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
  const token = auth.slice(7);

  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${token}`
    }
  });

  if (!r.ok) return { error: json({ error: 'Token non valido' }, 401) };

  const user = await r.json();
  if (!user?.id) return { error: json({ error: 'Token non valido' }, 401) };

  return { user };
}

/**
 * Consuma una unita' di quota in modo atomico lato DB.
 * La funzione SQL consume_analysis_quota() salta il limite per permanent_plan
 * = 'founder', quindi per il proprietario passa sempre.
 */
export async function consumeQuota(env, userId, limit = 3) {
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
    const detail = await r.text();
    return { error: json({ error: 'Errore verifica quota: ' + detail }, 500) };
  }

  const out = await r.json();
  const q = Array.isArray(out) ? out[0] : out;

  if (!q?.allowed) {
    return {
      error: json({
        error: `Limite giornaliero raggiunto (${limit} analisi/giorno).`
      }, 429)
    };
  }

  return { quota: q };
}

/**
 * Inoltra una richiesta all'API di Anthropic.
 *
 * La risposta viene restituita in streaming senza passare da JSON.parse:
 * su Worker il limite e' di CPU, non di tempo, e deserializzare e
 * riserializzare 20.000 token di risposta e' l'unico punto del flusso che
 * ne consumerebbe davvero. Cosi' il costo resta vicino allo zero.
 */
export async function callAnthropic(env, payload) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });

  return new Response(r.body, {
    status: r.status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

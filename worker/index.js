/*
 * SoundAnalyst — Worker.
 *
 * Grazie a run_worker_first in wrangler.jsonc, questo codice gira solo per
 * /api/*. Tutto il resto lo serve direttamente il livello degli asset
 * statici, e i percorsi non trovati ricadono su index.html perche'
 * not_found_handling e' impostato su single-page-application: e' li' che si
 * configura l'SPA su Workers, non in _redirects. Un rewrite verso
 * /index.html in _redirects viene anzi rifiutato come loop infinito.
 */

import { json, readJson, requireUser, consumeQuota, callAnthropic, CORS } from './shared.js';
import { handleWrap } from './wrap.js';

const FREE_LIMIT = 3;

/*
 * Spegne il ragionamento per le due rotte che producono JSON strutturato.
 *
 * Su questo PDL Haiku 5.5 aveva consumato 16.000 token su 16.000 in
 * ragionamento, senza scrivere una riga di risposta — e abbassare l'effort
 * a "low" non aveva cambiato nulla, come la documentazione stessa avverte.
 * L'interruttore vero e' il parametro thinking, ma i due modelli vogliono
 * valori diversi:
 *
 *   Haiku 5.5   -> { type: 'disabled' }       ('between_tools' da' 400)
 *   Sonnet 5.5  -> { type: 'between_tools' }  ('disabled' da' 400)
 *
 * In entrambi i casi serve un effort di 'high' o inferiore, altrimenti la
 * richiesta viene rifiutata: da qui il limite imposto sotto.
 */
function spegniRagionamento(model) {
  return String(model).startsWith('claude-sonnet-5-5')
    ? { type: 'between_tools' }
    : { type: 'disabled' };
}

// 'xhigh' e 'max' sono incompatibili con il ragionamento spento: si
// riportano a 'high' invece di far fallire la richiesta.
function effortCompatibile(richiesto) {
  const e = richiesto || 'low';
  return (e === 'xhigh' || e === 'max') ? 'high' : e;
}

// ── /api/analyze ─────────────────────────────────────────────────────────────
async function handleAnalyze(request, env, ctx) {
  const { user, error: authError } = await requireUser(request, env);
  if (authError) return authError;

  const { error: quotaError } = await consumeQuota(env, user.id, FREE_LIMIT);
  if (quotaError) return quotaError;

  const { body, error } = await readJson(request);
  if (error) return error;

  const modello = body.model || 'claude-sonnet-5-5';

  return callAnthropic(env, {
    model: modello,
    max_tokens: body.max_tokens || 16000,
    thinking: spegniRagionamento(modello),
    output_config: { effort: effortCompatibile(body.effort) },
    system: body.system,
    messages: body.messages
  }, ctx);
}

// ── /api/chat ────────────────────────────────────────────────────────────────
// Niente quota: la chat e' leggera e nell'originale non la consumava.
async function handleChat(request, env, ctx) {
  const { error: authError } = await requireUser(request, env);
  if (authError) return authError;

  const { body, error } = await readJson(request);
  if (error) return error;

  return callAnthropic(env, {
    model: body.model || 'claude-sonnet-5-5',
    max_tokens: body.max_tokens || 1024,
    system: body.system,
    messages: body.messages
  }, ctx);
}

// ── /api/pdl ─────────────────────────────────────────────────────────────────
// Modello fisso come nell'originale: il PDL e' estrazione strutturata,
// non serve lasciarlo scegliere al client.
async function handlePdl(request, env, ctx) {
  const { user, error: authError } = await requireUser(request, env);
  if (authError) return authError;

  const { error: quotaError } = await consumeQuota(env, user.id, FREE_LIMIT);
  if (quotaError) return quotaError;

  const { body, error } = await readJson(request);
  if (error) return error;

  return callAnthropic(env, {
    model: 'claude-haiku-5-5',
    max_tokens: body.max_tokens || 16000,
    thinking: spegniRagionamento('claude-haiku-5-5'),
    output_config: { effort: effortCompatibile(body.effort) },
    system: body.system,
    messages: body.messages
  }, ctx);
}

const ROUTES = {
  '/api/analyze': handleAnalyze,
  '/api/chat':    handleChat,
  '/api/pdl':     handlePdl,
  '/api/wrap':    handleWrap
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname];

    if (!route) return json({ error: 'Endpoint inesistente' }, 404);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Metodo non consentito' }, 405);
    }

    try {
      return await route(request, env, ctx);
    } catch (e) {
      console.error(pathname, e);
      return json({ error: 'Errore interno: ' + e.message }, 500);
    }
  }
};

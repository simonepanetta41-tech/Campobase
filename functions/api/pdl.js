import { json, requireUser, consumeQuota, callAnthropic } from './_shared.js';

export { onRequestOptions } from './_shared.js';

const FREE_LIMIT = 3;

export async function onRequestPost({ request, env }) {
  const { user, error: authError } = await requireUser(request, env);
  if (authError) return authError;

  const { error: quotaError } = await consumeQuota(env, user.id, FREE_LIMIT);
  if (quotaError) return quotaError;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo della richiesta non valido' }, 400);
  }

  const { messages, system, max_tokens } = body;

  // Modello fisso come nell'originale: il PDL e' estrazione strutturata,
  // non serve lasciarlo scegliere al client.
  return callAnthropic(env, {
    model: 'claude-haiku-5-5',
    max_tokens: max_tokens || 16000,
    temperature: 0,
    system,
    messages
  });
}

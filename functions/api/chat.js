import { json, requireUser, callAnthropic } from './_shared.js';

export { onRequestOptions } from './_shared.js';

// Niente quota qui: la chat e' leggera e nell'originale non la consumava.
export async function onRequestPost({ request, env }) {
  const { error: authError } = await requireUser(request, env);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo della richiesta non valido' }, 400);
  }

  const { messages, system, model, max_tokens } = body;

  return callAnthropic(env, {
    model: model || 'claude-sonnet-5-5',
    max_tokens: max_tokens || 1024,
    system,
    messages
  });
}

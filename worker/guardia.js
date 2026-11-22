/* Chi amministra Campobase, e come avvisarlo quando il server sbaglia.
   Sta in un file suo perche' serve sia alle rotte dell'amministrazione
   (admin.js) sia alle letture (ombra.js, piano.js), che fra loro non si
   devono importare a vicenda. */
import { db } from './ombra.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* Gli amministratori: gli UUID in ADMIN_IDS, separati da virgole. */
export function adminIds(env) {
  return String(env && env.ADMIN_IDS || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(s => UUID.test(s));
}

/* Una notifica agli amministratori: "Lettura fallita", sotto di che mail
   si parla e perche'. Una sola per mail e per documento (la chiave):
   una lettura riprovata tre volte non suona tre volte. Non deve mai
   fermare chi la chiama. */
export async function avvisaAdmin(env, c) {
  try {
    const chi = adminIds(env);
    if (!chi.length || !c || !c.titolo) return 0;
    const adesso = new Date().toISOString();
    const testo = [c.titolo, String(c.oggetto || '').replace(/\s+/g, ' ').trim().slice(0, 80), String(c.perche || '').replace(/\s+/g, ' ').trim().slice(0, 120)]
      .filter(Boolean).join('\n');
    await db(env, 'push_appuntamenti?on_conflict=chiave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chi.map(u => ({ user_id: u, project_id: c.film || null, quando: adesso, genere: 'admin', testo,
        chiave: `${u}:admin:${c.chiave || adesso}` }))) });
    return chi.length;
  } catch (e) { console.error('guardia: avviso non partito', e && e.message); return 0; }
}

/* Com'e' finita una lettura, vista da chi deve saperlo: null se e' andata
   bene (o se non c'era niente da dire), altrimenti il perche'. */
export function guasto(esito, giro) {
  if (!giro || !giro.riga || giro.prova) return null;
  if (giro.nonScritto) return 'non scritto: ' + giro.nonScritto;
  if (/^errore/.test(String(esito || ''))) return String(esito).replace(/^errore:?\s*/, '') || 'errore';
  if (esito === 'tronca') return 'lettura troncata';
  return null;
}

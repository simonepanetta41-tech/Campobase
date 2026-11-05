import { json } from './_shared.js';

export { onRequestOptions } from './_shared.js';

export async function onRequestPost({ request, env }) {
  const key = env.GOOGLE_PLACES_KEY;
  if (!key) return json({ error: 'GOOGLE_PLACES_KEY non configurata' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo della richiesta non valido' }, 400);
  }

  // ── Recensioni di un singolo posto ──
  if (body.action === 'reviews') {
    const { placeId } = body;
    if (!placeId) return json({ error: 'placeId required' }, 400);

    const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'reviews,photos,currentOpeningHours,websiteUri',
        'Accept-Language': 'it'
      }
    });
    const data = await r.json();
    if (data.error) return json({ error: data.error.message }, 500);

    const reviews = (data.reviews || []).map(rv => ({
      authorName: rv.authorAttribution?.displayName || 'Anonimo',
      rating: rv.rating || 0,
      text: rv.text?.text || '',
      relativeTime: rv.relativePublishTimeDescription || ''
    }));

    const photos = (data.photos || []).slice(0, 4).map(p =>
      `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=200&maxWidthPx=300&key=${key}`
    );

    return json({
      reviews,
      photos,
      hours: data.currentOpeningHours?.weekdayDescriptions || [],
      website: data.websiteUri || null
    });
  }

  // ── Ricerca nei dintorni ──
  const { lat, lng, filters, radius = 5000 } = body;
  if (!lat || !lng) return json({ error: 'lat/lng required' }, 400);

  const typeMap = {
    pranzo:    ['restaurant'],
    cena:      ['restaurant'],
    birra:     ['bar'],
    vino:      ['wine_bar'],
    aperitivo: ['bar']
  };

  const activeTypes = [...new Set(
    (filters || ['pranzo']).flatMap(f => typeMap[f] || ['restaurant'])
  )];

  const results = [];

  for (const type of activeTypes) {
    try {
      const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.currentOpeningHours,places.internationalPhoneNumber,places.websiteUri,places.location,places.types,places.reservable',
          'Accept-Language': 'it'
        },
        body: JSON.stringify({
          includedTypes: [type],
          maxResultCount: 15,
          locationRestriction: {
            circle: {
              center: { latitude: parseFloat(lat), longitude: parseFloat(lng) },
              radius: parseInt(radius)
            }
          }
        })
      });
      const data = await r.json();
      if (data.error) return json({ error: data.error.message }, 500);
      if (data.places) results.push(...data.places);
    } catch (e) {
      console.error('Fetch error:', e.message);
    }
  }

  const seen = new Set();
  const unique = results.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  unique.sort((a, b) => {
    const aName = a.displayName?.text?.toLowerCase() || '';
    const bName = b.displayName?.text?.toLowerCase() || '';
    const aSlow = /osteria|trattoria|locanda/.test(aName) ? 1 : 0;
    const bSlow = /osteria|trattoria|locanda/.test(bName) ? 1 : 0;
    if (aSlow !== bSlow) return bSlow - aSlow;
    return (b.rating || 0) - (a.rating || 0);
  });

  // gmapsKey serve al client per caricare Maps JS, che la chiave la vuole
  // per forza nel browser. Vedi DEPLOY_CLOUDFLARE.md: conviene usare qui una
  // seconda chiave limitata per referrer, non questa.
  return json({
    places: unique.slice(0, 15),
    gmapsKey: env.GOOGLE_MAPS_BROWSER_KEY || key
  });
}

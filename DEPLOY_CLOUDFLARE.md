# Deploy su Cloudflare Pages

SoundAnalyst era su Vercel. Questo branch lo porta su Cloudflare Pages, dove il
piano gratuito regge l'app senza limiti di durata sulle richieste HTTP e senza
il divieto di uso commerciale che ha il piano Hobby di Vercel.

---

## 1. Collegare il repo

1. Vai su **dash.cloudflare.com** → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**
2. Autorizza GitHub e scegli il repository `soundanalyst`
3. Nella configurazione della build lascia **tutto vuoto**:

   | Campo | Valore |
   |---|---|
   | Framework preset | None |
   | Build command | *(vuoto)* |
   | Build output directory | `/` |

   Non c'e' niente da compilare: il sito e' un file HTML e le funzioni le
   impacchetta Cloudflare da sola. Se metti un build command, fallisce.

4. **Save and Deploy**

---

## 2. Le quattro variabili d'ambiente

Dopo il primo deploy: **Settings** → **Environment variables** → aggiungi
queste quattro a **Production** (e anche a Preview se vuoi che i rami di prova
funzionino). Scegli il tipo **Secret**, non Plaintext.

| Nome | Dove la trovi |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → `service_role` |
| `GOOGLE_PLACES_KEY` | Google Cloud Console → Credentials |

Sono gli stessi valori che erano su Vercel. Dopo averle inserite serve **un
nuovo deploy** perche' vengano lette: Deployments → ultimo deploy → Retry.

### Variabile facoltativa

`GOOGLE_MAPS_BROWSER_KEY` — vedi la nota di sicurezza in fondo.

---

## 3. La PWA sul telefono

**L'indirizzo cambia**: da `soundanalyst.vercel.app` a
`<nome-progetto>.pages.dev`. Per il browser e' un sito diverso, quindi
l'icona che hai gia' sulla home continuerebbe a puntare al vecchio indirizzo.

Sull'iPhone:

1. Tieni premuta l'icona di SoundAnalyst sulla home → **Rimuovi app**
2. Apri Safari sul nuovo indirizzo `.pages.dev`
3. Entra con il tuo account, cosi' la sessione si ricrea
4. Condividi → **Aggiungi alla schermata Home**
5. Apri l'app una volta **con rete**, per far scaricare la cache offline
6. Prova: metti il telefono in modalita' aereo e riaprila — deve partire lo
   stesso

Se qualcosa va storto con la cache, apri l'app aggiungendo `?nosw`
all'indirizzo: disattiva l'offline e svuota tutto. `?sw` lo riaccende.

### Se vuoi un indirizzo stabile

Un dominio tuo evita di rifare questo giro al prossimo trasloco. In Cloudflare:
Pages → **Custom domains**. Se il dominio e' gia' su Cloudflare bastano due
clic.

---

## 4. Cosa e' cambiato rispetto a Vercel

| Prima | Ora |
|---|---|
| `api/*.js` (funzioni Vercel) | `functions/api/*.js` (Pages Functions) |
| `export default handler(req, res)` | `export async function onRequestPost({ request, env })` |
| `process.env.NOME` | `env.NOME` |
| `@supabase/supabase-js` lato server | chiamate dirette a Supabase con `fetch` |
| `vercel.json`, `netlify.toml` | niente: non serve configurazione |
| `maxDuration: 180` | non serve: le richieste HTTP non hanno limite di durata |

Due note sul perche':

- **Supabase via `fetch`**: toglie l'unica dipendenza npm del lato server.
  Niente `package.json`, niente impacchettamento, niente `nodejs_compat` —
  una cosa in meno che puo' rompersi in fase di build.
- **La risposta di Anthropic non viene deserializzata**: su Worker il limite
  e' di CPU (10 ms), non di tempo, e l'attesa della rete non conta. Fare
  `JSON.parse` su 20.000 token di risposta sarebbe l'unico punto che
  consumerebbe CPU davvero, quindi il corpo viene girato al client cosi'
  com'e'.

### `_redirects`

La vecchia regola generica `/*  /index.html  200` e' stata tolta. Su
Cloudflare i redirect valgono **anche quando esiste un file** con quello
stesso percorso, quindi `/*` avrebbe servito `index.html` al posto di
`sw.js`, `manifest.json` e delle icone, rompendo la PWA. Resta solo la regola
per `/share/*`, che e' l'unico percorso gestito dal client.

---

## 5. Verifiche fatte

Le funzioni sono state provate in locale con `wrangler pages dev`, cioe' lo
stesso runtime che gira in produzione:

- `POST /api/analyze` senza token → `401` JSON, non una pagina HTML
- `OPTIONS /api/chat` → `204` con gli header CORS corretti
- `GET /api/_shared.js` → non espone il sorgente del modulo
- `GET /sw.js` e `/manifest.json` → servono i file veri, non `index.html`
- `GET /share/<token>` → serve `index.html`
- `POST /api/wrap` senza la variabile configurata → `500` con messaggio chiaro

Non e' stato possibile provare qui le chiamate vere a Supabase e Anthropic,
che richiedono le chiavi. **Dopo il primo deploy prova in quest'ordine**:
login → una chat con Gennaro (la piu' corta) → un'analisi di sceneggiatura
(la piu' lunga, e' quella che metteva alla prova i limiti di durata).

---

## 6. Due cose da sistemare quando hai tempo

**La chiave di Google Maps finisce nel browser.** `functions/api/wrap.js`
restituisce `gmapsKey` al client, perche' Maps JS la chiave la vuole per forza
li'. Oggi e' la stessa chiave usata lato server per Places: chiunque apra
l'app puo' leggerla e usarla. La cosa giusta e' creare in Google Cloud una
**seconda chiave limitata per referrer** al solo dominio dell'app, e metterla
in `GOOGLE_MAPS_BROWSER_KEY`. Il codice la usa gia' se c'e', e ricade sulla
vecchia se manca.

**Le fatture Vercel restano da pagare.** Spostare il deploy non chiude il
debito: va sistemato con il supporto Vercel, separatamente.

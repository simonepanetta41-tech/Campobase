# Deploy su Cloudflare Workers

Campobase era su Vercel. Questo branch lo porta su Cloudflare, dove il piano
gratuito regge l'app senza limiti di durata sulle richieste HTTP e senza il
divieto di uso commerciale che ha il piano Hobby di Vercel.

> **Workers, non Pages.** Il pannello di Cloudflare ormai crea Worker, non
> progetti Pages, e il primo tentativo di deploy e' fallito proprio per
> questo. Le due piattaforme hanno convenzioni diverse: su Pages le funzioni
> stanno in `functions/`, su Workers c'e' un solo script di ingresso
> dichiarato in `wrangler.jsonc`. Questo repo e' impostato per **Workers**.

---

## 1. Collegare il repo

1. Vai su **dash.cloudflare.com** → **Workers & Pages** → **Create** →
   **Import a repository**
2. Autorizza GitHub e scegli il repository `soundanalyst`
3. Nella configurazione lascia **tutto vuoto**:

   | Campo | Valore |
   |---|---|
   | Build command | *(vuoto)* |
   | Deploy command | `npx wrangler deploy` *(gia' il predefinito)* |

   Non c'e' niente da compilare, e non c'e' `package.json`: tutte le
   impostazioni le legge Cloudflare da `wrangler.jsonc`, che e' gia' nel
   repo. Se metti un build command, fallisce.

4. **Deploy**

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

1. Tieni premuta l'icona di Campobase sulla home → **Rimuovi app**
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
| `api/*.js`, una funzione per file | `worker/index.js`, un solo Worker con un instradatore |
| `export default handler(req, res)` | `export default { fetch(request, env) }` |
| `process.env.NOME` | `env.NOME` |
| `@supabase/supabase-js` lato server | chiamate dirette a Supabase con `fetch` |
| `vercel.json`, `netlify.toml` | `wrangler.jsonc` |
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

### Niente piu' `_redirects`

Il file e' stato eliminato. Su Workers un rewrite verso `/index.html` viene
**rifiutato in fase di deploy** come loop infinito — e' l'errore che ha fatto
fallire il primo tentativo:

```
Invalid _redirects configuration:
Line 1: Infinite loop detected in this rule.
```

L'equivalente corretto e' in `wrangler.jsonc`:

- `not_found_handling: "single-page-application"` manda su `index.html` i
  percorsi che non corrispondono a un file. Copre `/share/<token>`.
- `run_worker_first: ["/api/*"]` fa girare il Worker **prima** degli asset su
  quelle rotte. Senza, `/api/analyze` non corrisponderebbe a nessun file,
  ricadrebbe su `index.html` e il client riceverebbe HTML al posto del JSON.

### `.assetsignore`

La cartella pubblicata e' la radice del repo, quindi senza questo file
sarebbero scaricabili da chiunque il codice del Worker, le query SQL, questa
documentazione e `.git`. Se aggiungi file che non devono stare in rete,
mettili nell'elenco.

---

## 5. Verifiche fatte

Tutto provato in locale con `wrangler dev`, cioe' lo stesso runtime della
produzione, piu' `wrangler deploy --dry-run` per validare la configurazione:

- `POST` su `/api/analyze`, `/api/chat`, `/api/pdl` senza token → `401` JSON
- `POST /api/wrap` senza la variabile configurata → `500` con messaggio chiaro
- la risposta delle rotte `/api/` e' `application/json`, mai HTML
- `OPTIONS` → `204` con gli header CORS; `GET` → `405`; rotta inesistente → `404`
- `GET /sw.js`, `/manifest.json`, le icone → i file veri, non `index.html`
- `GET /` e `GET /share/<token>` → `index.html`
- `worker/`, `sql/`, i `.md`, `wrangler.jsonc` e `.git` → non raggiungibili

Non e' stato possibile provare qui le chiamate vere a Supabase e Anthropic,
che richiedono le chiavi. **Dopo il primo deploy prova in quest'ordine**:
login → una chat con Gennaro (la piu' corta) → un'analisi di sceneggiatura
(la piu' lunga, e' quella che metteva alla prova i limiti di durata).

---

## 6. Due cose da sistemare quando hai tempo

**La chiave di Google Maps finisce nel browser.** `worker/wrap.js`
restituisce `gmapsKey` al client, perche' Maps JS la chiave la vuole per forza
li'. Oggi e' la stessa chiave usata lato server per Places: chiunque apra
l'app puo' leggerla e usarla. La cosa giusta e' creare in Google Cloud una
**seconda chiave limitata per referrer** al solo dominio dell'app, e metterla
in `GOOGLE_MAPS_BROWSER_KEY`. Il codice la usa gia' se c'e', e ricade sulla
vecchia se manca.

**Le fatture Vercel restano da pagare.** Spostare il deploy non chiude il
debito: va sistemato con il supporto Vercel, separatamente.

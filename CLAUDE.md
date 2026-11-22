# Campobase — regole per chi ci mette le mani

- **Prima di ogni push gira tutta la serie**, non solo i test delle parti
  toccate: `cd test && NODE_PATH=$(npm root -g) node prova.js`. In una copia
  nuova del repo attivare il blocco: `git config core.hooksPath .githooks`.
- `git push` pubblica subito (Cloudflare). Prima del deploy gira
  `test/controllo-rapido.mjs` (wrangler.jsonc, `build.command`): se fallisce
  online resta la versione di prima. Dopo un push, la versione nuova deve
  comparire nell'app; se non compare, il controllo ha fermato il deploy.
- A ogni modifica di `index.html` o `sw.js` si alzano insieme `CB_VERSIONE`
  (index.html) e `CACHE` (sw.js): devono avere lo stesso numero.
- A ogni modifica di `admin.html` si alza di uno il secondo numero di
  `ADMIN_VERSIONE` (admin.html): e' la "A 1.4" in fondo alla pagina di
  amministrazione, separata dalla versione dell'app. Il primo numero scatta
  (2.0) solo con un rifacimento importante, deciso con Simone.
- Senza rete l'app mostra l'ultima cosa letta: tutte le chiamate a Supabase
  passano da `sbFetch` (index.html), che mette da parte ogni lettura e la
  restituisce quando la rete manca. Una lettura fatta con `fetch` diretto, o
  con una domanda che cambia a ogni apertura (un orario nell'indirizzo), senza
  rete non c'e'. Prove: `test/senza-rete.test.js`, `test/sw-rete.test.js`.
- **Mai riscrivere un file leggendolo nella stessa espressione**
  (`open(f,'w').write(open(f).read()...)` lo tronca prima di leggerlo: e'
  cosi' che `sw.js` e' andato online vuoto). Leggere, poi scrivere.
- `node --check` sui file del Worker non controlla niente (sono moduli ES):
  per sapere se si caricano, `node test/controllo-rapido.mjs`.
- Gli interruttori del server stanno nelle variabili di Cloudflare:
  `OMBRA_SCRIVE`, `PIANO_SCRIVE`, `OMBRA_AVVISI`, `OMBRA`, `PIANO`.

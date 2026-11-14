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
- **Mai riscrivere un file leggendolo nella stessa espressione**
  (`open(f,'w').write(open(f).read()...)` lo tronca prima di leggerlo: e'
  cosi' che `sw.js` e' andato online vuoto). Leggere, poi scrivere.
- `node --check` sui file del Worker non controlla niente (sono moduli ES):
  per sapere se si caricano, `node test/controllo-rapido.mjs`.
- Gli interruttori del server stanno nelle variabili di Cloudflare:
  `OMBRA_SCRIVE`, `PIANO_SCRIVE`, `OMBRA_AVVISI`, `OMBRA`, `PIANO`.

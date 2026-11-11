/* La scheda dell'interprete presa da TMDB.
 *
 * Wikipedia copre bene i nomi noti, che sono esattamente quelli per cui
 * non serve: davanti a un ordine del giorno i nomi che non riconosci sono
 * i caratteristi e la gente di teatro, e una voce enciclopedica non ce
 * l'hanno. TMDB ce li ha, spesso senza biografia ma sempre con i titoli —
 * e la domanda vera sul set e' "dove l'ho gia' vista".
 *
 * Qui non si chiama TMDB: si provano le decisioni, che sono tutte sui
 * bordi — quale persona scegliere fra gli omonimi, quali titoli mostrare,
 * e se quella biografia e' italiana o e' l'inglese che TMDB restituisce
 * senza dirlo.
 */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { sembraItaliano, scegli, titoli, nascita } = await import(RADICE + '/worker/attore.js');

let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(104) + ' atteso ' + JSON.stringify(exp)); };

console.log('\n── italiano o inglese ──');
/* TMDB risponde in it-IT, ma quando la traduzione italiana non c'e'
   restituisce l'inglese senza dirlo. Su un'app italiana un paragrafo in
   inglese stona, e stona di piu' se si presenta come la scheda italiana. */
ok('la biografia italiana passa', sembraItaliano(
  'Carmen Pommella è un\'attrice italiana nata a Napoli. Ha lavorato in teatro e al cinema con registi come Paolo Sorrentino.'), true);
// Quella vera di Toni Servillo su TMDB oggi.
ok('quella inglese no', sembraItaliano(
  'Marco Antonio Servillo (born 25 January 1959), known as Toni Servillo, is an Italian actor and theatrical director.'), false);
ok('una riga sola non basta', sembraItaliano('Attrice.'), false);
ok('niente biografia',        sembraItaliano(null), false);
ok('e nel dubbio si scarta',  sembraItaliano('Italian actor, director and writer born in Naples.'), false);

console.log('\n── quale persona, fra gli omonimi ──');
/* TMDB ordina per popolarita', e un attore di giornata non e' popolare:
   il primo risultato per un nome puo' essere un'altra persona. */
const RIS = [
  {id:1, name:'Carmen Russo',    known_for_department:'Acting', popularity:9},
  {id:2, name:'Carmen Pommella', known_for_department:'Acting', popularity:1.4},
  {id:3, name:'Carmen Pommella', known_for_department:'Production', popularity:0.6}
];
ok('vince il nome esatto', (scegli(RIS, 'Carmen Pommella')||{}).id, 2);
ok('e fra due esatti, chi recita', (scegli(
  [RIS[2], RIS[1]], 'Carmen Pommella')||{}).id, 2);
ok('un nome che non c\'è non si pesca', scegli(RIS, 'Mario Bianchi'), null);
ok('niente risultati, niente scelta', scegli([], 'Carmen Pommella'), null);
ok('e senza nome nemmeno',            scegli(RIS, ''), null);
// Un cognome solo basta se il resto combacia: sugli ordini del giorno
// capita di trovare il nome scritto corto.
ok('il quasi-uguale si accetta', (scegli(
  [{id:7, name:'Carmen Pommella', known_for_department:'Acting', popularity:1}], 'Pommella')||{}).id, 7);

console.log('\n── i titoli per cui la conosci ──');
const CREDITI = { cast: [
  {title:'Gomorra', character:'Rosaria', popularity:40},
  {title:'L\'amica geniale', character:'Maestra', popularity:35},
  {title:'È stata la mano di Dio', character:'Signora Gentile', popularity:30},
  {title:'Film senza ruolo', character:'', popularity:99},
  {title:'Gomorra', character:'Rosaria', popularity:20},
  {name:'Una serie TV', character:'Nonna', popularity:10},
  {title:'Settimo', character:'A', popularity:9},
  {title:'Ottavo', character:'B', popularity:8},
  {title:'Nono',   character:'C', popularity:7}
]};
const t = titoli(CREDITI);
ok('i più visti per primi', t.slice(0,3), ['Gomorra','L\'amica geniale','È stata la mano di Dio']);
// Un attore accreditato senza personaggio non te lo ricordi di certo.
ok('senza personaggio resta fuori', t.includes('Film senza ruolo'), false);
ok('niente doppioni',               t.filter(x=>x==='Gomorra').length, 1);
ok('anche le serie, che hanno name', t.includes('Una serie TV'), true);
ok('al massimo sei',                t.length, 6);
ok('senza crediti, lista vuota',    titoli(null), []);

console.log('\n── nascita ──');
// TMDB scrive i luoghi in inglese e non li traduce nemmeno in it-IT.
ok('luogo e data',      nascita('1972-01-14', 'Naples, Campania, Italy'), 'Napoli · 14 gennaio 1972');
ok('e le città tradotte', [nascita(null,'Rome, Italy'), nascita(null,'Milan, Italy'),
                           nascita(null,'Florence, Italy')], ['Roma','Milano','Firenze']);
ok('quelle uguali restano', nascita(null, 'Bari, Puglia, Italy'), 'Bari');
ok('solo il luogo',     nascita(null, 'Afragola, Campania, Italy'), 'Afragola');
ok('solo la data',      nascita('1959-01-25', null), '25 gennaio 1959');
ok('niente di niente',  nascita(null, null), null);
ok('una data storta non rompe', nascita('chissà', 'Roma, Italy'), 'Roma');

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);

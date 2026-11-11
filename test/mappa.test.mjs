// Il lettore di coordinate: le forme in cui Google le scrive.
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const src = await (await import('node:fs/promises')).readFile(RADICE + '/worker/index.js','utf8');
const taglio = src.indexOf('const ROUTES');
const fn = new Function(src.slice(0, taglio>0?taglio:src.length)
  .replace(/^\s*import .*$/gm,'').replace(/^\s*export /gm,'')
  + '\nreturn {coordinateDa, nomeDa, sbuccia};')();
let ko=0; const ok=(n,g,e)=>{const b=JSON.stringify(g)===JSON.stringify(e);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${n.padEnd(46)} ${JSON.stringify(g)}`);};
const C=fn.coordinateDa, N=fn.nomeDa;
ok('indirizzo lungo con la chiocciola', C('https://www.google.com/maps/place/Masseria/@40.4912,17.3312,17z'), {lat:40.4912,lon:17.3312});
ok('dentro i dati del posto',           C('https://www.google.com/maps/place/X/data=!4m2!3d40.4912!4d17.3312'), {lat:40.4912,lon:17.3312});
ok('uno spillo senza nome',             C('https://maps.google.com/?q=40.4912,17.3312'), {lat:40.4912,lon:17.3312});
ok('la pagina del consenso, codificata',
   C('https://consent.google.com/m?continue=https%3A%2F%2Fwww.google.com%2Fmaps%2Fplace%2FMasseria%2F%4040.4912%2C17.3312%2C17z'),
   {lat:40.4912,lon:17.3312});
ok('e anche codificata due volte',
   C('https://consent.google.com/m?c=https%253A%252F%252Fmaps.google.com%252F%253Fq%253D40.4912%252C17.3312'),
   {lat:40.4912,lon:17.3312});
ok('apple mappe',                       C('https://maps.apple.com/?ll=40.4912,17.3312&q=CB'), {lat:40.4912,lon:17.3312});
ok('una destinazione',                  C('https://www.google.com/maps/dir/?destination=40.4912,17.3312'), {lat:40.4912,lon:17.3312});
ok('niente coordinate, niente numeri',  C('https://maps.app.goo.gl/2kUywsjpG4SfNNrN7?g_st=iw'), null);
ok('un numero impossibile si scarta',   C('https://maps.google.com/?q=140.4912,17.3312'), null);
ok('il nome del posto',                 N('https://www.google.com/maps/place/Masseria+Accetta+Grande/@40.49,17.33'), 'Masseria Accetta Grande');
ok('anche dentro il consenso',          N('https://consent.google.com/m?continue=https%3A%2F%2Fwww.google.com%2Fmaps%2Fplace%2FMasseria%2BAccetta%2F%4040.49'), 'Masseria Accetta');
ok('ma non delle coordinate in gradi',  N('https://www.google.com/maps/place/40%C2%B033\'34.6%22N/@40.49,17.33'), null);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);

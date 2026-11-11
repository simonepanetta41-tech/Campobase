const RADICE = require('path').join(__dirname, '..');
const fs=require('fs');
const {chromium}=require('playwright');
const src=fs.readFileSync(RADICE + '/index.html','utf8');

// Tutte le regole .tt2 prese dal file vero.
let css='';
for(const m of src.matchAll(/^(?:table\.tt2|\.tt2[^{\n]*)\{[^}]*\}$/gm)) css+=m[0]+'\n';
// Le variabili di colore.
// Le variabili dei due temi, prese dal file.
for(const sel of [':root','body.light']){
  const i=src.indexOf('\n'+sel+' {');
  if(i<0){console.log('tema non trovato:',sel);continue;}
  css=src.slice(i+1,src.indexOf('\n}',i)+2)+'\n'+css;
}

const righe=['Partenza','Inizio','Pausa','Stop','Fine','Rientro'];
const calc=['Ore viaggio 55%','Magg. nott. 55%','Magg. nott. 80%','Golden ord.','Golden nott.','Golden 6°g.'];
const giorni=['LUN','MAR','MER','GIO','VEN','SAB'];
let t='<table class="tt2"><thead><tr><th class="lbl2"></th>'+
  giorni.map(d=>`<th>${d}</th>`).join('')+'<th style="width:82px;min-width:82px">TOTALE</th></tr></thead><tbody>';
t+='<tr class="secrow2"><td class="lbl2">orari</td><td colspan="7"></td></tr>';
for(const r of righe){t+=`<tr><td class="lbl2">${r}</td>`+giorni.map(()=>'<td><input class="ti" value="09.00"></td>').join('')+'<td class="tot2">—</td></tr>';}
t+='<tr class="secrow2"><td class="lbl2">calcolato</td><td colspan="7"></td></tr>';
for(const r of calc){t+=`<tr><td class="lbl2 calc2">${r}</td>`+giorni.map(()=>'<td class="comp2">1h</td>').join('')+'<td class="tot2">3h</td></tr>';}
t+='</tbody></table>';

const pagina=`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0;background:#0d0d0d;color:#fff;font-family:'DM Mono',monospace}
${css}
.card{background:var(--surface,#161616);padding:14px 16px}
</style></head><body><div class="card"><div id="sc" style="overflow-x:auto">${t}</div></div></body></html>`;

(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  await p.setContent(pagina);
  const misura=async()=>p.evaluate(()=>{
    const sc=document.getElementById('sc');
    const et=[...document.querySelectorAll('.tt2 td.lbl2')].map(e=>({t:e.textContent.trim(),x:Math.round(e.getBoundingClientRect().left)}));
    const sez=[...document.querySelectorAll('.tt2 tr.secrow2 td.lbl2')].map(e=>({t:e.textContent.trim(),x:Math.round(e.getBoundingClientRect().left)}));
    const sf=getComputedStyle(document.querySelector('.tt2 td.lbl2')).backgroundColor;
    return {scroll:sc.scrollLeft,max:sc.scrollWidth-sc.clientWidth,etichette:et,sezioni:sez,sfondo:sf};
  });
  const a=await misura();
  await p.evaluate(()=>{document.getElementById('sc').scrollLeft=9999;});
  await p.waitForTimeout(120);
  const d=await misura();
  console.log('scorrimento disponibile:',a.max,'px — dopo lo scroll:',d.scroll,'px\n');
  console.log('etichetta           x prima   x dopo');
  let ko=0;
  for(let i=0;i<a.etichette.length;i++){
    const pr=a.etichette[i], po=d.etichette[i];
    const fermo=Math.abs(pr.x-po.x)<=1;
    if(!fermo)ko++;
    console.log(`  ${fermo?'ok ':'KO '}${pr.t.padEnd(18)} ${String(pr.x).padEnd(9)} ${po.x}`);
  }
  for(let i=0;i<a.sezioni.length;i++){
    const pr=a.sezioni[i], po=d.sezioni[i];
    const fermo=Math.abs(pr.x-po.x)<=1;
    if(!fermo)ko++;
    console.log(`  ${fermo?'ok ':'KO '}${('['+pr.t+']').padEnd(18)} ${String(pr.x).padEnd(9)} ${po.x}`);
  }
  // Una colonna ferma ma trasparente lascia scorrere il resto sotto il
  // testo: il difetto e' identico a non averla bloccata.
  const opaco=d.sfondo&&!/rgba\(.*,\s*0?\.?\d*\)$/.test(d.sfondo.replace(/,\s*1\)$/,')'))&&d.sfondo!=='rgba(0, 0, 0, 0)';
  if(!opaco)ko++;
  console.log(`  ${opaco?'ok ':'KO '}sfondo della colonna ferma: ${d.sfondo}`);
  await p.screenshot({path:'/tmp/claude-0/-home-claude/53b34710-362c-5fb2-bfbf-da310a874ca4/scratchpad/timetable-scrollata.png'});
  console.log(ko===0?'\nok — la colonna resta ferma':`\nKO — ${ko} etichette scorrono via`);
  await b.close(); process.exit(ko?1:0);
})();

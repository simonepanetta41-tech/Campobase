const RADICE = require('path').join(__dirname, '..');
const fs=require('fs');
const {chromium}=require('playwright');
const src=fs.readFileSync(RADICE + '/index.html','utf8');

// Prende dal file le regole che governano la griglia del calendario.
const regole=['.cal-grid {','.cal-cell {','.cal-cell-day {','.cal-cell-giorno {','.cal-cell-viaggio {','.cal-cell-loc {'];
let css='';
for(const r of regole){
  const i=src.indexOf('\n'+r);
  if(i<0){console.log('regola non trovata:',r);continue;}
  css+=src.slice(i+1,src.indexOf('}',i)+1)+'\n';
}
// Anche il blocco @media per schermo stretto.
const im=src.indexOf('@media (max-width:600px)');
if(im>0){
  let liv=0,j=src.indexOf('{',im);
  for(let k=j;k<src.length;k++){
    if(src[k]==='{')liv++;else if(src[k]==='}'){liv--;if(!liv){css+=src.slice(im,k+1)+'\n';break;}}
  }
}

const pagina=`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0;background:#111;color:#fff;font-family:monospace}
.wrap{padding:12px}
${css}
.cal-cell{background:#2a2a2a}
</style></head><body><div class="wrap"><div class="cal-grid" id="g"></div></div>
<script>
const g=document.getElementById('g');
const etichette=['NAPOLI','TRASFERIMENTO','REGGIA DI CASERTA','',' ','VIAGGIO','SAN GIOVANNI A TEDUCCIO'];
for(let i=0;i<7;i++){
  const d=document.createElement('div');
  d.className='cal-cell has-shooting'+(i%3===0?' is-viaggio':'');
  d.innerHTML='<div class="cal-cell-day">'+(i+2)+'</div><div class="cal-cell-giorno">D'+(14+i)+' 16:00</div>'+
    (etichettei=>i)(0);
  g.appendChild(d);
}
<\/script></body></html>`;

(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  await p.setContent(pagina.replace("(etichettei=>i)(0)","(etichette[i]?'<div class=\"cal-cell-viaggio\">\\u{1F68C} '+etichette[i]+'</div>':'')"));
  const r=await p.evaluate(()=>{
    const g=document.getElementById('g');
    const b=document.body;
    return {
      grigliaScroll:g.scrollWidth, grigliaVisibile:g.clientWidth,
      paginaScroll:b.scrollWidth, paginaVisibile:document.documentElement.clientWidth,
      larghezzeCelle:[...g.children].map(c=>Math.round(c.getBoundingClientRect().width))
    };
  });
  console.log('griglia  scroll',r.grigliaScroll,'visibile',r.grigliaVisibile);
  console.log('pagina   scroll',r.paginaScroll,'visibile',r.paginaVisibile);
  console.log('celle   ',r.larghezzeCelle.join(' '));
  const ok=r.paginaScroll<=r.paginaVisibile && new Set(r.larghezzeCelle).size<=2;
  console.log(ok?'\nok — niente debordamento, colonne uniformi':'\nKO — la griglia esce dallo schermo');
  await p.screenshot({path:'/tmp/claude-0/-home-claude/53b34710-362c-5fb2-bfbf-da310a874ca4/scratchpad/calendario.png'});
  await b.close();
  process.exit(ok?0:1);
})();

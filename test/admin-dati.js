// Dati finti condivisi fra il test della pagina e le anteprime.
module.exports = function dati() {
  const ora = Date.now(), fa = m => new Date(ora - m * 60000).toISOString();
  const FA='f1f1f1f1-1111-4111-8111-111111111111', FB='f2f2f2f2-1111-4111-8111-111111111111', A='aaaaaaaa-1111-4111-8111-111111111111';
  const M1='11111111-2222-4222-8222-222222222222', M2='22222222-2222-4222-8222-222222222222', M3='33333333-2222-4222-8222-222222222222', M4='44444444-2222-4222-8222-222222222222';
  const msg={id:FA,titolo:'Missione San Gennaro',sigla:'MSG'};
  const mail=[
    {id:M1,film:msg,oggetto:'MSG - ODG #30 del 21.11.2026 + Giri Auto, Stralci',ricevuta:fa(60*17),esito:'letta',colore:'g',secondi:44,notifiche:10,allegati:3,dollari:0.144},
    {id:M2,film:msg,oggetto:'MSG - ERRATA CORRIGE ODG #29',ricevuta:fa(60*40),esito:'errata',colore:'y',secondi:41,notifiche:10,allegati:2,dollari:0.139},
    {id:M3,film:msg,oggetto:'Promemoria alle disposizioni di sicurezza',ricevuta:fa(60*47),esito:'senza allegati',colore:'m',secondi:null,notifiche:null,allegati:0,dollari:0},
    {id:M4,film:msg,oggetto:'MSG - PDL 8 del 24.11',ricevuta:fa(60*70),esito:'errore',colore:'r',secondi:95,notifiche:null,allegati:1,dollari:0.31}];
  const somma=(c,e,u,d)=>({chiamate:c,entrata:e,uscita:u,dollari:d,senzaPrezzo:0});
  return { FA, FB, A, M1,
    film:{film:[{id:FA,titolo:'Missione San Gennaro',sigla:'MSG',membri:16,capo:'Simone Panetta',casella:'84956e3c3046df55',mail:23,ultimaMail:fa(60*17),dollari:6.42},
                {id:FB,titolo:'Separazioni',sigla:null,membri:1,capo:'Luca Berti',casella:null,mail:0,ultimaMail:null,dollari:0}]},
    filmUno:{id:FA,titolo:'Missione San Gennaro',sigla:'MSG',casella:'84956e3c3046df55',codice:'K7QM2X',mittente:'produzione@esempio.it',esclusi:1,capo:'Simone Panetta',dentro:{analisi:1,odg:30,mail:23},
      membri:[{id:A,nome:'Simone Panetta',reparto:'Suono',ruolo:'capo',segna:true,telefono:true},{id:A,nome:'Anna Riva',reparto:'Regia',ruolo:'membro',segna:true,telefono:true},
              {id:A,nome:'Luca Berti',reparto:'Fotografia',ruolo:'membro',segna:false,telefono:false}],
      posta:mail.slice(0,3),totale:somma(63,1100000,420000,6.42),
      consumi:[{scopo:'piano',origine:'server',...somma(20,543190,197104,3.06)},{scopo:'odg',origine:'server',...somma(22,340000,221000,2.89)},
               {scopo:'spoglio',origine:'telefono',...somma(3,150000,30000,0.45)},{scopo:'stralci',origine:'server',...somma(18,60000,9000,0.02)}]},
    posta:{mail,lette:2,errori:1},
    mail:{...mail[0],nota:null,mittente:'produzione@esempio.it',haOdg:true,haPiano:false,rileggibile:{odg:true,piano:false},
      allegati:[{nome:'MSG - ODG _30 del 21.11.2026.pdf',byte:732000,tenuto:true,genere:'odg'},{nome:'30 MSG - GIRI AUTO di Sabato.pdf',byte:217000,tenuto:true,genere:'giri'},
                {nome:'STRALCI #30.pdf',byte:1468000,tenuto:true,genere:'stralci'},{nome:'logo.png',byte:9000,tenuto:false,genere:null}],
      passi:[{quando:fa(60*17),titolo:'Arrivata',testo:'3 allegati · da produzione@esempio.it',colore:''},
             {quando:fa(60*17-0.8),titolo:'Ordine del giorno: letto in 44 s',testo:'15,9k token in · 10,4k out · $0,136',colore:''},
             {quando:fa(60*17-0.8),titolo:'Ordine del giorno: scritto',testo:'giorno 2026-11-21 · 14 avvisi di pick-up e catering',colore:'g'},
             {quando:fa(60*17-0.8),titolo:'10 notifiche',testo:'8 mostrate, 2 senza conferma',colore:'y'},
             {quando:fa(60*17-1.1),titolo:'Indice stralci',testo:'48k token in · 600 out · $0,008',colore:''}]},
    lettura:{letto:{numero:30,data:'2026-11-21',convocazione:'12:00',luoghi:[{nome:'Chiesa di San Gennaro',indirizzo:'Via Duomo 147, 80138 Napoli'}]},testo:null},
    server:{stato:{ultima:{quando:fa(60*17),esito:'letta',colore:'g',oggetto:'MSG - ODG #30'},coda:0,errori:1,mail:9,secondi:46,notifiche:{partite:96,senza:4}},
      costi:{oggi:somma(2,40000,9000,0.17),ieri:somma(5,90000,30000,0.48),sette:somma(31,600000,260000,3.8),sempre:somma(63,1100000,420000,6.42),dal:'2026-11-12T10:00:00Z',
        scopi:[{scopo:'piano',origine:'server',...somma(20,543190,197104,3.06)},{scopo:'odg',origine:'server',...somma(22,340000,221000,2.89)},
               {scopo:'spoglio',origine:'telefono',...somma(3,150000,30000,0.45)},{scopo:'stralci',origine:'server',...somma(18,60000,9000,0.02)}],troncato:false,manca:false,
        giorni:[0,0.31,0.62,0,0.48,0.71,0.29,0,0.66,1.24,0.52,0.3,0.48,0.17].map((d,i)=>({giorno:new Date(ora-(13-i)*86400000).toISOString().slice(0,10),dollari:d,chiamate:d?Math.round(d*8):0})),
        persone:[{id:A,nome:'Anna Riva',...somma(2,120000,22000,0.34)},{id:A,nome:'Luca Berti',...somma(1,30000,8000,0.11)}]},
      tempi:[44,41,47,52,39,43,95,45,42,46,44].map((s,i)=>({quando:fa(60*24*(11-i)),secondi:s,oggetto:'MSG - ODG #'+(20+i)})),
      versioni:{ultima:'1.176',aggiornati:12,indietro:[{id:A,nome:'Luca Berti',versione:'1.171',vista:fa(60*50)}],ignoti:3},
      prezzi:[{modello:'claude-sonnet-5-5',entrata:2,uscita:10},{modello:'claude-haiku-5-5',entrata:0.1,uscita:0.5}],
      interruttori:[{nome:'Legge gli ordini del giorno',acceso:true},{nome:'Scrive gli ordini del giorno',acceso:true},{nome:'Legge i piani',acceso:true},{nome:'Scrive i piani',acceso:true},
        {nome:'Smistamento allegati',acceso:true},{nome:'Indice degli stralci',acceso:true}]} };
};

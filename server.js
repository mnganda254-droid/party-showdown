const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const rooms = new Map();
const questions = [
  { type:'TRIVIA', title:'Quick fire', prompt:'Which planet has the most prominent ring system?', choices:['Mars','Saturn','Venus','Mercury'], answer:1, explanation:'Saturn is famous for its spectacular ring system.' },
  { type:'WORD SCRAMBLE', title:'Unscramble it', prompt:'Rearrange these letters to make a fruit:  A N A N A B', choices:['BANANA','CABANA','BANDANA','ANABAN'], answer:0, explanation:'BANANA is the fruit.' },
  { type:'RIDDLE', title:'Think fast', prompt:'What has keys but can’t open locks?', choices:['A treasure chest','A piano','A map','A clock'], answer:1, explanation:'A piano has musical keys.' },
  { type:'TRIVIA', title:'Brain boost', prompt:'How many sides does a hexagon have?', choices:['Five','Six','Seven','Eight'], answer:1, explanation:'A hexagon has six sides.' },
  { type:'WORD PLAY', title:'Odd one out', prompt:'Which one does not belong?', choices:['Whisper','Shout','Speak','Listen'], answer:3, explanation:'Listen is receiving sound; the others are ways of producing speech.' },
  { type:'TRIVIA', title:'Around the world', prompt:'Which is the largest ocean on Earth?', choices:['Atlantic','Indian','Arctic','Pacific'], answer:3, explanation:'The Pacific Ocean is the largest.' },
  { type:'RIDDLE', title:'Puzzle time', prompt:'The more you take, the more you leave behind. What are they?', choices:['Photographs','Footsteps','Coins','Breaths'], answer:1, explanation:'You leave footprints or footsteps as you walk.' },
  { type:'TRIVIA', title:'Pop knowledge', prompt:'Which instrument typically has 88 keys?', choices:['Violin','Flute','Piano','Trumpet'], answer:2, explanation:'A standard modern piano has 88 keys.' },
  { type:'WORD SCRAMBLE', title:'Letter race', prompt:'Rearrange these letters to make an animal:  G I T E R', choices:['TIGER','GRITE','TRIG','GREAT'], answer:0, explanation:'TIGER is the animal.' },
  { type:'FINAL BOSS', title:'The grand finale', prompt:'Which number is the only even prime number?', choices:['0','1','2','4'], answer:2, explanation:'2 is divisible only by 1 and itself. It earns the special challenge bonus.' }
];

function code(){ return crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase(); }
function publicRoom(r){
  const q = r.status === 'question' || r.status === 'reveal' ? questions[r.round] : null;
  return {
    code:r.code, status:r.status, hostId:r.hostId, round:r.round, totalRounds:questions.length,
    players:[...r.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,connected:p.connected,answered:r.answers.has(p.id)})),
    question:q ? {type:q.type,title:q.title,prompt:q.prompt,choices:q.choices,explanation:r.status==='reveal'?q.explanation:null,answer:r.status==='reveal'?q.answer:null} : null,
    deadline:r.deadline, revealUntil:r.revealUntil,
    lastRound:r.status==='reveal' ? [...r.answers.entries()].map(([id,a])=>({id,choice:a.choice,correct:a.correct,points:a.points,bonus:a.bonus,rank:a.rank})) : [],
    winner:r.status==='finished' ? [...r.players.values()].sort((a,b)=>b.score-a.score).slice(0,3).map(p=>({id:p.id,name:p.name,score:p.score})) : []
  };
}
function broadcast(r){ const data='data: '+JSON.stringify(publicRoom(r))+'\n\n'; for(const res of r.clients) res.write(data); }
function startRound(r){
  if(r.round >= questions.length){ r.status='finished'; r.deadline=null; broadcast(r); return; }
  r.status='question'; r.answers.clear(); r.deadline=Date.now()+18000; r.revealUntil=null; broadcast(r);
  clearTimeout(r.timer); r.timer=setTimeout(()=>endRound(r),18000);
}
function endRound(r){
  if(r.status!=='question') return;
  r.status='reveal'; r.deadline=null; r.revealUntil=Date.now()+5000; broadcast(r);
  clearTimeout(r.timer); r.timer=setTimeout(()=>{r.round++; startRound(r);},5000);
}
function send(res,status,body,headers={}){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*',...headers});res.end(JSON.stringify(body));}
const server=http.createServer((req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET' && url.pathname==='/events'){
    const c=(url.searchParams.get('code')||'').toUpperCase(), id=url.searchParams.get('id'); const r=rooms.get(c);
    if(!r || !r.players.has(id)){res.writeHead(404);return res.end('Room or player not found');}
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});res.write('retry: 1500\n\n');r.clients.add(res);r.players.get(id).connected=true;broadcast(r);
    req.on('close',()=>{r.clients.delete(res);const p=r.players.get(id);if(p)p.connected=false;broadcast(r);}); return;
  }
  if(req.method==='GET' && url.pathname==='/api/room'){
    const r=rooms.get((url.searchParams.get('code')||'').toUpperCase()); if(!r)return send(res,404,{error:'Room not found'}); return send(res,200,publicRoom(r));
  }
  if(req.method==='POST' && url.pathname.startsWith('/api/')){
    let raw='';req.on('data',d=>raw+=d);req.on('end',()=>{
      let b={};try{b=JSON.parse(raw||'{}')}catch{return send(res,400,{error:'Invalid JSON'});}
      if(url.pathname==='/api/create'){
        const name=String(b.name||'').trim().slice(0,18);if(!name)return send(res,400,{error:'Enter a player name'});
        let c;do{c=code()}while(rooms.has(c));const id=crypto.randomUUID();const r={code:c,hostId:id,players:new Map([[id,{id,name,score:0,connected:false}]]),clients:new Set(),status:'lobby',round:0,answers:new Map(),deadline:null,timer:null};rooms.set(c,r);return send(res,200,{code:c,id,room:publicRoom(r)});
      }
      const c=String(b.code||'').toUpperCase(),r=rooms.get(c);if(!r)return send(res,404,{error:'That room code was not found'});
      if(url.pathname==='/api/join'){
        const name=String(b.name||'').trim().slice(0,18);if(!name)return send(res,400,{error:'Enter a player name'});if(r.status!=='lobby')return send(res,400,{error:'This game has already started'});if(r.players.size>=8)return send(res,400,{error:'This room is full (8 players max)'});
        if([...r.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return send(res,400,{error:'That name is already taken in this room'});
        const id=crypto.randomUUID();r.players.set(id,{id,name,score:0,connected:false});broadcast(r);return send(res,200,{code:c,id,room:publicRoom(r)});
      }
      const p=r.players.get(b.id);if(!p)return send(res,403,{error:'You are not in this room'});
      if(url.pathname==='/api/start'){
        if(b.id!==r.hostId)return send(res,403,{error:'Only the host can start the game'});if(r.status!=='lobby')return send(res,400,{error:'Game already started'});if(r.players.size<2)return send(res,400,{error:'At least 2 players are needed'});r.round=0;startRound(r);return send(res,200,{ok:true});
      }
      if(url.pathname==='/api/answer'){
        if(r.status!=='question')return send(res,400,{error:'This round is not accepting answers'});if(r.answers.has(b.id))return send(res,400,{error:'You already answered'});
        const q=questions[r.round],choice=Number(b.choice);if(!Number.isInteger(choice)||choice<0||choice>=q.choices.length)return send(res,400,{error:'Choose an answer'});
        const correct=choice===q.answer, rank=correct?[...r.answers.values()].filter(a=>a.correct).length+1:0, bonus=correct?(rank===1?50:rank===2?30:rank===3?10:0):0;
        const special=r.round===questions.length-1 && correct && rank===1?100:0;const points=(correct?100:0)+bonus+special;p.score+=points;r.answers.set(b.id,{choice,correct,points,bonus:bonus+special,rank});
        if(r.answers.size===r.players.size)endRound(r);else broadcast(r);return send(res,200,{ok:true});
      }
      if(url.pathname==='/api/leave'){
        if(r.status==='lobby'){r.players.delete(b.id);if(!r.players.size)rooms.delete(c);else{if(r.hostId===b.id)r.hostId=r.players.keys().next().value;broadcast(r);}}return send(res,200,{ok:true});
      }
      return send(res,404,{error:'Unknown endpoint'});
    });return;
  }
  let file=url.pathname==='/'?'index.html':url.pathname.slice(1);const full=path.join(ROOT,file);if(!full.startsWith(ROOT)){res.writeHead(403);return res.end();}
  fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}const ext=path.extname(full);res.writeHead(200,{'Content-Type':ext==='.css'?'text/css':ext==='.js'?'text/javascript':'text/html'});res.end(data);});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Party Showdown running on http://localhost:${PORT}`));

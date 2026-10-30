'use strict';
// BLASTRIDGE telemetry: disabled until OPS_SITE_URL and OPS_SITE_TOKEN are configured.
// Bounded in-process counters; disk and network work runs outside the simulation tick.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const pct=(a,q)=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.max(0,Math.ceil(s.length*q)-1)]};
const r=v=>Math.round(v*100)/100;
exports.createOpsTelemetry=function({io,rooms,build,config={},fetchImpl=globalThis.fetch}){
 const wallNow=config.now??Date.now;
 const base=config.url??process.env.OPS_SITE_URL,token=config.token??process.env.OPS_SITE_TOKEN;
 const disabled={enabled:false,startRoom(){},endRoom(){},tick(){},sent(){},stall(){},error(){},attach(){},close:async()=>{}};
 if(!base||!token)return disabled;
 const url=new URL('/api/ingest',base);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('OPS_SITE_URL must use HTTPS');
 const serverId=String(config.serverId??process.env.OPS_SERVER_ID??'kamatera-bucharest').replace(/[^a-zA-Z0-9_.:-]/g,'-').slice(0,80);
 const region='București',bootId=crypto.randomUUID(),outDir=config.outDir??process.env.OPS_QUEUE_DIR??path.join(__dirname,'.ops-queue');
 const states=new Map(),pending=[];let writing=Promise.resolve(),sending=false,closed=false,nextTry=0,failures=0,dropped=0,sequence=0;
 const newRecord=(kind,matchId,data,at=wallNow())=>({id:crypto.randomUUID(),kind,matchId:matchId??null,serverId,at,data});
 function enqueue(kind,matchId,data,at){if(pending.length>=500){dropped++;return false}pending.push(newRecord(kind,matchId,data,at));if(pending.length>=50)spool();return true}
 function spool(){if(!pending.length)return writing;const rows=[];let size=0;while(pending.length&&rows.length<50){const len=JSON.stringify(pending[0]).length;if(rows.length&&size+len>1300000)break;rows.push(pending.shift());size+=len}writing=writing.then(async()=>{await fs.mkdir(outDir,{recursive:true,mode:0o700});const files=await fs.readdir(outDir);const diskBytes=(await Promise.all(files.filter(n=>n.endsWith('.json')).map(n=>fs.stat(path.join(outDir,n)).then(s=>s.size).catch(()=>0)))).reduce((a,b)=>a+b,0);if(files.length>=1000||diskBytes+size>50*1024*1024){dropped+=rows.length;console.warn('[OPS] Telemetry outbox full; check connection.');return}const name=wallNow()+'-'+String(sequence++).padStart(6,'0')+'-'+crypto.randomUUID()+'.json',temp=path.join(outDir,name+'.tmp');await fs.writeFile(temp,JSON.stringify({format:'blastridge-telemetry',version:1,records:rows}),{mode:0o600});await fs.rename(temp,path.join(outDir,name))}).catch(()=>{dropped+=rows.length;console.warn('[OPS] Could not persist telemetry batch.');});return writing}
 async function send(){if(sending||wallNow()<nextTry||closed)return;sending=true;try{await spool();const files=(await fs.readdir(outDir).catch(()=>[])).filter(x=>x.endsWith('.json')).sort();for(const name of files.slice(0,3)){const file=path.join(outDir,name),body=await fs.readFile(file,'utf8');const obj=JSON.parse(body);obj.records=obj.records.filter(x=>x.at>=wallNow()-30*86400000);if(!obj.records.length){await fs.unlink(file);continue}const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+token},body:JSON.stringify(obj),signal:AbortSignal.timeout(8000),redirect:'error'});if(!response.ok)throw Error('HTTP '+response.status);const result=await response.json();if(!result.ok)throw Error('Rejected batch');await fs.unlink(file)}failures=0;nextTry=0}catch{failures++;nextTry=wallNow()+Math.min(300000,5000*2**Math.min(failures,6));if(failures===1||failures%10===0)console.warn('[OPS] Dashboard unavailable; queued data will be retried.')}finally{sending=false}}
 const counts=room=>{const p=room._playerArr??[];let alive=0,zombies=0;for(const x of p)if(x.alive)alive++;for(const z of room.zombies??[])if(z.alive)zombies++;return {players:p.length,alive,zombies,bullets:(room.bullets??[]).length,entities:p.length+zombies+(room.bullets??[]).length}}
 function context(socket,state){socket._opsMatchId=state.id;socket._opsAllowedMatches=socket._opsAllowedMatches||[];if(!socket._opsAllowedMatches.includes(state.id))socket._opsAllowedMatches.push(state.id);socket._opsAllowedMatches=socket._opsAllowedMatches.slice(-2);socket.emit('ops-context',{enabled:true,matchId:state.id,serverId,region,build:build()})}
 function sample(state,now=wallNow()){
  if(!state.ticks.length)return;const elapsed=(now-state.window)/1000,c=counts(state.room);
  enqueue('server-sample',state.id,{...c,targetHz:60,windowMs:Math.round(elapsed*1000),tps:r(state.ticks.length/Math.max(.01,elapsed)),tickAvgMs:r(state.ticks.reduce((a,b)=>a+b,0)/state.ticks.length),tickP95Ms:r(pct(state.ticks,.95)),tickMaxMs:r(Math.max(...state.ticks)),lateP95Ms:r(pct(state.late,.95)),packets:state.packets,bytes:state.bytes,wave:state.room.pveWave??0,countdown:!!state.room.countdownActive},now);
  state.ticks=[];state.late=[];state.packets=0;state.bytes=0;state.window=now;
 }
 function endRoom(room,result='ended'){const state=states.get(room);if(!state)return;sample(state);enqueue('match-end',state.id,{result,roomId:state.code,...counts(room)});states.delete(room);void spool()}
 const api={enabled:true,
  startRoom(code,room){endRoom(room,'restarted');const id=bootId+':'+crypto.randomUUID();const state={id,code,room,window:wallNow(),ticks:[],late:[],packets:0,bytes:0};states.set(room,state);room._opsMatchId=id;enqueue('match-start',id,{roomId:code,mode:room.mode==='pve'?'pve':'br',region,build:build(),targetHz:60,...counts(room)});for(const p of room._playerArr??[]){const sock=io.sockets.sockets.get(p.id);if(sock)context(sock,state)}void spool()},
  endRoom,
  tick(room,ms,late){const s=states.get(room);if(!s)return;if(s.ticks.length<1200){s.ticks.push(ms);s.late.push(Math.max(0,late||0))}},
  sent(room,bytes){const s=states.get(room);if(s){s.packets++;s.bytes+=bytes}},
  stall(ms,at=wallNow()){for(const s of states.values())enqueue('server-stall',s.id,{durationMs:r(ms),scope:'process'},at)},
  error(room){const s=states.get(room);if(s)enqueue('server-error',s.id,{message:'Game loop error; inspect VPS logs.'})},
  attach(socket){
   socket.on('ops-context-request',()=>{const room=rooms()?.get(socket._roomCode),s=room&&states.get(room);if(s)context(socket,s)});
   socket.on('ops-blackbox',(report,ack)=>{const reply=typeof ack==='function'?ack:()=>{};const now=wallNow();if(!socket._nickname||!socket._opsMatchId||now-(socket._opsUploadAt||0)<5000){reply({ok:false,error:'Not available or rate limited'});return}socket._opsUploadAt=now;
    try{if(typeof report==='string'){if(report.length>900000)throw Error();report=JSON.parse(report)}if(!report||report.format!=='arena-blackbox'||report.version!==1||!report.summary||!Array.isArray(report.incidents)||!report.window||!report.series)throw Error();const from=Date.parse(report.window.wallStart),to=Date.parse(report.window.wallEnd);if(!Number.isFinite(from)||!Number.isFinite(to)||to<from||to-from>100000||Math.abs(now-to)>300000)throw Error();const text=JSON.stringify(report);if(Buffer.byteLength(text)>900000)throw Error();const clientId=crypto.createHash('sha256').update(bootId+socket.id).digest('hex').slice(0,16);const matchId=report.header&&report.header.matchId;if(!socket._opsAllowedMatches||!socket._opsAllowedMatches.includes(matchId))throw Error();const safe={...report,header:{matchId,serverId,region,build:build()}};if(!enqueue('blackbox',matchId,{report:safe,clientId,source:'live'},to))throw Error();void spool();reply({ok:true})}catch{reply({ok:false,error:'Invalid capture'})}
   });
  },
  async close(){clearInterval(interval);clearInterval(heartbeat);for(const room of [...states.keys()])endRoom(room,'server-stop');while(pending.length)await spool();await send();closed=true;await writing},
  flush:async()=>{while(pending.length)await spool();await send()},
 };
 const interval=setInterval(()=>{for(const [room,s] of states){if(room.gameEnded||!room.gameStarted)endRoom(room);else sample(s)}void send()},5000);interval.unref?.();
 let cpuStart=process.cpuUsage(),cpuWall=performance.now();
 function beat(){if(closed)return;const now=performance.now(),cpu=process.cpuUsage(cpuStart),elapsed=now-cpuWall;cpuStart=process.cpuUsage();cpuWall=now;enqueue('heartbeat',null,{region,bootId,build:build(),rooms:states.size,rssMB:r(process.memoryUsage.rss()/1048576),cpuPercent:r((cpu.user+cpu.system)/Math.max(1,elapsed*1000)*100),droppedRecords:dropped,sampleSeconds:5});void send()}
 const heartbeat=setInterval(beat,30000);heartbeat.unref?.();setTimeout(beat,1000).unref?.();
 return api;
};

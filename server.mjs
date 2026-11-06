import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {WebSocketServer,WebSocket} from 'ws';
import {World} from './world.mjs';

const PORT=Number(process.env.PORT)||3000,MAX_PLAYERS=Math.max(0,Number(process.env.MAX_PLAYERS)||0);
const clients=new Set();
function send(ws,o){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536){ws.send(typeof o==='string'?o:JSON.stringify(o));return true;}return false;}
function broadcast(o){const data=JSON.stringify(o);for(const ws of clients)if(ws.player)send(ws,data);}
const world=new World({roundMs:Math.max(1000,Number(process.env.ROUND_MS)||180000),breakMs:Math.max(1000,Number(process.env.BREAK_MS)||10000),emit:broadcast});
const assets=new Map();for(const name of ['index.html','style.css','game.js','physics.js','navigation.js'])assets.set('/'+name,await readFile(new URL('./public/'+name,import.meta.url)));
const server=http.createServer((req,res)=>{let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400);res.end();return;}if(path==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,players:world.players.size,maxPlayers:MAX_PLAYERS||null,rssMB:Math.round(process.memoryUsage().rss/1048576)}));}const key=path==='/'?'/index.html':path,data=assets.get(key);res.writeHead(data?200:404,{'Content-Type':key.endsWith('.js')?'text/javascript':key.endsWith('.css')?'text/css':'text/html','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; img-src 'self' data:",'Cache-Control':'no-cache'});res.end(data||'Not found');});
const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{const pending=clients.size-world.players.size;if(req.url!=='/ws'||pending>=32){socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
wss.on('connection',ws=>{clients.add(ws);ws.alive=true;ws.mapRevision=-1;ws.on('pong',()=>ws.alive=true);let count=0,window=Date.now();const joinTimer=setTimeout(()=>{if(!ws.player)ws.close(1008,'Join timeout');},10000);
 ws.on('message',raw=>{const now=Date.now();if(now-window>1000){count=0;window=now;}if(++count>75)return ws.close(1008,'Rate limit');let m;try{m=JSON.parse(raw);}catch{return;}if(!m||typeof m!=='object')return;
  if(m.t==='join'&&!ws.player){if(MAX_PLAYERS&&world.players.size>=MAX_PLAYERS){send(ws,{t:'full'});return ws.close(1000,'Host capacity reached');}const name=String(m.name||'Space gremlin').replace(/[\x00-\x1f<>]/g,'').trim().slice(0,18)||'Space gremlin';ws.player=world.join(name);clearTimeout(joinTimer);send(ws,{t:'welcome',id:ws.player.id,slot:ws.player.slot});return;}
  if(m.t==='ping'&&Number.isFinite(m.at))return send(ws,{t:'pong',at:m.at});const p=ws.player;if(!p)return;
  if(m.t==='input'&&Number.isSafeInteger(m.seq)&&m.seq>p.seq&&Number.isFinite(m.x)&&Number.isFinite(m.y)){p.seq=m.seq;p.input={x:Math.max(-1,Math.min(1,m.x)),y:Math.max(-1,Math.min(1,m.y))};p.inputTime=now;}
  if(m.t==='chat'&&now-(p.chatTime||0)>900){p.chatTime=now;const text=String(m.text||'').replace(/[\x00-\x1f]/g,'').trim().slice(0,100);if(text)broadcast({t:'chat',id:p.id,name:p.name,text});}
  if(m.t==='pulse'||m.t==='dash')world.action(p,m.t);
 });ws.on('close',()=>{clearTimeout(joinTimer);clients.delete(ws);if(ws.player)world.leave(ws.player);});ws.on('error',()=>{});
});
let last=Date.now(),tick=0;
const loop=setInterval(()=>{const now=Date.now();world.tick(now,Math.min((now-last)/1000,.075));last=now;if(tick++%2===0){const state=JSON.stringify(world.snapshot());let map;for(const ws of clients){if(!ws.player)continue;send(ws,state);if(ws.mapRevision!==world.revision){map??=JSON.stringify(world.map());if(send(ws,map))ws.mapRevision=world.revision;}}}},1000/30);
const heartbeat=setInterval(()=>{for(const ws of clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);
server.listen(PORT,'0.0.0.0',()=>console.log('Moon Salvage → http://localhost:'+PORT+' (player limit: '+(MAX_PLAYERS||'none')+')'));
function stop(){clearInterval(loop);clearInterval(heartbeat);for(const ws of clients)ws.terminate();wss.close();server.close();}process.on('SIGTERM',stop);process.on('SIGINT',stop);


import {move,W,H,rocks,vault,colors,CAPACITY,distance} from './physics.js';
import {bankBearing} from './navigation.js';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),mini=$('minimap').getContext('2d');
const npcRemotes=new Map();
const keys=new Set(),bubbles=new Map(),remotes=new Map(),effects=[],particles=[];
let ws,id=null,slot=0,me=null,joined=false,joinName='',retry,seq=0,rtt=0,received=0,serverOffset=0,lastFrame=performance.now(),sendAt=0,hudAt=0;
let state={players:[],meteors:[],banks:[],npcs:[],vaultIn:23},map={gems:[],crates:[],powers:[]},joy={x:0,y:0},lastDirection={x:0,y:-1},camera={x:1200,y:900},viewW=innerWidth,viewH=innerHeight,zoom=1,dpr=1,muted=true,audio,toastUntil=0,toastText='',mapRound=0,chatOpen=false,pendingDashUntil=0,shake=0;
const stars=Array.from({length:550},(_,i)=>({x:(i*7127+31)%W,y:(i*4547+97)%H,r:i%7===0?1.7:.8}));
const decorations=Array.from({length:45},(_,i)=>({x:(i*739+170)%W,y:(i*977+210)%H,r:12+i%6*5}));
const powerNames={magnet:'MAGNET',shield:'SHIELD',boost:'BOOST'},powerColors={magnet:'#bca6ff',shield:'#7edbff',boost:'#ffd18c'};
function color(p){return colors[(p?.slot||0)%colors.length];}
function now(){return Date.now()+serverOffset;}
function send(o){if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<8192)ws.send(JSON.stringify(o));}
function toast(text){toastText=text;toastUntil=performance.now()+3300;$('toast').textContent=text;$('toast').style.opacity=1;}
function sound(f=550,type='sine'){if(muted)return;try{audio??=new AudioContext();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(f,audio.currentTime);o.frequency.exponentialRampToValueAtTime(f*.6,audio.currentTime+.14);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.2);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.21);}catch{}}
function log(name,text){const p=document.createElement('p');if(name){const b=document.createElement('b');b.textContent=name+': ';p.append(b);}else p.className='system';p.append(document.createTextNode(text));$('messages').append(p);while($('messages').children.length>40)$('messages').firstChild.remove();$('messages').scrollTop=$('messages').scrollHeight;if(!chatOpen&&name)$('unread').classList.remove('hidden');}
function setChat(open,focus=false){chatOpen=open;$('chat-panel').classList.toggle('hidden',!open);$('chat-toggle').setAttribute('aria-expanded',String(open));if(open){$('unread').classList.add('hidden');if(focus&&joined)$('chat-input').focus();}else{$('chat-input').blur();}}
function stopInput(){keys.clear();joy={x:0,y:0};$('joystick').querySelector('span').style.transform='';send({t:'input',seq:++seq,x:0,y:0});}
function input(){if(document.activeElement?.tagName==='INPUT'||!joined||state.paused||!$('help').classList.contains('hidden'))return{x:0,y:0};let x=joy.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),y=joy.y+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}if(len>.05)lastDirection={x,y};return{x,y};}
function particlesAt(x,y,c,count=16){for(let i=0;i<count;i++){if(particles.length>200)particles.shift();const a=Math.random()*Math.PI*2,s=40+Math.random()*150;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,born:performance.now(),life:500+Math.random()*500,c});}}
function connect(){clearTimeout(retry);if(ws&&ws.readyState<2)return;$('join-button').disabled=true;$('join-button').textContent='CONNECTING…';let full=false;ws=new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws');
 ws.onopen=()=>send({t:'join',name:joinName});
 ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.t==='welcome'){id=m.id;slot=m.slot;joined=true;me=null;seq=0;mapRound=0;remotes.clear();document.body.classList.add('playing');$('landing').classList.add('hidden');$('results').classList.add('hidden');$('join-button').disabled=false;$('join-button').textContent='DROP IN ↗';$('join-error').textContent='';$('chat-input').disabled=false;$('chat-send').disabled=false;$('led').style.background='#a5f5ce';setChat(true);log(null,'Banks relocate. Follow the arrow. Pulse hostile scrappers to recover loot!');toast('Collect ◆ · follow banks · pulse scrappers');send({t:'ping',at:Date.now()});}
  if(m.t==='full'){full=true;$('join-error').textContent='The host’s configured capacity is reached. Try again shortly.';}
  if(m.t==='pong'){rtt=Math.max(0,Date.now()-m.at);$('ping').textContent=rtt+' ms';}
  if(m.t==='map'){map=m;}
  if(m.t==='state'){
   const oldRound=mapRound;state=m;mapRound=m.round;received=performance.now();serverOffset=m.now-Date.now()+rtt/2;
   const self=m.players.find(p=>p.id===id);
   if(self){const predicted={...self};if(!m.paused)move(predicted,input(),Math.min(rtt/2000,.18));if(!me||oldRound!==m.round){me={...predicted};camera={x:me.x,y:me.y};}else{const dx=predicted.x-me.x,dy=predicted.y-me.y;if(Math.hypot(dx,dy)>190){me.x=predicted.x;me.y=predicted.y;}else if(performance.now()>pendingDashUntil){me.x+=dx*.24;me.y+=dy*.24;}const {x,y,...rest}=self;Object.assign(me,rest);if(performance.now()<pendingDashUntil){me.dashing=true;me.dx=lastDirection.x;me.dy=lastDirection.y;}}}
   for(const p of m.players){const prev=remotes.get(p.id);remotes.set(p.id,{...p,fromX:prev?.drawX??p.x,fromY:prev?.drawY??p.y,drawX:prev?.drawX??p.x,drawY:prev?.drawY??p.y});}for(const k of remotes.keys())if(!m.players.some(p=>p.id===k))remotes.delete(k);
   for(const n of m.npcs||[]){const previous=npcRemotes.get(n.id);npcRemotes.set(n.id,{...n,fromX:previous?.drawX??n.x,fromY:previous?.drawY??n.y,drawX:previous?.drawX??n.x,drawY:previous?.drawY??n.y});}for(const k of npcRemotes.keys())if(!(m.npcs||[]).some(n=>n.id===k))npcRemotes.delete(k);
   if(!m.paused)$('results').classList.add('hidden');
  }
  if(m.t==='chat'){bubbles.set(m.id,{text:m.text,until:performance.now()+6000});log(m.name,m.text);if(m.id!==id)sound(650);}
  if(m.t==='event'){
   effects.push({...m,born:performance.now()});if(effects.length>55)effects.shift();
   const near=me&&distance(me,m)<600;
   if(m.kind==='info')log(null,m.text);
   if(m.kind==='warning')toast(m.text);
   if(m.kind==='bank'){particlesAt(m.x,m.y,'#a5f5ce',22);if(m.id===id){sound(1000);toast(m.text);}}
   if(m.kind==='pulse'){particlesAt(m.x,m.y,'#c3e8ff',20);if(near)sound(180);if(me&&distance(me,m)<190&&m.id!==id)shake=7;}
   if(m.kind==='npcDown'){particlesAt(m.x,m.y,'#ffaf7d',30);if(m.id===id){toast(m.text);sound(700);}}
   if(m.kind==='hit'&&m.id===id){toast(m.text);shake=8;sound(150);}
   if(m.kind==='npcHit'){particlesAt(m.x,m.y,'#ffbd91',12);if(near)sound(280);}
   if(m.kind==='crate'){particlesAt(m.x,m.y,'#ffcf86',28);if(near)sound(390,'triangle');}
   if(m.kind==='meteor'){particlesAt(m.x,m.y,'#ffa47e',36);if(near){shake=13;sound(95,'triangle');}}
   if(m.kind==='power'&&m.id===id){toast(m.text);sound(800);particlesAt(m.x,m.y,'#bea6ff',20);}
  }
  if(m.t==='result'&&joined){stopInput();$('results').classList.remove('hidden');const top=m.scores[0],ties=m.scores.filter(p=>p.score===top?.score);$('winner').textContent=ties.length>1?'A cosmic tie.':(top?.name||'Nobody')+' owns this orbit.';$('result-list').replaceChildren();for(const p of m.scores.slice(0,20)){const row=document.createElement('p'),left=document.createElement('span'),small=document.createElement('small'),score=document.createElement('b');left.textContent=p.name;small.textContent=p.banks+' hauls banked · '+p.steals+' cargo knocked loose';left.append(small);score.textContent=p.score;row.append(left,score);$('result-list').append(row);}}
 };
 ws.onclose=()=>{joined=false;me=null;stopInput();document.body.classList.remove('playing');$('landing').classList.remove('hidden');$('results').classList.add('hidden');$('join-button').disabled=false;$('join-button').textContent='DROP IN ↗';$('chat-input').disabled=true;$('chat-send').disabled=true;if(!full){$('join-error').textContent='Signal lost. Reconnecting in 3 seconds…';retry=setTimeout(connect,3000);}};ws.onerror=()=>{};
}
function ability(type){if(!joined||state.paused||!me||me.stunned||document.activeElement?.tagName==='INPUT')return;const elapsed=performance.now()-received,remaining=type==='dash'?me.dashCool:me.cool;if(remaining>elapsed)return;send({t:'input',seq:++seq,...input()});send({t:type});if(type==='dash'){const v=input(),len=Math.hypot(v.x,v.y);if(len)lastDirection={x:v.x/len,y:v.y/len};pendingDashUntil=performance.now()+260;me.dashing=true;me.dx=lastDirection.x;me.dy=lastDirection.y;me.dashCool=3200+elapsed;particlesAt(me.x,me.y,color(me),8);sound(300);}else{me.cool=4000+elapsed;effects.push({kind:'anticipation',x:me.x,y:me.y,born:performance.now()});}}
$('join').onsubmit=e=>{e.preventDefault();joinName=$('name').value.trim()||'Space gremlin';try{localStorage.setItem('moon-name',joinName);}catch{}connect();};try{$('name').value=localStorage.getItem('moon-name')||'';}catch{}
$('chat-toggle').onclick=()=>setChat(!chatOpen);$('chat-close').onclick=()=>setChat(false);
$('chat').onsubmit=e=>{e.preventDefault();if(joined&&$('chat-input').value.trim())send({t:'chat',text:$('chat-input').value.trim()});$('chat-input').value='';$('chat-input').blur();};
$('chat-input').onfocus=()=>{stopInput();document.body.classList.add('chat-focused');};$('chat-input').onblur=()=>document.body.classList.remove('chat-focused');
document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>{if(joined)send({t:'chat',text:b.dataset.chat});});
function toggleRanks(open){$('leaderboard').classList.toggle('hidden',!open);$('rank-toggle').setAttribute('aria-expanded',String(open));}
$('rank-toggle').onclick=()=>toggleRanks($('leaderboard').classList.contains('hidden'));$('rank-close').onclick=()=>toggleRanks(false);
function help(open){$('help').classList.toggle('hidden',!open);if(open)stopInput();}
$('help-toggle').onclick=$('landing-help').onclick=()=>help(true);$('help-close').onclick=()=>help(false);
$('invite').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Invite link copied. Bring your accomplices.');}catch{toast('Share the address in your browser with your friends.');}};
$('sound').onclick=()=>{muted=!muted;$('sound').setAttribute('aria-pressed',String(!muted));sound();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is unavailable here. The arena already fills the window.');}};
addEventListener('keydown',e=>{if(e.key==='Escape'){setChat(false);help(false);toggleRanks(false);return;}if(e.target.tagName==='INPUT')return;if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(e.repeat)return;if(e.code==='Space')ability('pulse');if(e.key==='Shift')ability('dash');if(e.key==='Enter'&&joined)setChat(true,true);});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',stopInput);document.addEventListener('visibilitychange',stopInput);
for(const type of ['pulse','dash']){$(type).onpointerdown=e=>{e.preventDefault();ability(type);};$(type).onclick=e=>{if(e.detail===0)ability(type);};}
const stick=$('joystick');let stickPointer=null;
function joystick(e){const r=stick.getBoundingClientRect(),reach=r.width*.32,x=(e.clientX-r.left-r.width/2)/reach,y=(e.clientY-r.top-r.height/2)/reach,l=Math.max(1,Math.hypot(x,y));joy={x:x/l,y:y/l};stick.querySelector('span').style.transform='translate('+joy.x*reach+'px,'+joy.y*reach+'px)';}
stick.onpointerdown=e=>{if(stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);joystick(e);};
stick.onpointermove=e=>{if(e.pointerId===stickPointer)joystick(e);};
stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=e=>{if(e.pointerId!==stickPointer)return;stickPointer=null;joy={x:0,y:0};stick.querySelector('span').style.transform='';send({t:'input',seq:++seq,...input()});};
setInterval(()=>{if(joined)send({t:'ping',at:Date.now()});for(const [k,b]of bubbles)if(b.until<performance.now())bubbles.delete(k);},2500);
function resize(){viewW=canvas.clientWidth;viewH=canvas.clientHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(viewW*dpr);canvas.height=Math.round(viewH*dpr);zoom=Math.max(.65,Math.min(1.15,Math.min(viewW/920,viewH/700)));}new ResizeObserver(resize).observe(canvas);
function circle(x,y,r,fill,stroke){ctx.beginPath();ctx.arc(x,y,Math.max(0,r),0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function text(label,x,y,c='#8da4ba',size=12,font='monospace'){ctx.fillStyle=c;ctx.font=size+'px '+font;ctx.textAlign='center';ctx.fillText(label,x,y);}
function diamond(x,y,size,c){ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.fillStyle=c;ctx.fillRect(-size/2,-size/2,size,size);ctx.fillStyle='#ffffff66';ctx.fillRect(-size/2,-size/2,size*.32,size*.32);ctx.restore();}
function visible(p,pad=180){return Math.abs(p.x-camera.x)<viewW/zoom/2+pad&&Math.abs(p.y-camera.y)<viewH/zoom/2+pad;}
function astronaut(p,t,alpha=1){if(!visible(p))return;const c=color(p),bob=Math.sin(t/180+p.slot)*1.8;ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y);
 if(p.magnet){ctx.setLineDash([3,10]);circle(0,0,123,null,'#bea6ff33');ctx.setLineDash([]);}
 if(p.boost||p.dashing){circle(0,18,10+Math.sin(t/50)*4,'#ffd18c88');diamond(0,29,10,'#ffcf8d');}
 circle(0,18,23,'#0005');ctx.fillStyle=c+'88';ctx.beginPath();ctx.roundRect(-24,-3,12,24,5);ctx.fill();ctx.fillStyle=c;ctx.beginPath();ctx.roundRect(-17,-5+bob,34,33,11);ctx.fill();ctx.fillStyle='#17283c';ctx.fillRect(-13,23+bob,9,9);ctx.fillRect(5,23+bob,9,9);circle(0,-10+bob,21,c);ctx.fillStyle='#14273c';ctx.beginPath();ctx.roundRect(-15,-20+bob,30,18,8);ctx.fill();ctx.fillStyle='#bde6ff55';ctx.beginPath();ctx.roundRect(-10,-17+bob,12,5,3);ctx.fill();ctx.fillStyle='#edfaff88';ctx.fillRect(8,-15+bob,3,3);ctx.fillStyle='#20374c';ctx.fillRect(-7,9+bob,14,7);ctx.fillStyle='#f4d99a';ctx.fillRect(-4,11+bob,3,3);
 if(p.shield){ctx.setLineDash([5,4]);ctx.lineWidth=1.5;circle(0,0,35,null,'#8ee6ff99');ctx.setLineDash([]);ctx.lineWidth=1;}
 for(let i=0;i<Math.ceil(p.cargo/2);i++){const a=t/1500+i*Math.PI*2/Math.ceil(p.cargo/2);diamond(Math.cos(a)*32,Math.sin(a)*32,4,c);}
 if(p.stunned)text('✦ ✦ ✦',0,-38,'#ffc38c',15);
 text(p.name+(p.id===id?' · YOU':''),0,-48,c,12);if(p.cargo)text('◆ '+p.cargo,0,47,'#d6e7ed',10);ctx.restore();
}
function bubble(p,t){const b=bubbles.get(p.id);if(!b||b.until<t||!visible(p))return;ctx.font='14px system-ui';let line='',lines=[];for(const ch of b.text){if(ctx.measureText(line+ch).width>200){lines.push(line);line='';}line+=ch;}if(line)lines.push(line);lines=lines.slice(0,5);const width=Math.min(230,Math.max(...lines.map(l=>ctx.measureText(l).width))+24),height=lines.length*19+18;
 const screenX=(p.x-camera.x)*zoom+viewW/2,screenY=(p.y-camera.y)*zoom+viewH/2;
 const x=Math.max(width/2+8,Math.min(viewW-width/2-8,screenX)),y=Math.max(65,screenY-70*zoom-height);
 ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=Math.min(1,(b.until-t)/500);ctx.fillStyle='#eff8f3';ctx.shadowColor='#0005';ctx.shadowBlur=15;ctx.beginPath();ctx.roundRect(x-width/2,y,width,height,12);ctx.fill();ctx.shadowBlur=0;ctx.beginPath();ctx.moveTo(x-6,y+height);ctx.lineTo(x,y+height+7);ctx.lineTo(x+6,y+height);ctx.fill();lines.forEach((l,i)=>text(l,x,y+22+i*19,'#1a2b34',13,'system-ui'));ctx.restore();}
function drawWorld(t){ctx.fillStyle='#102033';ctx.fillRect(0,0,W,H);const haze=ctx.createRadialGradient(1200,900,70,1200,900,1150);haze.addColorStop(0,'#263b4533');haze.addColorStop(1,'#0b162300');ctx.fillStyle=haze;ctx.fillRect(0,0,W,H);
 for(const s of stars)if(visible(s,0))circle(s.x,s.y,s.r,'#8bb4d33c');
 ctx.strokeStyle='#7ca4be0a';ctx.lineWidth=1;for(let x=0;x<=W;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<=H;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
 for(const c of decorations)if(visible(c,50)){circle(c.x,c.y,c.r,'#0b192c24','#5c809314');circle(c.x-2,c.y+2,c.r*.68,null,'#5c80930a');}
 ctx.setLineDash([8,18]);ctx.strokeStyle='#9ab8cc28';ctx.strokeRect(40,40,W-80,H-80);ctx.setLineDash([]);text('THE QUIET SIDE',1200,90,'#70869a44',22);text('NO HONOR AMONG ASTRONAUTS',1200,1730,'#70869a33',15);
 for(const h of state.banks||[]){if(!visible(h))continue;circle(h.x,h.y,101,'#a5f5ce05','#a5f5ce12');circle(h.x,h.y,76,'#a5f5ce0a','#a5f5ce66');ctx.save();ctx.translate(h.x,h.y);ctx.rotate(t/12000);ctx.setLineDash([18,12]);circle(0,0,88,null,'#a5f5ce44');ctx.restore();ctx.setLineDash([]);circle(h.x,h.y,49,'#a5f5ce05','#a5f5ce33');text('⌂',h.x,h.y+12,'#a5f5ce',42);const leaving=h.moveAt-now()<8000;text('BANK '+(h.id+1)+(leaving?' · WARP IN '+Math.max(0,Math.ceil((h.moveAt-now())/1000))+'s':''),h.x,h.y+119,leaving?'#ffc58c':'#a5f5ceaa',11);}
 const vc=state.vaultOpen?'#ffda8b':'#bba7ff';circle(vault.x,vault.y,112,vc+'05',vc+'19');ctx.setLineDash([12,12]);circle(vault.x,vault.y,93,null,vc+'77');ctx.setLineDash([]);circle(vault.x,vault.y,73,vc+'0b',vc+'33');diamond(vault.x,vault.y,40,vc+'bb');text(state.vaultOpen?'2×':'◇',vault.x,vault.y+6,'#142035',18);text(state.vaultOpen?'VAULT OPEN · DOUBLE POINTS':'THE MIDNIGHT VAULT',vault.x,vault.y+136,vc,12);
 for(const r of rocks){if(!visible(r))continue;circle(r.x+10,r.y+17,r.r+2,'#030c1777');circle(r.x,r.y,r.r,'#263a50','#3d5367');circle(r.x-r.r*.26,r.y-r.r*.22,r.r*.29,'#1d2f44','#3b5062');circle(r.x+r.r*.35,r.y+r.r*.28,r.r*.17,'#1b2d41','#30465a');circle(r.x+r.r*.3,r.y-r.r*.4,r.r*.1,'#46576b44');circle(r.x-r.r*.4,r.y+r.r*.35,5,'#5e718633');}
 for(const c of map.crates){if(!visible(c))continue;const active=c.ready<=now();ctx.save();ctx.translate(c.x,c.y);ctx.globalAlpha=active?1:.2;circle(0,5,35,'#0003');ctx.fillStyle='#624d39';ctx.strokeStyle='#d7b47c';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-24,-24,48,48,8);ctx.fill();ctx.stroke();ctx.fillStyle='#9a7c4e';ctx.fillRect(-26,-5,52,10);ctx.fillRect(-5,-25,10,50);diamond(0,0,14,'#ffe1a4');ctx.lineWidth=1;text(active?'PULSE TO OPEN':'RESTOCKING',0,45,'#d9bf8e99',9);ctx.restore();}
 for(const g of map.gems){if(!visible(g,30))continue;const y=g.y+Math.sin(t/500+g.id)*3,c=g.value===3?'#ffdd8a':'#a5f5ce';circle(g.x,y,g.value===3?19:12,c+'0b');diamond(g.x,y,g.value===3?13:8,c);if(g.value===3)text('3',g.x,y+25,c+'99',9);}
 for(const p of map.powers){if(!visible(p,60))continue;const active=p.ready<=now(),c=powerColors[p.type];ctx.globalAlpha=active?1:.15;circle(p.x,p.y,32,c+'0a',c+'55');circle(p.x,p.y,23,c+'19',c+'99');text(p.type[0].toUpperCase(),p.x,p.y+6,c,20);if(active)text(powerNames[p.type],p.x,p.y+51,c+'aa',9);ctx.globalAlpha=1;}
 for(const m of state.meteors||[]){if(!visible(m))continue;const progress=1-Math.max(0,m.at-now())/2400;circle(m.x,m.y,m.r,'#ff78551c','#ff9a7777');circle(m.x,m.y,m.r*progress,null,'#ffa17ccc');text('⚠',m.x,m.y+8,'#ffbd93',29);text('IMPACT '+Math.max(0,(m.at-now())/1000).toFixed(1),m.x,m.y+40,'#ffbc9e',12);}
}
function drawMinimap(){mini.clearRect(0,0,160,120);const sx=160/W,sy=120/H;mini.fillStyle='#7e9bb622';for(const r of rocks){mini.beginPath();mini.arc(r.x*sx,r.y*sy,r.r*sx,0,Math.PI*2);mini.fill();}mini.strokeStyle='#a5f5ce';for(const h of state.banks||[])mini.strokeRect(h.x*sx-3,h.y*sy-3,6,6);mini.fillStyle=state.vaultOpen?'#ffe19a':'#b6a0ff';mini.fillRect(vault.x*sx-3,vault.y*sy-3,6,6);for(const n of state.npcs||[]){mini.fillStyle='#ff9f82';mini.fillRect(n.x*sx-1.5,n.y*sy-1.5,3,3);}for(const p of state.players){mini.fillStyle=color(p);mini.beginPath();mini.arc(p.x*sx,p.y*sy,p.id===id?3:1.6,0,Math.PI*2);mini.fill();}if(me){mini.strokeStyle='#b3d5eb44';mini.strokeRect((camera.x-viewW/zoom/2)*sx,(camera.y-viewH/zoom/2)*sy,viewW/zoom*sx,viewH/zoom*sy);}}
function updateHud(t){
 $('population').textContent=state.players.length+' online';$('round').textContent=String(state.round||1).padStart(2,'0');const seconds=Math.max(0,Math.ceil(((state.end||now()+180000)-now())/1000));$('timer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 if(state.paused)$('next-round').textContent='Next orbit in '+seconds+'s · stay for the rematch.';
 const cargo=me?.cargo||0;$('cargo').textContent=cargo;$('score').replaceChildren(document.createTextNode(String(me?.score||0)+' '));const pts=document.createElement('small');pts.textContent='PTS';$('score').append(pts);$('cargo-meter').style.setProperty('--fill',cargo/CAPACITY*100+'%');$('cargo-note').textContent=cargo===CAPACITY?'FULL HAUL · BANK FOR +4 BONUS':cargo>=8?'HEAVY POCKETS. FIND A BANK.':'COLLECT · ESCAPE · BANK';
 const elapsed=t-received;for(const [type,total,field,key]of [['pulse',4000,'cool','SPACE'],['dash',3200,'dashCool','SHIFT']]){const remaining=Math.max(0,(me?.[field]||0)-elapsed);$(type).style.setProperty('--cool',remaining/total*100+'%');$(type).classList.toggle('cooling',remaining>0);$(type+'-time').textContent=remaining>0?(remaining/1000).toFixed(1)+'s':matchMedia('(pointer:coarse),(max-width:900px)').matches?'READY':key;}
 $('event-banner').classList.toggle('open',!!state.vaultOpen);$('event-title').textContent=state.vaultOpen?'MIDNIGHT VAULT IS OPEN':'THE MIDNIGHT VAULT';$('event-detail').textContent=state.vaultOpen?'2× points at the center · closes in '+Math.max(0,Math.ceil(state.vaultIn-elapsed/1000))+'s':'Double points in '+Math.max(0,Math.ceil((state.vaultIn||0)-elapsed/1000))+'s · find the ◇';
 const powers=[];if(me?.magnet)powers.push('M MAGNET');if(me?.shield)powers.push('S SHIELD');if(me?.boost)powers.push('B BOOST');$('power-status').classList.toggle('hidden',!powers.length);$('power-status').textContent=powers.join(' · ')+' '+Math.max(0,((me?.powerLeft||0)-elapsed)/1000).toFixed(0)+'s';
 if(!$('leaderboard').classList.contains('hidden')){const crew=$('crew');crew.replaceChildren();const sorted=[...state.players].sort((a,b)=>b.score-a.score);for(const [i,p]of sorted.entries()){const row=document.createElement('div');row.className='crew-row';row.style.setProperty('--c',color(p));const rank=document.createElement('span');rank.className='rank';rank.textContent=i+1;const dot=document.createElement('span');dot.className='pilot-dot';const name=document.createElement('span');name.className='crew-name';name.textContent=p.name+(p.id===id?' (you)':'');const score=document.createElement('strong');score.textContent=p.score;row.append(rank,dot,name,score);crew.append(row);}}
 drawMinimap();
}
function bankGuide(){
 if(!me||!me.cargo){$('bank-guide').style.display='none';return;}
 const banks=state.vaultOpen?[...(state.banks||[]),{...vault,id:'vault'}]:(state.banks||[]);
 const nav=bankBearing(me,banks,camera,zoom,viewW,viewH);if(!nav){$('bank-guide').style.display='none';return;}
 const {bank,angle,distance,x,y}=nav;$('bank-guide').style.display='flex';$('bank-guide').style.left=x+'px';$('bank-guide').style.top=y+'px';
 $('bank-guide').querySelector('span').textContent='➤';$('bank-guide').querySelector('span').style.transform='rotate('+angle+'rad)';
 const warning=bank.moveAt-now()<8000?' · '+Math.max(0,Math.ceil((bank.moveAt-now())/1000))+'s':'';
 $('bank-distance').textContent=(bank.id==='vault'?'2× VAULT':'BANK '+(bank.id+1))+' · '+Math.round(distance/10)+'m'+warning;
}
function drawNPCs(t){for(const n of npcRemotes.values()){
 const a=Math.min(1,(t-received)/85);n.drawX=n.fromX+(n.x-n.fromX)*a;n.drawY=n.fromY+(n.y-n.fromY)*a;if(!visible(n))continue;
 const c=n.type==='thief'?'#ffb279':'#ff8498',x=n.drawX,y=n.drawY,bob=Math.sin(t/180+n.id)*3;
 if(n.windup){circle(n.attackX,n.attackY,92,'#ff8b6c17','#ffad7388');const progress=Math.max(0,Math.min(1,1-(n.windup-now())/850));circle(n.attackX,n.attackY,92*progress,null,'#ffca91');text('DODGE!',n.attackX,n.attackY-100,'#ffc69c',12);}
 ctx.save();ctx.translate(x,y);circle(0,19,26,'#0005');ctx.fillStyle='#192938';ctx.strokeStyle=c;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-24,-20+bob,48,42,9);ctx.fill();ctx.stroke();ctx.fillStyle=c;ctx.fillRect(-15,-7+bob,10,5);ctx.fillRect(5,-7+bob,10,5);ctx.fillRect(-10,11+bob,20,3);ctx.fillRect(-31,4,7,17);ctx.fillRect(24,4,7,17);ctx.lineWidth=1;
 for(let i=0;i<n.maxHp;i++){ctx.fillStyle=i<n.hp?c:'#314457';ctx.fillRect(-n.maxHp*6+i*12,-34,9,4);}
 text(n.type==='thief'?'SCRAPPER':'BRUISER',0,-47,c,10);if(n.loot)text('STOLEN ◆ '+n.loot,0,46,'#ffe0a3',10);if(n.stunned)text('✦ ✦',0,-62,'#c3e9ff',15);ctx.restore();
}}

function frame(t){const dt=Math.min((t-lastFrame)/1000,.05);lastFrame=t;
 if(joined&&me){if(t-received<1100&&!state.paused){me.dashing=t<pendingDashUntil;move(me,input(),dt);}if(t-sendAt>=50){sendAt=t;send({t:'input',seq:++seq,...input()});}const ease=1-Math.exp(-dt*12);camera.x+=(me.x-camera.x)*ease;camera.y+=(me.y-camera.y)*ease;}else{camera.x=1200+Math.sin(t/14000)*150;camera.y=900+Math.cos(t/17000)*100;}
 const halfW=viewW/zoom/2,halfH=viewH/zoom/2,edgeX=Math.max(0,halfW-Math.min(viewW*.3,210)/zoom),edgeY=Math.max(0,halfH-Math.min(viewH*.35,260)/zoom);camera.x=Math.max(Math.min(edgeX,W/2),Math.min(W-Math.min(edgeX,W/2),camera.x));camera.y=Math.max(Math.min(edgeY,H/2),Math.min(H-Math.min(edgeY,H/2),camera.y));
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0b1627';ctx.fillRect(0,0,viewW,viewH);for(let i=0;i<90;i++){const s=stars[i];circle((s.x*1.7)%viewW,(s.y*1.3)%viewH,s.r,'#8bb4d326');}ctx.translate(viewW/2-camera.x*zoom+(Math.random()-.5)*shake,viewH/2-camera.y*zoom+(Math.random()-.5)*shake);ctx.scale(zoom,zoom);shake*=.88;
 drawWorld(t);drawNPCs(t);
 const drawPlayers=[];if(joined&&me){for(const p of state.players){if(p.id===id)continue;const r=remotes.get(p.id);if(!r)continue;const a=Math.min(1,(t-received)/85);r.drawX=r.fromX+(r.x-r.fromX)*a;r.drawY=r.fromY+(r.y-r.fromY)*a;drawPlayers.push({...r,x:r.drawX,y:r.drawY});}drawPlayers.push({...me,id,slot,name:joinName});}else{drawPlayers.push({x:1060,y:900,slot:0,name:'',cargo:6},{x:1380,y:860,slot:1,name:'',cargo:3});}
 drawPlayers.sort((a,b)=>a.y-b.y);for(const p of drawPlayers)astronaut(p,t);
 for(let i=effects.length-1;i>=0;i--){const e=effects[i],age=t-e.born;if(age>1200){effects.splice(i,1);continue;}if(!visible(e))continue;ctx.globalAlpha=1-age/1200;if(['pulse','anticipation','meteor'].includes(e.kind)){ctx.lineWidth=e.kind==='anticipation'?1:3;circle(e.x,e.y,(e.kind==='meteor'?105:175)*Math.min(1,age/420),null,e.kind==='meteor'?'#ffb185':'#c3e8ff');ctx.lineWidth=1;}else if(e.kind!=='info'&&e.kind!=='warning'&&e.kind!=='dash')text(e.text,e.x,e.y-45-age/32,e.kind==='bank'?'#a5f5ce':'#f2d9b2',16);ctx.globalAlpha=1;}
 for(let i=particles.length-1;i>=0;i--){const p=particles[i],age=t-p.born;if(age>p.life){particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;ctx.globalAlpha=1-age/p.life;diamond(p.x,p.y,4,p.c);ctx.globalAlpha=1;}
 for(const p of drawPlayers)bubble(p,t);
 if(t-hudAt>100){hudAt=t;updateHud(t);}bankGuide();
 if(t>toastUntil&&toastText){$('toast').style.opacity=0;toastText='';}
 requestAnimationFrame(frame);
}
resize();requestAnimationFrame(frame);





import {move,W,H,homes,rocks,vault,crateSpots,powerSpots,CAPACITY,distance as dist} from './public/physics.js';
export class World {
 constructor({now=Date.now(),roundMs=180000,breakMs=10000,random=Math.random,emit=()=>{}}={}){
  Object.assign(this,{now,roundMs,breakMs,random,emit,players:new Map(),serial:0,round:1,end:now+roundMs,paused:false,lastFill:0,nextMeteor:now+17000,meteors:[],gems:[],revision:0});this.resetMap();
 }
 event(text,x,y,kind='info',extra={}){this.emit({t:'event',text,x,y,kind,...extra});}
 resetMap(){this.gems=[];this.crates=crateSpots.map((s,i)=>({...s,id:i,ready:0}));this.powers=powerSpots.map((s,i)=>({...s,id:i,type:['magnet','shield','boost'][i%3],ready:0}));this.meteors=[];this.nextMeteor=this.now+17000;this.setupBanks();this.setupNPCs();this.fill();this.revision++;}
 addGem(x,y,value=1){if(this.gems.length>=320)return;const p={x:Math.max(25,Math.min(W-25,x)),y:Math.max(25,Math.min(H-25,y))};move(p,{x:0,y:0},0);this.gems.push({id:++this.serial,x:Math.round(p.x),y:Math.round(p.y),value});this.revision++;}
 fill(){const target=Math.min(180,90+this.players.size*4);let tries=0;while(this.gems.length<target&&tries++<1000){const g={x:80+this.random()*(W-160),y:80+this.random()*(H-160)};if(rocks.every(o=>dist(g,o)>o.r+35)&&this.banks.every(h=>dist(g,h)>110)&&dist(g,vault)>100)this.addGem(g.x,g.y,this.random()<.12?3:1);}}
 spawn(slot){const h=this.banks[slot%this.banks.length],a=slot*2.399;return{x:h.x+Math.cos(a)*45,y:h.y+Math.sin(a)*45};}
 join(name){let slot=0;const used=new Set([...this.players.values()].map(p=>p.slot));while(used.has(slot))slot++;const p={id:++this.serial,slot,name,...this.spawn(slot),cargo:0,score:0,seq:0,input:{x:0,y:0},inputTime:this.now,cool:0,dashCool:0,dashUntil:0,dx:0,dy:-1,shieldUntil:this.now+2500,magnetUntil:0,boostUntil:0,stunUntil:0,banks:0,steals:0};this.players.set(p.id,p);this.event(name+' landed',p.x,p.y);return p;}
 drop(p,n){n=Math.min(p.cargo,n);for(let i=0;i<n;i++){const a=this.random()*Math.PI*2;this.addGem(p.x+Math.cos(a)*75,p.y+Math.sin(a)*75);}p.cargo-=n;}
 leave(p){this.drop(p,p.cargo);this.players.delete(p.id);this.event(p.name+' left',p.x,p.y);}
 isVaultOpen(){return !this.paused&&Math.floor((this.roundMs-(this.end-this.now))/1000)%35>=23;}
 action(p,type){if(this.paused)return false;
  if(type==='dash'&&this.now>=p.dashCool&&!p.stunned){const l=Math.hypot(p.input.x,p.input.y);if(l){p.dx=p.input.x/l;p.dy=p.input.y/l;}p.dashUntil=this.now+260;p.dashCool=this.now+3200;this.event('DASH',p.x,p.y,'dash',{id:p.id});return true;}
  if(type!=='pulse'||this.now<p.cool||p.stunned)return false;
  p.cool=this.now+4000;this.event('PULSE',p.x,p.y,'pulse',{id:p.id});
  for(const o of this.players.values()){if(o===p||this.now<o.shieldUntil||dist(p,o)>175)continue;const n=Math.min(o.cargo,4);this.drop(o,n);p.steals+=n;const d=dist(p,o)||1;o.x+=(o.x-p.x)/d*95;o.y+=(o.y-p.y)/d*95;move(o,{x:0,y:0},0);o.shieldUntil=this.now+1100;this.event(n?'−'+n+' CARGO':'BOOP!',o.x,o.y,'hit');}
  for(const c of this.crates){if(c.ready>this.now||dist(p,c)>175)continue;c.ready=this.now+14000;for(let i=0;i<7;i++){const a=i*Math.PI*2/7;this.addGem(c.x+Math.cos(a)*43,c.y+Math.sin(a)*43,i===0?3:1);}this.event('SUPPLY BURST',c.x,c.y,'crate');this.revision++;}
  for(const bot of this.npcs){if(bot.deadUntil||dist(p,bot)>175)continue;bot.hp--;bot.stunUntil=this.now+1700;bot.windup=0;const d=dist(p,bot)||1;bot.x+=(bot.x-p.x)/d*85;bot.y+=(bot.y-p.y)/d*85;move(bot,{x:0,y:0},0);this.event('−1 ARMOR',bot.x,bot.y,'npcHit');if(bot.hp<=0){bot.deadUntil=this.now+18000;const loot=bot.loot+3;for(let i=0;i<loot;i++)this.addGem(bot.x+Math.cos(i*2.4)*42,bot.y+Math.sin(i*2.4)*42);bot.loot=0;this.event('SCRAPPER DOWN · LOOT RECOVERED',bot.x,bot.y,'npcDown',{id:p.id});}}
  return true;
 }
 tick(now,dt){this.now=now;
  if(!this.paused&&now>=this.end){this.paused=true;this.end=now+this.breakMs;this.emit({t:'result',scores:[...this.players.values()].sort((a,b)=>b.score-a.score).map(p=>({name:p.name,score:p.score,slot:p.slot,banks:p.banks,steals:p.steals}))});}
  if(this.paused&&now>=this.end){this.paused=false;this.round++;this.end=now+this.roundMs;this.resetMap();for(const p of this.players.values())Object.assign(p,this.spawn(p.slot),{score:0,cargo:0,cool:0,dashCool:0,dashUntil:0,shieldUntil:now+2500,magnetUntil:0,boostUntil:0,stunUntil:0,banks:0,steals:0,input:{x:0,y:0}});this.event('NEW ORBIT · go make trouble',1200,900);}
  if(this.paused)return;
  this.updateBanks();this.updateNPCs(dt);
  if(now>=this.nextMeteor&&this.players.size){this.nextMeteor=now+19000;const targets=[...this.players.values()];for(let i=0;i<Math.min(5,targets.length+1);i++){const p=targets[i%targets.length];const m={id:++this.serial,x:Math.max(100,Math.min(W-100,p.x+(this.random()-.5)*300)),y:Math.max(100,Math.min(H-100,p.y+(this.random()-.5)*300)),at:now+2400,r:105};if(this.banks.every(h=>dist(h,m)>180))this.meteors.push(m);}this.event('METEOR SHOWER · leave the red circles!',1200,900,'warning');}
  for(let i=this.meteors.length-1;i>=0;i--){const m=this.meteors[i];if(now<m.at)continue;for(const p of this.players.values())if(dist(p,m)<m.r&&p.shieldUntil<now){this.drop(p,4);p.stunUntil=now+650;p.shieldUntil=now+1500;}for(let j=0;j<6;j++)this.addGem(m.x+Math.cos(j)*65,m.y+Math.sin(j)*65,j%2?1:3);this.event('IMPACT',m.x,m.y,'meteor');this.meteors.splice(i,1);}
  for(const p of this.players.values()){
   p.dashing=p.dashUntil>now;p.boost=p.boostUntil>now;p.stunned=p.stunUntil>now;
   const input=now-p.inputTime<350?p.input:{x:0,y:0},length=Math.hypot(input.x,input.y);
   if(!p.dashing&&length){p.dx=input.x/length;p.dy=input.y/length;}
   move(p,input,dt);
   if(p.cargo<CAPACITY&&!p.stunned){const range=p.magnetUntil>now?125:34;for(let i=this.gems.length-1;i>=0&&p.cargo<CAPACITY;i--){const g=this.gems[i];if(dist(g,p)>=range)continue;const n=Math.min(g.value,CAPACITY-p.cargo);p.cargo+=n;if(g.value>n)g.value-=n;else this.gems.splice(i,1);this.revision++;}}
   for(const power of this.powers){if(power.ready>now||dist(power,p)>39)continue;p[power.type==='shield'?'shieldUntil':power.type+'Until']=now+8500;power.ready=now+21000;this.revision++;this.event(power.type.toUpperCase()+' · 8s',p.x,p.y,'power',{id:p.id});}
   const double=this.isVaultOpen()&&dist(p,vault)<85;if(p.cargo&&(double||this.banks.some(h=>dist(p,h)<75))){const full=p.cargo===CAPACITY,points=(p.cargo+(full?4:0))*(double?2:1);p.score+=points;p.cargo=0;p.banks++;this.event('+'+points+(full?' FULL HAUL!':' BANKED'),p.x,p.y,'bank',{id:p.id});}
  }
  if(now-this.lastFill>2000){this.fill();this.lastFill=now;}
 }

 bankSpot(index,avoid=[]){
  const quadrant=index%4,x0=quadrant%2?1200:0,y0=quadrant>1?900:0;
  const valid=p=>rocks.every(r=>dist(p,r)>r.r+135)&&crateSpots.every(c=>dist(p,c)>135)&&powerSpots.every(c=>dist(p,c)>100)&&dist(p,vault)>250&&avoid.every(b=>dist(p,b)>280);
  for(let i=0;i<160;i++){const p={x:Math.round(x0+160+this.random()*880),y:Math.round(y0+150+this.random()*600)};if(valid(p))return p;}
  for(let y=y0+150;y<y0+800;y+=90)for(let x=x0+150;x<x0+1100;x+=90){const p={x,y};if(valid(p))return p;}
  return {...homes[quadrant]};
 }
 setupBanks(){this.banks=[];for(let i=0;i<4;i++)this.banks.push({id:i,...this.bankSpot(i,this.banks),moveAt:this.now+45000+i*11000,warned:false});}
 updateBanks(){for(const bank of this.banks){if(bank.moveAt-this.now<=8000&&!bank.warned){bank.warned=true;this.event('BANK '+(bank.id+1)+' RELOCATES IN 8s',bank.x,bank.y,'warning');}if(this.now<bank.moveAt)continue;
  if([...this.players.values()].some(p=>dist(p,bank)<115)){bank.moveAt=this.now+5000;continue;}
  const old={x:bank.x,y:bank.y};Object.assign(bank,this.bankSpot(bank.id,this.banks),{moveAt:this.now+60000,warned:false});this.revision++;this.event('BANK '+(bank.id+1)+' HAS RELOCATED',bank.x,bank.y,'warning');this.event('WARP OUT',old.x,old.y,'warp');}}
 setupNPCs(){this.npcs=Array.from({length:6},(_,i)=>({id:++this.serial,...crateSpots[i],type:i%2?'bruiser':'thief',hp:i%2?3:2,maxHp:i%2?3:2,loot:0,deadUntil:0,stunUntil:0,windup:0,cool:0,target:null,roamAt:0}));}
 updateNPCs(dt){for(const bot of this.npcs){
  if(bot.deadUntil){if(this.now<bot.deadUntil)continue;Object.assign(bot,crateSpots[bot.id%crateSpots.length],{hp:bot.maxHp,deadUntil:0,stunUntil:this.now+1200,windup:0,cool:0});}
  if(this.now<bot.stunUntil)continue;
  const safe=p=>this.banks.some(b=>dist(p,b)<115);
  if(bot.windup){if(this.now>=bot.windup){const target=this.players.get(bot.target);if(target&&target.shieldUntil<=this.now&&!safe(target)&&dist(target,{x:bot.attackX,y:bot.attackY})<92){if(bot.type==='thief'){const stolen=Math.min(2,target.cargo,12-bot.loot);target.cargo-=stolen;bot.loot+=stolen;this.event(stolen?'SCRAPPER STOLE '+stolen+' ◆':'SCRAPPER BUMP',target.x,target.y,'hit',{id:target.id});}else{this.drop(target,3);target.stunUntil=this.now+650;this.event('BRUISER SLAM · CARGO LOST',target.x,target.y,'hit',{id:target.id});}target.shieldUntil=this.now+1800;}bot.windup=0;bot.cool=this.now+2200;}continue;}
  let target=null,best=430;for(const p of this.players.values()){if(p.shieldUntil>this.now||safe(p))continue;const d=dist(bot,p);if(d<best){target=p;best=d;}}
  if(target&&best<75&&this.now>=bot.cool){bot.target=target.id;bot.attackX=target.x;bot.attackY=target.y;bot.windup=this.now+850;continue;}
  let goal=target;if(!goal){if(this.now>=bot.roamAt||!bot.roam){const a=this.random()*Math.PI*2;bot.roam={x:Math.max(100,Math.min(W-100,bot.x+Math.cos(a)*230)),y:Math.max(100,Math.min(H-100,bot.y+Math.sin(a)*230))};bot.roamAt=this.now+4000;}goal=bot.roam;}
  let dx=goal.x-bot.x,dy=goal.y-bot.y,l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;
  for(const rock of rocks){const rx=rock.x-bot.x,ry=rock.y-bot.y,d=Math.hypot(rx,ry);if(d<rock.r+90&&rx*dx+ry*dy>0){const sign=dx*(-ry)+dy*rx>=0?1:-1;dx=-ry/d*sign;dy=rx/d*sign;break;}}
  bot.speed=target?(bot.type==='thief'?160:125):65;move(bot,{x:dx,y:dy},dt);
 }}

 snapshot(){const now=this.now,phase=(this.roundMs-(this.end-now))/1000%35;return{t:'state',now,round:this.round,end:this.end,paused:this.paused,vaultOpen:this.isVaultOpen(),vaultIn:this.paused?0:(phase<23?23-phase:35-phase),revision:this.revision,banks:this.banks.map(({id,x,y,moveAt})=>({id,x,y,moveAt})),npcs:this.npcs.filter(b=>!b.deadUntil).map(b=>({id:b.id,x:Math.round(b.x),y:Math.round(b.y),type:b.type,hp:b.hp,maxHp:b.maxHp,loot:b.loot,windup:b.windup,attackX:b.attackX,attackY:b.attackY,stunned:b.stunUntil>now})),players:[...this.players.values()].map(p=>({id:p.id,slot:p.slot,name:p.name,x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10,cargo:p.cargo,score:p.score,seq:p.seq,cool:Math.max(0,p.cool-now),dashCool:Math.max(0,p.dashCool-now),dashLeft:Math.max(0,p.dashUntil-now),dx:p.dx,dy:p.dy,dashing:p.dashUntil>now,stunned:p.stunUntil>now,boost:p.boostUntil>now,magnet:p.magnetUntil>now,shield:p.shieldUntil>now,powerLeft:Math.max(0,p.magnetUntil-now,p.boostUntil-now,p.shieldUntil-now)})),meteors:this.meteors};}
 map(){return{t:'map',revision:this.revision,gems:this.gems,crates:this.crates,powers:this.powers};}
}


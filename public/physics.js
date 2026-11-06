export const W=2400,H=1800,R=19,CAPACITY=12;
export const colors=['#a5f5ce','#bea6ff','#ffbd83','#79d8ff','#ff91bb','#f6e58c','#81e8d4','#b8ceff'];
export const homes=[{x:220,y:260},{x:2180,y:260},{x:220,y:1540},{x:2180,y:1540}];
export const vault={x:1200,y:900};
export const rocks=[{x:550,y:410,r:72},{x:1850,y:410,r:72},{x:550,y:1390,r:72},{x:1850,y:1390,r:72},{x:950,y:680,r:66},{x:1450,y:680,r:66},{x:950,y:1120,r:66},{x:1450,y:1120,r:66},{x:350,y:900,r:100},{x:2050,y:900,r:100},{x:1200,y:300,r:85},{x:1200,y:1500,r:85}];
export const crateSpots=[{x:730,y:280},{x:1670,y:280},{x:730,y:1520},{x:1670,y:1520},{x:740,y:900},{x:1660,y:900},{x:1200,y:580},{x:1200,y:1220}];
export const powerSpots=[{x:420,y:630},{x:1980,y:1170},{x:780,y:1180},{x:1620,y:620},{x:780,y:620},{x:1620,y:1180}];
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function move(p,input,dt){
 let x=Number(input.x)||0,y=Number(input.y)||0,l=Math.hypot(x,y);if(l>1){x/=l;y/=l;}
 if(p.stunned)return;
 const speed=(p.speed??(260-(p.cargo||0)*6))*(p.boost?1.35:1)*(p.dashing?2.7:1);
 if(p.dashing){x=p.dx||0;y=p.dy??-1;}
 const steps=Math.max(1,Math.ceil(speed*dt/15));
 for(let i=0;i<steps;i++){p.x+=x*speed*dt/steps;p.y+=y*speed*dt/steps;
 for(const o of rocks){const dx=p.x-o.x,dy=p.y-o.y,d=Math.hypot(dx,dy),min=o.r+R;if(d<min){p.x=o.x+(d?dx/d:1)*min;p.y=o.y+(d?dy/d:0)*min;}}
 p.x=Math.max(R,Math.min(W-R,p.x));p.y=Math.max(R,Math.min(H-R,p.y));}
}


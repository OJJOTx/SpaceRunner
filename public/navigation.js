// Keep the indicator on the actual player-to-target ray, even with an offset camera.
export function bankBearing(player,banks,camera,zoom,width,height){
 if(!player||!banks.length)return null;
 const bank=banks.reduce((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)<=Math.hypot(b.x-player.x,b.y-player.y)?a:b);
 const dx=bank.x-player.x,dy=bank.y-player.y,distance=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
 const px=(player.x-camera.x)*zoom+width/2,py=(player.y-camera.y)*zoom+height/2;
 const radius=Math.min(85,distance*zoom*.6);
 return{bank,angle,distance,x:px+Math.cos(angle)*radius,y:py+Math.sin(angle)*radius,px,py};
}

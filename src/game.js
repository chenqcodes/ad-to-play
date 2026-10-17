/** Deterministic gameplay. No DOM, wall clock, rendering, or external dependencies. */
export const CONFIG = Object.freeze({step:1/120,maxFrameDelta:.25,maxSquad:36,initialSquad:3,maxBullets:480,maxEnemies:96,moveSpeed:3.8,roadSpeed:142,bulletSpeed:780,fireInterval:.28,spawnZ:980,gateZ:30,playerRadius:.15,bossAt:45,bossHP:1000,duration:62});
export const GATES = Object.freeze([
  {at:0,good:-1,amount:5,penalty:2},{at:7,good:1,amount:6,penalty:4},
  {at:14,good:-1,amount:7,penalty:5},{at:21,good:1,amount:8,penalty:6},
  {at:28,good:-1,amount:6,penalty:6},{at:35,good:1,amount:7,penalty:8},
]);
export const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export class ObjectPool {
  constructor(capacity){this.capacity=capacity;this.items=Array.from({length:capacity},()=>({active:false}));this.cursor=0;}
  take(values){for(let i=0;i<this.capacity;i++){const item=this.items[this.cursor];this.cursor=(this.cursor+1)%this.capacity;if(!item.active){Object.assign(item,values,{active:true});return item;}}return null;}
  clear(){for(const item of this.items)item.active=false;this.cursor=0;}
  get count(){let n=0;for(const item of this.items)if(item.active)n++;return n;}
}
export function squadOffset(index,count){const cols=count<=3?count:count<=12?4:6;const row=Math.floor(index/cols);const rowCount=Math.min(cols,count-row*cols);return{x:(index%cols-(rowCount-1)/2)*.067,z:-row*10};}
export class Game {
  constructor(){this.bullets=new ObjectPool(CONFIG.maxBullets);this.enemies=new ObjectPool(CONFIG.maxEnemies);this.events=[];this.reset('ready');}
  reset(mode='ready'){this.mode=mode;this.time=0;this.x=0;this.targetX=0;this.squad=CONFIG.initialSquad;this.maxSquad=this.squad;this.fireTimer=0;this.nextGate=0;this.nextWave=0;this.gates=[];this.boss=null;this.bullets.clear();this.enemies.clear();this.events.length=0;this.stats={kills:0,recruits:0,gates:0,shots:0,damage:0};this.result=null;}
  start(){this.reset('playing');this.emit('start');}
  pause(){if(this.mode==='playing'){this.mode='paused';this.emit('pause');}}
  resume(){if(this.mode==='paused'){this.mode='playing';this.emit('resume');}}
  setTarget(x){if(Number.isFinite(x))this.targetX=clamp(x,-.79,.79);}
  emit(type,details={}){if(this.events.length<128)this.events.push({type,...details});}
  drainEvents(){const result=this.events;this.events=[];return result;}
  addSquad(delta,source='gate'){
    if(this.mode!=='playing')return;const before=this.squad;this.squad=clamp(this.squad+delta,0,CONFIG.maxSquad);const actual=this.squad-before;
    if(actual>0)this.stats.recruits+=actual;this.maxSquad=Math.max(this.maxSquad,this.squad);
    this.emit(actual>=0?'gain':'hurt',{amount:actual,source,x:this.x,z:0,capped:this.squad===CONFIG.maxSquad});
    if(this.squad<=0)this.finish(false,source==='gate'?'gate':'squad');
  }
  finish(won,reason='boss'){if(this.mode!=='playing')return;this.mode=won?'won':'lost';this.result={won,reason,time:this.time,squad:this.squad,...this.stats};this.emit(won?'win':'lose',{x:this.x,z:0});}
  spawnGate(def){this.gates.push({...def,z:CONFIG.spawnZ,resolved:false,left:def.good===-1?def.amount:-def.penalty,right:def.good===1?def.amount:-def.penalty});}
  spawnWave(index){
    const lane=[-.52,.52,0,-.52,.52,0,.52,-.52][index%8],rows=index>8?2:1,count=index<3?2:3;
    for(let row=0;row<rows;row++)for(let i=0;i<count;i++)this.enemies.take({x:lane+(i-(count-1)/2)*.19,z:CONFIG.spawnZ+row*60,hp:index<5?4:7,maxHP:index<5?4:7,radius:.10,speed:CONFIG.roadSpeed*.94,hit:0,phase:index+i});
  }
  fire(){let fired=0;for(let i=0;i<this.squad;i++){const offset=squadOffset(i,this.squad);if(this.bullets.take({x:this.x+offset.x,z:42+offset.z,prevZ:42+offset.z,age:0}))fired++;}this.stats.shots+=fired;this.emit('fire',{count:fired,x:this.x,z:0});}
  update(dt){
    if(this.mode!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    this.time+=dt;this.x+=clamp((this.targetX-this.x)*(1-Math.exp(-18*dt)),-CONFIG.moveSpeed*dt,CONFIG.moveSpeed*dt);
    while(this.nextGate<GATES.length&&GATES[this.nextGate].at<=this.time)this.spawnGate(GATES[this.nextGate++]);
    while(this.nextWave<19&&2.5+this.nextWave*2.05<=this.time)this.spawnWave(this.nextWave++);
    this.fireTimer-=dt;while(this.fireTimer<=0){this.fire();this.fireTimer+=CONFIG.fireInterval;}
    for(const row of this.gates){row.z-=CONFIG.roadSpeed*dt;if(!row.resolved&&row.z<=CONFIG.gateZ){row.resolved=true;let amount=null;if(Math.abs(this.x+.49)<=.39)amount=row.left;else if(Math.abs(this.x-.49)<=.39)amount=row.right;if(amount!==null){this.stats.gates++;this.addSquad(amount);}else this.emit('missGate');}}
    this.gates=this.gates.filter(row=>row.z>-180);if(this.mode!=='playing')return;
    for(const enemy of this.enemies.items){if(!enemy.active)continue;enemy.z-=enemy.speed*dt;enemy.hit=Math.max(0,enemy.hit-dt);if(enemy.z<25){if(Math.abs(enemy.x-this.x)<enemy.radius+CONFIG.playerRadius)this.addSquad(-2,'enemy');enemy.active=false;}}
    if(this.mode!=='playing')return;
    if(!this.boss&&this.time>=CONFIG.bossAt){this.boss={hp:CONFIG.bossHP,maxHP:CONFIG.bossHP,x:0,z:780,radius:.27,hit:0,nextAttack:this.time+2.7,attack:null};this.emit('boss');}
    if(this.boss){const b=this.boss;b.x=Math.sin((this.time-CONFIG.bossAt)*.67)*.52;b.z=Math.max(480,b.z-dt*105);b.hit=Math.max(0,b.hit-dt);
      if(b.attack&&this.time>=b.attack.at){if(Math.abs(this.x-b.attack.x)<.22)this.addSquad(-6,'boss');this.emit('beam',{x:b.attack.x,z:0});b.attack=null;}
      if(this.time>=b.nextAttack&&!b.attack){b.attack={x:this.x,at:this.time+1.25,started:this.time};b.nextAttack=this.time+3.1;this.emit('warning');}
    }
    if(this.mode!=='playing')return;
    for(const bullet of this.bullets.items){
      if(!bullet.active)continue;bullet.prevZ=bullet.z;bullet.z+=CONFIG.bulletSpeed*dt;bullet.age+=dt;let nearest=null;
      for(const enemy of this.enemies.items){if(!enemy.active||Math.abs(bullet.x-enemy.x)>enemy.radius)continue;if(bullet.z>=enemy.z-12&&bullet.prevZ<=enemy.z+12&&(!nearest||enemy.z<nearest.z))nearest=enemy;}
      if(nearest){nearest.hp--;nearest.hit=.08;bullet.active=false;this.stats.damage++;this.emit('hit',{x:nearest.x,z:nearest.z});if(nearest.hp<=0){nearest.active=false;this.stats.kills++;this.emit('kill',{x:nearest.x,z:nearest.z});}}
      else if(this.boss&&Math.abs(bullet.x-this.boss.x)<this.boss.radius&&bullet.z>=this.boss.z-22&&bullet.prevZ<=this.boss.z+22){this.boss.hp--;this.boss.hit=.06;bullet.active=false;this.stats.damage++;this.emit('hitBoss',{x:bullet.x,z:this.boss.z});if(this.boss.hp<=0){this.finish(true);return;}}
      if(bullet.z>1250||bullet.age>2)bullet.active=false;
    }
    if(this.time>=CONFIG.duration)this.finish(false,'timeout');
  }
}
/** Rendering rates never change the simulation timestep. Long interruption delta is bounded. */
export class FixedStepper {
  constructor(update,step=CONFIG.step){this.update=update;this.step=step;this.accumulator=0;}
  reset(){this.accumulator=0;}
  advance(realDelta){if(!Number.isFinite(realDelta)||realDelta<0)return 0;this.accumulator+=Math.min(realDelta,CONFIG.maxFrameDelta);let steps=0;while(this.accumulator+1e-10>=this.step){this.update(this.step);this.accumulator-=this.step;steps++;}return steps;}
}

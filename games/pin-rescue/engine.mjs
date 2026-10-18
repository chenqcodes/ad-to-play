// Original deterministic gravity puzzle. Each chamber has at most one downhill outlet.
const room=(id,x,y,items=[],to=null)=>({id,x,y,items,to});
const simple=(title,hint,items)=>({title,hint,rooms:[room('a',1,0,items[0],'b'),room('b',1,1,items[1],'c'),room('c',1,2,items[2],'exit'),room('exit',1,3,[],null)]});
const fork=(title,hint,left,right,middle=[],hero=['hero'],extra=[])=>({title,hint,rooms:[room('a',0,0,left,'mix'),room('b',2,0,right,'mix'),room('mix',1,1,middle,'exit'),room('hero',0,2,hero,'exit'),room('gold',2,2,extra,'exit'),room('exit',1,3)]});
export const LEVELS=[
 simple('第一根针','点金色拉环。探险家拿到宝石，到达出口就获胜。',[['hero'],['gem'],[]]),
 simple('先降温','水碰到熔岩会变成安全的岩石。先放水，再放探险家。',[['water'],['lava'],['hero','gem']]),
 fork('汇流','先让水和熔岩在中央相遇，再送宝石和探险家。',['water'],['lava'],[],['hero'],['gem']),
 fork('别急着拿宝石','中央有宝石。先用水降温，再把熔岩放下来。',['water'],['lava'],['gem'],['hero']),
 fork('双份热浪','两滴熔岩需要两滴水。看清每个房间里的数量。',['water','water'],['lava','lava'],[],['hero'],['gem']),
 fork('宝石先行？','出口也可能变危险。水要赶在宝石和探险家前面。',['lava'],['water'],[],['hero'],['gem','gem']),
 {title:'两道关卡',hint:'先冷却上层，再把剩余的水送往下层。',rooms:[room('a',1,0,['water','water'],'mix'),room('mix',1,1,['lava'],'low'),room('hero',0,2,['hero','gem'],'exit'),room('low',2,2,['lava'],'exit'),room('exit',1,3)]},
 {title:'分头救援',hint:'右边的水先救出宝石；左边的水再清理出口。',rooms:[room('a',0,0,['water'],'exit'),room('b',2,0,['water'],'mix'),room('mix',2,1,['lava'],'gold'),room('gold',2,2,['gem'],'exit'),room('hero',0,2,['hero'],'exit'),room('exit',1,3,['lava'])]},
 {title:'三重熔岩',hint:'三滴水正好。先冷却每一层，再让大家汇合。',rooms:[room('a',1,0,['water','water','water'],'mix'),room('mix',1,1,['lava'],'low'),room('low',2,2,['lava'],'exit'),room('hero',0,2,['hero','gem','gem'],'exit'),room('exit',1,3,['lava'])]},
 {title:'最后的宝藏',hint:'水要先通过两层熔岩。等出口安全，再放行探险家和宝石。',rooms:[room('a',0,0,['water','water'],'mix'),room('b',2,0,['gem','gem'],'mix'),room('mix',1,1,['lava'],'low'),room('low',2,2,['lava'],'exit'),room('hero',0,2,['hero','gem'],'exit'),room('exit',1,3)]}
];
export function createState(level){return {rooms:Object.fromEntries(level.rooms.map(r=>[r.id,[...r.items]])),open:[],status:'playing',reason:'',moves:0,collected:0,total:level.rooms.flatMap(r=>r.items).filter(i=>i==='gem').length,events:[]};}
export function pull(level,previous,id){
 if(previous.status!=='playing'||previous.open.includes(id)||!level.rooms.some(r=>r.id===id&&r.to))return previous;
 const s=structuredClone(previous);s.open.push(id);s.moves++;s.events=[];
 // Process top to bottom so all flowing content settles in the same deterministic turn.
 for(const r of [...level.rooms].sort((a,b)=>a.y-b.y)){
   const a=s.rooms[r.id];let water=a.filter(i=>i==='water').length,lava=a.filter(i=>i==='lava').length;
   const cooled=Math.min(water,lava);
   if(cooled){for(let n=0;n<cooled;n++){a.splice(a.indexOf('water'),1);a.splice(a.indexOf('lava'),1);}s.events.push({type:'cool',room:r.id,count:cooled});}
   if(a.includes('lava')&&(a.includes('hero')||a.includes('gem'))){s.status='lost';s.reason=a.includes('hero')?'探险家遇到了熔岩。先用水降温。':'宝石掉进了熔岩。先冷却它经过的房间。';return s;}
   if(r.to&&s.open.includes(r.id)&&a.length){s.events.push({type:'fall',from:r.id,to:r.to,items:[...a]});s.rooms[r.to].push(...a);s.rooms[r.id]=[];}
 }
 const exit=s.rooms.exit;
 if(exit.includes('hero')&&exit.filter(i=>i==='gem').length===s.total&&!Object.values(s.rooms).some(a=>a.includes('lava'))){s.status='won';s.collected=s.total;s.reason='宝石和探险家都安全到达！';}
 return s;
}
export function solve(level,state=createState(level)){
 const queue=[[state,[]]],seen=new Set();while(queue.length){const [s,path]=queue.shift();if(s.status==='won')return path;if(s.status!=='playing')continue;const key=[...s.open].sort().join(',');if(seen.has(key))continue;seen.add(key);for(const r of level.rooms)if(r.to&&!s.open.includes(r.id))queue.push([pull(level,s,r.id),[...path,r.id]]);}return null;
}
export function readProgress(storage){try{const p=JSON.parse(storage.getItem('adtoplay-pin-v1'));return {unlocked:Math.max(0,Math.min(9,Number.isInteger(p?.unlocked)?p.unlocked:0)),wins:Array.isArray(p?.wins)?p.wins.filter(n=>Number.isInteger(n)&&n>=0&&n<10):[]};}catch{return {unlocked:0,wins:[]};}}
export function saveProgress(storage,p){try{storage.setItem('adtoplay-pin-v1',JSON.stringify(p));return true;}catch{return false;}}

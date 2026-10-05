/* Deterministic simulation with no DOM or rendering dependencies. */
(function(root){
'use strict';
const WIDTH=10800,GROUND=578;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const distance=(a,b)=>Math.hypot(a.x+a.w/2-b.x-b.w/2,a.y+a.h/2-b.y-b.h/2);
const STAGES=[{x:0,name:'引擎觉醒',hint:'A / D 行驶 · 空格跳跃 · Shift 加速'}, {x:1900,name:'霓虹高速',hint:'提前起跳越过缺口 · 蓝色平台可以落脚'}, {x:3850,name:'高楼飞跃',hint:'驶上金色跳台 · 按住 Shift 冲刺，空格飞跃'}, {x:5600,name:'钢铁封锁',hint:'按 V 变形 · J 激光剑 / K 火焰炮 / L 导弹'}, {x:8950,name:'城市守卫',hint:'躲开红色预警 · 跳过地波 · 激光前切换到守卫身后'}];
class Game {
 constructor(){this.reset()}
 reset(){
  this.time=0;this.state='playing';this.stage=0;this.camera=0;this.shake=0;this.flash=0;this.checkpoint=150;this.deaths=0;this.kills=0;this.events=[];this.particles=[];this.shots=[];this.waves=[];this.rings=[];this.damageLabels=[];this.banner={text:'未来城市 · 极速突围',sub:'启动你的引擎，向右出发',ttl:4};
  this.player={x:150,y:GROUND-36,w:82,h:36,vx:0,vy:0,face:1,mode:'car',grounded:true,coyote:.1,hp:100,energy:0,gears:0,trophy:0,parts:0,inv:0,transform:0,slash:0,cd:{sword:0,fire:0,missile:0,transform:0}};
  this.platforms=[{x:0,y:GROUND,w:2520,h:160},{x:2740,y:GROUND,w:1450,h:160},{x:4480,y:GROUND,w:1570,h:160},{x:6050,y:GROUND,w:4750,h:160},{x:2020,y:458,w:240,h:22},{x:2920,y:478,w:210,h:22},{x:3220,y:382,w:240,h:22},{x:3970,y:500,w:220,h:24,launch:true},{x:4310,y:420,w:130,h:24},{x:4750,y:438,w:260,h:22},{x:5130,y:344,w:180,h:22},{x:6440,y:456,w:220,h:22},{x:6760,y:355,w:220,h:22},{x:7720,y:455,w:260,h:22}];
  this.hazards=[{x:1150,y:542,w:52,h:36},{x:1740,y:540,w:52,h:38},{x:3130,y:542,w:56,h:36},{x:4910,y:542,w:52,h:36},{x:7130,y:540,w:70,h:38}];
  this.drones=[{x:2160,y:474,w:85,h:30,base:2160,phase:0},{x:3520,y:477,w:85,h:30,base:3520,phase:2},{x:5320,y:470,w:85,h:30,base:5320,phase:4}];
  for(const d of this.drones)Object.assign(d,{hp:60,maxHp:60,hit:0,dead:false,type:'drone'});
  for(const h of this.hazards)Object.assign(h,{hp:36,maxHp:36,hit:0,dead:false,type:'barrier'});
  this.items=[];let id=0;const item=(type,x,y)=>this.items.push({id:id++,type,x,y,w:24,h:24,taken:false});
  for(let x=500;x<8700;x+=150){if(x>2430&&x<2840||x>4080&&x<4530)continue;item('gear',x,520)}
  for(const x of [700,1470,2300,2980,3670,4650,5520,5810,6290,7280,8030,8660])item('crystal',x,490);
  for(const [x,y] of [[2080,410],[2990,430],[3280,334],[4380,363],[4810,390],[5180,295],[6820,307],[7780,405]])item(x===5180?'trophy':x===6820?'part':'gear',x,y);
  item('part',3340,334);for(const x of [5450,7460,8750])item('repair',x,510);
  this.enemies=[5790,6070,6490,6960,7370,7890,8380,8640].map((x,i)=>this.enemy(x,i%3===0?'gunner':'guard'));
  this.boss={x:10050,y:GROUND-172,w:118,h:172,hp:2800,maxHp:2800,active:false,dead:false,phase:1,mode:'idle',timer:2.5,sequence:0,face:-1,hit:0};
  this.core=null;this.gate=8900;
 }
 enemy(x,type='guard'){return {x,y:GROUND-66,w:42,h:66,hp:type==='gunner'?90:74,maxHp:type==='gunner'?90:74,type,vx:0,vy:0,home:x,grounded:true,attack:1,hit:0,dead:false}}
 say(text,sub='',ttl=3){this.banner={text,sub,ttl};this.events.push('notice')}
 burst(x,y,color,count=15){for(let i=0;i<count;i++){let a=Math.random()*Math.PI*2,s=70+Math.random()*210;this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+Math.random()*.5,max:.8,color,size:2+Math.random()*4})}}
 ring(x,y,color,max=170){this.rings.push({x,y,color,r:8,max,life:.5})}
 damagePlayer(amount,dir=0){const p=this.player;if(p.inv>0||this.state!=='playing')return; p.hp=Math.max(0,p.hp-amount);p.inv=1.1;p.vx=dir*210;p.vy=-170;this.shake=.2;this.events.push('hurt');this.burst(p.x+p.w/2,p.y+20,'#ff795c',12);if(p.hp<=0){this.state='dead';this.deaths++;this.burst(p.x,p.y,'#ffce68',45)}}
 targets(){return [...this.enemies,...this.drones,...this.hazards,...(this.boss.active?[this.boss]:[])].filter(e=>!e.dead)}
 damageEnemy(e,amount,dir=0){if(e.dead)return;e.hp=Math.max(0,e.hp-amount);e.hit=.2;if(e.type==='guard'||e.type==='gunner')e.x+=dir*16;this.damageLabels.push({x:e.x+e.w/2,y:e.y-20,text:`−${amount}`,life:.65});this.burst(e.x+e.w/2,e.y+e.h/2,'#ffb363',7);if(e.hp<=0){e.dead=true;this.events.push('explode');if(e.type!=='barrier')this.kills++;this.burst(e.x+e.w/2,e.y+e.h/2,'#ffb363',30);this.ring(e.x+e.w/2,e.y+e.h/2,'#ffc982',75);if(e===this.boss){this.core={x:e.x+42,y:GROUND-46,w:32,h:32};this.shots=this.shots.filter(s=>!s.hostile);this.waves=[];this.enemies.forEach(n=>n.dead=true);this.say('城市守卫已击破','向前拾取能量核心！',7);this.shake=.6}else{this.player.energy=clamp(this.player.energy+(e.type==='barrier'?5:12),0,100);this.player.gears+=e.type==='barrier'?1:3}}}
 swordCollision(){const p=this.player;if(p.slash<=0)return;const face=p.slashFace||p.face,center=p.x+p.w/2;const box={x:face>0?center-14:center-112,y:p.y-22,w:126,h:p.h+44};for(const e of this.targets())if(!p.swordHits.has(e)&&overlap(box,e)){p.swordHits.add(e);this.damageEnemy(e,28,face)}}
 transform(){const p=this.player;if(p.cd.transform>0)return;let foot=p.y+p.h;p.mode=p.mode==='car'?'robot':'car';p.w=p.mode==='car'?82:44;p.h=p.mode==='car'?36:76;p.y=foot-p.h;p.transform=.42;p.cd.transform=.45;this.ring(p.x+p.w/2,p.y+p.h/2,'#ffe18d',110);this.events.push('transform')}
 attack(type){const p=this.player;if(p.mode!=='robot'){if(!this.banner||this.banner.ttl<=0)this.say('切换战斗形态','按 V 变成机器人后使用武器',1.8);return}if(type==='pulse'){if(p.energy<100){this.say('电磁能量尚未充满','收集蓝色水晶，或击败敌人补充能量',1.6);return}p.energy=0;this.ring(p.x,p.y,'#65f7ff',620);this.shake=.35;this.flash=.3;this.events.push('pulse');for(const e of this.targets())if(distance(p,e)<620)this.damageEnemy(e,220,p.x<e.x?1:-1);this.shots=this.shots.filter(s=>!s.hostile||distance(p,s)>620);this.waves=this.waves.filter(w=>Math.abs(w.x-p.x)>620);return}
  if(p.cd[type]>0)return;
  if(type==='sword'){p.cd.sword=.28;p.slash=.2;p.slashFace=p.face;p.swordHits=new Set();this.events.push('sword');this.swordCollision()}
  else{const missile=type==='missile',speed=missile?510:820,w=missile?28:19,h=missile?12:14;const mx=p.x+p.w/2,my=p.y+41;let vx=p.face*speed,vy=0;const target=this.targets().filter(e=>(e.x+e.w/2-mx)*p.face>=-12&&Math.abs(e.x+e.w/2-mx)<850&&Math.abs(e.y+e.h/2-my)<170).sort((a,b)=>distance(p,a)-distance(p,b))[0];if(target){const dx=target.x+target.w/2-mx,dy=target.y+target.h/2-my,length=Math.hypot(dx,dy);if(length>25){vx=dx/length*speed;vy=dy/length*speed}}p.cd[type]=missile?2.8:.32;this.shots.push({x:mx-w/2,y:my-h/2,w,h,vx,vy,life:2,type,damage:missile?94:20,hostile:false});this.events.push(missile?'missile':'fire')}
 }
 physics(body,dt){const old=body.y+body.h;body.vy+=1680*dt;body.x+=body.vx*dt;body.y+=body.vy*dt;body.grounded=false;let top=Infinity;for(const s of this.platforms){if(body.vy>=0&&body.x+body.w>s.x&&body.x<s.x+s.w&&old<=s.y+6&&body.y+body.h>=s.y)top=Math.min(top,s.y)}if(top!==Infinity){body.y=top-body.h;body.vy=0;body.grounded=true}}
 update(dt,input={}){
  if(this.state!=='playing')return;dt=Math.min(dt,.04);this.time+=dt;this.shake=Math.max(0,this.shake-dt);this.flash=Math.max(0,this.flash-dt);if(this.banner)this.banner.ttl-=dt;
  const p=this.player;for(const k of Object.keys(p.cd))p.cd[k]=Math.max(0,p.cd[k]-dt);p.inv=Math.max(0,p.inv-dt);p.slash=Math.max(0,p.slash-dt);p.transform=Math.max(0,p.transform-dt);
  if(input.transform)this.transform();
  const dir=(input.right?1:0)-(input.left?1:0);const speed=p.mode==='car'?(input.boost?660:420):265;const accel=p.mode==='car'?1300:2300;const target=dir*speed;p.vx+=clamp(target-p.vx,-accel*dt,accel*dt);if(p.mode==='car'){if(Math.abs(p.vx)>5)p.face=Math.sign(p.vx);else if(dir)p.face=dir}else if(dir)p.face=dir;
  p.coyote=p.grounded?.12:Math.max(0,p.coyote-dt);if(input.jump&&p.coyote>0){p.vy=-690;p.coyote=0;p.grounded=false;this.events.push('jump');this.burst(p.x+p.w/2,p.y+p.h,'#97e7eb',8)}
  const wasGrounded=p.grounded;this.physics(p,dt);if(!wasGrounded&&p.grounded)this.burst(p.x+p.w/2,p.y+p.h,'#507587',9);
  if(p.mode==='car'&&p.grounded&&p.x>4000&&p.x<4180&&Math.abs(p.vx)>300){p.vy=-750;p.grounded=false;this.say('飞跃天际','保持速度，落到对面公路',2);this.events.push('jump')}
  p.x=clamp(p.x,0,WIDTH-p.w);
  if(p.y>820){p.inv=0;this.damagePlayer(22);if(this.state==='playing'){p.x=this.checkpoint;p.y=GROUND-p.h;p.vx=0;p.vy=0;p.inv=1.7;this.say('重新出发','已返回最近的检查点',2)}}
  let index=0;STAGES.forEach((s,i)=>{if(p.x>=s.x)index=i});if(index>this.stage){this.stage=index;this.checkpoint=[150,1910,3860,5620,9040][index];this.say(STAGES[index].name,STAGES[index].hint,4);p.hp=clamp(p.hp+12,0,100)}
  if(input.sword)this.attack('sword');if(input.fire)this.attack('fire');if(input.missile)this.attack('missile');if(input.pulse)this.attack('pulse');
  for(const h of this.hazards){h.hit=Math.max(0,h.hit-dt);if(!h.dead&&overlap(p,h))this.damagePlayer(10,p.x<h.x?-1:1)}
  for(const d of this.drones){if(d.dead)continue;d.hit=Math.max(0,d.hit-dt);d.x=d.base+Math.sin(this.time*1.4+d.phase)*125;d.y=478+Math.sin(this.time*2+d.phase)*26;if(overlap(p,d))this.damagePlayer(12,p.x<d.x?-1:1)}
  for(const item of this.items){if(!item.taken&&overlap({x:p.x-8,y:p.y-8,w:p.w+16,h:p.h+16},item)){item.taken=true;if(item.type==='gear')p.gears++;if(item.type==='crystal')p.energy=clamp(p.energy+22,0,100);if(item.type==='trophy'){p.trophy++;this.say('隐藏奖杯发现！','高楼飞跃的证明',3)}if(item.type==='part'){p.parts++;this.say('获得武器零件','已收入收藏，留待未来升级',2)}if(item.type==='repair')p.hp=clamp(p.hp+28,0,100);this.burst(item.x,item.y,item.type==='crystal'?'#6ef7ff':'#ffe29a',9);this.events.push('collect')}}
  for(const e of this.enemies){if(e.dead||Math.abs(e.x-p.x)>1050)continue;e.hit=Math.max(0,e.hit-dt);e.attack-=dt;const dx=p.x-e.x;if(Math.abs(dx)<570){e.vx=Math.sign(dx)*(e.type==='gunner'?35:75);if(e.type==='gunner'&&Math.abs(dx)<460)e.vx=0;if(e.attack<=0){if(e.type==='gunner'){this.shots.push({x:e.x+20,y:e.y+24,w:14,h:10,vx:Math.sign(dx)*285,vy:0,life:3,damage:9,type:'enemy',hostile:true});e.attack=1.9}else if(Math.abs(dx)<66){this.damagePlayer(9,Math.sign(dx));e.attack=1.1}}}else e.vx=Math.sin(this.time)*25;this.physics(e,dt);if(e.y>850){e.x=e.home;e.y=GROUND-e.h;e.vy=0}if(overlap(p,e))this.damagePlayer(7,Math.sign(dx))}
  const remaining=this.enemies.filter(e=>!e.dead&&e.home<8900).length;
  if(p.x+p.w>this.gate&&p.x<9000&&remaining){p.x=this.gate-p.w;p.vx=Math.min(0,p.vx);if(!this.banner||this.banner.ttl<=0)this.say('封锁尚未解除',`还有 ${remaining} 个守卫 · 变形后清理道路`,2)}
  if(p.x>8980&&!this.boss.active&&!this.boss.dead){this.boss.active=true;p.hp=100;p.energy=100;this.checkpoint=9050;this.say('警报：城市守卫已启动','生命与能量已补满 · Q 释放电磁冲击波',4)}
  if(this.boss.active&&!this.boss.dead){p.x=Math.max(p.x,8960);this.updateBoss(dt)}
  this.swordCollision();
  for(const s of this.shots){s.life-=dt;const oldX=s.x,oldY=s.y;s.x+=s.vx*dt;s.y+=s.vy*dt;if(s.life<=0)continue;const swept={x:Math.min(oldX,s.x),y:Math.min(oldY,s.y),w:s.w+Math.abs(s.x-oldX),h:s.h+Math.abs(s.y-oldY)};if(s.hostile){if(overlap(p,swept)){this.damagePlayer(s.damage,Math.sign(s.vx));s.life=0}}else{for(const e of this.targets()){if(overlap(swept,e)){s.life=0;this.damageEnemy(e,s.damage,Math.sign(s.vx));if(s.type==='missile'){this.ring(s.x,s.y,'#ffb86e',150);this.events.push('explode');this.shake=.18;for(const other of this.targets())if(other!==e&&distance(s,other)<150)this.damageEnemy(other,65,Math.sign(s.vx))}break}}}}
  this.shots=this.shots.filter(s=>s.life>0&&s.x>0&&s.x<WIDTH);
  for(const w of this.waves){w.x+=w.vx*dt;w.life-=dt;if(overlap(p,w))this.damagePlayer(15,Math.sign(w.vx))}this.waves=this.waves.filter(w=>w.life>0);
  if(this.core&&overlap(p,this.core)){this.state='won';this.events.push('win');this.ring(this.core.x,this.core.y,'#ffe6a0',500)}
  for(const a of this.particles){a.life-=dt;a.x+=a.vx*dt;a.y+=a.vy*dt;a.vy+=380*dt}this.particles=this.particles.filter(a=>a.life>0);for(const r of this.rings){r.life-=dt;r.r+=(r.max-8)*dt*2}this.rings=this.rings.filter(r=>r.life>0);
  for(const label of this.damageLabels){label.life-=dt;label.y-=38*dt}this.damageLabels=this.damageLabels.filter(label=>label.life>0);
  const camTarget=clamp(p.x-370,0,WIDTH-1280);this.camera+=(camTarget-this.camera)*Math.min(1,dt*5);
 }
 updateBoss(dt){const b=this.boss,p=this.player;b.hit=Math.max(0,b.hit-dt);b.phase=b.hp<=b.maxHp/2?2:1;b.timer-=dt;
  if(b.mode==='idle'){b.face=p.x<b.x?-1:1;if(b.timer<=0){b.mode=['slam','laser','summon'][b.sequence++%3];b.timer=b.mode==='laser'?1.7:1.3;this.say(b.mode==='slam'?'重拳预警 · 准备跳跃':b.mode==='laser'?'激光锁定 · 跑到守卫身后':'增援信号 · 小心两侧',b.mode==='laser'?'红色区域即将被扫描':b.mode==='slam'?'地波会沿地面向两侧扩散':'使用导弹或冲击波清场',1.8)}}
  else if(b.timer<=0){if(b.mode==='slam'){for(const dir of [-1,1])this.waves.push({x:b.x+b.w/2,y:GROUND-24,w:56,h:24,vx:dir*(b.phase===2?430:340),life:5});this.shake=.45;this.events.push('slam');b.mode='recover';b.timer=.8}else if(b.mode==='laser'){b.mode='beam';b.timer=.75;this.events.push('laser')}else if(b.mode==='summon'){for(const x of [b.x-360,b.x+260])if(this.enemies.filter(e=>!e.dead).length<6)this.enemies.push(this.enemy(clamp(x,9100,10600)));b.mode='recover';b.timer=.8}else{b.mode='idle';b.timer=b.phase===2?1.2:2.1}}
  if(b.mode==='beam'){const box={x:b.face<0?8960:b.x+b.w,y:GROUND-100,w:b.face<0?b.x-8960:WIDTH-b.x-b.w,h:65};if(overlap(p,box))this.damagePlayer(20,b.face)}
  if(overlap(p,b))this.damagePlayer(10,p.x<b.x?-1:1);
 }
 respawn(){const save={gears:this.player.gears,trophy:this.player.trophy,parts:this.player.parts};const cp=this.checkpoint,stage=this.stage,deaths=this.deaths,time=this.time,kills=this.kills;const taken=this.items.filter(i=>i.taken).map(i=>i.id);const dead=this.enemies.filter(e=>e.dead).map(e=>e.home),deadDrones=this.drones.map(e=>e.dead),deadHazards=this.hazards.map(e=>e.dead);this.reset();this.checkpoint=cp;this.stage=stage;this.deaths=deaths;this.time=time;this.kills=kills;Object.assign(this.player,save,{x:cp,inv:2,energy:cp>=8950?100:30});for(const i of this.items)i.taken=taken.includes(i.id);for(const e of this.enemies)e.dead=dead.includes(e.home);this.drones.forEach((e,i)=>{if(deadDrones[i]){e.dead=true;e.hp=0}});this.hazards.forEach((e,i)=>{if(deadHazards[i]){e.dead=true;e.hp=0}});this.camera=clamp(cp-370,0,WIDTH-1280);this.say('系统重启完成','已返回检查点，继续向前！',3)}
}
root.FlameCore={Game,STAGES,WIDTH,GROUND,clamp,overlap};if(typeof module!=='undefined')module.exports=root.FlameCore;
})(typeof window!=='undefined'?window:globalThis);

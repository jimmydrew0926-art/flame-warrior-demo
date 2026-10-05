'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const game=new FlameCore.Game(),renderer=new FlameRenderer(ctx),$=id=>document.getElementById(id);
const credits=new FlameCredits.CreditClient(window.FLAME_CONFIG||{});
const demoOnly=!!(window.FLAME_CONFIG||{}).demoOnly;
const requireCredits=!demoOnly&&!!(window.FLAME_CONFIG||{}).requireCredits;
let screen='menu',previous=performance.now(),accumulator=0,audio=null,muted=false,lastStatus='',lastState='playing',paidMode=requireCredits,busy=false;
function sound(name){if(muted||!audio)return;try{const osc=audio.createOscillator(),gain=audio.createGain();const pitches={jump:430,transform:130,sword:720,fire:290,missile:100,collect:960,hurt:75,explode:65,pulse:90,slam:45,laser:200,win:780,notice:520};const duration=name==='pulse'?.45:name==='transform'?.25:.12;osc.type=['collect','notice','win'].includes(name)?'sine':'sawtooth';osc.frequency.setValueAtTime(pitches[name]||200,audio.currentTime);osc.frequency.exponentialRampToValueAtTime((pitches[name]||200)*(name==='collect'?1.6:.4),audio.currentTime+duration);gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration)}catch{}}
function initAudio(){try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{})}catch{}}
function focus(){canvas.focus({preventScroll:true})}
let lastTouchEnabled=null,lastViewportWidth=null,lastLandscape=null;
function touchLayout(){
 const viewport=window.visualViewport;
 const height=viewport&&(!viewport.scale||viewport.scale===1)?viewport.height:window.innerHeight;
 if(Number.isFinite(height)&&height>0)$('game-shell').style.setProperty('--viewport-height',`${Math.floor(height)}px`);
 const preference=(window.FLAME_CONFIG||{}).touch;
 const enabled=preference==='on'||preference!=='off'&&(window.matchMedia('(any-pointer: coarse)').matches||window.innerWidth<=900);
 const width=Math.floor(window.innerWidth);
 const landscape=window.innerWidth>window.innerHeight;
 // A browser toolbar may change only the height while a thumb is still held.
 // Keep that gesture; release captures when rotating or remapping control widths.
 if(enabled!==lastTouchEnabled||width!==lastViewportWidth||landscape!==lastLandscape)controls.clear();
 lastTouchEnabled=enabled;lastViewportWidth=width;lastLandscape=landscape;
 $('game-shell').classList.toggle('touch-enabled',enabled);$('touch-controls').hidden=!enabled;$('mobile-tip').hidden=!enabled;
 $('menu-help').textContent=enabled?'左侧摇杆移动 · 右侧跳跃 / 变形 / 攻击':'A / D 移动 · 空格跳跃 · V 变形 · Esc 暂停';
}
function orientationLayout(){controls.clear();touchLayout()}
function syncCreditUI(message=''){
 $('play-modes').hidden=demoOnly;
 $('mode-free').classList.toggle('active',!paidMode);$('mode-paid').classList.toggle('active',paidMode);$('mode-free').setAttribute('aria-pressed',String(!paidMode));$('mode-paid').setAttribute('aria-pressed',String(paidMode));$('recharge').hidden=!paidMode;$('recharge').disabled=!credits.available;
 $('credit-status').hidden=!paidMode;$('credit-status').textContent=message||(credits.available?`余额 ${credits.balance} 币 · 开局消耗 1 币`:requireCredits?'投币服务暂不可用，请稍后再试。':'投币服务尚未开放，当前可免费试玩。');
 $('start').disabled=busy||paidMode&&!credits.available;$('start').textContent=busy?'正在确认…':paidMode?(credits.available?'投币开局 · 1 币 →':'投币服务准备中'):'启动引擎 →';
 $('session-credit').hidden=!paidMode||screen==='menu';$('session-credit').textContent=`余额 ${credits.balance} 币`;
 $('restart').textContent=paidMode?'重新投币开局 · 1 币':'重新开始本关';
}
function selectMode(value){if(busy||demoOnly||!value&&requireCredits)return;paidMode=value;syncCreditUI()}
function launch(){initAudio();game.reset();screen='playing';lastState='playing';controls.clear();$('menu').hidden=true;$('result').hidden=true;$('pause').hidden=true;$('payment').hidden=true;$('pause-button').hidden=false;syncCreditUI();focus()}
async function start(){if(busy)return;busy=true;syncCreditUI();try{if(paidMode)await credits.start();launch()}catch(error){syncCreditUI(error.message);if(screen==='result')$('result-text').textContent=error.message;if(screen==='paused'){$('pause').hidden=true;home(error.message)}}finally{busy=false;syncCreditUI($('credit-status').textContent)}}
function pause(){if(screen==='menu'||screen==='result'||game.state!=='playing'||!$('payment').hidden)return;screen=screen==='paused'?'playing':'paused';$('pause').hidden=screen!=='paused';controls.clear();if(screen==='playing')focus()}
function home(message=''){screen='menu';controls.clear();$('menu').hidden=false;$('result').hidden=true;$('pause').hidden=true;$('payment').hidden=true;$('pause-button').hidden=true;syncCreditUI(message)}
async function retry(){if(busy)return;if(game.state!=='dead')return start();busy=true;$('retry').disabled=true;try{if(paidMode)await credits.continue();game.respawn();screen='playing';lastState='playing';$('result').hidden=true;$('pause-button').hidden=false;controls.clear();syncCreditUI();focus()}catch(error){$('result-text').textContent=error.message+' · 可返回主菜单充值后继续。'}finally{busy=false;$('retry').disabled=false}}
function openPayment(){if(screen==='playing')pause();controls.clear();$('payment').hidden=false;const price=credits.config&&credits.config.pricing;const amount=price?(price.priceMinor/100).toFixed(2):null;$('payment-text').textContent=credits.available&&price?`当前余额 ${credits.balance} 币\n充值 ${price.credits} 枚游戏币：${amount} ${price.currency}\n请家长完成支付，到账后再开始游戏。`:'充值服务尚未开放，正式开放后可在这里购买游戏次数。';$('buy-credits').disabled=!credits.available}
async function buy(){if(busy)return;busy=true;$('buy-credits').disabled=true;try{const order=await credits.checkout();$('checkout-link').href=order.url;$('checkout-link').hidden=false;$('refresh-credits').hidden=false;$('payment-text').textContent='订单已创建。打开支付页面完成支付，再查询到账。';}catch(error){$('payment-text').textContent=error.message}finally{busy=false;$('buy-credits').disabled=!credits.available}}
async function checkPayment(){if(busy)return;busy=true;$('refresh-credits').disabled=true;try{await credits.checkOrder();$('payment-text').textContent=`当前余额 ${credits.balance} 币。未到账时请稍后再查询。`;syncCreditUI()}catch(error){$('payment-text').textContent=error.message}finally{busy=false;$('refresh-credits').disabled=false}}
const controls=new FlameInput.Controller({joystick:$('joystick'),knob:$('joystick-knob'),buttons:document.querySelectorAll('[data-action]'),isPlaying:()=>screen==='playing'&&game.state==='playing'&&$('payment').hidden,onPause:pause,onMute:()=>{muted=!muted},onStart:()=>{if(screen==='menu')start()}});
$('start').addEventListener('click',start);$('mode-free').addEventListener('click',()=>selectMode(false));$('mode-paid').addEventListener('click',()=>selectMode(true));$('resume').addEventListener('click',pause);$('pause-button').addEventListener('click',pause);$('restart').addEventListener('click',start);$('retry').addEventListener('click',retry);$('result-home').addEventListener('click',()=>home());$('recharge').addEventListener('click',openPayment);$('buy-credits').addEventListener('click',buy);$('refresh-credits').addEventListener('click',checkPayment);$('payment-close').addEventListener('click',()=>{$('payment').hidden=true;syncCreditUI();if(screen==='playing')focus()});
window.addEventListener('blur',()=>{controls.clear();if(screen==='playing'&&game.state==='playing')pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='playing'&&game.state==='playing')pause()});window.addEventListener('resize',touchLayout);
window.addEventListener('orientationchange',orientationLayout);
window.screen?.orientation?.addEventListener('change',orientationLayout);
window.visualViewport?.addEventListener('resize',touchLayout);
window.visualViewport?.addEventListener('scroll',touchLayout);
window.matchMedia('(any-pointer: coarse)').addEventListener?.('change',touchLayout);
function frame(now){const dt=Math.min(.1,(now-previous)/1000);previous=now;if(screen==='playing'&&game.state==='playing'){accumulator+=dt;while(accumulator>=1/120&&game.state==='playing'){game.update(1/120,controls.read());accumulator-=1/120}for(const event of game.events)sound(event);game.events=[]}else accumulator=0;
 renderer.draw(game,screen,muted,now/1000);
 if(game.state!==lastState){lastState=game.state;if(game.state==='dead'||game.state==='won'){screen='result';controls.clear();$('result').hidden=false;$('pause-button').hidden=true;const won=game.state==='won';$('result-tag').textContent=won?'ENERGY CORE / 01 COLLECTED':'SYSTEM / REBOOT';$('result-title').textContent=won?'第一枚能量核心获得！':'装甲需要修复';$('result-text').textContent=won?`第二世界：沙漠峡谷 已解锁（后续章节）\n用时 ${Math.floor(game.time/60)} 分 ${Math.floor(game.time%60)} 秒 · 齿轮 ${game.player.gears} · 奖杯 ${game.player.trophy}/1 · 零件 ${game.player.parts}/2`:'从最近的检查点重启，保留已收集的物品。';const costs=paidMode&&(!credits.config||credits.config.continueCostsCredit!==false);$('retry').textContent=won?(paidMode?'再次投币挑战 · 1 币 →':'再次挑战 →'):costs?'投币续关 · 1 币 →':'检查点重启 →';$('retry').focus();syncCreditUI()}}
 const p=game.player;document.querySelectorAll('.touch-key.weapon').forEach(button=>button.classList.toggle('is-unavailable',p.mode!=='robot'));document.querySelector('[data-action="boost"]').classList.toggle('is-unavailable',p.mode!=='car');document.querySelector('[data-action="pulse"]').classList.toggle('is-unavailable',p.mode!=='robot'||p.energy<100);
 const status=`${screen} · ${FlameCore.STAGES[game.stage].name} · ${p.mode==='car'?'跑车':'机器人'} · 生命 ${Math.ceil(p.hp)} · 齿轮 ${p.gears} · 击毁 ${game.kills}`;
 if(status!==lastStatus){$('live-status').textContent=status;canvas.setAttribute('data-state',status);lastStatus=status}canvas.setAttribute('data-x',String(Math.round(p.x)));canvas.setAttribute('data-y',String(Math.round(p.y)));canvas.setAttribute('data-shots',String(game.shots.length));
 requestAnimationFrame(frame)
}
if(requireCredits)$('mode-free').hidden=true;touchLayout();syncCreditUI();credits.init().then(config=>{if(config&&config.allowFreePreview===false){$('mode-free').hidden=true;paidMode=true}syncCreditUI()});requestAnimationFrame(frame);

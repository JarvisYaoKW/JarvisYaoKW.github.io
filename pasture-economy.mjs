export const SHEEP_SKINS=Object.freeze([
 {id:'S001',name:'白绵羊',variant:0,cost:0,starter:true},
 {id:'S002',name:'浅棕羊',variant:1,cost:0,starter:true},
 {id:'S003',name:'小羊',variant:2,cost:0,starter:true},
 {id:'S004',name:'卷角羊',variant:3,cost:0,starter:true},
 {id:'S005',name:'垂耳羊',variant:4,cost:0,starter:true},
 {id:'S006',name:'深灰羊',variant:5,cost:0,starter:true}
].map(Object.freeze));
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export function createWallet(opening=0){if(!integer(opening))throw Error('金币数值无效');return{version:1,balance:opening,earned:opening,spent:0,owned:SHEEP_SKINS.map(s=>s.id),selected:'mixed',recent:opening?[{id:'opening',type:'opening',amount:opening,at:Date.now()}]:[]};}
export function validWallet(w){return !!(w&&w.version===1&&integer(w.balance)&&integer(w.earned)&&integer(w.spent)&&w.balance===w.earned-w.spent&&Array.isArray(w.owned)&&w.owned.every(id=>typeof id==='string')&&new Set(w.owned).size===w.owned.length&&SHEEP_SKINS.every(s=>w.owned.includes(s.id))&&(w.selected==='mixed'||w.owned.includes(w.selected))&&Array.isArray(w.recent)&&w.recent.length<=100&&w.recent.every(t=>typeof t.id==='string'&&['opening','catch','redeem'].includes(t.type)&&Number.isSafeInteger(t.amount)&&(t.type==='redeem'?t.amount<0:t.amount>0)&&Number.isFinite(t.at)));}
function historicalCorrect(s){let n=0;for(const e of Object.values(s.entries||{}))for(const c of ['typing','choice']){const value=e.stats?.[c]?.correct;if(Number.isFinite(value)&&value>0)n+=Math.floor(value);}if(!integer(n))throw Error('历史正确次数超出金币范围');return n;}
export function ensureWallet(s){if(s.pastureWallet==null)s.pastureWallet=createWallet(historicalCorrect(s));if(!validWallet(s.pastureWallet))throw Error('金币记录不完整，请恢复有效备份');return s.pastureWallet;}
export function walletSummary(s){return s.pastureWallet&&validWallet(s.pastureWallet)?s.pastureWallet:createWallet(historicalCorrect(s));}
function record(w,t){w.recent=[t,...w.recent].slice(0,100);}
export function rewardCatch(s,cat,r,q){if(!q?.finished||q.outcome!=='correct'||q.coinRewarded)return 0;const w=ensureWallet(s);if(!integer(w.earned+1))throw Error('金币数值超出范围');w.balance++;w.earned++;q.coinRewarded=true;q.coinReward=1;if(r.lastEvent)r.lastEvent.coins=1;record(w,{id:`catch:${cat}:${r.number}:${r.steps}`,type:'catch',amount:1,key:q.key,category:cat,round:r.number,kind:q.kind,at:Date.now()});return 1;}
export function selectedSkin(s,seed=0,catalog=SHEEP_SKINS){const w=walletSummary(s),owned=catalog.filter(skin=>w.owned.includes(skin.id)&&skin.available!==false),chosen=w.selected==='mixed'?null:owned.find(skin=>skin.id===w.selected);return chosen||owned[Math.abs(seed)%owned.length]||SHEEP_SKINS[0];}
export function selectSkin(s,id,catalog=SHEEP_SKINS){const w=ensureWallet(s);if(id!=='mixed'&&(!w.owned.includes(id)||!catalog.some(skin=>skin.id===id&&skin.available!==false)))return false;w.selected=id;return true;}
export function redeemSkin(s,id,catalog=SHEEP_SKINS){const skin=catalog.find(skin=>skin.id===id),w=ensureWallet(s);if(!skin||skin.available===false)return{ok:false,reason:'unavailable'};if(w.owned.includes(id))return{ok:false,reason:'owned'};if(!integer(skin.cost)||skin.cost===0)return{ok:false,reason:'unavailable'};if(w.balance<skin.cost)return{ok:false,reason:'insufficient'};w.balance-=skin.cost;w.spent+=skin.cost;w.owned.push(id);record(w,{id:'redeem:'+id,type:'redeem',skin:id,amount:-skin.cost,at:Date.now()});return{ok:true,skin};}

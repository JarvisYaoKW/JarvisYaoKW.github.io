import {createWallet,ensureWallet,rewardCatch} from './pasture-economy.mjs';
export const norm = s => String(s || '').trim().toLowerCase();
export const uniq = a => [...new Set(a)];
const extraCount=(r,key)=>Object.hasOwn(r.extra,key)?r.extra[key]:0;
export const blankStats = () => ({correct:0,wrong:0,first:0,streak:0,ms:0,chars:0});
export const blankRound = (number=1) => ({number,done:[],skipped:[],extra:{},due:[],steps:0,current:null,last:null,history:[],outcomes:{},lastEvent:null});
function roundOutcome(r,key,outcome,event) {
  r.outcomes??={};
  Object.defineProperty(r.outcomes,key,{value:outcome,enumerable:true,configurable:true,writable:true});
  r.lastEvent={key,type:event,at:Date.now(),serial:(r.lastEvent?.serial||0)+1};
}
export function initialState() {
  return {version:1,revision:0,entries:{},groups:[],pastureWallet:createWallet(),settings:{theme:'light',mode:'blank',hint:0.35,englishDefinitions:true,accent:'us',autoAudio:true,strictCase:false,strictPunctuation:false,group:'',scope:'all'},rounds:{typing:blankRound(),choice:blankRound()},aux:null};
}
export const category = s => s.settings.mode === 'choice' ? 'choice' : 'typing';
export const statsOf = (e,c) => e.stats[c] || (e.stats[c]=blankStats());
export const totalWrong = e => (e.stats.typing?.wrong||0)+(e.stats.choice?.wrong||0);
export function mergeEntries(s,rows,group='') {
  const result={added:0,updated:0,skipped:0};
  if(group && !s.groups.includes(group)) s.groups.push(group);
  for(const row of rows) {
    const english=String(row.english||row.word||'').trim();
    const key=norm(english);
    if(!key || english.length>1000) {result.skipped++;continue;}
    const meanings=uniq((Array.isArray(row.meanings)?row.meanings:[row.meaning||row.chinese||'']).map(x=>String(x).trim()).filter(Boolean));
    if(!meanings.length) {result.skipped++;continue;}
    const groups=uniq([...(Array.isArray(row.groups)?row.groups:typeof row.groups==='string'?row.groups.split('|'):[]),...(group?[group]:[])].map(g=>String(g).trim()).filter(Boolean));
    groups.forEach(g=>{if(g&&!s.groups.includes(g))s.groups.push(g)});
    const old=Object.hasOwn(s.entries,key)?s.entries[key]:null;
    if(old) {
      const next=uniq([...old.meanings,...meanings]);
      const nextGroups=uniq([...old.groups,...groups]);
      const changed=next.length!==old.meanings.length||nextGroups.length!==old.groups.length||(!old.phonetic&&row.phonetic);
      old.meanings=next;old.groups=nextGroups;
      if(!old.phonetic&&row.phonetic)old.phonetic=row.phonetic;
      result[changed?'updated':'skipped']++;
    } else {
      Object.defineProperty(s.entries,key,{enumerable:true,configurable:true,writable:true,value:{key,english,meanings,groups,phonetic:row.phonetic||'',type:row.type||( /[.!?。！？]$/.test(english)?'sentence':/\s/.test(english)?'phrase':'word'),recognitionOnly:!!row.recognitionOnly,favorite:!!row.favorite,favoritedAt:row.favorite?Date.now():0,createdAt:Date.now(),source:row.source||'手动导入',stats:{typing:blankStats(),choice:blankStats()},supplement:row.supplement||null}});
      result.added++;
    }
  }
  return result;
}
export function pool(s) {
  const cat=category(s);
  return Object.values(s.entries).filter(e=>(cat!=='typing'||!e.recognitionOnly)&&(!s.settings.group || (s.settings.group==='__ungrouped'?e.groups.length===0:e.groups.includes(s.settings.group)))&&(s.settings.scope==='favorite'?e.favorite:s.settings.scope==='wrong'?statsOf(e,cat).wrong>0:true));
}
export function shouldExtra(e,cat) {return !(cat==='typing'&&e.recognitionOnly)&&(e.favorite || (statsOf(e,cat).wrong>0 && statsOf(e,cat).streak<3));}
export function schedule(s,e) {
  const cat=category(s),r=s.rounds[cat];
  if(r.skipped?.includes(e.key)||!shouldExtra(e,cat) || extraCount(r,e.key)>=2 || r.due.some(d=>d.key===e.key))return;
  const spacing=Math.min(5,Math.max(1,pool(s).length-1));
  r.due.push({key:e.key,at:r.steps+spacing});
}
export function nextQuestion(s,rng=Math.random) {
  const cat=category(s),r=s.rounds[cat];
  if(r.current && !r.current.finished && s.entries[r.current.key])return r.current;
  const list=pool(s),keys=new Set(list.map(e=>e.key));
  r.due=r.due.filter(d=>!r.skipped?.includes(d.key)&&s.entries[d.key]&&shouldExtra(s.entries[d.key],cat)&&extraCount(r,d.key)<2);
  let base=list.filter(e=>!r.done.includes(e.key));
  let due=r.due.filter(d=>keys.has(d.key)&&(d.at<=r.steps||!base.length));
  // A later import or newly favorited completed word must also be eligible for review.
  for(const e of list)if(r.done.includes(e.key)&&shouldExtra(e,cat)&&!extraCount(r,e.key)&&!r.due.some(d=>d.key===e.key))schedule(s,e);
  due=r.due.filter(d=>keys.has(d.key)&&(d.at<=r.steps||!base.length));
  if(base.length+due.length>1) {
    const b=base.filter(e=>e.key!==r.last),d=due.filter(e=>e.key!==r.last);
    if(b.length+d.length){base=b;due=d;}
  }
  let key,kind;
  if(due.length) {
    // Recent mistakes get a higher chance; favorite + wrong still has one queue entry.
    const weighted=due.flatMap(d=>Array(1+Math.min(4,statsOf(s.entries[d.key],cat).wrong)).fill(d));
    key=weighted[Math.floor(rng()*weighted.length)].key;kind='extra';r.due=r.due.filter(d=>d.key!==key);
  } else if(base.length) {key=base[Math.floor(rng()*base.length)].key;kind='base';}
  else {r.current=null;return null;}
  r.current={key,kind,tries:0,input:'',finished:false,outcome:null,ms:0,options:null,hints:null};
  if(kind==='extra'&&Object.hasOwn(r.outcomes||{},key)&&r.outcomes[key]==='correct')roundOutcome(r,key,'escaped','escape');
  return r.current;
}
function rememberQuestion(r,q){
  if(!Array.isArray(r.history))r.history=[];
  q.historyIndex=r.history.length;
  r.history.push(structuredClone(q));
}
export function previousQuestion(s,before){
  const r=s.rounds[category(s)],history=Array.isArray(r.history)?r.history:[];
  const limit=before??(Number.isInteger(r.current?.historyIndex)?r.current.historyIndex:history.length);
  for(let i=Math.min(limit,history.length)-1;i>=0;i--){const q=history[i];if(q?.finished&&Object.hasOwn(s.entries,q.key))return {question:q,index:i};}
  return null;
}
export function finish(s,correct) {
  const cat=category(s),r=s.rounds[cat],q=r.current;
  if(!q||q.finished)return false;
  ensureWallet(s);
  const e=s.entries[q.key],st=statsOf(e,cat);
  q.finished=true;q.outcome=correct?'correct':'wrong';
  roundOutcome(r,q.key,q.outcome,correct?'catch':'miss');
  if(correct){st.correct++;if(q.tries===0){st.first++;st.streak++;}else st.streak=0;}
  else {st.wrong++;st.streak=0;}
  st.ms+=q.ms||0;st.chars+=e.english.length;
  if(q.kind==='base'){if(!r.done.includes(e.key))r.done.push(e.key);}
  else if(q.kind==='extra')Object.defineProperty(r.extra,e.key,{enumerable:true,configurable:true,writable:true,value:extraCount(r,e.key)+1});
  r.steps++;r.last=e.key;schedule(s,e);if(correct)rewardCatch(s,cat,r,q);rememberQuestion(r,q);return true;
}
export function compare(input,target,type,settings) {
  let a=String(input).trim(),b=String(target).trim();
  if(type!=='sentence'||!settings.strictCase){a=a.toLowerCase();b=b.toLowerCase();}
  if(type==='sentence'&&!settings.strictPunctuation){a=a.replace(/[.,!?;:"“”‘’'()\[\]—–-]/g,'').replace(/\s+/g,' ');b=b.replace(/[.,!?;:"“”‘’'()\[\]—–-]/g,'').replace(/\s+/g,' ');}
  return a===b;
}
export function submit(s,input) {
  const q=s.rounds[category(s)].current;if(!q||q.finished)return 'ignored';
  q.input=input;
  const e=s.entries[q.key],ok=category(s)==='choice'?input===q.key:compare(input,e.english,e.type,s.settings);
  if(ok){finish(s,true);return 'correct';}
  q.tries++;
  if(q.tries>=2){finish(s,false);return 'wrong';}
  return 'retry';
}
export function choices(s,q,rng=Math.random) {
  if(q.options)return q.options;
  const e=s.entries[q.key];
  const semanticTokens=x=>new Set(x.meanings.flatMap(m=>m.replace(/\b(?:n|v|adj|adv|vt|vi|prep|pron)\./g,'').split(/[；;，,：:、。]/)).map(v=>v.trim()).filter(v=>v.length>=2));
  const targetTokens=semanticTokens(e);
  const candidates=Object.values(s.entries).filter(x=>x.key!==e.key&&x.meanings.join('；')!==e.meanings.join('；')&&![...semanticTokens(x)].some(t=>targetTokens.has(t)));
  const shuffle=a=>a.map(v=>({v,n:rng()})).sort((a,b)=>a.n-b.n).map(x=>x.v);
  q.options=shuffle([e,...shuffle(candidates).slice(0,3)]).map(x=>({key:x.key,label:x.meanings.join('；')}));
  return q.options;
}
export function hintMask(q,word,amount) {
  if(q.hints&&q.hints.amount===amount)return q.hints.mask;
  let start=true;
  const mask=[...word].map(c=>{if(/\s/.test(c)){start=true;return c;}if(!/[a-z]/i.test(c))return c;const show=start||amount>=1||Math.random()<Math.max(0,(amount-0.12));start=false;return show?c:'＿';}).join(' ');
  q.hints={amount,mask};return mask;
}

export function skipQuestion(s){
 const cat=category(s),r=s.rounds[cat],q=r.current;if(!q||q.finished)return false;
 q.finished=true;q.outcome='skipped';r.skipped=uniq([...(r.skipped||[]),q.key]);
 roundOutcome(r,q.key,'skipped','skip');
 if(q.kind==='base'&&!r.done.includes(q.key))r.done.push(q.key);
 r.due=r.due.filter(d=>d.key!==q.key);r.steps++;r.last=q.key;
 const st=statsOf(s.entries[q.key],cat);st.skipped=(st.skipped||0)+1;rememberQuestion(r,q);return true;
}

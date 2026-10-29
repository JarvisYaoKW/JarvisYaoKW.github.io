import {category,pool} from './engine.mjs';

// Read-only projection of the normal practice round. No question queue or score lives here.
export function sheepStatus(s,key) {
  const r=s.rounds[category(s)],q=r.current;
  const result=Object.hasOwn(r.outcomes||{},key)?r.outcomes[key]:null;
  if(result==='correct')return 'caught';
  if(result==='escaped')return 'escaped';
  if(result==='wrong')return 'waiting';
  if(result==='skipped'||r.skipped?.includes(key))return 'skipped';
  // Old saves may predate the per-round ledger; only the current result is certain.
  if(q?.key===key&&q.finished)return q.outcome==='correct'?'caught':q.outcome==='wrong'?'waiting':'skipped';
  return r.done.includes(key)?'unconfirmed':'free';
}
export function herdSummary(s) {
  const r=s.rounds[category(s)],entries=pool(s),keys=new Set(entries.map(e=>e.key));
  const caught=entries.filter(e=>sheepStatus(s,e.key)==='caught');
  return {round:r.number,entries,caught,outside:entries.filter(e=>sheepStatus(s,e.key)!=='caught'),
    escaped:entries.filter(e=>sheepStatus(s,e.key)==='escaped'),
    skipped:entries.filter(e=>sheepStatus(s,e.key)==='skipped'),
    unknown:entries.filter(e=>sheepStatus(s,e.key)==='unconfirmed'),
    done:r.done.filter(k=>keys.has(k)).length,
    extra:Object.entries(r.extra).filter(([k])=>keys.has(k)).reduce((n,[,v])=>n+v,0),
    event:r.lastEvent&&keys.has(r.lastEvent.key)?r.lastEvent:null};
}

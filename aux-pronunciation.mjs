export function normalizedIPA(value){const t=String(value||'').trim();return t?'/'+t.replace(/^[/\[]|[/\]]$/g,'')+'/':'';}
export function lookupPronunciations(raw={}){
 const out=[];const add=(text,accent='',extra={})=>{text=normalizedIPA(text);if(text&&!out.some(p=>p.text===text&&p.accent===accent))out.push({text,accent,...extra});};
 for(const accent of ['us','uk'])add(raw.youdao?.phonetics?.[accent],accent);
 for(const d of raw.dictionary||[]){for(const p of d.phonetics||[])add(p.text,/(?:^|[-_/])uk(?:[.\-_/]|$)/i.test(p.audio||'')?'uk':/(?:^|[-_/])us(?:[.\-_/]|$)/i.test(p.audio||'')?'us':'',{audio:p.audio||''});if(!(d.phonetics||[]).some(p=>p.text))add(d.phonetic);}
 for(const p of [...(raw.pronunciationGroups||[]),...(raw.unmappedPronunciations||[])])add(p.ipa,p.accent||'',{pos:p.pos||''});
 return out;
}
export function auxiliaryEntry(item){return{key:item.word.trim().toLowerCase(),english:item.word,meanings:[item.meaning||item.label||''],phonetic:item.phonetic||item.phonetics?.[0]?.text||'',supplement:{phonetics:item.phonetics||[],pronunciationGroups:item.pronunciationGroups||[]}};}
export function selectedReadings(item,accent){
 const match=String(item.meaning||'').match(/\b(vt|vi|v|n|adj|adv)\./i),pos=match?({vt:'verb',vi:'verb',v:'verb',n:'noun',adj:'adjective',adv:'adverb'})[match[1].toLowerCase()]:'';
 const mapped=(item.pronunciationGroups||[]).filter(p=>p.verified&&p.pos===pos&&(p.accent===accent||!p.accent));
 if(mapped.length)return [...new Set(mapped.map(p=>normalizedIPA(p.ipa)))];
 const all=item.phonetics||[],preferred=all.filter(p=>p.accent===accent),neutral=all.filter(p=>!p.accent),choices=preferred.length?preferred:neutral;
 if(choices.length)return [...new Set(choices.map(p=>p.text).filter(Boolean))];
 return [...new Set(all.map(p=>(p.accent==='us'?'美音 ':p.accent==='uk'?'英音 ':'')+p.text).filter(Boolean))];
}

import {category,pool} from './engine.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const panelIcon=`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m-3-10h0m0 4h0"/></svg>`;
export const closeIcon=`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>`;
const modes=[['blank','完整拼写','不显示字母提示'],['hint','字母提示','显示部分字母，原位输入'],['choice','中文选择','看英文，按 1–4 选择词义']];
export function practiceSelection(s) {
 const group=s.settings.group==='__ungrouped'?'未分组':s.settings.group||'全部词条';
 const scope={all:'全部内容',wrong:'只练常错',favorite:'只练收藏'}[s.settings.scope]||'全部内容';
 return {group,scope,count:pool(s).length,mode:modes.find(m=>m[0]===s.settings.mode)?.[1]||'完整拼写'};
}
export function practiceControls(s,{mobile=false}={}) {
 const sel=practiceSelection(s),q=s.rounds[category(s)].current,waiting=q&&!q.finished&&!pool(s).some(e=>e.key===q.key);
 const groupOptions='<option value="">全部词条</option><option value="__ungrouped" '+(s.settings.group==='__ungrouped'?'selected':'')+'>未分组</option>'+s.groups.map(g=>'<option value="'+esc(g)+'" '+(g===s.settings.group?'selected':'')+'>'+esc(g)+'</option>').join('');
 return `<div class="config-heading"><h2 id="practice-settings-title">练习设置</h2><button class="config-icon" data-action="${mobile?'config-close':'sidebar-toggle'}" aria-label="${mobile?'关闭练习设置':'收起练习设置'}" title="${mobile?'关闭练习设置':'收起侧栏'}">${mobile?closeIcon:panelIcon}</button></div>
 <fieldset class="config-section"><legend>练习方式</legend><div class="practice-mode-options">${modes.map(([value,title,description])=>`<label class="practice-mode-option"><input type="radio" name="practice-mode" value="${value}" ${s.settings.mode===value?'checked':''}><span><strong>${title}</strong><small>${description}</small></span></label>`).join('')}</div>
 ${s.settings.mode==='hint'?`<div class="sidebar-hint"><div><label for="hint-level">字母提示程度</label><output for="hint-level" id="hint-amount">${s.settings.hint>=1?'100% · 全部显示':s.settings.hint?Math.round(s.settings.hint*100)+'% 左右':'仅首字母'}</output></div><input id="hint-level" name="hint-level" aria-label="字母提示程度" type="range" min="0" max="1" step="0.1" value="${s.settings.hint}"><div class="hint-scale" aria-hidden="true"><span>少</span><span>全部显示</span></div></div>`:''}</fieldset>
 <fieldset class="config-section"><legend>练习内容</legend><label class="config-field" for="practice-group">词库分组</label><select id="practice-group" name="practice-group">${groupOptions}</select><label class="config-field" for="practice-scope">范围</label><select id="practice-scope" name="practice-scope"><option value="all" ${s.settings.scope==='all'?'selected':''}>全部内容</option><option value="wrong" ${s.settings.scope==='wrong'?'selected':''}>只练常错</option><option value="favorite" ${s.settings.scope==='favorite'?'selected':''}>只练收藏</option></select><p class="practice-pool-count">当前可练 <strong>${sel.count}</strong> 条</p>${waiting?'<p class="config-pending" role="status">当前题已保留，新范围从下一题开始。</p>':''}</fieldset>
 <div class="config-bottom"><button class="sidebar-import" data-action="books">预置词库</button><button class="sidebar-import" data-action="import"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/></svg>导入词库</button><p>进度自动保存，下次接着练。</p>${mobile?'<button class="primary config-done" data-action="config-close">完成设置</button>':''}</div>`;
}
export function practiceSidebar(s){const collapsed=!!s.settings.sidebarCollapsed;return `<aside class="practice-sidebar" id="practice-sidebar" aria-labelledby="practice-settings-title" aria-hidden="${collapsed}" ${collapsed?'inert':''}><div class="practice-sidebar-body">${practiceControls(s)}</div></aside>`;}
export function practiceContext(s,{mobile=false,collapsed=false,pasture=false}={}) {
 const sel=practiceSelection(s),button=true;
 return `<div class="practice-context">${button?`<button class="panel-open ${!mobile&&!collapsed?'is-active':''}" data-action="${mobile?'config-open':'sidebar-toggle'}" aria-expanded="${!mobile&&!collapsed}" ${mobile?'aria-haspopup="dialog"':'aria-controls="practice-sidebar"'}>${panelIcon}<span>练习设置</span></button>`:''}<div class="context-copy"><h1>${pasture?'羊群草场':category(s)==='choice'?'词义选择练习':'打字练习'}</h1><p>${esc(sel.group)}<span aria-hidden="true"> / </span>${esc(sel.scope)}<span class="context-count">${sel.count} 条可练</span></p></div>${pasture?'<button class="text-btn" data-action="pasture-help">草场说明</button>':!mobile?`<span class="context-mode">${esc(sel.mode)}</span>`:''}</div>`;
}
export function practiceFrame(content,s,{mobile=false}={}) {
 const collapsed=!!s.settings.sidebarCollapsed;
 return `<div class="practice-workspace ${collapsed?'sidebar-collapsed':''} ${mobile?'is-mobile':''}">${!mobile?practiceSidebar(s):''}<div class="practice-workspace-content">${content}</div></div>`;
}

export function applySidebarState(frame,collapsed) {
 const aside=frame.querySelector('.practice-sidebar'),button=frame.querySelector('.panel-open');
 if(!aside||!button)return;
 // Keep the input, hint mask, header and pasture DOM alive throughout the transition.
 if(collapsed&&aside.contains(document.activeElement))button.focus({preventScroll:true});
 frame.classList.toggle('sidebar-collapsed',collapsed);
 aside.toggleAttribute('inert',collapsed);aside.setAttribute('aria-hidden',String(collapsed));
 button.setAttribute('aria-expanded',String(!collapsed));button.classList.toggle('is-active',!collapsed);
 aside.querySelector('[data-action="sidebar-toggle"]')?.setAttribute('aria-expanded',String(!collapsed));
}

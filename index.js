import { getContext, extension_settings } from '../../../extensions.js';
import { saveBase64AsFile } from '../../../utils.js';
import { writeSecret, SECRET_KEYS } from '../../../secrets.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import * as wi from '../../../world-info.js';
import { getScriptsByType, saveScriptsByType, SCRIPT_TYPES } from '../../regex/engine.js';
import { defaults, parseBlocks, buildRequest } from './core.js';

const ID='miao_nai_image';
const base=new URL('.',import.meta.url);
const ctx=()=>getContext();
const settings=extension_settings[ID] ??= {enabled:true,stream:false,pattern:'image###([\\s\\S]*?)###',profiles:[{...defaults}],active:0,installed:false};
const running=new Map();
const attempted=new Set();
let queue=Promise.resolve(), streamActive=false, timer;
const save=()=>ctx().saveSettingsDebounced();
function el(tag,text,cls) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; }
async function errorPopup(error) {
    const box=el('div'); box.append(el('h3','喵喵文生图：生成失败'),el('pre',String(error.message||error)));
    await callGenericPopup(box,POPUP_TYPE.TEXT);
}
const guard=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(errorPopup);
function blocks(message) { return parseBlocks(message.mes,settings.pattern); }
function identity(message,block) { return `${message.swipe_id??0}:${block.index}:${block.prompt}`; }
function state(message,key) { return message.extra?.[ID]?.[key]; }
function currentChat() { return String(ctx().getCurrentChatId()); }
function stillValid(chat,message,block,key) { return currentChat()===chat && ctx().chat.includes(message) && blocks(message).some(b=>identity(message,b)===key); }
function generate(message,block) {
    const key=identity(message,block), chat=currentChat(), taskId=`${chat}:${ctx().chat.indexOf(message)}:${key}`;
    if(running.has(taskId))return;
    const request=buildRequest(settings.profiles[settings.active],block.prompt);
    attempted.add(taskId);
    const task={status:'排队中',message,key,chat}; running.set(taskId,task); renderAll();
    queue=queue.then(async()=>{
        if(!settings.enabled || !stillValid(chat,message,block,key))return;
        task.status='生成中'; renderAll();
        const response=await fetch('/api/novelai/generate-image',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(request)});
        if(!response.ok)throw new Error(`NAI HTTP ${response.status}\n${(await response.text()).slice(0,1600)}`);
        const data=(await response.text()).trim();
        if(!data || data.startsWith('{') || data.startsWith('<'))throw new Error('酒馆生图接口未返回有效的 base64 图片，请检查后端兼容性');
        const url=await saveBase64AsFile(data,'miao-nai',`miao-${Date.now()}`,'png');
        // Do not attach stale results to another chat or edited/swiped messages.
        if(!stillValid(chat,message,block,key)) { toastr.info('图片已保存，但原消息已切换或修改：'+url); return; }
        message.extra??={}; message.extra[ID]??={}; message.extra[ID][key]={url,request,created:Date.now()};
        await ctx().saveChat();
    }).catch(async error=>{
        task.status='失败，点击重试'; task.error=String(error.message||error);
        await errorPopup(error);
    }).finally(()=>{running.delete(taskId);renderAll();});
}
function makeCard(message,block) {
    const key=identity(message,block), card=el('div',undefined,'miao-image-card');
    card.dataset.miaoKey=key;
    const record=state(message,key);
    const task=[...running.values()].find(t=>t.chat===currentChat() && t.message===message && t.key===key);
    if(record?.url) {
        const link=el('a');link.href=record.url;link.target='_blank';link.rel='noopener';
        const image=el('img');image.src=record.url;image.alt='生成的剧情插图';image.loading='lazy';link.append(image);card.append(link);
    }
    const button=el('button',task?.status || (record?'重新生成':'生成插图'),'menu_button');button.type='button';button.disabled=!!task;
    button.addEventListener('click',guard(()=>generate(message,block)));card.append(button);
    const details=el('details'), summary=el('summary','查看提示词');details.append(summary,el('pre',block.prompt));card.append(details);
    return card;
}
function replaceLiteral(root,literal,node) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];let text='',n;
    while((n=walker.nextNode())) { if(n.parentElement.closest('.miao-image-card'))continue; nodes.push({n,start:text.length});text+=n.textContent; }
    const start=text.indexOf(literal);if(start<0)return false;const end=start+literal.length;
    const a=nodes.find(x=>x.start+x.n.length>start),b=nodes.find(x=>x.start+x.n.length>=end);
    if(!a||!b)return false;
    const range=document.createRange();range.setStart(a.n,start-a.start);range.setEnd(b.n,end-b.start);range.deleteContents();range.insertNode(node);return true;
}
function renderAll() {
    if(!settings.enabled)return;
    document.querySelectorAll('#chat .mes').forEach(mes=>{
        const message=ctx().chat[Number(mes.getAttribute('mesid'))],root=mes.querySelector('.mes_text');
        if(!message||message.is_user||message.is_system||!root)return;
        const found=blocks(message),valid=new Set(found.map(b=>identity(message,b)));
        root.querySelectorAll('.miao-image-card').forEach(n=>{if(!valid.has(n.dataset.miaoKey))n.remove();});
        for(const block of found) {
            const old=[...root.querySelectorAll('.miao-image-card')].find(n=>n.dataset.miaoKey===identity(message,block));
            const card=makeCard(message,block);
            if(old)old.replaceWith(card);else if(!replaceLiteral(root,block.raw,card))root.append(card);
        }
    });
}
async function installWorld(file) {
    const data=JSON.parse(await file.text());if(!data.entries)throw new Error('世界书需要 entries 字段');
    const name=file.name.replace(/\.json$/i,'');
    if(!wi.world_names.includes(name))await wi.importWorldInfo(file);
    if(!wi.world_names.includes(name))throw new Error('世界书导入失败');
    if(!wi.selected_world_info.includes(name))wi.onWorldInfoChange({state:'on',silent:'true'},name);
    settings.world=name;save();
}
async function installRegex(rules) {
    const list=Array.isArray(rules)?rules:[rules];
    for(const rule of list) {
        if(!rule.findRegex||typeof rule.replaceString!=='string')throw new Error('不是有效的酒馆正则文件');
    }
    const existing=getScriptsByType(SCRIPT_TYPES.GLOBAL,{allowedOnly:false});
    const merged=[...existing];
    for(const rule of list)if(!merged.some(r=>r.id===rule.id||r.scriptName===rule.scriptName))merged.push({...rule,id:rule.id||crypto.randomUUID()});
    await saveScriptsByType(merged,SCRIPT_TYPES.GLOBAL);
}
async function installDefaults() {
    const [w,r]=await Promise.all([fetch(new URL('assets/worldbook.json',base)),fetch(new URL('assets/regex.json',base))]);
    if(!w.ok||!r.ok)throw new Error('内置资源读取失败');
    await installWorld(new File([await w.text()],'[喵喵]文生图 2.0.json',{type:'application/json'}));
    await installRegex(await r.json());settings.installed=true;save();
}
function button(parent,text,fn) {const b=el('button',text,'menu_button');b.type='button';b.addEventListener('click',guard(fn));parent.append(b);return b;}
function input(parent,label,value,onChange,type='text') {
    const wrap=el('label',undefined,'miao-field');wrap.append(el('span',label));
    const field=el(type==='textarea'?'textarea':'input');if(type!=='textarea')field.type=type;field.value=value??'';
    field.className='text_pole';field.addEventListener('change',guard(()=>onChange(type==='number'?Number(field.value):field.value)));wrap.append(field);parent.append(wrap);return field;
}
function drawSettings() {
    document.getElementById('miao-nai-settings')?.remove();
    const root=el('div',undefined,'miao-settings');root.id='miao-nai-settings';root.append(el('h3','喵喵文生图'));
    const toggle=(text,key)=>{const label=el('label',undefined,'miao-toggle');const field=el('input');field.type='checkbox';field.checked=settings[key];field.onchange=()=>{settings[key]=field.checked;save();renderAll();};label.append(field,el('span',text));root.append(label);};
    toggle('启用插件','enabled');toggle('流式自动生成（完整标签闭合后立即入队）','stream');
    root.append(el('p','默认模式：正文提示词变为按钮，点击生成。流式模式仅处理本次新回复。'));
    const key=input(root,'NAI API Key（保存到酒馆密钥管理）','',()=>{},'password');key.autocomplete='new-password';
    button(root,'保存 Key',async()=>{if(!key.value.trim())throw new Error('请填写 Key');await writeSecret(SECRET_KEYS.NOVEL,key.value.trim());key.value='';toastr.success('NAI Key 已保存');});
    const select=el('select',undefined,'text_pole');settings.profiles.forEach((p,i)=>{const o=el('option',p.name);o.value=i;o.selected=i===settings.active;select.append(o);});select.onchange=()=>{settings.active=+select.value;save();drawSettings();};root.append(select);
    button(root,'复制为新配置',()=>{settings.profiles.push({...settings.profiles[settings.active],name:'新配置'});settings.active=settings.profiles.length-1;save();drawSettings();});
    button(root,'删除当前配置',()=>{if(settings.profiles.length===1)throw new Error('至少保留一个配置');settings.profiles.splice(settings.active,1);settings.active=0;save();drawSettings();});
    const p=settings.profiles[settings.active];
    for(const [key,label,type] of [['name','配置名称'],['positive','固定正面提示词','textarea'],['artists','画师串','textarea'],['negative','固定负面提示词','textarea'],['model','NAI 模型'],['sampler','采样器'],['scheduler','噪声表'],['width','宽度','number'],['height','高度','number'],['steps','步数','number'],['scale','Guidance','number'],['seed','种子（-1 为随机）','number']])input(root,label,p[key],v=>{p[key]=v;save();},type);
    button(root,'测试生成（当前配置）',async()=>{
        const request=buildRequest(p,'1girl, adult woman, white dress, flower garden, sunlight');
        const res=await fetch('/api/novelai/generate-image',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(request)});
        if(!res.ok)throw new Error(`NAI HTTP ${res.status}\n${(await res.text()).slice(0,1600)}`);
        const url=await saveBase64AsFile((await res.text()).trim(),'miao-nai',`test-${Date.now()}`,'png');
        const image=el('img');image.src=url;image.style.maxWidth='100%';await callGenericPopup(image,POPUP_TYPE.TEXT);
    });
    input(root,'捕捉表达式（第一捕获组为绘图提示词）',settings.pattern,v=>{new RegExp(v,'gi');if(parseBlocks('image###test###',v).length===0 && !v.includes('('))throw new Error('需要第一捕获组');settings.pattern=v;save();renderAll();});
    button(root,'载入默认世界书与正则',installDefaults);
    const upload=(text,accept,fn)=>{const f=el('input');f.type='file';f.accept=accept;f.hidden=true;f.onchange=guard(async()=>{if(f.files[0])await fn(f.files[0]);f.value='';});root.append(f);button(root,text,()=>f.click());};
    upload('载入自己的世界书','.json',installWorld);
    upload('载入自己的正则（支持单条或数组）','.json',async f=>installRegex(JSON.parse(await f.text())));
    root.append(el('p','自定义世界书的输出格式需要匹配上面的捕捉表达式。已有同名世界书和同 ID 正则会复用。'));
    (document.getElementById('extensions_settings2')||document.getElementById('extensions_settings')).append(root);
}
function scanStream(text) {
    if(!settings.enabled||!settings.stream||!streamActive)return;
    const message=ctx().chat.at(-1);if(!message||message.is_user||message.is_system)return;
    // ST emits the cumulative response text. Only closed blocks become requests.
    const source=typeof text==='string'?text:message.mes;
    for(const block of parseBlocks(source,settings.pattern)) {
        if(!blocks(message).some(b=>identity(message,b)===identity(message,block)))continue;
        const id=`${currentChat()}:${ctx().chat.indexOf(message)}:${identity(message,block)}`;
        if(!attempted.has(id) && !state(message,identity(message,block)))generate(message,block);
    }
}
async function init() {
    drawSettings();const c=ctx();
    for(const name of ['CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_EDITED','CHAT_CHANGED'])if(c.eventTypes[name])c.eventSource.on(c.eventTypes[name],()=>{clearTimeout(timer);timer=setTimeout(()=>{try{renderAll();}catch(e){errorPopup(e);}},50);});
    c.eventSource.on(c.eventTypes.GENERATION_STARTED,()=>{attempted.clear();streamActive=true;});
    c.eventSource.on(c.eventTypes.GENERATION_ENDED,()=>{scanStream();streamActive=false;renderAll();});
    c.eventSource.on(c.eventTypes.STREAM_TOKEN_RECEIVED,()=>{setTimeout(()=>guard(scanStream)(),0);});
    if(settings.enabled&&!settings.installed)await installDefaults();renderAll();
}
jQuery(()=>guard(init)());

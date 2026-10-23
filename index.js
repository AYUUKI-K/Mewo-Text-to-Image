import {fingerprintKey,runWithQueue,validateQueueURL} from './cloud-queue.js';
import { getContext, extension_settings } from '../../../extensions.js';
import { saveBase64AsFile } from '../../../utils.js';
import { writeSecret, SECRET_KEYS } from '../../../secrets.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import * as wi from '../../../world-info.js';
import { getScriptsByType, saveScriptsByType, SCRIPT_TYPES } from '../../regex/engine.js';
import { createSettingsPanel } from './ui.js';
import { defaults, parseBlocks, buildRequest, latestImageMessage, canAutoGenerate, validateFolder, imageDay, imageURL, normalizeProfile, delimiterPattern } from './core.js';

const ID='miao_nai_image';
const base=new URL('.',import.meta.url);
const ctx=()=>getContext();
const settings=extension_settings[ID] ??= {enabled:true,stream:false,pattern:'image###([\\s\\S]*?)###',profiles:[{...defaults}],active:0,installed:false};
settings.mode ??= settings.stream ? 'stream' : 'manual';
settings.theme ??= 'auto';
settings.folder ??= 'miao-nai';
settings.folders ??= ['miao-nai'];
settings.profiles=settings.profiles.map(normalizeProfile);
settings.cloudQueue ??= false;
settings.queueUrl ??= '';
settings.keyHash ??= '';
if(settings.startTag===undefined){
    const legacy=(settings.pattern||'').match(/^(.*?)\(\[\\s\\S\]\*\?\)(.*?)$/);
    settings.startTag=legacy?legacy[1].replace(/\\(.)/g,'$1'):'image###';
    settings.endTag=legacy?legacy[2].replace(/\\(.)/g,'$1'):'###';
}
settings.endTag ??= '###';
settings.pattern ??= delimiterPattern(settings.startTag,settings.endTag);
const running=new Map();
const attempted=new Set();
let queue=Promise.resolve(), streamActive=false, timer, autoScheduled=false, generationChat=null, settingsHost=null;
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
function generate(message,block,{automatic=false}={}) {
    const key=identity(message,block), chat=currentChat(), taskId=`${chat}:${ctx().chat.indexOf(message)}:${key}`;
    if(running.has(taskId))return;
    const request=buildRequest(settings.profiles[settings.active],block.prompt);
    const folder=validateFolder(settings.folder);
    attempted.add(taskId);
    const task={status:'排队中',message,key,chat}; running.set(taskId,task); renderAll();
    queue=queue.then(async()=>{
        if(!settings.enabled || !stillValid(chat,message,block,key))return;
        if(automatic && !canAutoGenerate(ctx().chat,message,settings.mode,streamActive))return;
        task.status='生成中'; renderAll();
        const data=await requestImage(request,task,()=>stillValid(chat,message,block,key)&&(!automatic||canAutoGenerate(ctx().chat,message,settings.mode,streamActive)));
        const url=await saveBase64AsFile(data,folder,`miao-${Date.now()}-${crypto.randomUUID()}`,'png');
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
    card.dataset.theme=resolvedTheme();
    card.dataset.miaoKey=key;
    const record=state(message,key);
    const task=[...running.values()].find(t=>t.chat===currentChat() && t.message===message && t.key===key);
    if(record?.url&&!record.deleted) {
        const link=el('a');link.href=record.url;link.addEventListener('click',event=>{event.preventDefault();guard(()=>openImage(record.url))();});
        const image=el('img');image.src=record.url;image.alt='生成的剧情插图';image.loading='lazy';link.append(image);card.append(link);
    }
    card.dataset.status=`${record?.deleted?'deleted':record?.url||''}:${task?.status||''}`;
    const actions=el('div',undefined,'miao-image-tools');
    const iconButton=(label,icon,fn)=>{const button=el('button',undefined,'miao-icon-button');button.type='button';button.title=label;button.setAttribute('aria-label',label);const symbol=el('i',undefined,`fa-solid fa-${icon}`);symbol.setAttribute('aria-hidden','true');button.append(symbol);button.addEventListener('click',guard(fn));actions.append(button);return button;};
    const button=iconButton(task?.status || (record?'重新生成':'生成插图'),task?'spinner':record?'rotate-right':'image',()=>generate(message,block));button.disabled=!!task;
    if(task)button.classList.add('miao-spinning');
    if(record?.url&&!record.deleted)iconButton('下载图片','download',()=>downloadImage(record.url));
    iconButton('查看提示词','sliders',()=>{const pre=el('pre',block.prompt);pre.style.whiteSpace='pre-wrap';return callGenericPopup(pre,POPUP_TYPE.TEXT);});
    card.append(actions);
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
            if(old) {
                old.dataset.theme=card.dataset.theme;
                if(old.dataset.status!==card.dataset.status)old.replaceWith(card);
            } else if(!replaceLiteral(root,block.raw,card))root.append(card);
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
function resolvedTheme() {
    if(settings.theme!=='auto')return settings.theme;
    const color=getComputedStyle(document.body).getPropertyValue('--SmartThemeBodyColor').trim();
    const rgb=color.match(/[\d.]+/g)?.slice(0,3).map(Number);
    if(rgb?.length===3)return (rgb[0]*.299+rgb[1]*.587+rgb[2]*.114)>140?'dark':'light';
    return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}
function applyTheme() {
    document.querySelectorAll('.miao-settings,.miao-image-card').forEach(n=>n.dataset.theme=resolvedTheme());
}
async function testImage() {
    const request=buildRequest(settings.profiles[settings.active],'1girl, adult woman, white dress, flower garden, sunlight');
    const data=await requestImage(request);
    const url=await saveBase64AsFile(data,validateFolder(settings.folder),`test-${Date.now()}-${crypto.randomUUID()}`,'png');
    await openImage(url);
}
function saveCapture(start,end) {
    const pattern=delimiterPattern(start,end);settings.startTag=start;settings.endTag=end;settings.pattern=pattern;save();renderAll();toastr.success('捕捉标签已保存');
}
async function downloadImage(url,name='miao-image.png') {
    const response=await fetch(url);if(!response.ok)throw new Error(`图片下载失败：HTTP ${response.status}`);
    const objectURL=URL.createObjectURL(await response.blob());
    const link=el('a');link.href=objectURL;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),60000);
}
async function openImage(url,name='miao-image.png') {
    const view=el('div',undefined,'miao-image-viewer');
    const image=el('img');image.src=url;image.alt='图片预览';
    const download=el('button','下载到设备','miao-button miao-primary');download.type='button';download.addEventListener('click',guard(()=>downloadImage(url,name)));
    view.append(image,download);await callGenericPopup(view,POPUP_TYPE.TEXT,'',{wide:true});
}
async function queueStatus() {
    const url=validateQueueURL(settings.queueUrl);
    const response=await fetch(url+'/ping',{credentials:'omit',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error(`队列连接失败：HTTP ${response.status}`);
    return response.json();
}
async function requestImage(request,task,canContinue) {
    const generate=async()=>{
        const response=await fetch('/api/novelai/generate-image',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(request),signal:AbortSignal.timeout(180000)});
        if(!response.ok)throw new Error(`NAI HTTP ${response.status}\n${(await response.text()).slice(0,1600)}`);
        const data=(await response.text()).trim();
        if(!data||data.startsWith('{')||data.startsWith('<'))throw new Error('酒馆生图接口未返回有效图片');
        return data;
    };
    if(settings.cloudQueue)return runWithQueue({url:settings.queueUrl,keyHash:settings.keyHash,generate,canContinue,
        onStatus:status=>{if(task){task.status=status;renderAll();}},
        onReleaseError:()=>toastr.info('队列连接中断，占用将自动到期释放')});
    return generate();
}
function changeFolder(value) {
    settings.folder=validateFolder(value);
    if(!settings.folders.includes(settings.folder))settings.folders.push(settings.folder);
    save();
}
async function imageAPI(endpoint,body) {
    const res=await fetch('/api/images/'+endpoint,{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(body)});
    if(!res.ok)throw new Error(`图片管理 HTTP ${res.status}\n${(await res.text()).slice(0,500)}`);
    return res;
}
async function listImages(folder) {
    folder=validateFolder(folder);
    const names=await (await imageAPI('list',{folder,sortField:'date',sortOrder:'desc'})).json();
    return names.filter(name=>typeof name==='string'&&imageDay(name)).map(name=>({name,day:imageDay(name),url:imageURL(folder,name)}));
}
async function deleteImages(folder,names) {
    folder=validateFolder(folder);
    const allowed=new Set((await listImages(folder)).map(item=>item.name));
    if(!names.length)return;
    if(names.some(name=>!allowed.has(name)))throw new Error('清理列表已变化，请刷新后重试');
    const question=el('div');question.append(el('h3',`清理 ${names.length} 张生成图片？`),el('p',`服务器目录：${folder}`),el('p','这会永久删除服务器上的文件，引用这些图片的聊天将无法再显示原图。'));
    const previews=el('div',undefined,'miao-history-grid');
    for(const name of names){const image=el('img');image.src=imageURL(folder,name);image.alt=name;image.loading='lazy';previews.append(image);}
    question.append(previews);
    if(!await callGenericPopup(question,POPUP_TYPE.CONFIRM))return;
    const removed=[];let failure;
    for(const name of names) {
        try {await imageAPI('delete',{path:`user/images/${folder}/${name}`});removed.push(name);}
        catch(error){failure=error;break;}
    }
    const paths=new Set(removed.map(name=>`user/images/${folder}/${name}`));let changed=false;
    for(const message of ctx().chat)for(const record of Object.values(message.extra?.[ID]||{})) {
        if(paths.has(String(record.url).replace(/^\//,''))){record.deleted=true;changed=true;}
    }
    if(changed)await ctx().saveChat();renderAll();
    toastr.success(`已清理 ${removed.length} 张图片`);
    if(failure)throw failure;
}
async function openSettings() {
    if(settingsHost?.isConnected)return;
    const panel=createSettingsPanel({settings,save,theme:resolvedTheme,onTheme:applyTheme,onError:errorPopup,
        onChange:async action=>{
            if(action==='confirm-delete')return Boolean(await callGenericPopup('删除当前配置？',POPUP_TYPE.CONFIRM));
            renderAll();if(action===true)autoLatest();
        },
        saveKey:async key=>{if(!key)throw new Error('请填写 Key');const hash=await fingerprintKey(key);await writeSecret(SECRET_KEYS.NOVEL,key);settings.keyHash=hash;save();toastr.success('NAI Key 已保存');},
        testImage,installDefaults,installWorld,installRegex,listImages,deleteImages,changeFolder,saveCapture,queueStatus,openImage});
    settingsHost=panel;
    await callGenericPopup(panel,POPUP_TYPE.TEXT,'',{wide:true,okButton:'完成',onOpen:popup=>popup.dlg.classList.add('miao-settings-dialog')});
    settingsHost=null;
}
function mountMenu() {
    document.getElementById('miao-nai-settings')?.remove();
    if(document.getElementById('miao-nai-menu'))return;
    const item=el('div',undefined,'list-group-item flex-container flexGap5');item.id='miao-nai-menu';item.setAttribute('role','button');item.tabIndex=0;
    const icon=el('i',undefined,'fa-solid fa-image extensionsMenuExtensionButton');icon.setAttribute('aria-hidden','true');
    item.append(icon,el('span','喵喵文生图'));item.addEventListener('click',guard(openSettings));
    item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();guard(openSettings)();}});
    const menu=document.getElementById('extensionsMenu');if(menu)menu.append(item);
}
function autoLatest() {
    if(!settings.enabled)return;
    const message=latestImageMessage(ctx().chat);
    if(!message || !canAutoGenerate(ctx().chat,message,settings.mode,streamActive))return;
    for(const block of blocks(message)) {
        const id=`${currentChat()}:${ctx().chat.indexOf(message)}:${identity(message,block)}`;
        if(!attempted.has(id)&&!state(message,identity(message,block)))generate(message,block,{automatic:true});
    }
}
function scanStream() {
    if(!settings.enabled||settings.mode!=='stream'||!streamActive||generationChat!==currentChat())return;
    autoLatest();
}
function scheduleRender(automatic=false) {
    autoScheduled ||= automatic;
    clearTimeout(timer);timer=setTimeout(()=>guard(()=>{const auto=autoScheduled;autoScheduled=false;renderAll();if(auto)autoLatest();})(),80);
}
async function init() {
    mountMenu();const c=ctx();save();
    for(const name of ['CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_EDITED'])if(c.eventTypes[name])c.eventSource.on(c.eventTypes[name],()=>scheduleRender(false));
    c.eventSource.on(c.eventTypes.CHAT_CHANGED,()=>{streamActive=false;generationChat=null;scheduleRender(true);});
    c.eventSource.on(c.eventTypes.GENERATION_STARTED,()=>{streamActive=true;generationChat=currentChat();});
    c.eventSource.on(c.eventTypes.GENERATION_ENDED,()=>{const same=generationChat===currentChat();streamActive=false;generationChat=null;renderAll();if(same)autoLatest();});
    c.eventSource.on(c.eventTypes.STREAM_TOKEN_RECEIVED,()=>{setTimeout(()=>guard(()=>{scanStream();renderAll();})(),0);});
    for(const event of ['SECRET_WRITTEN','SECRET_DELETED','SECRET_ROTATED'])if(c.eventTypes[event])c.eventSource.on(c.eventTypes[event],key=>{if(key===SECRET_KEYS.NOVEL){settings.keyHash='';save();}});
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
    if(settings.enabled&&!settings.installed)await installDefaults();renderAll();autoLatest();
}
jQuery(()=>guard(init)());

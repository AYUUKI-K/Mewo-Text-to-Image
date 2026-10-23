import {fingerprintKey,runWithQueue,validateQueueURL} from './cloud-queue.js';
import { getContext, extension_settings } from '../../../extensions.js';
import { saveBase64AsFile } from '../../../utils.js';
import { writeSecret, SECRET_KEYS } from '../../../secrets.js';
import { getCurrentUserHandle } from '../../../user.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import * as wi from '../../../world-info.js';
import { getScriptsByType, saveScriptsByType, SCRIPT_TYPES } from '../../regex/engine.js';
import { createSettingsPanel } from './ui.js';
import {createDirectClient} from './direct-client.js';
import {createKeyVault} from './direct-key.js';
import {appendImageVersion,imageVersions} from './image-history.js';
import {selectVibes} from './vibe.js';
import { defaults, parseBodyBlocks, maskReasoning, renderedBlockRange, buildRequest, latestImageMessage, canAutoGenerate, validateFolder, imageDay, imageURL, normalizeProfile, delimiterPattern } from './core.js';

const ID='miao_nai_image';
const base=new URL('.',import.meta.url);
const ctx=()=>getContext();
const settings=extension_settings[ID] ??= {enabled:true,stream:false,pattern:'image###([\\s\\S]*?)###',profiles:[{...defaults}],active:0,installed:false};
settings.mode ??= settings.stream ? 'stream' : 'manual';
settings.theme = 'auto';
settings.folder ??= 'miao-nai';
settings.folders ??= ['miao-nai'];
settings.profiles=settings.profiles.map(normalizeProfile);
settings.cloudQueue ??= false;
settings.queueUrl ||= 'https://miao-image-queue.savlu329.workers.dev';
settings.keyHash ??= '';
settings.rememberDirectKey ??= false;
if(settings.startTag===undefined){
    const legacy=(settings.pattern||'').match(/^(.*?)\(\[\\s\\S\]\*\?\)(.*?)$/);
    settings.startTag=legacy?legacy[1].replace(/\\(.)/g,'$1'):'image###';
    settings.endTag=legacy?legacy[2].replace(/\\(.)/g,'$1'):'###';
}
settings.endTag ??= '###';
// The visible delimiters are authoritative, including for legacy saved patterns.
settings.pattern = delimiterPattern(settings.startTag,settings.endTag);
const running=new Map();
const attempted=new Set();
let queue=Promise.resolve(), streamActive=false, timer, autoScheduled=false, generationChat=null, settingsHost=null;
let settingsPopup=null;
const save=()=>ctx().saveSettingsDebounced();
const directUser=getCurrentUserHandle(),directVault=createKeyVault(directUser);
const direct=createDirectClient({settings,save,getHeaders:()=>ctx().getRequestHeaders(),getKey:async()=>{
    if(getCurrentUserHandle()!==directUser)throw Error('酒馆用户已切换，请刷新页面后重试');
    const key=await directVault.get();
    if(key&&(!settings.keyHash||await fingerprintKey(key)!==settings.keyHash))throw Error('直连 Key 与当前配置不匹配，请在本插件重新保存当前 Key');
    return key;
},unzipPNG:async bytes=>{
    if(!globalThis.JSZip)await import('/lib/jszip.min.js');
    const archive=await globalThis.JSZip.loadAsync(bytes),image=Object.values(archive.files).find(file=>!file.dir&&/\.png$/i.test(file.name));
    if(!image)throw Error('NAI 返回结果中没有 PNG 图片');return image.async('base64');
}});
function el(tag,text,cls) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; }
async function showPopup(content,type,input='',options={}){
    let dispose=()=>{};
    try{return await callGenericPopup(content,type,input,{...options,animation:'none',onOpen:popup=>{
        const dialog=popup.dlg;dialog.classList.add('miao-modal');
        const viewport=window.visualViewport;
        const fit=()=>{dialog.style.setProperty('--miao-vv-width',(viewport?.width||innerWidth)+'px');dialog.style.setProperty('--miao-vv-height',(viewport?.height||innerHeight)+'px');dialog.style.setProperty('--miao-vv-left',(viewport?.offsetLeft||0)+'px');dialog.style.setProperty('--miao-vv-top',(viewport?.offsetTop||0)+'px');};
        fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);
        dispose=()=>{viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);window.removeEventListener('resize',fit);};
        options.onOpen?.(popup);
    }});}finally{dispose();}
}

async function errorPopup(error) {
    const box=el('div',undefined,'miao-prompt-view'); box.append(el('h3','喵喵文生图：操作失败'),el('pre',String(error.message||error)));
    await showPopup(box,POPUP_TYPE.TEXT);
}
const guard=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(errorPopup);
function reasoningFormat(){const r=ctx().powerUserSettings?.reasoning||{};return {prefix:ctx().substituteParams?.(r.prefix||'')??r.prefix,suffix:ctx().substituteParams?.(r.suffix||'')??r.suffix};}
function blocks(message) { return parseBodyBlocks(message.mes,settings.pattern,reasoningFormat()); }
function identity(message,block) { return `${message.swipe_id??0}:${block.index}:${block.prompt}`; }
function state(message,key) { return message.extra?.[ID]?.[key]; }
function currentChat() { return String(ctx().getCurrentChatId()); }
function stillValid(chat,message,block,key) { return currentChat()===chat && ctx().chat.includes(message) && blocks(message).some(b=>identity(message,b)===key); }
function generate(message,block,{automatic=false}={}) {
    const key=identity(message,block), chat=currentChat(), taskId=`${chat}:${ctx().chat.indexOf(message)}:${key}`;
    if(running.has(taskId))return;
    const request=buildRequest(settings.profiles[settings.active],block.prompt);
    request.vibes=selectVibes(settings.profiles[settings.active],settings.vibeLibrary);
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
        message.extra??={}; message.extra[ID]??={}; message.extra[ID][key]=appendImageVersion(message.extra[ID][key],{url,request,created:Date.now()});
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
    const versions=imageVersions(record),wanted=Math.min(record?.selected??versions.length-1,versions.length-1),selected=versions[wanted]?.deleted?versions.findLastIndex(v=>!v.deleted):wanted,current=versions[selected];
    const actions=el('div',undefined,'miao-image-tools');actions.hidden=true;
    const button=(label,fn)=>{const b=el('button',label,'miao-button');b.type='button';b.addEventListener('click',guard(fn));actions.append(b);return b;};
    if(current?.url&&!current.deleted){
        const image=el('img');image.src=current.url;image.alt='生成的剧情插图';image.loading='lazy';image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label','单击图片显示选项，双击重新生成');
        let clickTimer,lastTap=0;
        const reroll=()=>{clearTimeout(clickTimer);actions.hidden=true;if(!task)guard(()=>generate(message,block))();};
        image.addEventListener('click',event=>{if(event.detail>1)return;clearTimeout(clickTimer);clickTimer=setTimeout(()=>{actions.hidden=!actions.hidden;},280);});
        image.addEventListener('dblclick',event=>{event.preventDefault();reroll();});
        image.addEventListener('touchend',event=>{const now=Date.now();if(now-lastTap<300){event.preventDefault();reroll();lastTap=0;}else lastTap=now;},{passive:false});
        image.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();actions.hidden=!actions.hidden;}});
        card.append(image);
        if(versions.length>1){
            const switchTo=async index=>{record.selected=(index+versions.length)%versions.length;const item=versions[record.selected];Object.assign(record,{url:item.url,request:item.request,created:item.created,deleted:item.deleted||false});await ctx().saveChat();card.dataset.status='';renderAll();const replacement=[...document.querySelectorAll('.miao-image-card')].find(n=>n.dataset.miaoKey===key&&n.closest('.mes')?.getAttribute('mesid')===String(ctx().chat.indexOf(message)));if(replacement)replacement.querySelector('.miao-image-tools').hidden=false;};
            button('上一张',()=>switchTo(selected-1));actions.append(el('span',String(selected+1)+' / '+versions.length,'miao-version-count'));button('下一张',()=>switchTo(selected+1));
        }
        button('查看提示词',()=>showPrompt(current.request?.prompt||block.prompt,current.request?.vibes));
        button('下载图片',()=>downloadImage(current.url));button('放大查看',()=>openImage(current.url));
    }else{
        actions.hidden=false;button(task?.status||'生成插图',()=>generate(message,block)).disabled=!!task;button('查看提示词',()=>showPrompt(block.prompt));
    }
    if(task)card.append(el('span',task.status,'miao-image-progress'));
    card.dataset.status=String(selected)+':'+versions.map(v=>v.url+':'+!!v.deleted).join('|')+':'+(task?.status||'');
    card.append(actions);
    return card;
}
function replaceLiteral(root,literal,node) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];let text='',n;
    const customTag=reasoningFormat().prefix?.match(/^<([\w-]+)>$/)?.[1]?.toLowerCase();
    while((n=walker.nextNode())) { if(n.parentElement.closest('.miao-image-card,.mes_reasoning,.mes_reasoning_details,think,thinking,analysis,reasoning,imgthink,imagethink')||(customTag&&n.parentElement.closest(customTag)))continue; if(nodes.length)text+='\n';nodes.push({n,start:text.length});text+=n.textContent; }
    const found=renderedBlockRange(maskReasoning(text,reasoningFormat()),literal,settings.startTag,settings.endTag);if(!found)return false;const {start,end}=found;
    const a=nodes.find(x=>x.start+x.n.length>start),b=nodes.find(x=>x.start+x.n.length>=end);
    if(!a||!b)return false;
    const range=document.createRange();range.setStart(a.n,start-a.start);range.setEnd(b.n,end-b.start);range.deleteContents();range.insertNode(node);return true;
}
function renderAll() {
    if(!settings.enabled)return;
    document.querySelectorAll('#chat .mes').forEach(mes=>{
        const message=ctx().chat[Number(mes.getAttribute('mesid'))],root=mes.querySelector('.mes_text');
        if(!message||message.is_user||message.is_system||!root)return;
        // Streaming markdown is continually rebuilt by ST. Generate in the
        // background and insert cards only after its final message render.
        if(streamActive&&generationChat===currentChat()&&message===latestImageMessage(ctx().chat))return;
        const found=blocks(message),valid=new Set(found.map(b=>identity(message,b)));
        root.querySelectorAll('.miao-image-card').forEach(n=>{if(!valid.has(n.dataset.miaoKey))n.remove();});
        for(const block of found) {
            const old=[...root.querySelectorAll('.miao-image-card')].find(n=>n.dataset.miaoKey===identity(message,block));
            const card=makeCard(message,block);
            if(old) {
                old.dataset.theme=card.dataset.theme;
                if(old.dataset.status!==card.dataset.status)old.replaceWith(card);
            } else replaceLiteral(root,block.raw,card);
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
function resolvedTheme(){return 'host';}
function applyTheme() {
    document.querySelectorAll('.miao-settings,.miao-image-card').forEach(n=>n.dataset.theme=resolvedTheme());
}
async function testImage() {
    const request=buildRequest(settings.profiles[settings.active],'1girl, adult woman, white dress, flower garden, sunlight');
    request.vibes=selectVibes(settings.profiles[settings.active],settings.vibeLibrary);
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
    view.append(image,download);await showPopup(view,POPUP_TYPE.TEXT,'',{wide:true});
}
async function queueStatus() {
    const url=validateQueueURL(settings.queueUrl);
    const response=await fetch(url+'/ping',{credentials:'omit',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error(`队列连接失败：HTTP ${response.status}`);
    return response.json();
}
async function requestImage(request,task,canContinue) {
    const generate=async()=>{
        if(request.vibes?.length)return direct.generate(request);
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
const translations=new Map();
async function showPrompt(prompt,vibes=[]){
    const view=el('section',undefined,'miao-prompt-view');view.append(el('h3','绘图提示词'),el('pre',prompt));
    if(vibes.length)view.append(el('p','本张 Vibe：'+vibes.map(v=>v.name||v.id).join('、'),'miao-muted'));
    const button=el('button','Google 翻译为中文','miao-button');button.type='button';
    const note=el('p','点击后通过酒馆的 Google 翻译接口发送这段提示词。译文仅供查看，不会改动生图内容。','miao-muted');
    const translated=el('pre');translated.hidden=true;translated.setAttribute('aria-live','polite');
    button.onclick=guard(async()=>{button.disabled=true;button.textContent='翻译中…';try{
        let result=translations.get(prompt);
        if(!result){const response=await fetch('/api/translate/google',{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify({text:prompt,lang:'zh-CN'}),signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(`Google 翻译失败：HTTP ${response.status}，请检查酒馆服务器能否连接 Google。`);result=await response.text();if(!result.trim())throw Error('Google 未返回译文');if(translations.size>=50)translations.delete(translations.keys().next().value);translations.set(prompt,result);}
        translated.textContent=result;translated.hidden=false;
    }finally{button.disabled=false;button.textContent='Google 翻译为中文';}});
    view.append(button,note,translated);await showPopup(view,POPUP_TYPE.TEXT,'',{wide:true,onOpen:popup=>popup.dlg.classList.add('miao-content-dialog')});
}
async function importVibeFile(file){
    if(file.size>18*1024*1024)throw Error('文件不能超过 18 MB');
    const name=file.name.replace(/\.[^.]+$/,'');
    if(/\.(naiv4vibe|naiv4vibebundle|json)$/i.test(file.name))return direct.import({data:JSON.parse(await file.text()),name});
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 .naiv4vibe、.naiv4vibeBundle 或 PNG/JPEG/WebP');
    const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file);});
    return direct.import({image,name});
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
    for(const name of names.slice(0,24)){const image=el('img');image.src=imageURL(folder,name);image.alt=name;image.loading='lazy';previews.append(image);}
    if(names.length>24)question.append(el('p',`共 ${names.length} 张，下方预览前 24 张。`));
    question.append(previews);
    if(!await showPopup(question,POPUP_TYPE.CONFIRM))return;
    const removed=[];let failure;
    for(const name of names) {
        try {await imageAPI('delete',{path:`user/images/${folder}/${name}`});removed.push(name);}
        catch(error){failure=error;break;}
    }
    const paths=new Set(removed.map(name=>`user/images/${folder}/${name}`));let changed=false;
    for(const message of ctx().chat)for(const record of Object.values(message.extra?.[ID]||{})) {
        for(const version of imageVersions(record)){if(paths.has(String(version.url).replace(/^\//,''))){version.deleted=true;changed=true;}}
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
            if(action==='confirm-delete')return Boolean(await showPopup('删除当前配置？',POPUP_TYPE.CONFIRM));
            renderAll();if(action===true)autoLatest();
        },
        saveKey:async key=>{if(!key)throw new Error('请填写 Key');const hash=await fingerprintKey(key);await writeSecret(SECRET_KEYS.NOVEL,key);settings.keyHash=hash;save();await directVault.set(key,settings.rememberDirectKey);toastr.success('NAI Key 已保存，Vibe 可直接使用');},
        testImage,installDefaults,installWorld,installRegex,listImages,deleteImages,changeFolder,saveCapture,queueStatus,openImage,
        listVibes:()=>direct.list(),importVibeFile,
        directKeyStatus:async()=>{const key=await directVault.get();return Boolean(key&&settings.keyHash&&await fingerprintKey(key)===settings.keyHash);},clearDirectKey:()=>directVault.clear(),
        closeSettings:()=>settingsPopup?.completeAffirmative?settingsPopup.completeAffirmative():settingsPopup?.dlg.close(),
        setRememberDirectKey:async value=>{settings.rememberDirectKey=value;save();if(!value)await directVault.forgetPersistent();},
        encodeVibe:async body=>{const generate=()=>direct.encode(body);return settings.cloudQueue?runWithQueue({url:settings.queueUrl,keyHash:settings.keyHash,generate}):generate();},renameVibe:body=>direct.rename(body),
        deleteVibe:async id=>{if(!await showPopup('删除这个 Vibe？所有配置中的引用也会移除。',POPUP_TYPE.CONFIRM))return false;await direct.delete(id);for(const p of settings.profiles)p.vibes=(p.vibes||[]).filter(v=>v.id!==id);save();return true;}});
    settingsHost=panel;
    try{await showPopup(panel,POPUP_TYPE.TEXT,'',{wide:true,okButton:'完成',onOpen:popup=>{settingsPopup=popup;popup.dlg.classList.add('miao-settings-dialog');}});}
    finally{settingsHost=null;settingsPopup=null;}
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

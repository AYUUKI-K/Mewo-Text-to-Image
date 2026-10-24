import {fingerprintKey,runWithQueue,validateQueueURL} from './cloud-queue.js';
import { getContext, extension_settings } from '../../../extensions.js';
import * as extensionAPI from '../../../extensions.js';
import { saveBase64AsFile } from '../../../utils.js';
import * as hostUtils from '../../../utils.js';
import {bindImageGesture,createFloatingEntry} from './interactions.js';
import {persistHostSettings} from './settings-save.js';
import {createPromptTranslator} from './translation.js';
import { writeSecret, SECRET_KEYS } from '../../../secrets.js';
import { getCurrentUserHandle } from '../../../user.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import * as wi from '../../../world-info.js';
import { getScriptsByType, saveScriptsByType, SCRIPT_TYPES } from '../../regex/engine.js';
import { createSettingsPanel } from './ui.js';
import {createDirectClient} from './direct-client.js';
import {createKeyVault,saveCurrentKey} from './direct-key.js';
import {appendImageVersion,imageVersions,selectImageVersion} from './image-history.js';
import {selectVibes} from './vibe.js';
import {createExtensionUpdater} from './updates.js';
import {downloadImageSelection} from './downloads.js';
import {migrateSwipeImages,readSwipeImage,writeSwipeImage,swipeImageRecords,removeSwipeImages} from './swipe-history.js';
import { defaults, parseBodyBlocks, maskReasoning, renderedBlockRange, buildRequest, latestImageMessage, canAutoGenerate, validateFolder, imageDay, imageURL, normalizeProfile, delimiterPattern } from './core.js';

await (window.__TAURITAVERN__?.ready??window.__TAURITAVERN_MAIN_READY__);
const isTT=()=>Boolean(window.__TAURITAVERN__);
const ID='miao_nai_image';
const base=new URL('.',import.meta.url);
const ctx=()=>getContext();
const updater=createExtensionUpdater({moduleURL:import.meta.url,getHeaders:()=>ctx().getRequestHeaders(),getGlobal:name=>extensionAPI.extensionTypes?.[name]==='global'});
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
const cardBindings=new WeakMap();
let chatObserver,chatRootObserver,observedChat,imageSaves=0;
let queue=Promise.resolve(), streamActive=false, timer, autoScheduled=false, generationChat=null, settingsHost=null,imageToolsEpoch=0;
let settingsPopup=null,autoSession=null,floatingDispose=()=>{},lastGestureReroll=0;
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
const generationError=error=>toastr.error(String(error.message||error),'生图失败',{escapeHtml:true,timeOut:8000});
function reasoningFormat(){const r=ctx().powerUserSettings?.reasoning||{};return {prefix:ctx().substituteParams?.(r.prefix||'')??r.prefix,suffix:ctx().substituteParams?.(r.suffix||'')??r.suffix};}
function blocks(message) { return parseBodyBlocks(message.mes,settings.pattern,reasoningFormat()); }
const blockSlot=block=>`body:${block.bodyIndex}:${block.prompt}`;
function identity(message,block) { return `${message.swipe_id??0}:${blockSlot(block)}`; }
function state(message,key) {
    const at=key.indexOf(':'),swipe=Number(key.slice(0,at)),slot=key.slice(at+1),prompt=promptIdentity(slot.replace(/^(?:body:)?\d+:/,''));
    const text=(message.swipe_id??0)===swipe?message.mes:message.swipes?.[swipe];
    const all=parseBodyBlocks(text,settings.pattern,reasoningFormat()),unique=all.filter(b=>promptIdentity(b.prompt)===prompt).length===1;
    const block=all.find(b=>blockSlot(b)===slot);
    return readSwipeImage(message,swipe,slot,unique,block?`${block.index}:${block.prompt}`:undefined);
}
function currentChat() { return String(ctx().getCurrentChatId()); }
const promptIdentity=prompt=>String(prompt).replace(/\s+/g,' ').trim();
function liveMessage(message,fallback){
    if(ctx().chat.includes(message))return message;
    const byId=message.miao_nai_image_id&&ctx().chat.find(m=>m.miao_nai_image_id===message.miao_nai_image_id);
    if(byId)return byId;
    if(!fallback)return null;
    const candidate=ctx().chat[fallback.messageIndex];
    if(!candidate||candidate.name!==fallback.name||!!candidate.is_user!==!!fallback.is_user||!!candidate.is_system!==!!fallback.is_system)return null;
    const text=(candidate.swipe_id??0)===fallback.swipe?candidate.mes:candidate.swipes?.[fallback.swipe];
    const matching=parseBodyBlocks(text,settings.pattern,reasoningFormat()).filter(b=>promptIdentity(b.prompt)===fallback.prompt);
    return matching[fallback.occurrence]?candidate:null;
}
function taskTarget(task,inactive=false){
    if(task.cancelled||currentChat()!==task.chat)return null;
    const message=liveMessage(task.message,task);if(!message)return null;
    const active=(message.swipe_id??0)===task.swipe;if(!active&&!inactive)return null;
    const text=active?message.mes:message.swipes?.[task.swipe];if(typeof text!=='string')return null;
    const block=parseBodyBlocks(text,settings.pattern,reasoningFormat()).filter(b=>promptIdentity(b.prompt)===task.prompt)[task.occurrence];
    return block?{message,block}:null;
}
function taskFor(message,block){
    return [...running.values()].find(task=>{const target=taskTarget(task);return target?.message===message&&target.block.start===block.start;});
}
function generate(message,block,{automatic=false}={}) {
    try{return startGeneration(message,block,{automatic});}catch(error){generationError(error);}
}
function startGeneration(message,block,{automatic=false}={}) {
    message=liveMessage(message);if(!message)throw Error('原楼层已切换，请重新点击当前图片');
    const key=identity(message,block), chat=currentChat(), taskId=`${chat}:${ctx().chat.indexOf(message)}:${key}`;
    if(running.has(taskId)||taskFor(message,block))return;
    message.miao_nai_image_id??=crypto.randomUUID();
    const profile=settings.profiles[settings.active],profileName=profile.name;
    const request=buildRequest(profile,block.prompt);
    request.vibes=selectVibes(settings.profiles[settings.active],settings.vibeLibrary);
    const folder=validateFolder(settings.folder);
    attempted.add(taskId);
    const task={status:'排队中',message,key,chat,messageIndex:ctx().chat.indexOf(message),name:message.name,is_user:!!message.is_user,is_system:!!message.is_system,swipe:message.swipe_id??0,prompt:promptIdentity(block.prompt),occurrence:blocks(message).filter(b=>promptIdentity(b.prompt)===promptIdentity(block.prompt)).findIndex(b=>b.start===block.start),previousRecord:state(message,key),toolsEpoch:imageToolsEpoch};
    const waiting=running.size>0||settings.cloudQueue;running.set(taskId,task);renderAll();
    if(waiting)toastr.info('已加入生图队列','喵喵文生图');
    queue=queue.then(async()=>{
        let target=taskTarget(task);if((automatic&&!settings.enabled)||!target)return;
        if(automatic && !canAutoGenerate(ctx().chat,target.message,settings.mode,streamActive))return;
        task.status='正在生图'; renderAll();
        const data=await requestImage(request,task,()=>{const target=taskTarget(task);return !!target&&(!automatic||canAutoGenerate(ctx().chat,target.message,settings.mode,streamActive));});
        const url=await saveBase64AsFile(data,folder,`miao-${Date.now()}-${crypto.randomUUID()}`,'png');
        // Switching swipes does not invalidate an image already being generated.
        target=taskTarget(task,true);if(!target) { toastr.info('图片已保存，但原消息已删除或修改：'+url); return; }
        writeSwipeImage(target.message,task.swipe,blockSlot(target.block),appendImageVersion(task.previousRecord,{url,request,profileName,created:Date.now()}));
        // Show the result before waiting for ST's chat-save request.
        if(running.get(taskId)===task)running.delete(taskId);renderAll();
        if(task.previousRecord&&task.toolsEpoch===imageToolsEpoch&&(target.message.swipe_id??0)===task.swipe){
            const root=document.querySelector(`#chat .mes[mesid="${ctx().chat.indexOf(target.message)}"] .mes_text`);
            const card=[...(root?.querySelectorAll('.miao-image-card')||[])].find(n=>n.dataset.miaoKey===identity(target.message,target.block));
            if(card)card.querySelector('.miao-image-tools').hidden=false;
        }
        imageSaves++;try{await ctx().saveChat();}finally{imageSaves--;}
        toastr.success('生图完成','喵喵文生图');
    }).catch(error=>{
        task.status='失败，点击重试'; task.error=String(error.message||error);
        generationError(error);
    }).finally(()=>{if(running.get(taskId)===task)running.delete(taskId);renderAll();});
}
function makeCard(message,block) {
    const key=identity(message,block), card=el('div',undefined,'miao-image-card');
    card.dataset.theme=resolvedTheme();
    card.dataset.miaoKey=key;
    card.dataset.miaoPrompt=promptIdentity(block.prompt);
    card.dataset.miaoBodyIndex=String(block.bodyIndex);
    card.dataset.miaoOccurrence=String(blocks(message).filter(b=>promptIdentity(b.prompt)===promptIdentity(block.prompt)).findIndex(b=>b.start===block.start));
    const record=state(message,key);
    const task=taskFor(message,block);
    const versions=imageVersions(record),wanted=Math.min(record?.selected??versions.length-1,versions.length-1),selected=versions[wanted]?.deleted?versions.findLastIndex(v=>!v.deleted):wanted,current=versions[selected];
    const actions=el('div',undefined,'miao-image-tools');actions.hidden=true;
    const button=(label,fn,parent=actions)=>{const b=el('button',label,'miao-button');b.type='button';b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();guard(fn)();});parent.append(b);return b;};
    if(current?.url&&!current.deleted){
        const image=el('img');image.src=current.url;image.alt='生成的剧情插图';image.loading='lazy';image.draggable=false;image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label','单击图片显示选项，双击重新生成');
        image.setAttribute('aria-label',`单击图片显示选项，${settings.rerollClicks===3?'三':'双'}击重新生成`);
        const cancelGesture=bindImageGesture(image,{getClicks:()=>settings.rerollClicks===3?3:2,
            onSingle:()=>{if(image.isConnected&&image.dataset.toolsEpoch===String(imageToolsEpoch))actions.hidden=!actions.hidden;},
            onReroll:()=>{const now=Date.now();if(task||now-lastGestureReroll<900)return;lastGestureReroll=now;actions.hidden=true;guard(()=>generate(message,block))();}});
        image.addEventListener('pointerdown',()=>{image.dataset.toolsEpoch=String(imageToolsEpoch);});
        image.addEventListener('click',()=>{image.dataset.toolsEpoch??=String(imageToolsEpoch);});
        card._cancelGesture=cancelGesture;
        image.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();actions.hidden=!actions.hidden;}});
        card.append(image);
        if(versions.length>1){
            const navigation=el('nav',undefined,'miao-version-nav');navigation.setAttribute('aria-label','图片版本');actions.append(navigation);
            const switchTo=async offset=>{
                // Cards may outlive their captured record after chat state updates.
                const currentMessage=liveMessage(message);if(!currentMessage)return;
                const occurrence=Number(card.dataset.miaoOccurrence),matching=blocks(currentMessage).filter(item=>promptIdentity(item.prompt)===promptIdentity(block.prompt)),currentBlock=matching[occurrence];
                if(!currentBlock)return;
                const currentKey=identity(currentMessage,currentBlock),live=state(currentMessage,currentKey);if(!live||!selectImageVersion(live,offset))return;
                writeSwipeImage(currentMessage,currentMessage.swipe_id??0,blockSlot(currentBlock),live);
                const replacement=makeCard(currentMessage,currentBlock);replacement.querySelector('.miao-image-tools').hidden=false;
                card.replaceWith(replacement);await ctx().saveChat();
            };
            const prev=button('‹',()=>switchTo(-1),navigation);prev.setAttribute('aria-label','上一张');prev.title='上一张';
            const count=el('span',`${selected+1} / ${versions.length}`,'miao-version-count');count.setAttribute('aria-live','polite');navigation.append(count);
            const next=button('›',()=>switchTo(1),navigation);next.setAttribute('aria-label','下一张');next.title='下一张';
        }
        const operations=el('div',undefined,'miao-image-operations');actions.append(operations);
        button('提示词',()=>showPrompt(current.request?.prompt||block.prompt,current.request?.vibes,current.profileName),operations).setAttribute('aria-label','查看提示词');
        button('下载',()=>downloadImage(current.url),operations).setAttribute('aria-label','下载图片');button('放大',()=>openImage(current.url),operations).setAttribute('aria-label','放大查看');
    }else if(!task){
        actions.hidden=false;button(task?.status||'生成插图',()=>generate(message,block)).disabled=!!task;button('查看提示词',()=>{const profile=settings.profiles[settings.active];return showPrompt(block.prompt,(profile.vibes||[]).map(v=>({...v,name:settings.vibeLibrary?.find(item=>item.id===v.id)?.name||v.name||v.id})),profile.name,true);});
    }
    if(task){const progress=el('span',task.status,'miao-image-progress');progress.setAttribute('role','status');card.append(progress);}
    card.dataset.status=String(selected)+':'+versions.map(v=>v.url+':'+!!v.deleted).join('|')+':'+(task?.status||'')+':'+(settings.rerollClicks===3?3:2);
    card.append(actions);
    cardBindings.set(card,{message,controls:[...card.querySelectorAll('img,button')]});
    return card;
}
function collectVisibleText(root) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];let text='',n;
    const customTag=reasoningFormat().prefix?.match(/^<([\w-]+)>$/)?.[1]?.toLowerCase();
    while((n=walker.nextNode())) { if(n.parentElement.closest('.miao-image-card,.mes_reasoning,.mes_reasoning_details,think,thinking,analysis,reasoning,imgthink,imagethink')||(customTag&&n.parentElement.closest(customTag)))continue; if(nodes.length)text+='\n';nodes.push({n,start:text.length});text+=n.textContent; }
    return {nodes,text};
}
function sourceText(value) {
    return String(value)
        .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
        .replace(/<!--[\s\S]*?-->/g,'')
        .replace(/<\/?[A-Za-z][^>]*>/g,'')
        .replace(/`{1,3}|\*{2}|_{2}|~~/g,'')
        .replace(/\s/g,'').toLowerCase();
}
function insertionOffset(text,message,block) {
    const visible=[],offsets=[];
    for(let i=0;i<text.length;i++)if(!/\s/.test(text[i])){visible.push(text[i].toLowerCase());offsets.push(i);}
    const compact=visible.join('');
    if(!compact.length)return 0;
    const masked=maskReasoning(message.mes,reasoningFormat());
    const prefix=sourceText(masked.slice(0,block.start)),suffix=sourceText(masked.slice(block.start+block.raw.length));
    const seek=(expected,fromEnd,from=0)=>{
        for(let size=Math.min(96,expected.length);size>=1;size-=size>8?Math.min(8,size-8):1){
            const needle=fromEnd?expected.slice(-size):expected.slice(0,size),at=fromEnd?compact.lastIndexOf(needle):compact.indexOf(needle,from);
            if(size<8&&compact.indexOf(needle)!==compact.lastIndexOf(needle))continue;
            if(at>=0)return {at,end:at+needle.length};
        }
        return null;
    };
    const before=seek(prefix,true),after=seek(suffix,false,before?.end||0);
    if(before&&after&&before.end<=after.at)return offsets[before.end-1]+1;
    if(before)return offsets[before.end-1]+1;
    if(after)return offsets[after.at];
    return null;
}
function insertAtTextOffset(root,nodes,offset,node) {
    if(!nodes.length)return false;
    const target=nodes.find(item=>offset<=item.start+item.n.length)||nodes.at(-1);
    const local=Math.max(0,Math.min(target.n.length,offset-target.start));
    const range=document.createRange();range.setStart(target.n,local);range.collapse(true);range.insertNode(node);return true;
}
function replaceLiteral(root,literal,node,message,block) {
    const {nodes,text}=collectVisibleText(root);
    const visible=maskReasoning(text,reasoningFormat());
    let found=renderedBlockRange(visible,literal,settings.startTag,settings.endTag);
    if(!found){
        const decoded=document.createElement('textarea');decoded.innerHTML=literal;
        found=renderedBlockRange(visible,decoded.value,settings.startTag,settings.endTag);
    }
    // Use the host formatter for entities, emphasis and other Markdown changes.
    // Formatting a fragment cannot overwrite the original message text.
    if(!found&&typeof ctx().messageFormatting==='function'){
        const fragment=document.createElement('div');
        fragment.innerHTML=ctx().messageFormatting(literal,message.name,!!message.is_system,!!message.is_user,ctx().chat.indexOf(message));
        const formatted=collectVisibleText(fragment).text;
        if(formatted.trim())found=renderedBlockRange(visible,formatted,settings.startTag,settings.endTag);
    }
    if(found){
        const {start,end}=found,a=nodes.find(x=>x.start+x.n.length>start),b=nodes.find(x=>x.start+x.n.length>=end);
        if(a&&b){const range=document.createRange();range.setStart(a.n,start-a.start);range.setEnd(b.n,end-b.start);range.deleteContents();range.insertNode(node);return true;}
    }
    // Regex or Markdown may remove the captured text from the rendered DOM.
    // Anchor the button between the nearest surviving text before and after it.
    const offset=insertionOffset(text,message,block);
    const inserted=offset!==null&&insertAtTextOffset(root,nodes,offset,node);
    if(!inserted){
        const cards=[...root.querySelectorAll('.miao-image-card')],index=block.bodyIndex;
        const previous=cards.filter(card=>Number(card.dataset.miaoBodyIndex)<index).sort((a,b)=>Number(b.dataset.miaoBodyIndex)-Number(a.dataset.miaoBodyIndex))[0];
        const next=cards.filter(card=>Number(card.dataset.miaoBodyIndex)>index).sort((a,b)=>Number(a.dataset.miaoBodyIndex)-Number(b.dataset.miaoBodyIndex))[0];
        if(previous)previous.after(node);else if(next)next.before(node);
        else if(!text.trim())root.append(node);
        else return false;
    }
    return true;
}
function renderAll() {
    chatObserver?.disconnect();
    try{
    document.querySelectorAll('#chat .mes').forEach(mes=>{
        const index=mes.getAttribute('mesid');if(index===null||!/^\d+$/.test(index))return;
        const message=ctx().chat[Number(index)],root=mes.querySelector('.mes_text');
        if(!message||!root)return;
        // The host replaces .mes_text with its editor. Never insert cards into it.
        if(mes.querySelector('textarea.edit_textarea,#curEditTextarea')){
            mes.querySelectorAll('.miao-image-card').forEach(card=>{card._cancelGesture?.();card.remove();});return;
        }
        // Streaming markdown is continually rebuilt by ST. Generate in the
        // background and insert cards only after its final message render.
        if(streamActive&&generationChat===currentChat()&&message===latestImageMessage(ctx().chat))return;
        const found=blocks(message),existing=[...root.querySelectorAll('.miao-image-card')],used=new Set();
        for(const block of found) {
            const card=makeCard(message,block);
            const candidates=existing.filter(n=>!used.has(n)&&(n.dataset.miaoPrompt??n.dataset.miaoKey?.replace(/^\d+:(?:body:)?\d+:/,''))===card.dataset.miaoPrompt);
            const old=candidates.find(n=>n.dataset.miaoOccurrence===card.dataset.miaoOccurrence)||existing.find(n=>!used.has(n)&&n.dataset.miaoKey===card.dataset.miaoKey)||candidates[0];
            if(old) {
                used.add(old);
                old.dataset.theme=card.dataset.theme;
                const bound=cardBindings.get(old),controls=[...old.querySelectorAll('img,button')];
                const boundHere=bound?.message===message&&bound.controls.length===controls.length&&bound.controls.every(n=>old.contains(n));
                const sameImage=old.querySelector('img')?.getAttribute('src')===card.querySelector('img')?.getAttribute('src');
                const sameVersion=old.querySelector('.miao-version-count')?.textContent===card.querySelector('.miao-version-count')?.textContent;
                if(old.dataset.status!==card.dataset.status||old.dataset.miaoKey!==card.dataset.miaoKey||!boundHere||!sameImage||!sameVersion){
                    if(old.querySelector('img')&&!old.querySelector('.miao-image-tools')?.hidden&&card.querySelector('img'))card.querySelector('.miao-image-tools').hidden=false;
                    old.replaceWith(card);
                }
            } else replaceLiteral(root,block.raw,card,message,block);
        }
        for(const old of existing)if(!used.has(old))old.remove();
    });
    }finally{observeChat();}
}
function observeChat(){
    // Some hosts replace #chat or mount it after extensions have initialized.
    if(!chatRootObserver){
        chatRootObserver=new MutationObserver(()=>{
            const root=document.getElementById('chat');if(root===observedChat)return;
            chatObserver?.disconnect();observedChat=null;observeChat();scheduleRender(false);
        });
        chatRootObserver.observe(document.body,{childList:true,subtree:true});
    }
    const root=document.getElementById('chat');if(!root)return;
    if(!chatObserver)chatObserver=new MutationObserver(()=>scheduleRender(false));
    observedChat=root;chatObserver.observe(observedChat,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','mesid']});
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
    try{
    const request=buildRequest(settings.profiles[settings.active],'1girl, adult woman, white dress, flower garden, sunlight');
    request.vibes=selectVibes(settings.profiles[settings.active],settings.vibeLibrary);
    const data=await requestImage(request);
    const url=await saveBase64AsFile(data,validateFolder(settings.folder),`test-${Date.now()}-${crypto.randomUUID()}`,'png');
    await openImage(url);
    }catch(error){generationError(error);}
}
function saveCapture(start,end) {
    const pattern=delimiterPattern(start,end);settings.startTag=start;settings.endTag=end;settings.pattern=pattern;save();renderAll();toastr.success('捕捉标签已保存');
}
async function downloadImage(url,name='miao-image.png') {
    const response=await fetch(url);if(!response.ok)throw new Error(`图片下载失败：HTTP ${response.status}`);
    return saveDownload(await response.blob(),name);
}
async function saveDownload(blob,name){
    if(isTT()&&typeof hostUtils.download==='function')return hostUtils.download(blob,name,blob.type,{throwOnFailure:true});
    const objectURL=URL.createObjectURL(blob);
    const link=el('a');link.href=objectURL;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),60000);
}
async function downloadImages(images){
    await downloadImageSelection(images,{saveBlob:saveDownload});
}
async function openImage(url,name='miao-image.png') {
    const view=el('div',undefined,'miao-image-viewer');
    const image=el('img');image.src=url;image.alt='图片预览';
    view.append(image);await showPopup(view,POPUP_TYPE.TEXT,'',{wide:true,onOpen:popup=>popup.dlg.classList.add('miao-image-viewer-dialog')});
}
async function queueStatus() {
    const url=validateQueueURL(settings.queueUrl);
    const response=await fetch(url+'/ping',{credentials:'omit',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error(`队列连接失败：HTTP ${response.status}`);
    return response.json();
}
async function requestImage(request,task,canContinue) {
    const generate=async()=>{
        if(task){task.status='正在生图';renderAll();}
        toastr.info('正在生图','喵喵文生图');
        if(isTT()||request.vibes?.length)return direct.generate(request);
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
const translatePrompt=createPromptTranslator({getHeaders:()=>ctx().getRequestHeaders()});
async function showPrompt(prompt,vibes=[],profileName='',pending=false){
    const view=el('section',undefined,'miao-prompt-view');view.append(el('h3','绘图提示词'),el('pre',prompt));
    const metadata=el('div',undefined,'miao-prompt-metadata');metadata.append(el('span',(pending?'当前配置：':'配置：')+(profileName||'未记录')),el('span',(pending?'Vibe 候选：':'Vibe：')+(vibes.length?vibes.map(v=>v.name||v.id).join('、'):pending?'未选择':'未使用')));view.append(metadata);
    const button=el('button','Google 翻译为中文','miao-button');button.type='button';
    const note=el('p','','miao-muted');note.setAttribute('role','status');note.hidden=true;
    const fallback=el('a','在 Google 翻译中打开');fallback.href='https://translate.google.com/?'+new URLSearchParams({sl:'auto',tl:'zh-CN',text:prompt,op:'translate'});fallback.target='_blank';fallback.rel='noopener noreferrer';fallback.hidden=true;
    const alternative=el('button','改用 Microsoft 翻译','miao-button');alternative.type='button';alternative.hidden=true;
    const translated=el('pre');translated.hidden=true;translated.setAttribute('aria-live','polite');
    const runTranslation=async(provider='google')=>{if(button.disabled)return;button.disabled=alternative.disabled=true;button.textContent='翻译中…';note.textContent='';note.hidden=fallback.hidden=alternative.hidden=true;let failed=false;try{
        const result=await translatePrompt(prompt,(index,total)=>{button.textContent=total>1?`翻译中 ${index}/${total}`:'翻译中…';},{provider});
        translated.textContent=result;translated.hidden=false;
        note.textContent=provider==='bing'?'Microsoft 翻译':'';note.hidden=provider!=='bing';
    }catch(error){failed=true;note.textContent=['TimeoutError','AbortError'].includes(error.name)?'翻译超时，请重试':error instanceof TypeError?'翻译连接失败，请重试':String(error.message||error);note.hidden=fallback.hidden=false;alternative.hidden=isTT();
    }finally{button.disabled=alternative.disabled=false;button.textContent=failed?'重试 Google 翻译':'Google 翻译为中文';}};
    button.onclick=()=>runTranslation();alternative.onclick=()=>runTranslation('bing');
    view.append(button,note,alternative,fallback,translated);await showPopup(view,POPUP_TYPE.TEXT,'',{wide:true,onOpen:popup=>popup.dlg.classList.add('miao-content-dialog')});
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
    for(const message of ctx().chat)for(const {swipe,slot,record} of swipeImageRecords(message)) {
        for(const version of imageVersions(record)){if(paths.has(String(version.url).replace(/^\//,''))){version.deleted=true;changed=true;}}
        if(paths.has(String(record.url).replace(/^\//,''))){record.deleted=true;changed=true;}
        writeSwipeImage(message,swipe,slot,record);
    }
    if(changed)await ctx().saveChat();renderAll();
    toastr.success(`已清理 ${removed.length} 张图片`);
    if(failure)throw failure;
}
async function openSettings() {
    if(settingsHost?.isConnected)return;
    const panel=createSettingsPanel({settings,save,persistSettings:()=>persistHostSettings({saveNow:async()=>{const host=await import('../../../../script.js');return host.saveSettings();},source:ctx().eventSource,event:ctx().eventTypes.SETTINGS_UPDATED}),theme:resolvedTheme,onTheme:applyTheme,onError:errorPopup,
        onChange:async action=>{
            if(action==='confirm-delete')return Boolean(await showPopup('删除当前配置？',POPUP_TYPE.CONFIRM));
            autoSession=null;refreshFloating();renderAll();
        },
        saveKey:async input=>{await saveCurrentKey({input,vault:directVault,settings,writeServerKey:key=>writeSecret(SECRET_KEYS.NOVEL,key),fingerprint:fingerprintKey,save});toastr.success(settings.rememberDirectKey?'NAI Key 已保存到酒馆和当前设备，刷新后可继续使用':'NAI Key 已保存，直连 Key 仅在当前页面暂存');},
        testImage,installDefaults,installWorld,installRegex,listImages,deleteImages,changeFolder,saveCapture,queueStatus,openImage,downloadImages,
        checkUpdate:force=>updater.check(force),installUpdate:()=>updater.install(),refreshPage:()=>location.reload(),
        listVibes:()=>direct.list(),importVibeFile,
        directKeyStatus:async()=>{const status=await directVault.status(),key=await directVault.get();return {...status,ready:Boolean(key&&settings.keyHash&&await fingerprintKey(key)===settings.keyHash),serverSaved:!!settings.keyHash};},clearDirectKey:()=>directVault.clear(),
        closeSettings:()=>settingsPopup?.completeAffirmative?settingsPopup.completeAffirmative():settingsPopup?.dlg.close(),
        setRememberDirectKey:async value=>{await directVault.remember(value);settings.rememberDirectKey=value;save();},
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
    const icon=el('span',undefined,'extensionsMenuExtensionButton');icon.setAttribute('aria-hidden','true');
    icon.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 3 3l6 4a13 13 0 0 1 6 0l6-4-1 8c3 9-19 14-16 0Z"/><path d="M8 12h.01M16 12h.01M11 15h2l-1 1-1-1ZM3 14l-2-1m2 4-2 1m20-4 2-1m-2 4 2 1"/></svg>';
    item.append(icon,el('span','喵喵文生图'));item.addEventListener('click',guard(openSettings));
    item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();guard(openSettings)();}});
    const menu=document.getElementById('extensionsMenu');if(menu)menu.append(item);
}
function refreshFloating(){
    floatingDispose();floatingDispose=createFloatingEntry({settings,save,open:guard(openSettings),icon:document.querySelector('#miao-nai-menu .extensionsMenuExtensionButton')?.innerHTML||'喵'});
}
function autoLatest() {
    if(!settings.enabled||!autoSession?.enabled||autoSession.chat!==currentChat())return;
    const message=latestImageMessage(ctx().chat);
    if(!message || !canAutoGenerate(ctx().chat,message,settings.mode,streamActive))return;
    for(const block of blocks(message)) {
        const id=`${currentChat()}:${ctx().chat.indexOf(message)}:${identity(message,block)}`;
        if(!autoSession.existing.has(`${ctx().chat.indexOf(message)}:${identity(message,block)}`)&&!attempted.has(id)&&!state(message,identity(message,block)))generate(message,block,{automatic:true});
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
    mountMenu();refreshFloating();const c=ctx();save();
    let migrated=false;for(const message of c.chat)migrated=migrateSwipeImages(message)||migrated;if(migrated)await c.saveChat();
    document.addEventListener('click',event=>{
        if(event.target.closest?.('.miao-image-card>img,.miao-image-tools'))return;
        imageToolsEpoch++;
        document.querySelectorAll('.miao-image-tools').forEach(tools=>{if(tools.closest('.miao-image-card')?.querySelector('img'))tools.hidden=true;});
        document.querySelectorAll('.miao-image-card').forEach(card=>card._cancelGesture?.());
    });
    for(const name of ['CHAT_LOADED','MORE_MESSAGES_LOADED','USER_MESSAGE_RENDERED','MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_EDITED'])if(c.eventTypes[name])c.eventSource.on(c.eventTypes[name],messageId=>{
        // Final rendering and swipe navigation must release any stale stream lock.
        if(name==='MESSAGE_SWIPED'||name==='CHARACTER_MESSAGE_RENDERED'&&Number(messageId)===ctx().chat.length-1){streamActive=false;generationChat=null;}
        if(name==='CHARACTER_MESSAGE_RENDERED'&&Number(messageId)===ctx().chat.length-1){autoLatest();autoSession=null;}
        scheduleRender(false);
    });
    if(c.eventTypes.MESSAGE_SWIPE_DELETED)c.eventSource.on(c.eventTypes.MESSAGE_SWIPE_DELETED,async({messageId,swipeId})=>{
        const message=ctx().chat[messageId];if(!message)return;
        for(const task of running.values())if(liveMessage(task.message,task)===message&&task.swipe>=swipeId)task.cancelled=true;
        removeSwipeImages(message,swipeId);await ctx().saveChat();scheduleRender(false);
    });
    c.eventSource.on(c.eventTypes.CHAT_CHANGED,()=>{streamActive=false;generationChat=null;autoSession=null;scheduleRender(false);});
    c.eventSource.on(c.eventTypes.GENERATION_STARTED,(type,options,dryRun)=>{
        // Quiet prompts and prompt previews do not render a chat reply and may
        // never emit GENERATION_ENDED. They must not hide the last floor's cards.
        if(dryRun||type==='quiet'||type==='impersonate')return;
        streamActive=false;generationChat=currentChat();
        autoSession={chat:currentChat(),enabled:settings.enabled&&settings.mode!=='manual',existing:new Set(ctx().chat.flatMap((m,i)=>blocks(m).map(b=>`${i}:${identity(m,b)}`)))};
    });
    c.eventSource.on(c.eventTypes.GENERATION_ENDED,()=>{const same=generationChat===currentChat();streamActive=false;generationChat=null;renderAll();if(same)autoLatest();});
    if(c.eventTypes.GENERATION_STOPPED)c.eventSource.on(c.eventTypes.GENERATION_STOPPED,()=>{streamActive=false;generationChat=null;scheduleRender(false);});
    c.eventSource.on(c.eventTypes.STREAM_TOKEN_RECEIVED,()=>{if(generationChat===currentChat())streamActive=true;setTimeout(()=>guard(()=>{scanStream();renderAll();})(),0);});
    for(const event of ['SECRET_WRITTEN','SECRET_DELETED','SECRET_ROTATED'])if(c.eventTypes[event])c.eventSource.on(c.eventTypes[event],key=>{if(key===SECRET_KEYS.NOVEL){settings.keyHash='';save();}});
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
    if(settings.enabled&&!settings.installed)await installDefaults();renderAll();autoLatest();
}
jQuery(()=>guard(init)());

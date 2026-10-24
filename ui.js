import {validateQueueURL} from './cloud-queue.js';
import {sizePresets,pageItems,defaults,compareImagesNewest} from './core.js';
import {vibeModelKeys} from './vibe.js';
const models=[['nai-diffusion-4-5-full','V4.5 Full'],['nai-diffusion-4-5-curated','V4.5 Curated'],['nai-diffusion-4-full','V4 Full'],['nai-diffusion-4-curated-preview','V4 Curated'],['nai-diffusion-3','V3 Anime'],['nai-diffusion-furry-3','V3 Furry']];
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createSettingsPanel({settings,save,persistSettings,theme,onTheme,onChange,onError,saveKey,testImage,installDefaults,installWorld,installRegex,listImages,deleteImages,changeFolder,saveCapture,queueStatus,openImage,downloadImages,checkUpdate,installUpdate,refreshPage,listVibes,importVibeFile,encodeVibe,deleteVibe,renameVibe,directKeyStatus,clearDirectKey,setRememberDirectKey,closeSettings}) {
    const root=node('section',undefined,'miao-settings');root.id='miao-nai-settings';
    let activeTab=matchMedia('(max-width:680px), (max-height:500px)').matches?'overview':'generation',fieldId=0,promptTab='positive',selectedVibeId=null;
    const safe=fn=>async()=>{try{await fn();}catch(e){onError(e);}};
    const updateBox=node('div',undefined,'miao-update-status');updateBox.setAttribute('aria-live','polite');
    let updateData=null,updateBusy=false,updateError='',updated=false;
    function paintUpdate(){
        updateBox.replaceChildren();
        if(updateBusy){updateBox.append(node('span','检查中…'));return;}
        if(updated){updateBox.append(node('span','更新完成…'));return;}
        if(updateError)updateBox.append(node('span',updateError));
        else updateBox.append(node('span',updateData?.isUpToDate===false?'发现新版本':updateData?'已是最新':''));
        action(updateBox,'检查并更新',async()=>{
            updateBusy=true;updateError='';paintUpdate();
            try{updateData=await checkUpdate(true);if(updateData.needsReload||updateData.isUpToDate===false){if(!updateData.needsReload)await installUpdate();updated=true;paintUpdate();await refreshPage();}}
            catch(error){updateError=error.message;updated=false;}
            finally{updateBusy=false;paintUpdate();}
        });
    }
    async function checkLatest(force=false){updateBusy=true;paintUpdate();try{updateData=await checkUpdate(force);}catch(error){updateError=error.message;}finally{updateBusy=false;paintUpdate();}}
    function action(parent,label,fn,primary=false) {
        const b=node('button',label,`miao-button${primary?' miao-primary':''}`);b.type='button';
        b.onclick=safe(async()=>{if(b.disabled)return;b.disabled=true;try{await fn();}finally{b.disabled=false;}});parent.append(b);return b;
    }
    function field(parent,label,value,change,{type='text',options,wide=false}={}) {
        const wrap=node('label',undefined,`miao-field${wide?' miao-wide':''}`);wrap.append(node('span',label));
        const control=node(options?'select':type==='textarea'?'textarea':'input');if(!options&&type!=='textarea')control.type=type;
        if(options)for(const [value,text] of options){const o=node('option',text);o.value=value;control.append(o);}
        control.id='miao-field-'+(++fieldId);wrap.htmlFor=control.id;
        control.value=value??'';
        if(type==='number'){control.step='any';control.inputMode='decimal';}
        const event=options?'change':'input';
        control.addEventListener(event,()=>{try{change(type==='number'?Number(control.value):control.value);}catch(e){onError(e);}});
        wrap.append(control);parent.append(wrap);return control;
    }
    function section(parent,title) {const box=node('section',undefined,'miao-section');box.append(node('h3',title));parent.append(box);return box;}
    async function profileVibes(parent,p){
        parent.append(node('p','读取中…','miao-muted'));
        try{
            const items=await listVibes();parent.replaceChildren();
            if(!items.length){parent.append(node('p','暂无 Vibe','miao-muted'));return;}
            for(const item of items){
                const row=node('div',undefined,'miao-vibe-choice'),label=node('label',undefined,'miao-switch-row'),check=node('input');check.type='checkbox';
                const variants=item.variants.filter(v=>v.model===vibeModelKeys[p.model]);
                let binding=(p.vibes||[]).find(v=>v.id===item.id);check.checked=!!binding;check.disabled=(!variants.length&&!binding)||(!binding&&p.vibeMode!=='random'&&(p.vibes||[]).length>=4);
                check.onchange=()=>{p.vibes??=[];if(check.checked&&p.vibeMode!=='random'&&p.vibes.length>=4){check.checked=false;onError(Error('最多同时启用 4 个 Vibe'));return;}if(check.checked)p.vibes.push({id:item.id,key:variants[0].key,strength:0.6});else p.vibes=p.vibes.filter(v=>v.id!==item.id);save();profileVibes(parent,p);};
                label.append(node('span',item.name),check);row.append(label);
                if(binding){
                    const grid=node('div',undefined,'miao-grid');row.append(grid);
                    const options=variants.map(v=>[v.key,`信息提取 ${v.information}`]);if(!variants.some(v=>v.key===binding.key))options.unshift([binding.key,'编码不匹配，请重新选择']);
                    field(grid,'编码',binding.key,v=>{binding.key=v;save();},{options});
                    const strength=field(grid,'参考强度',binding.strength,v=>{binding.strength=v;save();},{type:'number'});strength.min='0';strength.max='1';strength.step='0.05';
                }
                if(!variants.length)row.append(node('p','缺少当前模型编码','miao-muted'));
                parent.append(row);
            }
        }catch(error){parent.replaceChildren(node('p',error.message,'miao-muted'));}
    }
    function render() {
        root.replaceChildren();root.dataset.theme=theme();
        root.dataset.section=activeTab;
        let commitPage=async()=>{};
        const header=node('header',undefined,'miao-header');const brand=node('div',undefined,'miao-brand');
        const back=node('button','‹','miao-drawer-back');back.type='button';back.setAttribute('aria-label','返回功能列表');back.hidden=activeTab==='overview';back.onclick=()=>{activeTab='overview';render();root.closest('.popup-content')?.scrollTo({top:0});};header.append(back);
        if(activeTab==='overview'){const title=node('div');title.append(node('h2','喵喵文生图'));brand.append(title);header.append(brand);}
        header.dataset.compact=String(activeTab!=='overview');
        if(activeTab!=='overview'){
            const saveButton=action(header,'保存',async()=>{saveButton.textContent='保存中…';try{await commitPage();await persistSettings();const current=root.querySelector('.miao-save-button');if(current)current.textContent='已保存';}catch(error){const current=root.querySelector('.miao-save-button');if(current)current.textContent='保存';throw error;}});saveButton.classList.add('miao-save-button');
        }
        const close=node('button','×','miao-drawer-close');close.type='button';close.setAttribute('aria-label','关闭设置');close.onclick=safe(closeSettings);header.append(close);root.append(header);
        const tabs=node('nav',undefined,'miao-tabs');tabs.setAttribute('aria-label','设置分区');
        for(const [id,label] of [['generation','生成'],['config','配置'],['vibes','Vibe'],['resources','资源'],['images','图片']]) {
            const b=node('button',label);b.type='button';b.dataset.active=String(activeTab===id);b.setAttribute('aria-pressed',String(activeTab===id));b.onclick=()=>{activeTab=id;render();root.closest('.popup-content')?.scrollTo({top:0});};tabs.append(b);
        }root.append(tabs);
        const body=node('div',undefined,'miao-panel-body');root.append(body);
        const p=settings.profiles[settings.active];
        if(activeTab==='overview'){
            const overview=node('nav',undefined,'miao-overview');overview.setAttribute('aria-label','功能列表');body.append(overview);
            for(const [id,label,icon] of [
                ['generation','生成','sliders'],
                ['config','配置','layer-group'],
                ['vibes','Vibe','wand-magic-sparkles'],
                ['resources','资源','book'],
                ['images','图片','images'],
            ]){
                const row=node('button',undefined,'miao-overview-row');row.type='button';row.setAttribute('aria-label',label);
                const symbol=node('i',undefined,`fa-solid fa-${icon}`);symbol.setAttribute('aria-hidden','true');
                const copy=node('span',undefined,'miao-overview-copy');copy.append(node('strong',label));if(id==='config')copy.append(node('small',p.name));if(id==='vibes')copy.append(node('small',String(settings.vibeLibrary?.length||0)));const arrow=node('span','›','miao-overview-arrow');arrow.setAttribute('aria-hidden','true');row.append(symbol,copy,arrow);
                row.onclick=()=>{activeTab=id;render();root.closest('.popup-content')?.scrollTo({top:0});};overview.append(row);
            }
        } else if(activeTab==='generation') {
            const interaction=section(body,'操作');
            field(interaction,'悬浮入口',settings.floatingEntry?'floating':'menu',v=>{settings.floatingEntry=v==='floating';save();onChange();},{options:[['menu','关闭'],['floating','开启']]});
            field(interaction,'重新生图',String(settings.rerollClicks===3?3:2),v=>{settings.rerollClicks=Number(v);save();onChange();},{options:[['2','双击'],['3','三击']]});
            const main=section(body,'生成方式');
            const toggle=node('label',undefined,'miao-switch-row');const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=settings.enabled;checkbox.onchange=()=>{settings.enabled=checkbox.checked;save();onChange();};toggle.append(node('span','启用自动生图'),checkbox);main.append(toggle);
            field(main,'生成模式',settings.mode,v=>{settings.mode=v;save();onChange(true);render();},{options:[['manual','手动'],['auto','回复后生成'],['stream','流式生成']]});
            const connection=section(body,'连接 NovelAI');

            const key=field(connection,'API Key','',()=>{},{type:'password'});key.autocomplete='new-password';key.placeholder='输入你的 NovelAI Key';
            const remember=node('label',undefined,'miao-switch-row'),rememberCheck=node('input');rememberCheck.type='checkbox';rememberCheck.checked=!!settings.rememberDirectKey;rememberCheck.onchange=safe(async()=>{try{await setRememberDirectKey(rememberCheck.checked);}finally{rememberCheck.checked=!!settings.rememberDirectKey;await updateKeyState();}});remember.append(node('span','记住 Key'),rememberCheck);connection.append(remember);

            const keyState=node('p','检查中…','miao-muted');connection.append(keyState);
            const mask='••••••••••••';let directReady=false;
            key.addEventListener('focus',()=>{if(key.value===mask)key.value='';});
            key.addEventListener('blur',()=>{if(!key.value&&directReady)key.value=mask;});
            const updateKeyState=async()=>{const status=await directKeyStatus();directReady=status.ready;keyState.textContent=directReady?(status.persistent?'已记住':'本次有效'):status.serverSaved?'请填写直连 Key':'未设置';if(document.activeElement!==key&&(!key.value||key.value===mask))key.value=directReady?mask:'';};safe(updateKeyState)();
            const actions=node('div',undefined,'miao-actions');connection.append(actions);action(actions,'保存密钥',async()=>{try{await saveKey(key.value===mask?'':key.value.trim());key.value='';}finally{await updateKeyState();}},true);action(actions,'测试生成',testImage);
            action(connection,'清除 Key',async()=>{await clearDirectKey();await updateKeyState();});
            commitPage=async()=>{if(key.value.trim()&&key.value!==mask){await saveKey(key.value.trim());key.value='';await updateKeyState();}};
            const queue=section(body,'共享 Key 排队');
            const queueToggle=node('label',undefined,'miao-switch-row'),queueCheck=node('input');queueCheck.type='checkbox';queueCheck.checked=settings.cloudQueue;queueCheck.onchange=()=>{settings.cloudQueue=queueCheck.checked;save();};queueToggle.append(node('span','启用云端排队'),queueCheck);queue.append(queueToggle);
            field(queue,'队列服务地址',settings.queueUrl,v=>{settings.queueUrl=v.trim();save();}).placeholder='https://miao-image-queue.savlu329.workers.dev';
            const status=node('p',settings.keyHash?'Key 已就绪':'未设置 Key','miao-muted');queue.append(status);
            action(queue,'测试连接',async()=>{validateQueueURL(settings.queueUrl);await queueStatus();status.textContent='连接正常';});
        } else if(activeTab==='config') {
            const profiles=section(body,'配置');
            field(profiles,'当前配置',String(settings.active),v=>{settings.active=Number(v);save();render();},{options:settings.profiles.map((p,i)=>[String(i),p.name])});
            const actions=node('div',undefined,'miao-actions');profiles.append(actions);
            action(actions,'新增配置',()=>{let number=1;while(settings.profiles.some(profile=>profile.name===`新配置 ${number}`))number++;settings.profiles.push({...structuredClone(defaults),name:`新配置 ${number}`,vibes:[]});settings.active=settings.profiles.length-1;save();render();},true);
            action(actions,'复制配置',()=>{settings.profiles.push({...structuredClone(p),name:p.name+' · 副本'});settings.active=settings.profiles.length-1;save();render();});
            action(actions,'删除配置',async()=>{if(settings.profiles.length===1)throw new Error('至少保留一个配置');if(!await onChange('confirm-delete'))return;settings.profiles.splice(settings.active,1);settings.active=0;save();render();});
            field(profiles,'配置名称',p.name,v=>{p.name=v;save();});
            const modelOptions=models.some(([id])=>id===p.model)?models:[[p.model,p.model],...models];
            field(profiles,'NAI 模型',p.model,v=>{p.model=v;save();render();},{options:modelOptions});
            const workspace=node('div',undefined,'miao-config-workspace');body.append(workspace);
            const prompts=section(workspace,'提示词');
            const promptTabs=node('div',undefined,'miao-prompt-tabs');promptTabs.setAttribute('role','tablist');promptTabs.setAttribute('aria-label','提示词类型');prompts.append(promptTabs);
            const fields=new Map(),tabs=new Map();
            const sync=()=>{for(const [key,control] of fields){control.parentElement.hidden=key!==promptTab;tabs.get(key).setAttribute('aria-selected',String(key===promptTab));}};
            for(const [key,label] of [['positive','正面'],['negative','负面']]) {
                const tab=node('button',label);tab.type='button';tab.setAttribute('role','tab');tab.onclick=()=>{promptTab=key;sync();};promptTabs.append(tab);tabs.set(key,tab);
                const control=field(prompts,key==='positive'?'正面提示词':'负面提示词',p[key],v=>{p[key]=v;save();},{type:'textarea'});
                control.placeholder=key==='positive'?'风格、质量、画师':'负面标签';fields.set(key,control);
            }sync();
            const params=section(workspace,'生成参数');
            const sizes=node('div',undefined,'miao-size-options');params.append(sizes);
            for(const preset of sizePresets){const b=action(sizes,preset.name,()=>{p.width=preset.width;p.height=preset.height;save();render();});b.append(node('small',`${preset.width}×${preset.height}`));b.classList.add('miao-size-preset');b.dataset.selected=String(p.width===preset.width&&p.height===preset.height);b.setAttribute('aria-pressed',b.dataset.selected);}
            const grid=node('div',undefined,'miao-grid');params.append(grid);
            for(const [key,label,type] of [['width','宽度','number'],['height','高度','number'],['steps','步数','number'],['scale','Guidance','number'],['seed','种子','number'],['sampler','采样器','text'],['scheduler','噪声表','text']]){const choices=key==='sampler'?[['k_euler_ancestral','Euler Ancestral'],['k_euler','Euler'],['k_dpmpp_2m','DPM++ 2M'],['k_dpmpp_2s_ancestral','DPM++ 2S Ancestral'],['k_dpmpp_sde','DPM++ SDE']]:key==='scheduler'?[['karras','Karras'],['native','Native'],['exponential','Exponential'],['polyexponential','Polyexponential']]:null;const options=choices&&!choices.some(([id])=>id===p[key])?[[p[key],p[key]],...choices]:choices;field(grid,label,p[key],v=>{p[key]=v;save();},{type,options,wide:['seed','sampler','scheduler'].includes(key)});}
            const vibes=section(body,'Vibe');
            field(vibes,'使用方式',p.vibeMode??'multiple',value=>{
                if(value==='multiple'&&(p.vibes||[]).length>4){render();throw Error('当前候选超过 4 个，请先减少勾选，再切换「多个」');}
                p.vibeMode=value;save();render();
            },{options:[['random','随机 1 个'],['multiple','多个（最多 4 个）']]});
            const choices=node('div',undefined,'miao-vibe-choices');vibes.append(choices);profileVibes(choices,p);
        } else if(activeTab==='vibes') {
            const manage=section(body,'Vibe');
            const guide=node('a','Vibe 文档');guide.href='https://github.com/AYUUKI-K/Mewo-Text-to-Image/blob/main/VIBE.md';guide.target='_blank';guide.rel='noopener';manage.append(guide);
            const upload=node('input');upload.type='file';upload.accept='.naiv4vibe,.naiv4vibeBundle,.json,image/png,image/jpeg,image/webp';upload.multiple=true;upload.hidden=true;manage.append(upload);
            const actions=node('div',undefined,'miao-actions');manage.append(actions);
            const list=node('div',undefined,'miao-vibe-list');manage.append(list);
            const refresh=async()=>{
                list.replaceChildren(node('p','读取中…','miao-muted'));
                try{
                    const items=await listVibes();list.replaceChildren();
                    if(!items.length)list.append(node('p','暂无 Vibe','miao-muted'));
                    if(items.length){if(!items.some(item=>item.id===selectedVibeId))selectedVibeId=items[0].id;field(list,'当前 Vibe',selectedVibeId,value=>{selectedVibeId=value;refresh();},{options:items.map(item=>[item.id,item.name])});}
                    for(const item of items.filter(item=>item.id===selectedVibeId)){
                        const card=node('section',undefined,'miao-vibe-item');
                        if(item.thumbnail){const image=node('img');image.src=item.thumbnail;image.alt=item.name;image.loading='lazy';card.append(image);}
                        field(card,'名称',item.name,()=>{}).addEventListener('change',safe(async()=>{await renameVibe({id:item.id,name:card.querySelector('input').value});await refresh();}));
                        const summary=node('p',item.variants.length?item.variants.map(v=>`${v.model} · ${v.information}`).join(' / '):'尚未编码','miao-muted');card.append(summary);
                        if(item.hasImage){
                            const grid=node('div',undefined,'miao-grid');card.append(grid);
                            let model=vibeModelKeys[p.model]?p.model:'nai-diffusion-4-5-full',information=1;
                            field(grid,'编码模型',model,v=>model=v,{options:models.filter(([id])=>vibeModelKeys[id])});
                            const amount=field(grid,'信息提取量',information,v=>information=v,{type:'number'});amount.min='0';amount.max='1';amount.step='0.05';
                            action(card,'编码并保存（2 Anlas）',async()=>{await encodeVibe({id:item.id,model,information});await refresh();});
                        }
                        action(card,'删除 Vibe',async()=>{if(await deleteVibe(item.id))await refresh();});list.append(card);
                    }
                }catch(error){list.replaceChildren(node('p',error.message,'miao-muted'));}
            };
            upload.onchange=safe(async()=>{for(const file of upload.files){const imported=await importVibeFile(file);if(imported?.length)selectedVibeId=imported.at(-1).id;}upload.value='';await refresh();});
            action(actions,'导入 Vibe / 图片',()=>upload.click(),true);action(actions,'刷新列表',refresh);
            refresh();
        } else if(activeTab==='resources') {
            const resources=section(body,'世界书与正则');
            const status=node('div',undefined,'miao-notice');status.append(node('strong',settings.installed?'默认资源已载入':'默认资源尚未载入'),node('p',settings.world||'未选择世界书'));resources.append(status);
            action(resources,'载入默认资源',async()=>{await installDefaults();render();},true);
            const upload=(label,fn)=>{const file=node('input');file.type='file';file.accept='.json';file.hidden=true;file.onchange=safe(async()=>{if(file.files[0])await fn(file.files[0]);file.value='';render();});resources.append(file);action(resources,label,()=>file.click());};
            upload('导入世界书',installWorld);upload('导入正则',async f=>installRegex(JSON.parse(await f.text())));
            const capture=section(body,'捕捉标签');

            const start=field(capture,'起始标签',settings.startTag,()=>{});start.placeholder='image###';
            const end=field(capture,'结束标签',settings.endTag,()=>{});end.placeholder='###';
            const sample=node('pre',undefined,'miao-capture-sample');
            const updateSample=()=>{sample.textContent=start.value+'\nprompt\n'+end.value;};start.addEventListener('input',updateSample);end.addEventListener('input',updateSample);updateSample();capture.append(sample);
            commitPage=async()=>{if(start.value!==settings.startTag||end.value!==settings.endTag)await saveCapture(start.value,end.value);};


        }
        if(activeTab==='images') {
            const storage=section(body,'存储');
            const folder=field(storage,'存储目录',settings.folder,()=>{});folder.placeholder='miao-nai';
            commitPage=async()=>{if(folder.value!==settings.folder){await changeFolder(folder.value);render();}};
            const cleanup=section(body,'历史图片');
            let selectedFolder=settings.folder;
            field(cleanup,'管理目录',selectedFolder,v=>{selectedFolder=v;refresh();},{options:[...new Set([settings.folder,...settings.folders])].map(v=>[v,v])});
            const controls=node('div',undefined,'miao-actions');cleanup.append(controls);
            const selected=new Set(),selectedImages=new Set();let images=[],page=0;
            const imageControls=node('div',undefined,'miao-history-selection');cleanup.append(imageControls);
            const selectionCount=node('span','已选 0 张','miao-muted');imageControls.append(selectionCount);
            const removeSelected=node('button','删除选中图片','miao-button');removeSelected.type='button';removeSelected.disabled=true;imageControls.append(removeSelected);
            removeSelected.onclick=safe(async()=>{removeSelected.disabled=true;try{await deleteImages(selectedFolder,[...selectedImages]);await refresh();}finally{updateSelection();}});
            const downloadSelected=node('button','下载选中图片','miao-button');downloadSelected.type='button';downloadSelected.disabled=true;imageControls.insertBefore(downloadSelected,removeSelected);
            let downloading=false;
            downloadSelected.onclick=safe(async()=>{if(downloading)return;downloading=true;downloadSelected.textContent='正在下载…';updateSelection();try{await downloadImages(images.filter(image=>selectedImages.has(image.name)));}finally{downloading=false;downloadSelected.textContent='下载选中图片';updateSelection();}});
            action(imageControls,'取消选择',()=>{selectedImages.clear();draw();});
            const updateSelection=()=>{selectionCount.textContent=`已选 ${selectedImages.size} 张`;removeSelected.disabled=!selectedImages.size;downloadSelected.disabled=downloading||!selectedImages.size;};
            const list=node('div');list.setAttribute('aria-live','polite');cleanup.append(list);

            const draw=()=>{
                list.replaceChildren();updateSelection();const counts=new Map();for(const image of images)counts.set(image.day,(counts.get(image.day)||0)+1);
                const paged=pageItems(images,page);page=paged.page;
                if(!images.length)list.append(node('p','暂无图片','miao-muted'));
                for(const day of [...new Set(paged.items.map(i=>i.day))]){
                    const group=node('section',undefined,'miao-date-group');
                    const row=node('div',undefined,'miao-date-row'),label=node('label'),check=node('input');check.type='checkbox';check.checked=selected.has(day);check.onchange=()=>check.checked?selected.add(day):selected.delete(day);
                    label.append(check,node('span',day),node('small',`共 ${counts.get(day)} 张`));row.append(label);
                    action(row,'清理',async()=>{await deleteImages(selectedFolder,images.filter(i=>i.day===day).map(i=>i.name));await refresh();});group.append(row);
                    const gallery=node('div',undefined,'miao-history-grid');
                    for(const image of paged.items.filter(i=>i.day===day)){
                        const tile=node('article',undefined,'miao-history-tile');tile.dataset.selected=String(selectedImages.has(image.name));
                        const link=node('a');link.href=image.url;link.addEventListener('click',event=>{event.preventDefault();safe(()=>openImage(image.url,image.name))();});const thumb=node('img');thumb.src=image.url;thumb.alt=image.name;thumb.loading='lazy';link.title='放大查看';link.append(thumb);tile.append(link);
                        const pick=node('label',undefined,'miao-history-pick'),checkbox=node('input');checkbox.type='checkbox';checkbox.checked=selectedImages.has(image.name);checkbox.setAttribute('aria-label','选择图片 '+image.name);checkbox.onchange=()=>{if(checkbox.checked)selectedImages.add(image.name);else selectedImages.delete(image.name);tile.dataset.selected=String(checkbox.checked);updateSelection();};pick.append(checkbox);tile.append(pick);
                        gallery.append(tile);
                    }
                    group.append(gallery);list.append(group);
                }
                const pager=node('nav',undefined,'miao-pager');pager.setAttribute('aria-label','图片分页');
                action(pager,'上一页',()=>{page--;draw();}).disabled=page===0;
                const position=node('span',`${page+1} / ${paged.pages} · ${images.length} 张`);position.setAttribute('aria-live','polite');pager.append(position);
                action(pager,'下一页',()=>{page++;draw();}).disabled=page+1===paged.pages;list.append(pager);
            };
            const refresh=async()=>{
                list.replaceChildren(node('p','读取中…','miao-muted'));selected.clear();selectedImages.clear();updateSelection();
                try{
                    images=(await listImages(selectedFolder)).sort(compareImagesNewest);draw();
                }catch(error){list.replaceChildren(node('p','读取失败，请刷新重试。'));onError(error);}
            };
            action(controls,'刷新列表',refresh);
            action(controls,'清理选中日期',async()=>{if(!selected.size)throw new Error('请先勾选需要清理的日期');await deleteImages(selectedFolder,images.filter(i=>selected.has(i.day)).map(i=>i.name));await refresh();});
            refresh();
        }
        const footer=node('footer',undefined,'miao-footer');footer.append(node('span','by 喵喵电波-NUE','miao-credit'),node('span','喵喵文生图 · 1.1.2'),updateBox);root.append(footer);
    }
    for(const event of ['input','change'])root.addEventListener(event,()=>{const button=root.querySelector('.miao-save-button');if(button&&!button.disabled)button.textContent='保存';});
    render();checkLatest(false);return root;
}

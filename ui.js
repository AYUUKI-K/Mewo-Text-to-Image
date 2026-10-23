import {validateQueueURL} from './cloud-queue.js';
import {sizePresets,pageItems,defaults,compareImagesNewest} from './core.js';
import {vibeModelKeys} from './vibe.js';
const models=[['nai-diffusion-4-5-full','V4.5 Full'],['nai-diffusion-4-5-curated','V4.5 Curated'],['nai-diffusion-4-full','V4 Full'],['nai-diffusion-4-curated-preview','V4 Curated'],['nai-diffusion-3','V3 Anime'],['nai-diffusion-furry-3','V3 Furry']];
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createSettingsPanel({settings,save,theme,onTheme,onChange,onError,saveKey,testImage,installDefaults,installWorld,installRegex,listImages,deleteImages,changeFolder,saveCapture,queueStatus,openImage,downloadImages,checkUpdate,installUpdate,refreshPage,listVibes,importVibeFile,encodeVibe,deleteVibe,renameVibe,directKeyStatus,clearDirectKey,setRememberDirectKey,closeSettings}) {
    const root=node('section',undefined,'miao-settings');root.id='miao-nai-settings';
    let activeTab=matchMedia('(max-width:680px), (max-height:500px)').matches?'overview':'generation',fieldId=0,promptTab='positive',selectedVibeId=null;
    const safe=fn=>async()=>{try{await fn();}catch(e){onError(e);}};
    const updateBox=node('div',undefined,'miao-update-status');updateBox.setAttribute('aria-live','polite');
    let updateData=null,updateBusy=false,updateError='',updated=false;
    function paintUpdate(){
        updateBox.replaceChildren();
        if(updateBusy){updateBox.append(node('span','正在'+(updateData?.isUpToDate===false?'更新':'检查更新')+'…'));return;}
        if(updated){updateBox.append(node('span','更新已完成，刷新后生效'));action(updateBox,'强制刷新酒馆',refreshPage);return;}
        if(updateError){updateBox.append(node('span',updateError));action(updateBox,'重试检查',checkLatest);return;}
        if(updateData?.isUpToDate===false){updateBox.append(node('span','检测到当前有新版本'));action(updateBox,'立即更新',async()=>{updateBusy=true;paintUpdate();try{await installUpdate();updated=true;}catch(error){updateError=error.message;}finally{updateBusy=false;paintUpdate();}},true);}
        else{updateBox.append(node('span',updateData?'已是最新版本':'检查插件更新'));action(updateBox,'检查更新',checkLatest);}
    }
    async function checkLatest(force=true){updateBusy=true;updateError='';paintUpdate();try{updateData=await checkUpdate(force);updated=!!updateData.needsReload;}catch(error){updateError=error.message;}finally{updateBusy=false;paintUpdate();}}
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
    function section(parent,title,description) {const box=node('section',undefined,'miao-section');box.append(node('h3',title));if(description)box.append(node('p',description,'miao-muted'));parent.append(box);return box;}
    async function profileVibes(parent,p){
        parent.append(node('p','正在读取 Vibe 列表…','miao-muted'));
        try{
            const items=await listVibes();parent.replaceChildren();
            if(!items.length){parent.append(node('p','还没有 Vibe，先到「Vibe」页导入。','miao-muted'));return;}
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
                if(!variants.length)row.append(node('p','没有当前模型的编码，请到 Vibe 页编码或导入匹配文件。','miao-muted'));
                parent.append(row);
            }
        }catch(error){parent.replaceChildren(node('p',error.message,'miao-muted'));}
    }
    function render() {
        root.replaceChildren();root.dataset.theme=theme();
        root.dataset.section=activeTab;
        const header=node('header',undefined,'miao-header');const brand=node('div',undefined,'miao-brand');brand.append(node('span','✦','miao-mark'));
        const back=node('button','‹','miao-drawer-back');back.type='button';back.setAttribute('aria-label','返回功能列表');back.hidden=activeTab==='overview';back.onclick=()=>{activeTab='overview';render();root.closest('.popup-content')?.scrollTo({top:0});};header.append(back);
        if(activeTab==='overview'){const title=node('div');title.append(node('h2','喵喵文生图'));brand.append(title);header.append(brand);}
        header.dataset.compact=String(activeTab!=='overview');
        const close=node('button','×','miao-drawer-close');close.type='button';close.setAttribute('aria-label','关闭设置');close.onclick=safe(closeSettings);header.append(close);root.append(header);
        const tabs=node('nav',undefined,'miao-tabs');tabs.setAttribute('aria-label','设置分区');
        for(const [id,label] of [['generation','生成'],['config','配置'],['vibes','Vibe'],['resources','资源'],['images','图片']]) {
            const b=node('button',label);b.type='button';b.dataset.active=String(activeTab===id);b.setAttribute('aria-pressed',String(activeTab===id));b.onclick=()=>{activeTab=id;render();root.closest('.popup-content')?.scrollTo({top:0});};tabs.append(b);
        }root.append(tabs);
        const body=node('div',undefined,'miao-panel-body');root.append(body);
        const p=settings.profiles[settings.active];
        if(activeTab==='overview'){
            const overview=node('nav',undefined,'miao-overview');overview.setAttribute('aria-label','功能列表');body.append(overview);
            for(const [id,label,icon,description] of [
                ['generation','生成','sliders','生成方式 · NAI Key · 云端排队'],
                ['config','配置','layer-group',`${settings.profiles.length} 套配置 · 当前 ${p.name}`],
                ['vibes','Vibe','wand-magic-sparkles',`${settings.vibeLibrary?.length||0} 个氛围 · 导入与编码`],
                ['resources','资源','book','世界书 · 正则 · 捕捉标签'],
                ['images','图片','images','历史缩略图 · 按日期清理 · 下载'],
            ]){
                const row=node('button',undefined,'miao-overview-row');row.type='button';row.setAttribute('aria-label',label);
                const symbol=node('i',undefined,`fa-solid fa-${icon}`);symbol.setAttribute('aria-hidden','true');
                const copy=node('span',undefined,'miao-overview-copy');copy.append(node('strong',label),node('small',description));const arrow=node('span','›','miao-overview-arrow');arrow.setAttribute('aria-hidden','true');row.append(symbol,copy,arrow);
                row.onclick=()=>{activeTab=id;render();root.closest('.popup-content')?.scrollTo({top:0});};overview.append(row);
            }
        } else if(activeTab==='generation') {
            const main=section(body,'生成方式','自动生成只处理最新楼层；旧楼层随时可以手动点击。');
            const toggle=node('label',undefined,'miao-switch-row');const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=settings.enabled;checkbox.onchange=()=>{settings.enabled=checkbox.checked;save();onChange();};toggle.append(node('span','启用文生图'),checkbox);main.append(toggle);
            field(main,'最新楼层',settings.mode,v=>{settings.mode=v;save();onChange(true);render();},{options:[['manual','手动 · 点击按钮后生成'],['auto','自动 · 载入或回复完成后生成'],['stream','流式 · 完整标签出现后生成']]});
            const connection=section(body,'连接 NovelAI');
            const key=field(connection,'API Key','',()=>{},{type:'password'});key.autocomplete='new-password';key.placeholder='输入你的 NovelAI Key';
            const remember=node('label',undefined,'miao-switch-row'),rememberCheck=node('input');rememberCheck.type='checkbox';rememberCheck.checked=!!settings.rememberDirectKey;rememberCheck.onchange=safe(async()=>{try{await setRememberDirectKey(rememberCheck.checked);}finally{rememberCheck.checked=!!settings.rememberDirectKey;await updateKeyState();}});remember.append(node('span','在此设备记住 Vibe 直连 Key'),rememberCheck);connection.append(remember);
            connection.append(node('p','勾选后立即记住本页已保存的 Key，更新或刷新后仍可使用。新输入的 Key 请点保存；Key 不会进入插件配置或 Vibe 文件。','miao-muted'));
            const keyState=node('p','正在检查直连 Key…','miao-muted');connection.append(keyState);
            const mask='••••••••••••';let directReady=false;
            key.addEventListener('focus',()=>{if(key.value===mask)key.value='';});
            key.addEventListener('blur',()=>{if(!key.value&&directReady)key.value=mask;});
            const updateKeyState=async()=>{const status=await directKeyStatus();directReady=status.ready;keyState.textContent=directReady?(status.persistent?'✓ Key 已保存到当前设备，更新或刷新后可继续使用':'✓ Key 仅在当前页面暂存，刷新后需重填'):status.serverSaved?'酒馆端 Key 已保存；当前设备没有可用的 Vibe Key，请补填一次并保存。':'尚未保存 Key';if(document.activeElement!==key&&(!key.value||key.value===mask))key.value=directReady?mask:'';};safe(updateKeyState)();
            const actions=node('div',undefined,'miao-actions');connection.append(actions);action(actions,'保存密钥',async()=>{try{await saveKey(key.value===mask?'':key.value.trim());key.value='';}finally{await updateKeyState();}},true);action(actions,'测试生成',testImage);
            action(connection,'清除本设备直连 Key',async()=>{await clearDirectKey();await updateKeyState();});
            const queue=section(body,'共享 Key 排队');
            const queueToggle=node('label',undefined,'miao-switch-row'),queueCheck=node('input');queueCheck.type='checkbox';queueCheck.checked=settings.cloudQueue;queueCheck.onchange=()=>{settings.cloudQueue=queueCheck.checked;save();};queueToggle.append(node('span','启用云端排队'),queueCheck);queue.append(queueToggle);
            field(queue,'队列服务地址',settings.queueUrl,v=>{settings.queueUrl=v.trim();save();}).placeholder='https://miao-image-queue.savlu329.workers.dev';
            const status=node('p',settings.keyHash?'已能自动识别当前 Key':'首次使用排队，请在上方重新保存一次 Key。','miao-muted');queue.append(status);
            action(queue,'检查队列连接',async()=>{validateQueueURL(settings.queueUrl);await queueStatus();status.textContent='队列连接成功喵';});
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
            for(const [key,label] of [['positive','Base Prompt'],['negative','Undesired Content']]) {
                const tab=node('button',label);tab.type='button';tab.setAttribute('role','tab');tab.onclick=()=>{promptTab=key;sync();};promptTabs.append(tab);tabs.set(key,tab);
                const control=field(prompts,key==='positive'?'正面提示词':'负面提示词',p[key],v=>{p[key]=v;save();},{type:'textarea'});
                control.placeholder=key==='positive'?'填写风格、质量、画师等标签…':'填写不希望出现在画面中的内容…';fields.set(key,control);
            }sync();
            const params=section(workspace,'生成参数');
            const sizes=node('div',undefined,'miao-size-options');params.append(sizes);
            for(const preset of sizePresets){const b=action(sizes,preset.name,()=>{p.width=preset.width;p.height=preset.height;save();render();});b.append(node('small',`${preset.width}×${preset.height}`));b.classList.add('miao-size-preset');b.dataset.selected=String(p.width===preset.width&&p.height===preset.height);b.setAttribute('aria-pressed',b.dataset.selected);}
            const grid=node('div',undefined,'miao-grid');params.append(grid);
            for(const [key,label,type] of [['width','宽度','number'],['height','高度','number'],['steps','步数','number'],['scale','Guidance','number'],['seed','种子','number'],['sampler','采样器','text'],['scheduler','噪声表','text']]){const choices=key==='sampler'?[['k_euler_ancestral','Euler Ancestral'],['k_euler','Euler'],['k_dpmpp_2m','DPM++ 2M'],['k_dpmpp_2s_ancestral','DPM++ 2S Ancestral'],['k_dpmpp_sde','DPM++ SDE']]:key==='scheduler'?[['karras','Karras'],['native','Native'],['exponential','Exponential'],['polyexponential','Polyexponential']]:null;const options=choices&&!choices.some(([id])=>id===p[key])?[[p[key],p[key]],...choices]:choices;field(grid,label,p[key],v=>{p[key]=v;save();},{type,options,wide:['seed','sampler','scheduler'].includes(key)});}
            const vibes=section(body,'本配置的 Vibe','随机 1 个：勾选任意数量作为候选，每次生图抽一个。多个：同时使用勾选项，最多 4 个。不勾选时使用普通生图。');
            field(vibes,'使用方式',p.vibeMode??'multiple',value=>{
                if(value==='multiple'&&(p.vibes||[]).length>4){render();throw Error('当前候选超过 4 个，请先减少勾选，再切换「多个」');}
                p.vibeMode=value;save();render();
            },{options:[['random','随机 1 个'],['multiple','多个（最多 4 个）']]});
            const choices=node('div',undefined,'miao-vibe-choices');vibes.append(choices);profileVibes(choices,p);
        } else if(activeTab==='vibes') {
            const manage=section(body,'Vibe 氛围列表','导入 NAI 的 .naiv4vibe / .naiv4vibeBundle，或上传图片后编码。启用哪些 Vibe，请到「配置」页勾选。');
            const guide=node('a','Vibe 使用说明（无需额外安装）');guide.href='https://github.com/AYUUKI-K/Mewo-Text-to-Image/blob/main/VIBE.md';guide.target='_blank';guide.rel='noopener';manage.append(guide);
            const upload=node('input');upload.type='file';upload.accept='.naiv4vibe,.naiv4vibeBundle,.json,image/png,image/jpeg,image/webp';upload.multiple=true;upload.hidden=true;manage.append(upload);
            const actions=node('div',undefined,'miao-actions');manage.append(actions);
            const list=node('div',undefined,'miao-vibe-list');manage.append(list);
            const refresh=async()=>{
                list.replaceChildren(node('p','正在读取 Vibe…','miao-muted'));
                try{
                    const items=await listVibes();list.replaceChildren();
                    if(!items.length)list.append(node('p','还没有 Vibe，点击导入开始。','miao-muted'));
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
            manage.append(node('p','已编码文件可直接使用。V4/V4.5 新编码或修改信息提取量通常消耗 2 Anlas；超过 4 个 Vibe 时也可能增加生图费用。','miao-muted'));refresh();
        } else if(activeTab==='resources') {
            const resources=section(body,'世界书与正则','默认内置你的喵喵世界书，也支持替换为自己的资源。');
            const status=node('div',undefined,'miao-notice');status.append(node('strong',settings.installed?'默认资源已载入':'默认资源尚未载入'),node('p',settings.world?`当前载入：${settings.world}`:'载入世界书后，请在酒馆世界书面板确认启用范围。'));resources.append(status);
            action(resources,'载入默认资源',async()=>{await installDefaults();render();},true);
            const upload=(label,fn)=>{const file=node('input');file.type='file';file.accept='.json';file.hidden=true;file.onchange=safe(async()=>{if(file.files[0])await fn(file.files[0]);file.value='';render();});resources.append(file);action(resources,label,()=>file.click());};
            upload('导入世界书',installWorld);upload('导入正则',async f=>installRegex(JSON.parse(await f.text())));
            const capture=section(body,'捕捉标签');
            capture.append(node('p','自动排除酒馆当前「推理内容格式化」的前后缀，以及 imgthink / think / analysis 等思考标签。未闭合的思维链也不会生成图片。','miao-muted'));
            const start=field(capture,'起始标签',settings.startTag,()=>{});start.placeholder='image###';
            const end=field(capture,'结束标签',settings.endTag,()=>{});end.placeholder='###';
            const sample=node('pre',undefined,'miao-capture-sample');
            const updateSample=()=>{sample.textContent=start.value+'\n这里是绘图提示词\n'+end.value;};start.addEventListener('input',updateSample);end.addEventListener('input',updateSample);updateSample();capture.append(sample);
            action(capture,'保存标签',()=>{saveCapture(start.value,end.value);},true);
            resources.append(node('p','导入的正则会添加到酒馆全局正则；已有同名或同 ID 的规则会复用。','miao-muted'));

        }
        if(activeTab==='images') {
            const storage=section(body,'服务器存储','图片保存在酒馆服务器，不占用浏览器存储。目录位于服务器 user/images 下。');
            const folder=field(storage,'生成图片存储目录',settings.folder,()=>{});folder.placeholder='miao-nai';
            action(storage,'保存存储目录',()=>{changeFolder(folder.value);render();},true);
            const cleanup=section(body,'按日期清理','只列出本插件生成的图片。日期按当前设备时区归类，删除会影响历史聊天中的图片。');
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
            cleanup.append(node('p','每页 24 张。勾选日期或点击清理，会处理该日期的全部图片，包含其他页。','miao-muted'));
            const draw=()=>{
                list.replaceChildren();updateSelection();const counts=new Map();for(const image of images)counts.set(image.day,(counts.get(image.day)||0)+1);
                const paged=pageItems(images,page);page=paged.page;
                if(!images.length)list.append(node('p','这个目录还没有可清理的生成图片。','miao-muted'));
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
                list.replaceChildren(node('p','正在读取服务器图片…','miao-muted'));selected.clear();selectedImages.clear();updateSelection();
                try{
                    images=(await listImages(selectedFolder)).sort(compareImagesNewest);draw();
                }catch(error){list.replaceChildren(node('p','读取失败，请刷新重试。'));onError(error);}
            };
            action(controls,'刷新列表',refresh);
            action(controls,'清理选中日期',async()=>{if(!selected.size)throw new Error('请先勾选需要清理的日期');await deleteImages(selectedFolder,images.filter(i=>selected.has(i.day)).map(i=>i.name));await refresh();});
            refresh();
        }
        const footer=node('footer',undefined,'miao-footer');footer.append(node('span','by 喵喵电波-NUE','miao-credit'),node('span','喵喵文生图 · 1.0.0'),updateBox);root.append(footer);
    }
    render();checkLatest(false);return root;
}

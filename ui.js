import {validateQueueURL} from './cloud-queue.js';
import {sizePresets} from './core.js';
const models=[['nai-diffusion-4-5-full','V4.5 Full'],['nai-diffusion-4-5-curated','V4.5 Curated'],['nai-diffusion-4-full','V4 Full'],['nai-diffusion-4-curated-preview','V4 Curated'],['nai-diffusion-3','V3 Anime'],['nai-diffusion-furry-3','V3 Furry']];
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createSettingsPanel({settings,save,theme,onTheme,onChange,onError,saveKey,testImage,installDefaults,installWorld,installRegex,listImages,deleteImages,changeFolder,saveCapture,queueStatus,openImage}) {
    const root=node('section',undefined,'miao-settings');root.id='miao-nai-settings';
    let activeTab='generation',fieldId=0,promptTab='positive';
    const safe=fn=>async()=>{try{await fn();}catch(e){onError(e);}};
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
    function render() {
        root.replaceChildren();root.dataset.theme=theme();
        const header=node('header',undefined,'miao-header');const brand=node('div',undefined,'miao-brand');brand.append(node('span','✦','miao-mark'));
        const title=node('div');title.append(node('h2','喵喵文生图'),node('p','让故事里的画面，出现在故事里。'));brand.append(title);header.append(brand,node('span','NOVELAI','miao-provider'));root.append(header);
        const tabs=node('nav',undefined,'miao-tabs');tabs.setAttribute('aria-label','设置分区');
        for(const [id,label] of [['generation','生成'],['config','配置'],['resources','资源'],['images','图片']]) {
            const b=node('button',label);b.type='button';b.dataset.active=String(activeTab===id);b.setAttribute('aria-pressed',String(activeTab===id));b.onclick=()=>{activeTab=id;render();};tabs.append(b);
        }root.append(tabs);
        const body=node('div',undefined,'miao-panel-body');root.append(body);
        const p=settings.profiles[settings.active];
        if(activeTab==='generation') {
            const main=section(body,'生成方式','自动生成只处理最新楼层；旧楼层随时可以手动点击。');
            const toggle=node('label',undefined,'miao-switch-row');const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=settings.enabled;checkbox.onchange=()=>{settings.enabled=checkbox.checked;save();onChange();};toggle.append(node('span','启用文生图'),checkbox);main.append(toggle);
            field(main,'最新楼层',settings.mode,v=>{settings.mode=v;save();onChange(true);render();},{options:[['manual','手动 · 点击按钮后生成'],['auto','自动 · 载入或回复完成后生成'],['stream','流式 · 完整标签出现后生成']]});
            field(main,'界面主题',settings.theme,v=>{settings.theme=v;save();onTheme();render();},{options:[['auto','跟随酒馆'],['light','蓝白 · 浅色'],['dark','蓝黑 · 深色']]});
            const connection=section(body,'连接 NovelAI','密钥保存在酒馆中，所有配置共用。');
            const key=field(connection,'API Key','',()=>{},{type:'password'});key.autocomplete='new-password';key.placeholder='输入你的 NovelAI Key';
            const actions=node('div',undefined,'miao-actions');connection.append(actions);action(actions,'保存密钥',async()=>{await saveKey(key.value.trim());key.value='';},true);action(actions,'测试生成',testImage);
            const queue=section(body,'共享 Key 排队','同一个 Key 轮流生成，不同 Key 各走各的队列。');
            const queueToggle=node('label',undefined,'miao-switch-row'),queueCheck=node('input');queueCheck.type='checkbox';queueCheck.checked=settings.cloudQueue;queueCheck.onchange=()=>{settings.cloudQueue=queueCheck.checked;save();};queueToggle.append(node('span','启用云端排队'),queueCheck);queue.append(queueToggle);
            field(queue,'队列服务地址',settings.queueUrl,v=>{settings.queueUrl=v.trim();save();}).placeholder='https://你的队列.onrender.com';
            const status=node('p',settings.keyHash?'已能自动识别当前 Key':'首次使用排队，请在上方重新保存一次 Key。','miao-muted');queue.append(status);
            action(queue,'检查队列连接',async()=>{validateQueueURL(settings.queueUrl);await queueStatus();status.textContent='队列连接成功喵';});
        } else if(activeTab==='config') {
            const profiles=section(body,'配置');
            field(profiles,'当前配置',String(settings.active),v=>{settings.active=Number(v);save();render();},{options:settings.profiles.map((p,i)=>[String(i),p.name])});
            const actions=node('div',undefined,'miao-actions');profiles.append(actions);
            action(actions,'复制配置',()=>{settings.profiles.push({...p,name:p.name+' · 副本'});settings.active=settings.profiles.length-1;save();render();});
            action(actions,'删除配置',async()=>{if(settings.profiles.length===1)throw new Error('至少保留一个配置');if(!await onChange('confirm-delete'))return;settings.profiles.splice(settings.active,1);settings.active=0;save();render();});
            field(profiles,'配置名称',p.name,v=>{p.name=v;save();});
            const modelOptions=models.some(([id])=>id===p.model)?models:[[p.model,p.model],...models];
            field(profiles,'NAI 模型',p.model,v=>{p.model=v;save();},{options:modelOptions});
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
            const sizes=node('div',undefined,'miao-actions');params.append(sizes);
            for(const preset of sizePresets){const b=action(sizes,`${preset.name} ${preset.width} × ${preset.height}`,()=>{p.width=preset.width;p.height=preset.height;save();render();});b.classList.add('miao-size-preset');b.dataset.selected=String(p.width===preset.width&&p.height===preset.height);b.setAttribute('aria-pressed',b.dataset.selected);}
            const grid=node('div',undefined,'miao-grid');params.append(grid);
            for(const [key,label,type] of [['width','宽度','number'],['height','高度','number'],['steps','步数','number'],['scale','Guidance','number'],['seed','种子','number'],['sampler','采样器','text'],['scheduler','噪声表','text']]){const choices=key==='sampler'?[['k_euler_ancestral','Euler Ancestral'],['k_euler','Euler'],['k_dpmpp_2m','DPM++ 2M'],['k_dpmpp_2s_ancestral','DPM++ 2S Ancestral'],['k_dpmpp_sde','DPM++ SDE']]:key==='scheduler'?[['karras','Karras'],['native','Native'],['exponential','Exponential'],['polyexponential','Polyexponential']]:null;const options=choices&&!choices.some(([id])=>id===p[key])?[[p[key],p[key]],...choices]:choices;field(grid,label,p[key],v=>{p[key]=v;save();},{type,options});}
        } else if(activeTab==='resources') {
            const resources=section(body,'世界书与正则','默认内置你的喵喵世界书，也支持替换为自己的资源。');
            const status=node('div',undefined,'miao-notice');status.append(node('strong',settings.installed?'默认资源已载入':'默认资源尚未载入'),node('p',settings.world?`当前载入：${settings.world}`:'载入世界书后，请在酒馆世界书面板确认启用范围。'));resources.append(status);
            action(resources,'载入默认资源',async()=>{await installDefaults();render();},true);
            const upload=(label,fn)=>{const file=node('input');file.type='file';file.accept='.json';file.hidden=true;file.onchange=safe(async()=>{if(file.files[0])await fn(file.files[0]);file.value='';render();});resources.append(file);action(resources,label,()=>file.click());};
            upload('导入世界书',installWorld);upload('导入正则',async f=>installRegex(JSON.parse(await f.text())));
            const capture=section(body,'捕捉标签');
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
            const selected=new Set();let images=[];
            const list=node('div');list.setAttribute('aria-live','polite');cleanup.append(list);
            const refresh=async()=>{
                list.replaceChildren(node('p','正在读取服务器图片…','miao-muted'));selected.clear();
                try{
                    images=await listImages(selectedFolder);list.replaceChildren();
                    const counts=new Map();for(const image of images)counts.set(image.day,(counts.get(image.day)||0)+1);
                    if(!images.length)list.append(node('p','这个目录还没有可清理的生成图片。','miao-muted'));
                    for(const [day,count] of [...counts].sort((a,b)=>b[0].localeCompare(a[0]))) {
                        const group=node('section',undefined,'miao-date-group');
                        const row=node('div',undefined,'miao-date-row'),label=node('label'),check=node('input');check.type='checkbox';check.onchange=()=>check.checked?selected.add(day):selected.delete(day);
                        label.append(check,node('span',day),node('small',`${count} 张`));row.append(label);
                        action(row,'清理',async()=>{await deleteImages(selectedFolder,images.filter(i=>i.day===day).map(i=>i.name));await refresh();});group.append(row);
                        const gallery=node('div',undefined,'miao-history-grid');
                        for(const image of images.filter(i=>i.day===day)){const link=node('a');link.href=image.url;link.addEventListener('click',event=>{event.preventDefault();openImage(image.url,image.name);});const thumb=node('img');thumb.src=image.url;thumb.alt=image.name;thumb.loading='lazy';link.title=image.name;link.append(thumb);gallery.append(link);}
                        group.append(gallery);list.append(group);
                    }
                }catch(error){list.replaceChildren(node('p','读取失败，请刷新重试。'));onError(error);}
            };
            action(controls,'刷新列表',refresh);
            action(controls,'清理选中日期',async()=>{if(!selected.size)throw new Error('请先勾选需要清理的日期');await deleteImages(selectedFolder,images.filter(i=>selected.has(i.day)).map(i=>i.name));await refresh();});
            refresh();
        }
        const footer=node('footer',undefined,'miao-footer');footer.append(node('span','设置自动保存'),node('span','喵喵文生图 · 0.4.0'));root.append(footer);
    }
    render();return root;
}

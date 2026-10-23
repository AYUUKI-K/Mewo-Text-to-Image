const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createSettingsPanel({settings,save,theme,onTheme,onChange,onError,saveKey,testImage,installDefaults,installWorld,installRegex,listImages,deleteImages,changeFolder}) {
    const root=node('section',undefined,'miao-settings');root.id='miao-nai-settings';
    let activeTab='generation',fieldId=0;
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
        const event=(type==='textarea'||(!options&&type!=='number'))?'input':'change';
        control.addEventListener(event,()=>{try{change(type==='number'?Number(control.value):control.value);}catch(e){onError(e);}});
        wrap.append(control);parent.append(wrap);return control;
    }
    function section(parent,title,description) {const box=node('section',undefined,'miao-section');box.append(node('h3',title));if(description)box.append(node('p',description,'miao-muted'));parent.append(box);return box;}
    function render() {
        root.replaceChildren();root.dataset.theme=theme();
        const header=node('header',undefined,'miao-header');const brand=node('div',undefined,'miao-brand');brand.append(node('span','✦','miao-mark'));
        const title=node('div');title.append(node('h2','喵喵文生图'),node('p','让故事里的画面，出现在故事里。'));brand.append(title);header.append(brand,node('span','NOVELAI','miao-provider'));root.append(header);
        const tabs=node('nav',undefined,'miao-tabs');tabs.setAttribute('aria-label','设置分区');
        for(const [id,label] of [['generation','生成'],['prompts','提示词'],['parameters','参数'],['resources','资源'],['images','图片']]) {
            const b=node('button',label);b.type='button';b.dataset.active=String(activeTab===id);b.setAttribute('aria-pressed',String(activeTab===id));b.onclick=()=>{activeTab=id;render();};tabs.append(b);
        }root.append(tabs);
        const body=node('div',undefined,'miao-panel-body');root.append(body);
        const p=settings.profiles[settings.active];
        if(activeTab==='generation') {
            const main=section(body,'生成方式','自动生成只处理最新楼层；旧楼层随时可以手动点击。');
            const toggle=node('label',undefined,'miao-switch-row');const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=settings.enabled;checkbox.onchange=()=>{settings.enabled=checkbox.checked;save();onChange();};toggle.append(node('span','启用文生图'),checkbox);main.append(toggle);
            field(main,'最新楼层',settings.mode,v=>{settings.mode=v;save();onChange(true);render();},{options:[['manual','手动 · 点击按钮后生成'],['auto','自动 · 载入或回复完成后生成'],['stream','流式 · 完整标签出现后生成']]});
            const hint=node('div',undefined,'miao-notice');hint.append(node('strong','只追踪最新一层'),node('p','例如最新是 #5：#5 按所选方式处理，#3 等旧楼层仅显示按钮。已有图片不会重复生成。'));main.append(hint);
            field(main,'界面主题',settings.theme,v=>{settings.theme=v;save();onTheme();render();},{options:[['auto','跟随酒馆'],['light','蓝白 · 浅色'],['dark','蓝黑 · 深色']]});
            const connection=section(body,'连接 NovelAI','密钥保存在酒馆中，所有配置共用。');
            const key=field(connection,'API Key','',()=>{},{type:'password'});key.autocomplete='new-password';key.placeholder='输入你的 NovelAI Key';
            const actions=node('div',undefined,'miao-actions');connection.append(actions);action(actions,'保存密钥',async()=>{await saveKey(key.value.trim());key.value='';},true);action(actions,'测试生成',testImage);
        } else if(activeTab==='prompts'||activeTab==='parameters') {
            const profiles=section(body,'我的配置','画师、提示词和生成参数一起保存，切换即生效。');
            field(profiles,'当前配置',String(settings.active),v=>{settings.active=Number(v);save();render();},{options:settings.profiles.map((p,i)=>[String(i),p.name])});
            const actions=node('div',undefined,'miao-actions');profiles.append(actions);
            action(actions,'复制配置',()=>{settings.profiles.push({...p,name:p.name+' · 副本'});settings.active=settings.profiles.length-1;save();render();});
            action(actions,'删除配置',async()=>{if(settings.profiles.length===1)throw new Error('至少保留一个配置');if(!await onChange('confirm-delete'))return;settings.profiles.splice(settings.active,1);settings.active=0;save();render();});
            field(profiles,'配置名称',p.name,v=>{p.name=v;save();});
            if(activeTab==='prompts') {
                const prompts=section(body,'提示词','发送顺序：固定正面 → 画师串 → 本次绘图提示词；负面独立发送。');
                for(const [key,label] of [['positive','固定正面提示词'],['artists','画师串'],['negative','固定负面提示词']])field(prompts,label,p[key],v=>{p[key]=v;save();},{type:'textarea'});
            } else {
                const params=section(body,'画布与采样','尺寸为 64 的倍数，种子 -1 表示每次随机。');
                const sizes=node('div',undefined,'miao-actions');params.append(sizes);
                for(const [w,h,label] of [[512,512,'方形'],[832,1216,'竖图'],[1216,832,'横图']])action(sizes,label,()=>{p.width=w;p.height=h;save();render();});
                const grid=node('div',undefined,'miao-grid');params.append(grid);
                for(const [key,label,type] of [['width','宽度','number'],['height','高度','number'],['steps','步数','number'],['scale','Guidance','number'],['seed','种子','number'],['model','模型','text'],['sampler','采样器','text'],['scheduler','噪声表','text']])field(grid,label,p[key],v=>{p[key]=v;save();},{type,wide:key==='model'});
            }
        } else if(activeTab==='resources') {
            const resources=section(body,'世界书与正则','默认内置你的喵喵世界书，也支持替换为自己的资源。');
            const status=node('div',undefined,'miao-notice');status.append(node('strong',settings.installed?'默认资源已载入':'默认资源尚未载入'),node('p',settings.world?`当前载入：${settings.world}`:'载入世界书后，请在酒馆世界书面板确认启用范围。'));resources.append(status);
            action(resources,'载入默认资源',async()=>{await installDefaults();render();},true);
            const upload=(label,fn)=>{const file=node('input');file.type='file';file.accept='.json';file.hidden=true;file.onchange=safe(async()=>{if(file.files[0])await fn(file.files[0]);file.value='';render();});resources.append(file);action(resources,label,()=>file.click());};
            upload('导入世界书',installWorld);upload('导入正则',async f=>installRegex(JSON.parse(await f.text())));
            const advanced=node('details',undefined,'miao-advanced');advanced.append(node('summary','高级：标签捕捉规则'));resources.append(advanced);
            const pattern=field(advanced,'捕捉表达式',settings.pattern,()=>{},{});
            action(advanced,'保存捕捉规则',()=>{new RegExp(pattern.value,'gi');if(!pattern.value.includes('('))throw new Error('表达式需要第一捕获组，用于提取提示词');settings.pattern=pattern.value;save();onChange();});
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
                        const row=node('div',undefined,'miao-date-row'),label=node('label'),check=node('input');check.type='checkbox';check.onchange=()=>check.checked?selected.add(day):selected.delete(day);
                        label.append(check,node('span',day),node('small',`${count} 张`));row.append(label);
                        action(row,'清理',async()=>{await deleteImages(selectedFolder,images.filter(i=>i.day===day).map(i=>i.name));await refresh();});list.append(row);
                    }
                }catch(error){list.replaceChildren(node('p','读取失败，请刷新重试。'));onError(error);}
            };
            action(controls,'刷新列表',refresh);
            action(controls,'清理选中日期',async()=>{if(!selected.size)throw new Error('请先勾选需要清理的日期');await deleteImages(selectedFolder,images.filter(i=>selected.has(i.day)).map(i=>i.name));await refresh();});
            refresh();
        }
        const footer=node('footer',undefined,'miao-footer');footer.append(node('span','设置自动保存'),node('span','喵喵文生图 · 0.2.0'));root.append(footer);
    }
    render();return root;
}

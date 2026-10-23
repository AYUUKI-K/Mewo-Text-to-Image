// Isolated integration preview. No real NAI requests or image deletion.
// Run: node tests/preview-server.mjs, then open http://127.0.0.1:8766
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const prefix='/scripts/extensions/third-party/test/';
const fixturePNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
function fixtureZip(){
    const name=Buffer.from('image_0.png');let crc=0xffffffff;for(const byte of fixturePNG){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(fixturePNG.length,18);local.writeUInt32LE(fixturePNG.length,22);local.writeUInt16LE(name.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(fixturePNG.length,20);central.writeUInt32LE(fixturePNG.length,24);central.writeUInt16LE(name.length,28);
    const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+fixturePNG.length,16);
    return Buffer.concat([local,name,fixturePNG,central,name,end]);
}
const mock=`import {defaults} from '${prefix}core.js';
const handlers=new Map();const chat=Array.from({length:6},(_,i)=>({name:'Preview',mes:i===3?'image###third###':i===5?'<star_cot>image###fifth### image###wrong###</star_cot>image###fifth###':'Floor '+i,extra:{}}));
export const extension_settings={miao_nai_image:{enabled:true,mode:'manual',theme:'light',folder:'miao-nai',folders:['miao-nai'],pattern:'image###([\\\\s\\\\S]*?)###',profiles:[{...defaults,name:'A',positive:'a style',steps:20},{...defaults,name:'B',positive:'b style',steps:28}],active:0,installed:true,vibeLibrary:[{id:'00000000-0000-0000-0000-000000000001',name:'测试氛围',hasImage:false,variants:[{model:'v4-5full',key:'hash',information:0.7}]}]}};
const context={chat,powerUserSettings:{reasoning:{prefix:'<star_cot>',suffix:'</star_cot>'}},getCurrentChatId:()=>window.preview.chatId,getRequestHeaders:()=>({'Content-Type':'application/json'}),saveSettingsDebounced(){},async saveChat(){},eventTypes:Object.fromEntries(['CHAT_CHANGED','GENERATION_STARTED','GENERATION_ENDED','STREAM_TOKEN_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_EDITED'].map(x=>[x,x])),eventSource:{on(n,fn){if(!handlers.has(n))handlers.set(n,[]);handlers.get(n).push(fn);}}};
window.preview={chat,chatId:'preview',settings:extension_settings.miao_nai_image,async emit(n){for(const fn of handlers.get(n)||[])await fn();},calls:[],translations:[],files:[...Array.from({length:53},(_,i)=>'miao-'+(1792737847709-i*3600000)+'.png'),'unrelated.png']};
export const getContext=()=>context;
`;
const popup=`export const POPUP_TYPE={TEXT:1,CONFIRM:2};export async function callGenericPopup(content,type,input,options={}){if(type===2)return true;const dlg=document.createElement('dialog');dlg.className='popup';const body=document.createElement('div');body.className='popup-body';const box=document.createElement('div');box.className='popup-content';if(typeof content==='string')box.textContent=content;else box.append(content);body.append(box);const controls=document.createElement('div');controls.className='popup-controls';const close=document.createElement('button');close.textContent='完成';close.onclick=()=>dlg.close();controls.append(close);body.append(controls);dlg.append(body);document.body.append(dlg);options.onOpen?.({dlg});dlg.showModal();return new Promise(r=>dlg.addEventListener('close',()=>{dlg.remove();r(1);}));}`;
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>喵喵文生图 · 隔离测试</title><link rel="stylesheet" href="${prefix}style.css"><style>body{margin:0;background:#e9eff8;font:14px system-ui;color:#17304e;padding:20px}#extensionsMenu{padding:16px;background:white;border-radius:14px;max-width:350px}#chat{display:block}#report{white-space:pre-wrap}dialog.popup{border:0;display:flex;flex-direction:column;left:50%;top:50%;min-height:fit-content;max-height:calc(100dvh - 2em)}.popup-body{display:flex;flex-direction:column;overflow:hidden;height:100%}.popup-content{flex-grow:1}.popup-controls{display:flex;gap:20px}dialog::backdrop{background:#0d172870}button{cursor:pointer}</style><div id="extensionsMenu"></div><pre id="report">正在验证…</pre><div id="chat"></div><script>window.jQuery=fn=>fn();window.toastr={info:console.info,success:console.info};</script><script type="module">
import {getContext} from '/scripts/extensions.js';
const p=window.preview;function draw(){document.getElementById('chat').innerHTML=p.chat.map((m,i)=>'<div class="mes" mesid="'+i+'"><div class="mes_text">'+m.mes+'</div></div>').join('');}draw();
const nativeFetch=window.fetch.bind(window);window.fetch=async(url,options)=>{if(url==='/api/plugins/miao-nai-image/health')return Response.json({ready:true,vibe:true});if(url==='/api/plugins/miao-nai-image/vibes')return Response.json([{id:'00000000-0000-0000-0000-000000000001',name:'测试氛围',hasImage:true,variants:[{model:'v4-5full',key:'hash',information:0.7}]}]);if(url==='/api/translate/google'){p.translations.push(JSON.parse(options.body));return new Response('测试译文：阳光、花园、猫咪');}if(url==='/api/novelai/generate-image'||url==='/api/plugins/miao-nai-image/generate-image'){p.calls.push(JSON.parse(options.body));return new Response('aGVsbG8=');}if(url==='/api/images/list')return Response.json(p.files);if(url==='/api/images/delete'){const name=JSON.parse(options.body).path.split('/').at(-1);p.files=p.files.filter(f=>f!==name);return new Response('OK');}return nativeFetch(url,options);};
const previousFetch=window.fetch;p.vibeFiles={};p.vibeFiles['/user/files/miao-vibe-00000000-0000-0000-0000-000000000001.json']={id:'00000000-0000-0000-0000-000000000001',name:'测试氛围',encodings:{'v4-5full':{hash:{encoding:'YWJj',params:{information_extracted:0.7}}}}};
p.updates=[];
window.fetch=async(url,options)=>{
if(url==='/api/extensions/version'||url==='/api/extensions/update'){p.updates.push({url,...JSON.parse(options.body)});return Response.json({isUpToDate:false});}
if(String(url).startsWith('/user/files/miao-vibe-'))return p.vibeFiles[url]?Response.json(p.vibeFiles[url]):new Response('missing',{status:404});
if(url==='/api/files/upload'){const body=JSON.parse(options.body),path='/user/files/'+body.name;p.vibeFiles[path]=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.data),c=>c.charCodeAt(0))));return Response.json({path});}
if(url==='/api/files/delete'){delete p.vibeFiles[JSON.parse(options.body).path];return new Response('OK');}
if(url==='https://image.novelai.net/ai/generate-image'){p.calls.push(JSON.parse(options.body));return nativeFetch('/fixture-nai.zip');}
if(url==='https://image.novelai.net/ai/encode-vibe')return new Response(new Uint8Array([1,2,3]));
return previousFetch(url,options);};
await import('${prefix}index.js');const wait=()=>new Promise(r=>setTimeout(r,180));await wait();
const results=[];const check=(condition,label)=>{results.push((condition?'PASS ':'FAIL ')+label);if(!condition)throw Error(label);};
try{
check(document.querySelectorAll('.miao-image-card').length===2,'#3 与 #5 都显示按钮');check(p.calls.length===0,'手动模式载入零请求');
p.settings.mode='auto';await p.emit('CHAT_CHANGED');await p.emit('CHARACTER_MESSAGE_RENDERED');await wait();check(p.calls.length===1&&p.calls[0].prompt.includes('fifth'),'载入自动模式只生成 #5，渲染事件不覆盖载入事件');
await p.emit('CHAT_CHANGED');await wait();check(p.calls.length===1,'重复载入不重复生成');
document.querySelector('[mesid="3"] button').click();await wait();check(p.calls.length===2&&p.calls[1].prompt.includes('third'),'旧楼层可以手动生成');
p.settings.mode='stream';p.chat.push({name:'Preview',mes:'image###partial',extra:{}});draw();await p.emit('GENERATION_STARTED');await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===2,'半截标签不发请求');
p.chat.at(-1).mes='<star_cot>image###wrong in streaming###';draw();await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===2,'自定义流式思维链不生成图片');
p.chat.at(-1).mes='image###stream complete###';draw();await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===3&&p.calls[2].prompt.includes('stream complete'),'闭合标签立即生成最新楼层');await p.emit('GENERATION_ENDED');await wait();check(p.calls.length===3,'回复结束不重复生成');
p.chat.push({name:'Preview',mes:'<imgthink>image###自检示例### 9.信息完整性 10.扩展要求',extra:{}});draw();await p.emit('GENERATION_STARTED');await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===3,'世界书 imgthink 内完整示例不触发生成');
p.chat.at(-1).mes+='</imgthink>image###未闭合的格式说明 image###sfw, 1boy, 1girl, school corridor#';draw();await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===3,'新起始标签不会误关闭旧标签，单个结束井号不生成');
p.chat.at(-1).mes+='#';draw();await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===3,'两个结束井号仍不生成');
p.chat.at(-1).mes+='#';draw();await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===4&&p.calls[3].prompt==='a style,\\nsfw, 1boy, 1girl, school corridor','第三个井号到达只发送正式提示词，无自检或格式说明');
const lastRoot=document.querySelector('#chat .mes:last-child .mes_text');check(!lastRoot.querySelector('.miao-image-card'),'流式期间后台生图，不插入或刷新按钮卡片');
lastRoot.innerHTML='<p id="before-image">前正文</p><p>image###</p><p>sfw, 1boy, 1girl, school corridor</p><h1>#</h1><p id="after-image">后正文</p>';
await p.emit('GENERATION_ENDED');await wait();check(p.calls.length===4,'流式修复场景结束后不重复扣费');
const placed=lastRoot.querySelector('.miao-image-card');check(!!placed&&(lastRoot.querySelector('#before-image').compareDocumentPosition(placed)&Node.DOCUMENT_POSITION_FOLLOWING)&&(placed.compareDocumentPosition(lastRoot.querySelector('#after-image'))&Node.DOCUMENT_POSITION_FOLLOWING)&&!lastRoot.textContent.includes('image###'),'Markdown 拆段后图片仍替换在前后正文之间，不追加到文末');
const firstVersionURL=placed.querySelector('img').src;placed.querySelector('img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await wait();
let versionCard=lastRoot.querySelector('.miao-image-card');const secondVersionURL=versionCard.querySelector('img').src;check(versionCard.querySelector('.miao-version-count')?.textContent==='2 / 2'&&firstVersionURL!==secondVersionURL,'重新生成保留两张不同图片版本');
const liveRecord=p.chat.at(-1).extra.miao_nai_image;for(const key of Object.keys(liveRecord))liveRecord[key]=structuredClone(liveRecord[key]);
versionCard.querySelector('[aria-label="上一张"]').click();await wait();versionCard=lastRoot.querySelector('.miao-image-card');check(versionCard.querySelector('.miao-version-count').textContent==='1 / 2'&&!versionCard.querySelector('.miao-image-tools').hidden&&versionCard.querySelector('img').src===firstVersionURL,'上一张即时切换图片地址，聊天记录替换后仍有效');
versionCard.querySelector('[aria-label="下一张"]').click();await wait();versionCard=lastRoot.querySelector('.miao-image-card');check(versionCard.querySelector('.miao-version-count').textContent==='2 / 2'&&versionCard.querySelector('img').src===secondVersionURL,'下一张可切回第二版图片地址');
document.getElementById('after-image').click();check(versionCard.querySelector('.miao-image-tools').hidden,'点击图片及操作栏以外的正文，自动收起按钮');
versionCard.querySelector('img').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));document.getElementById('after-image').click();await new Promise(r=>setTimeout(r,320));check(versionCard.querySelector('.miao-image-tools').hidden,'外部点击会取消尚未显示的延迟操作栏');
versionCard.querySelector('img').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
versionCard.querySelector('[aria-label="放大查看"]').click();await wait();check(document.querySelector('.miao-image-viewer')&&!document.querySelector('.miao-image-viewer button'),'放大弹窗只有图片，不包含下载按钮');document.querySelector('dialog:last-of-type .popup-controls button').click();await wait();
check(!document.querySelector('#extensions_settings .miao-settings'),'扩展列表没有设置面板');
document.getElementById('miao-nai-menu').click();await wait();
(document.querySelector('.miao-overview-row[aria-label="图片"]')||[...document.querySelectorAll('.miao-tabs button')].find(b=>b.textContent==='图片')).click();await wait();
let tiles=[...document.querySelectorAll('.miao-history-tile')];check(tiles.length===24,'历史图片每页 24 张，缩略图独立勾选');
check(!document.querySelector('.miao-header h2')&&document.querySelector('.miao-credit').textContent==='by 喵喵电波-NUE','子目录隐藏插件标题，保留作者署名');
check(document.querySelector('.miao-update-status').textContent.includes('检测到当前有新版本'),'打开面板自动检测并显示更新按钮');document.querySelector('.miao-update-status button').click();await wait();check(document.querySelector('.miao-update-status').textContent.includes('更新已完成')&&p.updates.filter(c=>c.url.endsWith('/update')).length===1&&p.updates.every(c=>c.extensionName==='test'&&c.global===false),'更新仅操作当前插件，完成后提示手动刷新');
const firstName=tiles[0].querySelector('img').alt;tiles[0].querySelector('input').click();
document.querySelector('.miao-pager button:last-child').click();await wait();tiles=[...document.querySelectorAll('.miao-history-tile')];const secondName=tiles[0].querySelector('img').alt;tiles[0].querySelector('input').click();check(document.querySelector('.miao-history-selection span').textContent==='已选 2 张','跨页勾选保留选择和数量');
const nativeAnchorClick=HTMLAnchorElement.prototype.click,nativeObjectURL=URL.createObjectURL;const downloads=[],blobs=[];HTMLAnchorElement.prototype.click=function(){if(this.download)downloads.push(this.download);else nativeAnchorClick.call(this);};URL.createObjectURL=function(blob){blobs.push(blob);return nativeObjectURL.call(URL,blob);};
document.querySelector('.miao-history-selection button').click();await new Promise(r=>setTimeout(r,500));HTMLAnchorElement.prototype.click=nativeAnchorClick;URL.createObjectURL=nativeObjectURL;
const archive=await JSZip.loadAsync(await blobs[0].arrayBuffer());check(downloads[0]==='miao-images-2.zip'&&Object.keys(archive.files).length===2&&archive.files[firstName]&&archive.files[secondName]&&!document.querySelector('.miao-history-download'),'勾选两张下载一个 ZIP，保留原名，缩略图不再显示下载按钮');
document.querySelectorAll('.miao-history-selection button')[1].click();await wait();check(!p.files.includes(firstName)&&!p.files.includes(secondName)&&p.files.length===52&&p.files.includes('unrelated.png'),'勾选删除只清理选中两张，不影响同日其他图或无关文件');
}catch(error){results.push(error.stack);}document.getElementById('report').textContent=results.join('\\n');
if(!document.querySelector('.miao-settings'))document.getElementById('miao-nai-menu').click();
</script>`;
const server=http.createServer(async(req,res)=>{try{
let body,type='text/javascript';
if(req.url==='/'||req.url?.startsWith('/?theme=')){
const dark=new URL(req.url,'http://localhost').searchParams.get('theme')==='dark';
const hostTheme=dark?'--SmartThemeBodyColor:#e5ebf5;--SmartThemeBlurTintColor:#121b2b;--SmartThemeQuoteColor:#83b7ff;--SmartThemeBorderColor:#35435b':'--SmartThemeBodyColor:#26364c;--SmartThemeBlurTintColor:#f8fbff;--SmartThemeQuoteColor:#3779c5;--SmartThemeBorderColor:#cedbea';
body=html.replace('<style>','<style>:root{'+hostTheme+'}');type='text/html';}
else if(req.url==='/scripts/extensions.js')body=mock;
else if(req.url==='/scripts/popup.js')body=popup;
else if(req.url==='/scripts/utils.js')body=`let saved=1892737847709;export async function saveBase64AsFile(){return '/user/images/miao-nai/miao-'+(saved++)+'.png';}`;
else if(req.url==='/scripts/secrets.js')body=`export const SECRET_KEYS={NOVEL:'novel'};export async function writeSecret(){}`;
else if(req.url==='/scripts/user.js')body=`export const getCurrentUserHandle=()=>'miao-preview-user';`;
else if(req.url==='/lib/jszip.min.js'&&process.env.MIAO_ST_ROOT)body=await readFile(new URL('public/lib/jszip.min.js', 'file:///'+process.env.MIAO_ST_ROOT.replaceAll('\\','/').replace(/\/$/,'')+'/'));
else if(req.url==='/fixture-nai.zip'){body=fixtureZip();type='application/zip';}
else if(req.url==='/scripts/world-info.js')body=`export const world_names=[],selected_world_info=[];export function onWorldInfoChange(){};export async function importWorldInfo(){}`;
else if(req.url==='/scripts/extensions/regex/engine.js')body=`export const SCRIPT_TYPES={GLOBAL:0};export function getScriptsByType(){return [];}export async function saveScriptsByType(){}`;
else if(req.url.startsWith(prefix)){const file=req.url.slice(prefix.length);if(!['index.js','core.js','vibe.js','direct-client.js','direct-key.js','image-history.js','updates.js','downloads.js','cloud-queue.js','ui.js','style.css'].includes(file))throw Error('Not found');body=await readFile(new URL(file,root));if(file.endsWith('.css'))type='text/css';}
else if(req.url.startsWith('/user/images/')){body=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');type='image/png';}
else{res.writeHead(404);res.end();return;}
res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(body);
}catch(e){res.writeHead(500);res.end(e.message);}});
const port=Number(process.env.MIAO_PREVIEW_PORT||8766);
server.listen(port,'127.0.0.1',()=>console.log('Isolated preview: http://127.0.0.1:'+port));

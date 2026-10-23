// Isolated integration preview. No real NAI requests or image deletion.
// Run: node tests/preview-server.mjs, then open http://127.0.0.1:8766
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const prefix='/scripts/extensions/third-party/test/';
const mock=`import {defaults} from '${prefix}core.js';
const handlers=new Map();const chat=Array.from({length:6},(_,i)=>({name:'Preview',mes:i===3?'image###third###':i===5?'image###fifth###':'Floor '+i,extra:{}}));
export const extension_settings={miao_nai_image:{enabled:true,mode:'manual',theme:'light',folder:'miao-nai',folders:['miao-nai'],pattern:'image###([\\\\s\\\\S]*?)###',profiles:[{...defaults,name:'A',positive:'a style',steps:20},{...defaults,name:'B',positive:'b style',steps:28}],active:0,installed:true}};
const context={chat,getCurrentChatId:()=>window.preview.chatId,getRequestHeaders:()=>({'Content-Type':'application/json'}),saveSettingsDebounced(){},async saveChat(){},eventTypes:Object.fromEntries(['CHAT_CHANGED','GENERATION_STARTED','GENERATION_ENDED','STREAM_TOKEN_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_UPDATED','MESSAGE_SWIPED','MESSAGE_EDITED'].map(x=>[x,x])),eventSource:{on(n,fn){if(!handlers.has(n))handlers.set(n,[]);handlers.get(n).push(fn);}}};
window.preview={chat,chatId:'preview',settings:extension_settings.miao_nai_image,async emit(n){for(const fn of handlers.get(n)||[])await fn();},calls:[],files:['miao-1792737847709.png','miao-1792651447709.png','unrelated.png']};
export const getContext=()=>context;
`;
const popup=`export const POPUP_TYPE={TEXT:1,CONFIRM:2};export async function callGenericPopup(content,type,input,options={}){if(type===2)return true;const dlg=document.createElement('dialog');dlg.className='popup';const body=document.createElement('div');body.className='popup-body';const box=document.createElement('div');box.className='popup-content';if(typeof content==='string')box.textContent=content;else box.append(content);body.append(box);const controls=document.createElement('div');controls.className='popup-controls';const close=document.createElement('button');close.textContent='完成';close.onclick=()=>dlg.close();controls.append(close);body.append(controls);dlg.append(body);document.body.append(dlg);options.onOpen?.({dlg});dlg.showModal();return new Promise(r=>dlg.addEventListener('close',()=>{dlg.remove();r(1);}));}`;
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>喵喵文生图 · 隔离测试</title><link rel="stylesheet" href="${prefix}style.css"><style>body{margin:0;background:#e9eff8;font:14px system-ui;color:#17304e;padding:20px}#extensionsMenu{padding:16px;background:white;border-radius:14px;max-width:350px}#chat{display:none}#report{white-space:pre-wrap}dialog{border:0}dialog::backdrop{background:#0d172870}button{cursor:pointer}</style><div id="extensionsMenu"></div><pre id="report">正在验证…</pre><div id="chat"></div><script>window.jQuery=fn=>fn();window.toastr={info:console.info,success:console.info};</script><script type="module">
import {getContext} from '/scripts/extensions.js';
const p=window.preview;function draw(){document.getElementById('chat').innerHTML=p.chat.map((m,i)=>'<div class="mes" mesid="'+i+'"><div class="mes_text">'+m.mes+'</div></div>').join('');}draw();
const nativeFetch=window.fetch.bind(window);window.fetch=async(url,options)=>{if(url==='/api/plugins/miao-nai-queue/health')return Response.json({ready:true,remote:false});if(url==='/api/novelai/generate-image'){p.calls.push(JSON.parse(options.body));return new Response('aGVsbG8=');}if(url==='/api/images/list')return Response.json(p.files);if(url==='/api/images/delete'){const name=JSON.parse(options.body).path.split('/').at(-1);p.files=p.files.filter(f=>f!==name);return new Response('OK');}return nativeFetch(url,options);};
await import('${prefix}index.js');const wait=()=>new Promise(r=>setTimeout(r,180));await wait();
const results=[];const check=(condition,label)=>{results.push((condition?'PASS ':'FAIL ')+label);if(!condition)throw Error(label);};
try{
check(document.querySelectorAll('.miao-image-card').length===2,'#3 与 #5 都显示按钮');check(p.calls.length===0,'手动模式载入零请求');
p.settings.mode='auto';await p.emit('CHAT_CHANGED');await p.emit('CHARACTER_MESSAGE_RENDERED');await wait();check(p.calls.length===1&&p.calls[0].prompt.includes('fifth'),'载入自动模式只生成 #5，渲染事件不覆盖载入事件');
await p.emit('CHAT_CHANGED');await wait();check(p.calls.length===1,'重复载入不重复生成');
document.querySelector('[mesid="3"] button').click();await wait();check(p.calls.length===2&&p.calls[1].prompt.includes('third'),'旧楼层可以手动生成');
p.settings.mode='stream';p.chat.push({name:'Preview',mes:'image###partial',extra:{}});draw();await p.emit('GENERATION_STARTED');await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===2,'半截标签不发请求');
p.chat.at(-1).mes='image###stream complete###';draw();await p.emit('STREAM_TOKEN_RECEIVED');await wait();check(p.calls.length===3&&p.calls[2].prompt.includes('stream complete'),'闭合标签立即生成最新楼层');await p.emit('GENERATION_ENDED');await wait();check(p.calls.length===3,'回复结束不重复生成');
check(!document.querySelector('#extensions_settings .miao-settings'),'扩展列表没有设置面板');
}catch(error){results.push(error.stack);}document.getElementById('report').textContent=results.join('\\n');
document.getElementById('miao-nai-menu').click();
</script>`;
const server=http.createServer(async(req,res)=>{try{
let body,type='text/javascript';
if(req.url==='/'){body=html;type='text/html';}
else if(req.url==='/scripts/extensions.js')body=mock;
else if(req.url==='/scripts/popup.js')body=popup;
else if(req.url==='/scripts/utils.js')body=`export async function saveBase64AsFile(){return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';}`;
else if(req.url==='/scripts/secrets.js')body=`export const SECRET_KEYS={NOVEL:'novel'};export async function writeSecret(){}`;
else if(req.url==='/scripts/world-info.js')body=`export const world_names=[],selected_world_info=[];export function onWorldInfoChange(){};export async function importWorldInfo(){}`;
else if(req.url==='/scripts/extensions/regex/engine.js')body=`export const SCRIPT_TYPES={GLOBAL:0};export function getScriptsByType(){return [];}export async function saveScriptsByType(){}`;
else if(req.url.startsWith(prefix)){const file=req.url.slice(prefix.length);if(!['index.js','core.js','cloud-queue.js','ui.js','style.css'].includes(file))throw Error('Not found');body=await readFile(new URL(file,root));if(file.endsWith('.css'))type='text/css';}
else if(req.url.startsWith('/user/images/')){body=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');type='image/png';}
else{res.writeHead(404);res.end();return;}
res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(body);
}catch(e){res.writeHead(500);res.end(e.message);}});
server.listen(8766,'127.0.0.1',()=>console.log('Isolated preview: http://127.0.0.1:8766'));

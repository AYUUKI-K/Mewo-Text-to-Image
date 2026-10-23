export const defaults = {name:'默认',positive:'best quality, masterpiece',negative:'lowres, bad anatomy, text, watermark',model:'nai-diffusion-4-5-full',sampler:'k_euler_ancestral',scheduler:'karras',width:512,height:512,steps:20,scale:5,seed:-1};
export function normalizeProfile(profile) {
    const merged={...defaults,...profile};
    merged.positive=[merged.positive,merged.artists].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()).join(',\n');
    delete merged.artists;
    return merged;
}
export function imageURL(folder,name) {
    validateFolder(folder);
    if(!imageDay(name))throw new Error('不是可管理的生成图片');
    return `/user/images/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
}
// The last floor must itself be an assistant reply. Never fall back to older tags.
export function latestImageMessage(chat) {
    const message = chat.at(-1);
    return message && !message.is_user && !message.is_system ? message : null;
}
export function canAutoGenerate(chat, message, mode, streaming = false) {
    return latestImageMessage(chat) === message && (mode === 'stream' || (mode === 'auto' && !streaming));
}
export function validateFolder(value) {
    if(typeof value!=='string'||!value.trim()||value.length>64||!/^[\p{L}\p{N}_ -]+$/u.test(value))throw new Error('目录名可用中英文、数字、空格、短横线和下划线，最多 64 字；不支持绝对路径');
    return value.trim();
}
export function imageDay(filename) {
    const match=/^(?:miao|test)-(\d{13})(?:-[\da-f-]+)?\.png$/i.exec(filename);
    if(!match)return null;
    const date=new Date(Number(match[1]));
    if(!Number.isFinite(date.getTime()))return null;
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function parseBlocks(text, pattern = 'image###([\\s\\S]*?)###') {
    const regex = new RegExp(pattern, 'gi');
    return [...String(text).matchAll(regex)].filter(m => m[1]?.trim()).map((m, index) => ({index, raw:m[0], prompt:m[1].trim(), start:m.index}));
}
export const sizePresets=[{name:'方图',width:1024,height:1024},{name:'竖图',width:832,height:1216},{name:'横图',width:1216,height:832}];
export function delimiterPattern(start,end) {
    if(typeof start!=='string'||typeof end!=='string'||!start||!end)throw new Error('起始标签和结束标签都要填写喵');
    const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return `${escape(start)}([\\s\\S]*?)${escape(end)}`;
}
export function buildRequest(profile, prompt) {
    const p = normalizeProfile(profile);
    for (const key of ['width','height']) if (!Number.isInteger(+p[key]) || +p[key]<64 || +p[key]>2048 || +p[key]%64) throw new Error('宽高须为 64～2048 的 64 倍数');
    if (+p.width * +p.height > 2097152) throw new Error('画布总像素不能超过 2097152');
    if (!Number.isInteger(+p.steps) || +p.steps<1 || +p.steps>50) throw new Error('步数须为 1～50');
    if (!Number.isFinite(+p.scale) || +p.scale<0 || +p.scale>10) throw new Error('Guidance 须为 0～10');
    if (!Number.isInteger(+p.seed) || +p.seed < -1 || +p.seed > 4294967295) throw new Error('种子须为 -1 或 0～4294967295');
    return {prompt:[p.positive,prompt].map(s=>s.trim()).filter(Boolean).join(',\n'),negative_prompt:p.negative,model:p.model,sampler:p.sampler,scheduler:p.scheduler,width:+p.width,height:+p.height,steps:+p.steps,scale:+p.scale,seed:+p.seed<0?Math.floor(Math.random()*4294967296):+p.seed,sm:false,sm_dyn:false,upscale_ratio:1,decrisper:false,variety_boost:false};
}

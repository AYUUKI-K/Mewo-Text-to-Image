export const defaults = {name:'默认',positive:'best quality, masterpiece',artists:'',negative:'lowres, bad anatomy, text, watermark',model:'nai-diffusion-4-5-full',sampler:'k_euler_ancestral',scheduler:'karras',width:512,height:512,steps:20,scale:5,seed:-1};
export function parseBlocks(text, pattern = 'image###([\\s\\S]*?)###') {
    const regex = new RegExp(pattern, 'gi');
    return [...String(text).matchAll(regex)].filter(m => m[1]?.trim()).map((m, index) => ({index, raw:m[0], prompt:m[1].trim(), start:m.index}));
}
export function buildRequest(profile, prompt) {
    const p = {...defaults, ...profile};
    for (const key of ['width','height']) if (!Number.isInteger(+p[key]) || +p[key]<64 || +p[key]>2048 || +p[key]%64) throw new Error('宽高须为 64～2048 的 64 倍数');
    if (+p.width * +p.height > 2097152) throw new Error('画布总像素不能超过 2097152');
    if (!Number.isInteger(+p.steps) || +p.steps<1 || +p.steps>50) throw new Error('步数须为 1～50');
    if (!Number.isFinite(+p.scale) || +p.scale<0 || +p.scale>10) throw new Error('Guidance 须为 0～10');
    if (!Number.isInteger(+p.seed) || +p.seed < -1 || +p.seed > 4294967295) throw new Error('种子须为 -1 或 0～4294967295');
    return {prompt:[p.positive,p.artists,prompt].map(s=>s.trim()).filter(Boolean).join(',\n'),negative_prompt:p.negative,model:p.model,sampler:p.sampler,scheduler:p.scheduler,width:+p.width,height:+p.height,steps:+p.steps,scale:+p.scale,seed:+p.seed<0?Math.floor(Math.random()*4294967296):+p.seed,sm:false,sm_dyn:false,upscale_ratio:1,decrisper:false,variety_boost:false};
}

// File schema and model encoding keys follow the official NovelAI image client.
export const vibeModelKeys={'nai-diffusion-4-5-full':'v4-5full','nai-diffusion-4-5-curated':'v4-5curated','nai-diffusion-4-full':'v4full','nai-diffusion-4-curated-preview':'v4curated'};
export function importVibeData(data,fallbackName='Vibe'){
    const sources=Array.isArray(data?.vibes)?data.vibes:[data];
    if(!sources.length||sources.length>64)throw Error('一次最多导入 64 个 Vibe');
    return sources.map((source,index)=>{
        const encodings={};
        for(const [model,variants] of Object.entries(source?.encodings||{})){
            if(!Object.values(vibeModelKeys).includes(model))continue;
            for(const [key,variant] of Object.entries(variants||{})){
                if(!/^[a-zA-Z0-9_.-]{1,128}$/.test(key)||['__proto__','constructor','prototype'].includes(key))continue;
                if(!variant?.encoding||!validBase64(variant.encoding))continue;
                const info=Number(variant.params?.information_extracted??1);
                if(!Number.isFinite(info)||info<0||info>1||variant.params?.mask)continue;
                (encodings[model]??={})[key]={encoding:variant.encoding,params:{information_extracted:info}};
            }
        }
        const image=source?.image?stripImage(source.image):null;
        if(!Object.keys(encodings).length&&!image)throw Error('没有可用的 Vibe 编码或原图；带遮罩的 Vibe 暂不支持');
        return {name:String(source?.name||fallbackName+(sources.length>1?` ${index+1}`:'')).slice(0,100),encodings,image,thumbnail:source?.thumbnail?safeThumbnail(source.thumbnail):null};
    });
}
export function validBase64(value){return typeof value==='string'&&value.length>0&&value.length<=16*1024*1024&&/^[A-Za-z0-9+/]+={0,2}$/.test(value);}
export function stripImage(value){const raw=String(value).replace(/^data:image\/(?:png|jpeg|webp);base64,/, '');if(!validBase64(raw))throw Error('图片数据无效或超过 12 MB');return raw;}
function safeThumbnail(value){try{return 'data:image/png;base64,'+stripImage(value);}catch{return null;}}
export function vibeSummary(item){return {id:item.id,name:item.name,thumbnail:item.thumbnail,hasImage:!!item.image,variants:Object.entries(item.encodings).flatMap(([model,variants])=>Object.entries(variants).map(([key,v])=>({model,key,information:v.params.information_extracted}))) };}
export function resolveVibes(model,bindings,library){
    if(bindings!==undefined&&!Array.isArray(bindings))throw Error('Vibe 列表格式错误');
    if(!bindings?.length)return {};
    if(bindings.length>16)throw Error('最多同时启用 16 个 Vibe');
    const modelKey=vibeModelKeys[model];if(!modelKey)throw Error('当前 Vibe 支持 V4 / V4.5 模型，请切换模型');
    const images=[],strengths=[];
    for(const binding of bindings){
        const vibe=library.find(v=>v.id===binding.id),variant=vibe?.encodings?.[modelKey]?.[binding.key];
        if(!variant)throw Error(`Vibe「${vibe?.name||binding.id}」缺少当前模型的编码，请重新选择或编码`);
        const strength=Number(binding.strength??0.6);if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('Vibe 强度应为 0～1');
        images.push(variant.encoding);strengths.push(strength);
    }
    return {reference_image_multiple:images,reference_strength_multiple:strengths,reference_information_extracted_multiple:images.map(()=>1)};
}

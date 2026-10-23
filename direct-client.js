import {importVibeData,resolveVibes,vibeSummary,vibeModelKeys,stripImage} from './vibe.js';

export function base64Bytes(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
export function naiPayload(request,references={}){
    return {action:'generate',input:request.prompt,model:request.model,parameters:{params_version:3,width:request.width,height:request.height,steps:request.steps,scale:request.scale,seed:request.seed,sampler:request.sampler,noise_schedule:request.scheduler,n_samples:1,negative_prompt:request.negative_prompt,qualityToggle:false,ucPreset:0,sm:false,sm_dyn:false,dynamic_thresholding:false,legacy:false,legacy_v3_extend:false,add_original_image:false,controlnet_strength:1,deliberate_euler_ancestral_bug:false,prefer_brownian:true,cfg_rescale:0,uncond_scale:1,use_coords:false,characterPrompts:[],...references,v4_prompt:{caption:{base_caption:request.prompt,char_captions:[]},use_coords:false,use_order:true},v4_negative_prompt:{caption:{base_caption:request.negative_prompt,char_captions:[]}}}};
}
export function createDirectClient({settings,save,getHeaders,getKey,unzipPNG,fetchImpl=fetch}){
    settings.vibeLibrary??=[];
    const filename=id=>{if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('无效 Vibe ID');return `miao-vibe-${id}.json`;};
    const filePath=id=>'/user/files/'+filename(id);
    const st=async(endpoint,body)=>{
        const response=await fetchImpl('/api/files/'+endpoint,{method:'POST',headers:getHeaders(),body:JSON.stringify(body)});
        if(!response.ok)throw Error(`酒馆文件接口 HTTP ${response.status}，请更新酒馆后重试`);return response;
    };
    const read=async id=>{
        if(!settings.vibeLibrary.some(item=>item.id===id))throw Error('Vibe 已从列表删除');
        const response=await fetchImpl(filePath(id),{cache:'no-store'});if(!response.ok)throw Error('Vibe 文件读取失败，请重新导入');
        const item=await response.json();if(item.id!==id)throw Error('Vibe 文件标识不匹配');return item;
    };
    const write=async item=>{
        const data=base64Bytes(new TextEncoder().encode(JSON.stringify(item)));
        const result=await (await st('upload',{name:filename(item.id),data})).json();
        if('/'+String(result.path).replace(/^\//,'')!==filePath(item.id))throw Error('酒馆返回了意外的 Vibe 文件路径');
        const summary=vibeSummary(item),index=settings.vibeLibrary.findIndex(v=>v.id===item.id);
        if(index<0)settings.vibeLibrary.push(summary);else settings.vibeLibrary[index]=summary;save();return summary;
    };
    const nai=async(endpoint,body)=>{
        const key=await getKey();if(!key)throw Error('请先在「生成」页重新填写并保存 NAI Key，用于当前浏览器直连');
        let response;
        try{response=await fetchImpl('https://image.novelai.net/ai/'+endpoint,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});}
        catch(error){if(error.name==='TypeError'){const friendly=Error('无法从当前设备连接 NovelAI，请检查设备网络。请求结果不确定，不会自动重试。');friendly.name='TypeError';throw friendly;}throw error;}
        if(!response.ok){const text=(await response.text()).split(key).join('[已隐藏]');throw Error(`NAI HTTP ${response.status}\n${text.slice(0,1200)}`);}return response;
    };
    return {
        async list(){return structuredClone(settings.vibeLibrary);},
        async import({data,name,image}){
            const items=image?importVibeData({name,image:stripImage(image),encodings:{}},name):importVibeData(data,name);
            if(settings.vibeLibrary.length+items.length>128)throw Error('最多保存 128 个 Vibe，请先清理列表');
            const saved=[];for(const item of items){item.id=crypto.randomUUID();saved.push(await write(item));}return saved;
        },
        async rename({id,name}){const item=await read(id);item.name=String(name||'Vibe').slice(0,100);return write(item);},
        async delete(id){await st('delete',{path:filePath(id)});settings.vibeLibrary=settings.vibeLibrary.filter(item=>item.id!==id);save();},
        async encode({id,model,information}){
            information=Number(information);const modelKey=vibeModelKeys[model];
            if(!modelKey||!Number.isFinite(information)||information<0||information>1)throw Error('请选择 V4/V4.5 模型，信息提取量为 0～1');
            let item=await read(id);const key='miao-'+information;
            if(item.encodings?.[modelKey]?.[key])return vibeSummary(item);
            if(!item.image)throw Error('这个 Vibe 没有原图，无法重新编码');
            const response=await nai('encode-vibe',{image:item.image,model,information_extracted:information});
            const encoding=base64Bytes(new Uint8Array(await response.arrayBuffer()));if(!encoding)throw Error('NAI 未返回 Vibe 编码');
            item=await read(id);(item.encodings[modelKey]??={})[key]={encoding,params:{information_extracted:information}};return write(item);
        },
        async generate(request){
            if(!Array.isArray(request.vibes)||request.vibes.length>4)throw Error('Vibe 列表格式错误，本插件最多启用 4 个');
            const library=[];for(const binding of request.vibes||[]){const item=await read(binding.id);library.push({id:item.id,name:item.name,encodings:item.encodings});}
            const references=resolveVibes(request.model,request.vibes,library);
            const response=await nai('generate-image',naiPayload(request,references));
            return unzipPNG(new Uint8Array(await response.arrayBuffer()));
        },
    };
}

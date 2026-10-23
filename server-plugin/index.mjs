import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {buildRequest} from '../core.js';
import {importVibeData,vibeSummary,vibeModelKeys,resolveVibes,stripImage} from '../vibe.js';

export const info={id:'miao-nai-image',name:'喵喵文生图 · Vibe',description:'用户隔离的 Vibe 文件管理与 NovelAI 转发'};
export async function init(router){
    const secrets=await import(pathToFileURL(path.resolve('src/endpoints/secrets.js')).href);
    const util=await import(pathToFileURL(path.resolve('src/util.js')).href);
    registerRoutes(router,{readKey:req=>secrets.readSecret(req.user.directories,secrets.SECRET_KEYS.NOVEL),extractPNG:buffer=>util.extractFileFromZipBuffer(buffer,'.png')});
}
export function registerRoutes(router,{readKey,extractPNG,fetchImpl=fetch}){
    const safe=fn=>async(req,res)=>{try{
        if(!req.user?.directories?.root)return res.status(401).json({error:'需要登录酒馆'});
        await fn(req,res);
    }catch(e){res.status(e.status||400).json({error:String(e.message||e).slice(0,1600)});}};
    const root=req=>path.join(req.user.directories.root,'miao-vibes');
    const file=(req,id)=>{if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('无效 Vibe ID');return path.join(root(req),id+'.json');};
    const read=async(req,id)=>JSON.parse(await fs.readFile(file(req,id),'utf8'));
    const write=async(req,item)=>{await fs.mkdir(root(req),{recursive:true});const target=file(req,item.id),tmp=target+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(item));await fs.rename(tmp,target);}finally{await fs.rm(tmp,{force:true});}};
    const library=async req=>{await fs.mkdir(root(req),{recursive:true});const names=(await fs.readdir(root(req))).filter(n=>/^[a-f0-9-]{36}\.json$/i.test(n));const result=[];for(const name of names)result.push(vibeSummary(await read(req,name.slice(0,-5))));return result;};
    const nai=async(req,endpoint,data)=>{
        const key=await readKey(req);if(!key)throw Error('请先保存 NovelAI Key');
        const response=await fetchImpl('https://image.novelai.net/ai/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(180000)});
        if(!response.ok){const text=await response.text();const err=Error(`NAI HTTP ${response.status}\n${text.slice(0,1200)}`);err.status=502;throw err;}
        return response;
    };
    router.get('/health',safe(async(req,res)=>res.json({ready:true,vibe:true,version:'0.5.0'})));
    router.get('/vibes',safe(async(req,res)=>res.json(await library(req))));
    router.post('/vibes/import',safe(async(req,res)=>{
        if(JSON.stringify(req.body).length>24*1024*1024)throw Error('单次导入不能超过 24 MB');
        const {data,name,image}=req.body;
        const imported=image?[{name:String(name||'Vibe').slice(0,100),image:stripImage(image),encodings:{},thumbnail:null}]:importVibeData(data,name);
        if((await library(req)).length+imported.length>128)throw Error('最多保存 128 个 Vibe，请先清理列表');
        const saved=[];for(const item of imported){item.id=randomUUID();await write(req,item);saved.push(vibeSummary(item));}res.json(saved);
    }));
    router.post('/vibes/delete',safe(async(req,res)=>{await fs.rm(file(req,req.body.id),{force:true});res.json({deleted:true});}));
    router.post('/vibes/rename',safe(async(req,res)=>{const item=await read(req,req.body.id);item.name=String(req.body.name||'Vibe').slice(0,100);await write(req,item);res.json(vibeSummary(item));}));
    // Explicit action only: never encode automatically during generation.
    router.post('/vibes/encode',safe(async(req,res)=>{
        const {id,model}=req.body,information=Number(req.body.information),modelKey=vibeModelKeys[model];
        if(!modelKey||!Number.isFinite(information)||information<0||information>1)throw Error('请选择 V4/V4.5 模型，信息提取量为 0～1');
        let item=await read(req,id);if(!item.image)throw Error('这个 Vibe 没有原图，不能重新编码');
        const key='miao-'+information;
        if(item.encodings?.[modelKey]?.[key])return res.json(vibeSummary(item));
        const response=await nai(req,'encode-vibe',{image:item.image,model,information_extracted:information});
        const encoding=Buffer.from(await response.arrayBuffer()).toString('base64');
        if(!encoding)throw Error('NAI 未返回 Vibe 编码');
        item=await read(req,id);(item.encodings[modelKey]??={})[key]={encoding,params:{information_extracted:information}};
        await write(req,item);res.json(vibeSummary(item));
    }));
    router.post('/generate-image',safe(async(req,res)=>{
        const input=req.body,request=buildRequest({...input,positive:input.prompt||'',negative:input.negative_prompt||''},'');
        if(!vibeModelKeys[request.model])throw Error('Vibe 生图只支持 V4 / V4.5');
        if(!Array.isArray(input.vibes)||input.vibes.length>16)throw Error('Vibe 列表格式错误，最多启用 16 个');
        const selected=[];for(const binding of input.vibes){const item=await read(req,binding.id);selected.push({id:item.id,name:item.name,encodings:item.encodings});}
        const references=resolveVibes(request.model,input.vibes,selected);
        const data={action:'generate',input:request.prompt,model:request.model,parameters:{params_version:3,width:request.width,height:request.height,steps:request.steps,scale:request.scale,seed:request.seed,sampler:request.sampler,noise_schedule:request.scheduler,n_samples:1,negative_prompt:request.negative_prompt,qualityToggle:false,ucPreset:0,sm:false,sm_dyn:false,dynamic_thresholding:false,legacy:false,legacy_v3_extend:false,add_original_image:false,controlnet_strength:1,deliberate_euler_ancestral_bug:false,prefer_brownian:true,cfg_rescale:0,uncond_scale:1,use_coords:false,characterPrompts:[],...references,v4_prompt:{caption:{base_caption:request.prompt,char_captions:[]},use_coords:false,use_order:true},v4_negative_prompt:{caption:{base_caption:request.negative_prompt,char_captions:[]}}}};
        const response=await nai(req,'generate-image',data),png=await extractPNG(Buffer.from(await response.arrayBuffer()));
        if(!png)throw Error('NAI 返回结果中没有 PNG 图片');res.type('text/plain').send(png.toString('base64'));
    }));
}

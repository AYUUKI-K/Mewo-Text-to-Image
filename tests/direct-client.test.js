import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectClient,naiPayload} from '../direct-client.js';
import {buildRequest,defaults} from '../core.js';
import {createKeyVault} from '../direct-key.js';

test('frontend-only Vibe uses existing ST file API and sends key only to NovelAI',async()=>{
 const settings={},files=new Map(),requests=[];let encodes=0;
 const fetchImpl=async(url,options={})=>{
 requests.push({url,options});
 if(url==='/api/files/upload'){const body=JSON.parse(options.body);files.set('/user/files/'+body.name,JSON.parse(Buffer.from(body.data,'base64').toString('utf8')));return Response.json({path:'/user/files/'+body.name});}
 if(url==='/api/files/delete'){files.delete(JSON.parse(options.body).path);return new Response('OK');}
 if(url.startsWith('/user/files/'))return files.has(url)?Response.json(files.get(url)):new Response('missing',{status:404});
 if(url==='https://image.novelai.net/ai/encode-vibe'){encodes++;return new Response(Buffer.from('encoding'));}
 if(url==='https://image.novelai.net/ai/generate-image')return new Response(Buffer.from('zip fixture'));
 throw Error('Unexpected endpoint '+url);
 };
 const client=createDirectClient({settings,save(){},getHeaders:()=>({'Content-Type':'application/json'}),getKey:async()=>'test-only-key',unzipPNG:async()=>Buffer.from('PNG').toString('base64'),fetchImpl});
 const [item]=await client.import({data:{name:'中文 Vibe',encodings:{'v4-5full':{hash:{encoding:'YWJj',params:{information_extracted:0.6}}}}}});
 assert.equal((await client.list())[0].name,'中文 Vibe');
 const image=await client.generate({prompt:'cat',negative_prompt:'bad',model:'nai-diffusion-4-5-full',width:512,height:512,steps:20,scale:5,seed:1,sampler:'k_euler_ancestral',scheduler:'karras',vibes:[{id:item.id,key:'hash',strength:0.4}]});
 assert.equal(image,Buffer.from('PNG').toString('base64'));
 const generation=requests.find(r=>r.url.endsWith('/ai/generate-image'));
 assert.equal(generation.options.headers.Authorization,'Bearer test-only-key');assert.equal(generation.options.credentials,'omit');
 assert.deepEqual(JSON.parse(generation.options.body).parameters.reference_image_multiple,['YWJj']);
 assert.equal(requests.filter(r=>!r.url.startsWith('https://image.novelai.net')).some(r=>JSON.stringify(r).includes('test-only-key')),false);
 assert.equal(JSON.stringify(settings).includes('test-only-key'),false);assert.equal(JSON.stringify([...files.values()]).includes('test-only-key'),false);
 await client.rename({id:item.id,name:'renamed'});assert.equal((await client.list())[0].name,'renamed');
 const [raw]=await client.import({image:'aW1hZ2U=',name:'raw'});
 await client.encode({id:raw.id,model:'nai-diffusion-4-5-full',information:1});await client.encode({id:raw.id,model:'nai-diffusion-4-5-full',information:1});assert.equal(encodes,1);
 await client.delete(item.id);assert.equal((await client.list()).length,1);
});
test('direct Key stays in page memory by default and can be cleared without server changes',async()=>{
 const vault=createKeyVault('user-a',{indexedDBImpl:null});await vault.set('page-only-key',false);assert.equal(await vault.get(),'page-only-key');await vault.clear();assert.equal(await vault.get(),'');
 await assert.rejects(vault.set('key',true),/浏览器/);
 const other=createKeyVault('user-b',{indexedDBImpl:null});assert.equal(await other.get(),'');
});

test('V5 Full and Curated preserve model IDs and ordered positive parts in the direct payload',()=>{
 for(const model of ['nai-diffusion-5-full','nai-diffusion-5-curated']){
  const request=buildRequest({...defaults,model,positive:'front',positiveSuffix:'back'},'scene');
  const payload=naiPayload(request);
  assert.equal(payload.model,model);assert.equal(payload.input,'front,\nscene,\nback,');
  assert.equal(payload.parameters.v4_prompt.caption.base_caption,payload.input);
  assert.equal(payload.parameters.v4_negative_prompt.caption.base_caption,defaults.negative);
 }
});
test('uncertain direct network failures retain TypeError so queue lease is not released early',async()=>{
 const settings={vibeLibrary:[]};const client=createDirectClient({settings,save(){},getHeaders:()=>({}),getKey:async()=>'test-key',unzipPNG:async()=>'',fetchImpl:async()=>{throw new TypeError('network');}});
 await assert.rejects(client.generate({model:'nai-diffusion-4-5-full',vibes:[]}),e=>e.name==='TypeError'&&e.message.includes('不确定'));
});

test('queued direct generation passes its original key fingerprint and stops before NAI when the key changes',async()=>{
 let calls=0;
 const client=createDirectClient({settings:{vibeLibrary:[]},save(){},getHeaders:()=>({}),getKey:async expected=>{assert.equal(expected,'original-key-hash');throw Error('NAI Key 已更换');},unzipPNG:async()=>'',fetchImpl:async()=>{calls++;return new Response('not expected');}});
 await assert.rejects(client.generate({model:'nai-diffusion-4-5-full',vibes:[]},{expectedKeyHash:'original-key-hash'}),/Key 已更换/);assert.equal(calls,0);
});

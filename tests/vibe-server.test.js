import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {registerRoutes} from '../server-plugin/index.mjs';
test('Vibe server isolates user files, forwards encodings and uses saved server key only',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'miao-vibe-test-'));
 try{
 const routes=new Map(),requests=[];let encodeCalls=0;
 registerRoutes({get:(p,fn)=>routes.set('GET '+p,fn),post:(p,fn)=>routes.set('POST '+p,fn)},{readKey:req=>'saved-test-secret',extractPNG:async()=>Buffer.from('PNG'),fetchImpl:async(url,options)=>{requests.push({url,body:JSON.parse(options.body),authorization:options.headers.Authorization});if(url.endsWith('encode-vibe')){encodeCalls++;return new Response(Buffer.from('encoded'));}return new Response(Buffer.from('archive'));}});
 const call=async(method,p,body={},user='a')=>{
 let result,status=200;
 const res={status(n){status=n;return this;},type(){return this;},json(data){result=data;return this;},send(data){result=data;return this;}};
 await routes.get(method+' '+p)({body,user:{directories:{root:path.join(root,user)}}},res);return {data:result,status};
 };
 const imported=await call('POST','/vibes/import',{data:{name:'official',encodings:{'v4-5full':{hash:{encoding:'YWJj',params:{information_extracted:0.7}}}}}});
 assert.equal(imported.status,200);const id=imported.data[0].id;
 assert.equal((await call('GET','/vibes',{},'b')).data.length,0);
 assert.equal((await call('GET','/vibes')).data[0].encodings,undefined);
 const request={model:'nai-diffusion-4-5-full',prompt:'scene',negative_prompt:'bad',width:512,height:512,steps:20,scale:5,seed:1,vibes:[{id,key:'hash',strength:0.5}]};
 const generated=await call('POST','/generate-image',request);
 assert.equal(generated.status,200);assert.equal(generated.data,Buffer.from('PNG').toString('base64'));
 assert.deepEqual(requests[0].body.parameters.reference_image_multiple,['YWJj']);assert.equal(requests[0].authorization,'Bearer saved-test-secret');assert.equal(requests[0].body.input,'scene,');
 await call('POST','/generate-image',{...request,prompt:'quality,\nscene,'});
 assert.equal(requests[1].body.input,'quality,\nscene,');
 assert.equal(requests[1].body.parameters.v4_prompt.caption.base_caption,'quality,\nscene,');
 assert.equal((await call('POST','/generate-image',request,'b')).status,400);
 assert.equal((await call('POST','/vibes/delete',{id:'../other'})).status,400);
 const raw=(await call('POST','/vibes/import',{name:'raw',image:'aW1hZ2U='})).data[0];
 const encode={id:raw.id,model:request.model,information:0.8};
 assert.equal((await call('POST','/vibes/encode',encode)).status,200);await call('POST','/vibes/encode',encode);assert.equal(encodeCalls,1);
 await call('POST','/vibes/delete',{id});assert.equal((await call('GET','/vibes')).data.length,1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

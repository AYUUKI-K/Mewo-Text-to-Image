import test from 'node:test';import assert from 'node:assert/strict';
import {createExtensionUpdater} from '../updates.js';
import {downloadImageSelection} from '../downloads.js';
test('update checks cache and only update this installed extension in its own scope',async()=>{
    const calls=[];
    const updater=createExtensionUpdater({moduleURL:'https://tavern/scripts/extensions/third-party/Mewo-Text-to-Image/index.js',getGlobal:name=>name==='third-party/Mewo-Text-to-Image',getHeaders:()=>({'X-CSRF-Token':'test'}),fetchImpl:async(url,options)=>{calls.push({url,...JSON.parse(options.body)});return Response.json({isUpToDate:false});}});
    await Promise.all([updater.check(),updater.check()]);await updater.check();assert.equal(calls.length,1);
    await updater.check(true);assert.equal(calls.length,2);
    await updater.install();assert.equal((await updater.check()).needsReload,true);assert.equal(calls.length,4);
    assert.deepEqual(calls.map(c=>c.url),['/api/extensions/version','/api/extensions/version','/api/extensions/update','/api/extensions/version']);
    for(const call of calls){assert.equal(call.extensionName,'Mewo-Text-to-Image');assert.equal(call.global,true);}
    assert.throws(()=>createExtensionUpdater({moduleURL:'https://example.com/index.js'}),/安装目录/);
});
test('failed update remains an error and never pretends it was installed',async()=>{
    const updater=createExtensionUpdater({moduleURL:'https://tavern/third-party/miao/index.js',getHeaders:()=>({}),fetchImpl:async()=>new Response('Forbidden',{status:403})});
    await assert.rejects(updater.install(),/403/);await assert.rejects(updater.check(),/403/);
});
test('selected images download separately with original names and image contents',async()=>{
    const requests=[],saves=[];
    await downloadImageSelection([{name:'first.png',url:'/first'},{name:'second.png',url:'/second'}],{
        fetchImpl:async url=>{requests.push(url);return new Response(url,{headers:{'Content-Type':'image/png'}});},
        saveBlob:async(blob,name)=>saves.push({name,type:blob.type,content:await blob.text()})});
    assert.deepEqual(requests,['/first','/second']);
    assert.deepEqual(saves,[{name:'first.png',type:'image/png',content:'/first'},{name:'second.png',type:'image/png',content:'/second'}]);
});

test('empty or failed selection produces no download',async()=>{
    let saves=0;const options={fetchImpl:async()=>new Response('',{status:404}),saveBlob:()=>saves++};
    await assert.rejects(downloadImageSelection([],options),/勾选/);
    await assert.rejects(downloadImageSelection([{name:'missing.png',url:'/missing'}],options),/missing.png.*404/);assert.equal(saves,0);
});

test('native export cancellation stops the remaining selected downloads',async()=>{
    const requests=[];await downloadImageSelection([{name:'a.png',url:'/a'},{name:'b.png',url:'/b'}],{
        fetchImpl:async url=>{requests.push(url);return new Response('png');},saveBlob:async()=>({delivered:false})});
    assert.deepEqual(requests,['/a']);
});

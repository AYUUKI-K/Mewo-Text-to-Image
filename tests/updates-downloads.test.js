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
test('selected images become one zip with original filenames, excluding unselected images',async()=>{
    const files=[],requests=[],saves=[];
    await downloadImageSelection([{name:'first.png',url:'/first'},{name:'second.png',url:'/second'}],{
        makeArchive:async()=>({file:(name,data)=>files.push({name,data}),generateAsync:async()=>new Blob(['zip'])}),
        fetchImpl:async url=>{requests.push(url);return new Response('image');},saveBlob:async(blob,name)=>saves.push({blob,name})});
    assert.deepEqual(requests,['/first','/second']);assert.deepEqual(files.map(f=>f.name),['first.png','second.png']);
    assert.equal(saves.length,1);assert.equal(saves[0].name,'miao-images-2.zip');
});
test('empty or failed selection produces no download archive',async()=>{
    let saves=0;const options={makeArchive:async()=>({file(){},generateAsync:async()=>new Blob()}),fetchImpl:async()=>new Response('',{status:404}),saveBlob:()=>saves++};
    await assert.rejects(downloadImageSelection([],options),/勾选/);
    await assert.rejects(downloadImageSelection([{name:'missing.png',url:'/missing'}],options),/404/);assert.equal(saves,0);
});

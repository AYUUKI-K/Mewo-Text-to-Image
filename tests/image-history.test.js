import test from 'node:test';import assert from 'node:assert/strict';import {appendImageVersion,imageVersions} from '../image-history.js';
test('reroll retains original image and request, adding versions at the same position',()=>{const original={url:'first.png',request:{prompt:'first'},created:1};const second=appendImageVersion(original,{url:'second.png',request:{prompt:'second'},created:2});assert.equal(second.selected,1);assert.equal(imageVersions(second)[0].url,'first.png');second.selected=0;const third=appendImageVersion(second,{url:'third.png',request:{prompt:'third'},created:3});assert.deepEqual(third.versions.map(v=>v.url),['first.png','second.png','third.png']);assert.equal(third.versions[1].request.prompt,'second');assert.equal(third.selected,2);assert.deepEqual(imageVersions(null),[]);});
import {resolveVibes} from '../vibe.js';
import {selectImageVersion} from '../image-history.js';
test('previous and next update the live record, survive serialization and skip deleted versions',()=>{
 let record=appendImageVersion({url:'first.png',request:{prompt:'first'},created:1},{url:'second.png',request:{prompt:'second'},created:2});
 assert.equal(selectImageVersion(record,-1).url,'first.png');assert.equal(record.selected,0);assert.equal(record.request.prompt,'first');
 record=JSON.parse(JSON.stringify(record));
 assert.equal(selectImageVersion(record,1).url,'second.png');assert.equal(record.selected,1);
 record.versions.push({url:'deleted.png',deleted:true});
 assert.equal(selectImageVersion(record,1).url,'first.png');
 assert.equal(selectImageVersion(record,-1).url,'second.png');
 assert.equal(selectImageVersion({versions:[{url:'gone.png',deleted:true}]},1),null);
});
test('more than four Vibes rejected before image generation',()=>{assert.throws(()=>resolveVibes('nai-diffusion-4-5-full',Array.from({length:5},()=>({id:'a',key:'a'})),[]),/4/);});
test('each version keeps its profile name through selection, JSON reload and legacy records',()=>{
 let record=appendImageVersion({url:'one.png',profileName:'配置 A',request:{vibes:[{name:'Vibe A'}]}},{url:'two.png',profileName:'配置 B',request:{vibes:[{name:'Vibe B'}]}});
 record=JSON.parse(JSON.stringify(record));
 assert.equal(selectImageVersion(record,-1).profileName,'配置 A');
 assert.equal(record.request.vibes[0].name,'Vibe A');
 assert.equal(selectImageVersion(record,1).profileName,'配置 B');
 const old=appendImageVersion({url:'legacy.png',request:{}},{url:'new.png',profileName:'配置 C',request:{}});
 assert.equal(selectImageVersion(old,-1).profileName,undefined);
});

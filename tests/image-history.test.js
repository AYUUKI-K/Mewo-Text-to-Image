import test from 'node:test';import assert from 'node:assert/strict';import {appendImageVersion,imageVersions} from '../image-history.js';
test('reroll retains original image and request, adding versions at the same position',()=>{const original={url:'first.png',request:{prompt:'first'},created:1};const second=appendImageVersion(original,{url:'second.png',request:{prompt:'second'},created:2});assert.equal(second.selected,1);assert.equal(imageVersions(second)[0].url,'first.png');second.selected=0;const third=appendImageVersion(second,{url:'third.png',request:{prompt:'third'},created:3});assert.deepEqual(third.versions.map(v=>v.url),['first.png','second.png','third.png']);assert.equal(third.versions[1].request.prompt,'second');assert.equal(third.selected,2);assert.deepEqual(imageVersions(null),[]);});
import {resolveVibes} from '../vibe.js';
import {selectImageVersion} from '../image-history.js';
import {markImageVersionsDeleted} from '../image-history.js';
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

test('deleting the selected image falls back to a remaining version and the last deletion permits reroll',()=>{
 let record=appendImageVersion({url:'/user/images/miao/a.png',profileName:'A',request:{prompt:'first'}},{url:'/user/images/miao/b.png',profileName:'B',request:{prompt:'second'}});
 assert.equal(markImageVersionsDeleted(record,['user/images/miao/b.png']),true);
 assert.equal(record.url,'/user/images/miao/a.png');assert.equal(record.profileName,'A');assert.equal(record.selected,0);assert.equal(record.deleted,false);
 record=JSON.parse(JSON.stringify(record));assert.equal(markImageVersionsDeleted(record,['user/images/miao/a.png']),true);
 assert.equal(record.deleted,true);assert.equal(selectImageVersion(record,1),null);
 const next=appendImageVersion(record,{url:'/user/images/miao/c.png',profileName:'C'});
 assert.equal(next.deleted,undefined);assert.equal(next.url,'/user/images/miao/c.png');assert.equal(imageVersions(next).filter(v=>!v.deleted).length,1);
});

test('deleting an unselected image preserves selection and matches encoded Chinese folders',()=>{
 const record=appendImageVersion({url:'/user/images/%E5%96%B5/a.png',request:{}},{url:'/user/images/%E5%96%B5/b.png',request:{prompt:'keep'}});
 assert.equal(markImageVersionsDeleted(record,['user/images/喵/a.png']),true);assert.equal(record.selected,1);assert.equal(record.request.prompt,'keep');
 assert.equal(markImageVersionsDeleted(record,['user/images/other/b.png']),false);assert.equal(record.versions[1].deleted,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBlocks,buildRequest,defaults} from '../core.js';
test('only closed nonempty blocks are recognized during streaming',()=>{
 assert.equal(parseBlocks('image###unfinished').length,0);
 assert.equal(parseBlocks('image######').length,0);
 assert.deepEqual(parseBlocks('hello image###a### text image###b### image###c').map(b=>b.prompt),['a','b']);
});
test('duplicate prompts retain separate positions',()=>{
 const b=parseBlocks('image###a### image###a###');assert.equal(b.length,2);assert.notEqual(b[0].index,b[1].index);
});
test('custom capture protocol',()=>assert.equal(parseBlocks('<draw>cat</draw>','<draw>([\\s\\S]*?)</draw>')[0].prompt,'cat'));
test('positive ordering, negative isolation and profile snapshot',()=>{
 const profile={...defaults,positive:'quality',artists:'artist',negative:'bad',seed:42};
 const r=buildRequest(profile,'scene'); profile.artists='changed';
 assert.equal(r.prompt,'quality,\nartist,\nscene');assert.equal(r.negative_prompt,'bad');assert.equal(r.seed,42);
});
test('invalid sizes and generation parameters rejected before charging',()=>{
 for(const patch of [{width:513},{height:0},{steps:51},{width:2048,height:2048},{seed:-2},{scale:NaN}])assert.throws(()=>buildRequest({...defaults,...patch},'cat'));
});

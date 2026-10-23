import test from 'node:test';
import assert from 'node:assert/strict';
import {maskReasoning,parseBlocks,parseBodyBlocks,pageItems} from '../core.js';
import {importVibeData,resolveVibes,vibeSummary} from '../vibe.js';
test('custom reasoning markers exclude complete and streamed CoT, preserving body offsets',()=>{
 const format={prefix:'<star_cot>',suffix:'</star_cot>'};
 const text='<star_cot>计划 image###wrong###</star_cot>正文 image###right###';
 const masked=maskReasoning(text,format);assert.equal(masked.length,text.length);
 const blocks=parseBlocks(masked);assert.deepEqual(blocks.map(b=>b.prompt),['right']);assert.equal(blocks[0].start,text.indexOf('image###right'));
 assert.deepEqual(parseBlocks(maskReasoning('<star_cot>image###wrong###',format)),[]);
 assert.deepEqual(parseBlocks(maskReasoning('<think>image###wrong###</think> image###yes###',format)).map(b=>b.prompt),['yes']);
});
test('nested and repeated reasoning blocks are excluded and separate extra reasoning is never a source',()=>{
 const text='<think><think>nested</think>image###bad###</think><analysis>image###bad2###</analysis>image###good###';
 assert.deepEqual(parseBlocks(maskReasoning(text)).map(b=>b.prompt),['good']);
 assert.equal(maskReasoning('plain').length,5);
});
test('body cards retain existing image identities after reasoning exclusion',()=>{
 const text='<think>image###draft###</think>image###same### image###same###';
 assert.deepEqual(parseBodyBlocks(text).map(b=>[b.index,b.prompt]),[[1,'same'],[2,'same']]);
 assert.deepEqual(parseBodyBlocks(text).map(b=>b.bodyIndex),[0,1]);
 assert.equal(parseBodyBlocks('image###a<think>secret</think>b###').length,0);
});
test('image pagination has no duplicates, clamps after deletion and handles empty galleries',()=>{
 const all=Array.from({length:53},(_,i)=>i);
 assert.deepEqual([0,1,2].flatMap(p=>pageItems(all,p).items),all);
 assert.equal(pageItems(all,2).items.length,5);assert.equal(pageItems(all.slice(0,4),2).page,0);assert.equal(pageItems([],5).pages,1);
});
const encoded={name:'官网 Vibe',encodings:{'v4-5full':{hash:{encoding:'YWJj',params:{information_extracted:0.7}}}}};
test('official single and bundled Vibe files select only matching model encodings',()=>{
 const [v]=importVibeData(encoded);v.id='example';
 assert.equal(vibeSummary(v).variants[0].information,0.7);
 const result=resolveVibes('nai-diffusion-4-5-full',[{id:v.id,key:'hash',strength:0.4}],[v]);
 assert.deepEqual(result.reference_image_multiple,['YWJj']);assert.deepEqual(result.reference_strength_multiple,[0.4]);
 assert.equal(importVibeData({vibes:[encoded,encoded]}).length,2);
 assert.throws(()=>resolveVibes('nai-diffusion-4-full',[{id:v.id,key:'hash'}],[v]),/缺少/);
 assert.throws(()=>resolveVibes('nai-diffusion-3',[{id:v.id,key:'hash'}],[v]),/V4/);
 assert.throws(()=>resolveVibes('nai-diffusion-4-5-full',[{id:v.id,key:'hash',strength:1.1}],[v]),/强度/);
 assert.throws(()=>importVibeData({encodings:{}}));
});

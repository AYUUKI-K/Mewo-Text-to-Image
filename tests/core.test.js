import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBlocks,buildRequest,defaults,latestImageMessage,canAutoGenerate,validateFolder,imageDay,normalizeProfile,imageURL} from '../core.js';
test('only #5 is eligible when #3 and #5 both contain tags',()=>{
 const chat=Array.from({length:6},(_,i)=>({mes:`floor ${i}`}));
 chat[3].mes='image###third###';chat[5].mes='image###fifth###';
 for(const mode of ['auto','stream']){assert.equal(canAutoGenerate(chat,chat[3],mode),false);assert.equal(canAutoGenerate(chat,chat[5],mode),true);}
 assert.equal(canAutoGenerate(chat,chat[5],'manual'),false);
 assert.equal(canAutoGenerate(chat,chat[5],'auto',true),false);
 assert.equal(canAutoGenerate(chat,chat[5],'stream',true),true);
 chat.push({is_user:true,mes:'next'});assert.equal(latestImageMessage(chat),null);
 assert.equal(canAutoGenerate(chat,chat[5],'auto'),false);
});
test('new latest floor disqualifies a queued automatic task',()=>{
 const previous={mes:'image###old###'},chat=[previous];
 assert.equal(canAutoGenerate(chat,previous,'auto'),true);
 chat.push({mes:'image###new###'});assert.equal(canAutoGenerate(chat,previous,'auto'),false);
});
test('storage only permits a server image subfolder',()=>{
 assert.equal(validateFolder('喵喵图片-2026'),'喵喵图片-2026');
 for(const invalid of ['','../other','/tmp','C:\\data','a/b','a\\b','.'])assert.throws(()=>validateFolder(invalid));
});
test('date cleanup recognizes plugin files, excluding unrelated files',()=>{
 const time=new Date(2026,9,23,12).getTime();
 assert.equal(imageDay(`miao-${time}.png`),'2026-10-23');
 assert.equal(imageDay(`test-${time}-aa-bb.png`),'2026-10-23');
 for(const name of ['photo.png','../miao-1792737847709.png','miao-hello.png','some-other-file.png'])assert.equal(imageDay(name),null);
});
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

test('legacy artist fields merge exactly once into the matching profile',()=>{
 const a=normalizeProfile({...defaults,positive:'a quality',artists:'a artist',steps:21});
 assert.equal(a.positive,'a quality,\n'+'a artist');assert.equal(a.steps,21);assert.equal('artists' in a,false);
 assert.deepEqual(normalizeProfile(a),a);
});
test('switching entire profiles keeps prompts, models and all parameters together',()=>{
 const profiles=[{...defaults,positive:'A',model:'nai-diffusion-4-5-full',width:512,height:768,steps:21,seed:1},{...defaults,positive:'B',model:'nai-diffusion-4-5-curated',width:832,height:1216,steps:28,seed:2}];
 const a=buildRequest(profiles[0],'scene');const b=buildRequest(profiles[1],'scene');
 assert.equal(a.prompt,'A,\nscene');assert.equal(a.steps,21);assert.equal(a.width,512);
 assert.equal(b.prompt,'B,\nscene');assert.equal(b.steps,28);assert.equal(b.width,832);assert.equal(b.model,'nai-diffusion-4-5-curated');
 assert.equal(buildRequest(profiles[0],'scene').steps,21);
});
test('history thumbnail urls encode folder names and reject unrelated files',()=>{
 assert.equal(imageURL('喵喵图片','miao-1792737847709.png'),'/user/images/'+encodeURIComponent('喵喵图片')+'/miao-1792737847709.png');
 assert.throws(()=>imageURL('miao-nai','../other.png'));
});

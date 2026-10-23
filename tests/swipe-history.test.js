import test from 'node:test';import assert from 'node:assert/strict';
import {readSwipeImage,writeSwipeImage,migrateSwipeImages,swipeImageRecords,removeSwipeImages} from '../swipe-history.js';
import {appendImageVersion,selectImageVersion} from '../image-history.js';
const slot='0:cat',first={url:'first.png',request:{prompt:'first'},created:1};
const switchPage=(message,page)=>{message.swipe_id=page;message.mes=message.swipes[page];message.extra=structuredClone(message.swipe_info[page]?.extra||{});};
test('same-floor swipes retain their own images despite extra replacement and JSON reload',()=>{
    let message={swipe_id:0,mes:'image###cat###',swipes:['image###cat###','image###cat###'],swipe_info:[{extra:{}},{extra:{}}],extra:{unrelated:'keep'}};
    writeSwipeImage(message,0,slot,first);switchPage(message,1);assert.equal(readSwipeImage(message,1,slot),undefined);
    writeSwipeImage(message,1,slot,{...first,url:'second.png'});
    for(let i=0;i<3;i++){switchPage(message,0);assert.equal(readSwipeImage(message,0,slot).url,'first.png');switchPage(message,1);assert.equal(readSwipeImage(message,1,slot).url,'second.png');}
    message=JSON.parse(JSON.stringify(message));message.extra={};message.swipe_info[0].extra={};
    switchPage(message,0);assert.equal(readSwipeImage(message,0,slot).url,'first.png');
    assert.equal(swipeImageRecords(message).length,2);
});
test('finishing generation after switching away writes only the original swipe',()=>{
    const message={swipe_id:1,mes:'image###other###',swipes:['image###cat###','image###other###'],swipe_info:[{extra:{}},{extra:{other:'keep'}}],extra:{other:'keep'}};
    writeSwipeImage(message,0,slot,first);
    assert.deepEqual(message.extra,{other:'keep'});assert.equal(readSwipeImage(message,1,slot),undefined);
    assert.equal(message.swipe_info[0].extra.miao_nai_image['0:'+slot].url,'first.png');
    switchPage(message,0);assert.equal(readSwipeImage(message,0,slot).url,'first.png');
});
test('reroll versions and selected image stay local to their swipe',()=>{
    const message={swipe_id:0,extra:{}};
    writeSwipeImage(message,0,slot,appendImageVersion(first,{...first,url:'reroll.png'}));
    writeSwipeImage(message,1,slot,{...first,url:'other-swipe.png'});
    const record=readSwipeImage(message,0,slot);selectImageVersion(record,-1);writeSwipeImage(message,0,slot,record);
    assert.equal(readSwipeImage(message,0,slot).url,'first.png');assert.equal(readSwipeImage(message,0,slot).versions.length,2);
    assert.equal(message.swipe_info[0].extra.miao_nai_image['0:'+slot].selected,0);
    assert.equal(readSwipeImage(message,1,slot).url,'other-swipe.png');
});
test('legacy active and inactive snapshots migrate without overwriting newer canonical images',()=>{
    const message={extra:{miao_nai_image:{['0:'+slot]:first}},swipe_info:[{extra:{}},{extra:{miao_nai_image:{['1:'+slot]:{...first,url:'old-page-two.png'}}}}]};
    assert.equal(migrateSwipeImages(message),true);writeSwipeImage(message,1,slot,{...first,url:'new-page-two.png'});
    message.swipe_info[1].extra.miao_nai_image['1:'+slot]={...first,url:'stale.png'};
    assert.equal(readSwipeImage(message,1,slot).url,'new-page-two.png');assert.equal(migrateSwipeImages(message),false);
});
test('deleting an earlier swipe shifts records together and does not resurrect its images',()=>{
    const message={swipe_id:1,extra:{},swipe_info:[]};
    for(let i=0;i<3;i++)writeSwipeImage(message,i,slot,{...first,url:`page-${i}.png`});
    message.swipe_info.splice(0,1);message.swipe_id=0;removeSwipeImages(message,0);
    assert.equal(readSwipeImage(message,0,slot).url,'page-1.png');assert.equal(readSwipeImage(message,1,slot).url,'page-2.png');
    assert.equal(swipeImageRecords(message).length,2);assert.equal(readSwipeImage(message,2,slot),undefined);
});

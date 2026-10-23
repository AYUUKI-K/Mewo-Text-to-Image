import test from 'node:test';
import assert from 'node:assert/strict';
import {bindImageGesture} from '../interactions.js';
function fixture(clicks=2){
    const image=new EventTarget();let time=1000,rerolls=0,singles=0;
    bindImageGesture(image,{getClicks:()=>clicks,onSingle:()=>singles++,onReroll:()=>rerolls++,now:()=>time,delay:15});
    const emit=(type,props={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{button:0,clientX:20,clientY:20,isPrimary:true,...props});image.dispatchEvent(e);};
    const tap=()=>{emit('pointerdown');time++;emit('pointerup');emit('click');time++;};
    return {tap,emit,advance:n=>time+=n,result:()=>({rerolls,singles})};
}
test('double tap produces one reroll, synthetic touchend and dblclick do not duplicate it',()=>{
    const f=fixture();f.tap();f.tap();f.emit('touchend');f.emit('dblclick');assert.equal(f.result().rerolls,1);
});
test('triple mode ignores a double tap and rerolls on the third tap only',()=>{
    const f=fixture(3);f.tap();f.tap();assert.equal(f.result().rerolls,0);f.tap();assert.equal(f.result().rerolls,1);
});
test('scrolling, pointer cancellation and long presses cannot count toward reroll',()=>{
    for(const action of ['drag','cancel','hold']){
        const f=fixture();f.emit('pointerdown');
        if(action==='drag')f.emit('pointermove',{clientY:70});
        if(action==='cancel')f.emit('pointercancel');
        if(action==='hold')f.advance(600);
        f.emit('pointerup');f.emit('click');f.tap();assert.equal(f.result().rerolls,0,action);
    }
});
test('widely spaced or distant clicks remain single taps',async()=>{
    const f=fixture();f.tap();f.advance(20);f.tap();assert.equal(f.result().rerolls,0);
    await new Promise(r=>setTimeout(r,25));assert.equal(f.result().singles,1);
    const far=fixture();far.tap();far.emit('click',{clientX:200});assert.equal(far.result().rerolls,0);
});

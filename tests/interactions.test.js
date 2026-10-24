import test from 'node:test';
import assert from 'node:assert/strict';
import {bindImageGesture} from '../interactions.js';
import {createFloatingEntry} from '../interactions.js';
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
test('floating entry docks on nearby edges, persists through resize and releases to the middle',()=>{
    const button=new EventTarget(),windowImpl=new EventTarget();
    Object.assign(windowImpl,{innerWidth:400,innerHeight:800});
    Object.assign(button,{style:{},setAttribute(){},setPointerCapture(){},remove(){}});
    Object.defineProperties(button,{offsetLeft:{get:()=>parseFloat(button.style.left)},offsetTop:{get:()=>parseFloat(button.style.top)}});
    const settings={floatingEntry:true,floatingPosition:{x:.5,y:.5,edgeX:null,edgeY:null}};let saves=0,opened=0;
    const dispose=createFloatingEntry({settings,save:()=>saves++,open:()=>opened++,icon:'',windowImpl,documentImpl:{createElement:()=>button,body:{append(){}}}});
    const emit=(type,props={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,button:0,isPrimary:true,detail:1,...props});button.dispatchEvent(event);};
    const dragTo=(x,y)=>{emit('pointerdown',{clientX:button.offsetLeft,clientY:button.offsetTop});emit('pointermove',{clientX:x,clientY:y});emit('pointerup');emit('click');};
    dragTo(330,250);assert.equal(button.offsetLeft,344);assert.equal(settings.floatingPosition.edgeX,'right');assert.equal(opened,0);
    windowImpl.innerWidth=900;windowImpl.dispatchEvent(new Event('resize'));assert.equal(button.offsetLeft,844);
    dragTo(20,10);assert.equal(button.offsetLeft,8);assert.equal(button.offsetTop,8);assert.equal(settings.floatingPosition.edgeY,'top');
    dragTo(400,350);assert.equal(button.offsetLeft,400);assert.equal(button.offsetTop,350);assert.equal(settings.floatingPosition.edgeX,null);assert.equal(settings.floatingPosition.edgeY,null);
    dragTo(420,730);assert.equal(button.offsetTop,744);assert.equal(settings.floatingPosition.edgeY,'bottom');
    emit('pointerdown',{clientX:420,clientY:744});emit('pointermove',{clientX:600,clientY:500});emit('pointercancel');assert.equal(button.offsetTop,744);
    emit('pointerdown');emit('pointerup');emit('click');assert.equal(opened,1);assert.equal(saves,4);
    dispose();
});

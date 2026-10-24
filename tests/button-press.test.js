import test from 'node:test';
import assert from 'node:assert/strict';
import {bindButtonPress} from '../button-press.js';
function fixture(pointerEvents=true){
    const button=new EventTarget();let time=1000,calls=0;
    button.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:60});
    bindButtonPress(button,()=>calls++,{now:()=>time,pointerEvents});
    const emit=(name,values={})=>{const e=new Event(name,{cancelable:true});Object.assign(e,{pointerType:'touch',pointerId:1,isPrimary:true,clientX:30,clientY:30,detail:1,...values});button.dispatchEvent(e);};
    return {button,emit,advance:n=>time+=n,count:()=>calls};
}
test('touch release activates without click, delayed click is deduplicated and keyboard/mouse still work',()=>{
    const f=fixture();f.emit('pointerdown');f.emit('pointerup');assert.equal(f.count(),1);f.emit('click');assert.equal(f.count(),1);
    f.emit('click',{detail:0});assert.equal(f.count(),2);f.emit('pointerdown',{pointerType:'mouse'});f.emit('click');assert.equal(f.count(),3);
});
test('scroll, long press, cancel, multiple fingers and disabled buttons cannot delete',()=>{
    for(const mode of ['scroll','hold','cancel','multi','disabled']){
        const f=fixture();f.emit('pointerdown');
        if(mode==='scroll'){f.emit('pointermove',{clientY:55});f.emit('pointermove',{clientY:30});}
        if(mode==='hold')f.advance(701);
        if(mode==='cancel')f.emit('pointercancel');
        if(mode==='multi')f.emit('pointerdown',{isPrimary:false,pointerId:2});
        if(mode==='disabled')f.button.disabled=true;
        f.emit('pointerup');f.emit('click');assert.equal(f.count(),0,mode);
    }
});
test('older touch-event-only WebViews activate once without a synthetic click',()=>{
    const f=fixture(false),touch={clientX:30,clientY:30,identifier:1};
    f.emit('touchstart',{touches:[touch]});f.emit('touchend',{changedTouches:[touch]});f.emit('click');assert.equal(f.count(),1);
});

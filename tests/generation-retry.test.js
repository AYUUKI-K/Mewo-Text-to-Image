import test from 'node:test';
import assert from 'node:assert/strict';
import {retryGeneration} from '../generation-retry.js';
import {runWithQueue} from '../cloud-queue.js';
test('explicit 500 waits then rejoins the queue; each failed attempt releases its lock',async()=>{
    let attempts=0;const calls=[],waits=[];
    const result=await retryGeneration({enabled:true,delays:[2000,3000],sleep:async ms=>waits.push(ms),run:()=>runWithQueue({url:'https://queue.example',keyHash:'a'.repeat(64),
        fetchImpl:async url=>{calls.push(new URL(url).pathname);return Response.json({your_turn:true,lock_token:'lease'});},
        generate:async()=>{if(++attempts<3)throw Object.assign(Error('500'),{status:500});return 'image';}})});
    assert.equal(result,'image');assert.equal(attempts,3);assert.equal(waits.reduce((a,b)=>a+b,0),5000);
    assert.deepEqual(calls,['/join-queue','/complete','/join-queue','/complete','/join-queue','/complete']);
});
test('retry is opt-in, bounded and never repeats transport failures or other HTTP errors',async()=>{
    for(const [enabled,error,count] of [[false,{status:500},1],[true,{status:500},4],[true,{status:401},1],[true,{status:429},1],[true,{name:'TimeoutError'},1],[true,{name:'TypeError'},1],[true,{},1]]){
        let attempts=0;await assert.rejects(retryGeneration({enabled,run:async()=>{attempts++;throw Object.assign(Error('failure'),error);},sleep:async()=>{}}));assert.equal(attempts,count);
    }
});
test('message or key change while waiting prevents another billable request',async()=>{
    let valid=true,attempts=0;
    await assert.rejects(retryGeneration({enabled:true,canContinue:()=>valid,run:async()=>{attempts++;throw Object.assign(Error('500'),{status:500});},sleep:async()=>{valid=false;}}),/原消息/);
    assert.equal(attempts,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {hostFetch} from '../host-fetch.js';
test('native bridge ignoring abort still releases the caller after timeout',async()=>{
    let signal;await assert.rejects(hostFetch('/fixture',{}, {timeoutMs:10,fetchImpl:async(url,options)=>{signal=options.signal;return new Promise(()=>{});}}),/超时/);assert.equal(signal.aborted,true);
    const result=await hostFetch('/fixture',{}, {timeoutMs:100,fetchImpl:async()=>new Response('ok')});assert.equal(await result.text(),'ok');
});

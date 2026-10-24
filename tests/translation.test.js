import test from 'node:test';
import assert from 'node:assert/strict';
import {splitTranslationText,createPromptTranslator} from '../translation.js';

test('translation chunks preserve all text and bound URL size for Chinese and emoji',()=>{
    for(const text of ['风格，猫咪 😀, '.repeat(400),'a '+'猫'.repeat(1000)+'😀','x'.repeat(6000)]){
        const chunks=splitTranslationText(text);
        assert.equal(chunks.join(''),text);
        assert.ok(chunks.every(chunk=>encodeURIComponent(chunk).length<=1800));
        assert.ok(chunks.length>1);
    }
});
test('translation retries a transient 500 once, uses only the host and caches success',async()=>{
    const calls=[],waits=[];let attempts=0;
    const translate=createPromptTranslator({getHeaders:()=>({'X-CSRF-Token':'fixture'}),wait:async ms=>waits.push(ms),fetchImpl:async(url,options)=>{
        calls.push({url,options});return ++attempts===1?new Response('upstream failure',{status:500}):new Response('猫咪');
    }});
    assert.equal(await translate('cat'),'猫咪');assert.equal(await translate('cat'),'猫咪');
    assert.equal(calls.length,2);assert.deepEqual(waits,[600]);
    assert.ok(calls.every(call=>call.url==='/api/translate/google'));
    assert.deepEqual(JSON.parse(calls[0].options.body),{text:'cat',lang:'zh-CN'});
    assert.equal(calls[0].options.headers['X-CSRF-Token'],'fixture');
});
test('failed chunk is retryable by the user without redoing earlier successful chunks',async()=>{
    const calls=[];let failing=true;
    // Make each chunk distinct so the cache can be checked independently.
    const distinct='a'.repeat(1700)+', '+'b'.repeat(1700)+', '+'c'.repeat(1700);
    const parts=splitTranslationText(distinct);
    const client=createPromptTranslator({getHeaders:()=>({}),wait:async()=>{},fetchImpl:async(url,options)=>{
        const value=JSON.parse(options.body).text;calls.push(value);
        if(value===parts[1]&&failing)return new Response('offline',{status:503});
        return new Response('译文');
    }});
    await assert.rejects(client(distinct),/503/);failing=false;
    assert.equal(await client(distinct),parts.map(()=> '译文').join('\n'));
    assert.equal(calls.filter(value=>value===parts[0]).length,1);
    assert.equal(calls.filter(value=>value===parts[1]).length,3);
});
test('permanent failures do not retry and concurrent identical requests share a fetch',async()=>{
    let calls=0;
    const bad=createPromptTranslator({getHeaders:()=>({}),wait:async()=>{throw Error('must not wait');},fetchImpl:async()=>{calls++;return new Response('not allowed',{status:403});}});
    await assert.rejects(bad('cat'),/403/);assert.equal(calls,1);
    let release;
    const good=createPromptTranslator({getHeaders:()=>({}),fetchImpl:async()=>{calls++;await new Promise(resolve=>release=resolve);return new Response('猫');}});
    const first=good('cat'),second=good('cat');release();
    assert.deepEqual(await Promise.all([first,second]),['猫','猫']);assert.equal(calls,2);
});
test('network failure retries once and HTML/empty responses never enter the cache',async()=>{
    let calls=0;
    const client=createPromptTranslator({getHeaders:()=>({}),wait:async()=>{},fetchImpl:async()=>{if(++calls===1)throw new TypeError('offline');return new Response('猫');}});
    assert.equal(await client('cat'),'猫');assert.equal(calls,2);
    for(const body of ['','<!doctype html><html>upstream error</html>']){
        let requests=0;
        const invalid=createPromptTranslator({getHeaders:()=>({}),fetchImpl:async()=>{requests++;return new Response(requests===1?body:'恢复');}});
        await assert.rejects(invalid('cat'),/有效译文/);assert.equal(await invalid('cat'),'恢复');
    }
});

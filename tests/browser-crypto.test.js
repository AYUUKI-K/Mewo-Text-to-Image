import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {randomId,sha256} from '../browser-crypto.js';
test('LAN HTTP UUID fallback uses secure random bytes and remains a version 4 UUID',()=>{
    const insecure={getRandomValues:array=>webcrypto.getRandomValues(array)};
    const ids=Array.from({length:1000},()=>randomId(insecure));
    assert.equal(new Set(ids).size,1000);
    assert.ok(ids.every(id=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)));
    assert.throws(()=>randomId({}),/随机数/);
});
test('HTTP SHA-256 fallback matches native hashes across UTF-8 and block boundaries',async()=>{
    for(const value of ['', 'abc','中文Key🐱',...Array.from({length:140},(_,i)=>'x'.repeat(i)),'long'.repeat(10000)]){
        const expected=createHash('sha256').update(value).digest('hex');
        assert.equal(await sha256(value,{}),expected);
        assert.equal(await sha256(value,webcrypto),expected);
    }
});

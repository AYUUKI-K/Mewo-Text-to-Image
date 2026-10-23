import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {persistHostSettings} from '../settings-save.js';
test('save waits for host confirmation and releases its listener',async()=>{
    const source=new EventEmitter();let completed=false;
    await persistHostSettings({source,event:'saved',saveNow:async()=>{await Promise.resolve();source.emit('saved');completed=true;}});
    assert.ok(completed);assert.equal(source.listenerCount('saved'),0);
});
test('a swallowed host error never reports a successful save',async()=>{
    const source=new EventEmitter();
    for(const saveNow of [async()=>{},async()=>false,async()=>{throw Error('offline');}]){
        await assert.rejects(persistHostSettings({source,event:'saved',saveNow}));
        assert.equal(source.listenerCount('saved'),0);
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LeaseQueue} from '../queue-service/queue.mjs';
import {createQueueServer} from '../queue-service/service.mjs';
import {runWithQueue,fingerprintKey} from '../cloud-queue.js';
const hash=key=>createHash('sha256').update(key).digest('hex');
const identity=(key,user)=>({key_hash:hash(key),user_id:'user-id-'+user,task_id:'task-id-'+user});
test('A/B share key one; C with key two is granted independently',()=>{
 const q=new LeaseQueue(),a=identity('one','a'),b=identity('one','b'),c=identity('two','c');
 const first=q.join(a);assert.equal(first.your_turn,true);assert.equal(q.join(b).your_turn,false);assert.equal(q.join(c).your_turn,true);
 assert.equal(q.turn(b).position,1);assert.throws(()=>q.release({...a,lock_token:'wrong'}));
 q.release({...a,lock_token:first.lock_token});assert.equal(q.turn(b).your_turn,true);
});
test('duplicate joins do not duplicate jobs; raw keys are rejected',()=>{
 const q=new LeaseQueue(),a=identity('one','a');assert.deepEqual(q.join(a),q.join(a));assert.deepEqual(q.stats(),{active:1,waiting:0});
 assert.throws(()=>q.join({...a,key:'must-never-send-this'}));assert.throws(()=>q.join({...a,key_hash:'invalid'}));
});
test('stale holders expire and heartbeats keep a waiter alive',()=>{
 let now=0;const q=new LeaseQueue({now:()=>now,leaseMs:100,waitingMs:60}),a=identity('one','a'),b=identity('one','b');
 q.join(a);q.join(b);now=50;assert.equal(q.turn(b).your_turn,false);now=101;assert.equal(q.turn(b).your_turn,true);
});
test('key hashing is stable and trims spaces',async()=>assert.equal(await fingerprintKey(' demo-key '),hash('demo-key')));
test('real HTTP coordination: same-key waits, different-key runs; no raw key or prompt sent',async()=>{
 const queue=new LeaseQueue(),server=createQueueServer({queue});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port,started=[],bodies=[];let finishA;
 const options={url,pollMs:2,heartbeatMs:100,fetchImpl:(u,o)=>{bodies.push(JSON.parse(o.body));return fetch(u,o);}};
 try{
  const a=runWithQueue({...options,keyHash:hash('one'),generate:()=>{started.push('a');return new Promise(r=>finishA=r);}});
  while(!finishA)await new Promise(r=>setTimeout(r,2));
  const b=runWithQueue({...options,keyHash:hash('one'),generate:async()=>{started.push('b');return 'image-b';}});
  const c=runWithQueue({...options,keyHash:hash('two'),generate:async()=>{started.push('c');return 'image-c';}});
  assert.equal(await c,'image-c');assert.deepEqual(started,['a','c']);finishA('image-a');assert.equal(await a,'image-a');assert.equal(await b,'image-b');assert.deepEqual(started,['a','c','b']);
  assert.deepEqual(queue.stats(),{active:0,waiting:0});
  assert.ok(bodies.every(body=>Object.keys(body).every(key=>['key_hash','user_id','task_id','greeting','lock_token'].includes(key))));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('generation errors release the lock without retrying NAI',async()=>{
 const queue=new LeaseQueue(),server=createQueueServer({queue});await new Promise(r=>server.listen(0,'127.0.0.1',r));let calls=0;
 try{await assert.rejects(()=>runWithQueue({url:'http://127.0.0.1:'+server.address().port,keyHash:hash('one'),generate:async()=>{calls++;throw new Error('upstream failed');}}),/upstream failed/);assert.equal(calls,1);assert.deepEqual(queue.stats(),{active:0,waiting:0});}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

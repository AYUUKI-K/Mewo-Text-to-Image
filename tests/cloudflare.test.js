import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{MiaoKeyQueue} from '../cloudflare/worker.js';
import {createHash} from 'node:crypto';
const identity=(key,user)=>({key_hash:createHash('sha256').update(key).digest('hex'),user_id:'user-id-'+user,task_id:'task-id-'+user});
function context(data=new Map()){
 let pending=Promise.resolve();
 return {data,storage:{async get(k){return structuredClone(data.get(k));},async put(k,v){data.set(k,structuredClone(v));},async deleteAll(){data.clear();},async deleteAlarm(){},async setAlarm(t){assert.ok(Number.isFinite(t));}},blockConcurrencyWhile(fn){const result=pending.then(fn);pending=result.catch(()=>{});return result;}};
}
const call=async(object,path,body)=>{const res=await object.fetch(new Request('https://queue.test'+path,{method:'POST',body:JSON.stringify(body)}));return {status:res.status,...await res.json()};};
test('durable queue survives eviction and retains per-key mutual exclusion',async()=>{
 const ctx=context(),a=identity('one','A'),b=identity('one','B');let object=new MiaoKeyQueue(ctx);
 const first=await call(object,'/join-queue',a);assert.equal(first.your_turn,true);assert.equal((await call(object,'/join-queue',b)).your_turn,false);
 object=new MiaoKeyQueue(context(ctx.data));assert.equal((await call(object,'/my-turn',b)).your_turn,false);
 assert.equal((await call(object,'/complete',{...a,lock_token:first.lock_token})).released,true);
 assert.equal((await call(object,'/my-turn',b)).your_turn,true);
});
test('edge router directs same keys to one object, different keys independently',async()=>{
 const objects=new Map();const env={MIAO_KEY_QUEUE:{idFromName:name=>name,get(id){if(!objects.has(id))objects.set(id,new MiaoKeyQueue(context()));return objects.get(id);}}};
 const request=(path,body)=>worker.fetch(new Request('https://queue.test'+path,{method:'POST',body:JSON.stringify(body)}),env);
 const a=identity('one','A'),b=identity('one','B'),c=identity('two','C');
 assert.equal((await (await request('/join-queue',a)).json()).your_turn,true);
 assert.equal((await (await request('/join-queue',b)).json()).your_turn,false);
 assert.equal((await (await request('/join-queue',c)).json()).your_turn,true);
 assert.equal(objects.size,2);assert.equal((await request('/join-queue',{...a,key:'must-reject'})).status,400);assert.equal(objects.size,2);
 const ping=await worker.fetch(new Request('https://queue.test/ping'),env);assert.equal((await ping.json()).ready,true);assert.equal(ping.headers.get('Access-Control-Allow-Origin'),'*');
});

test('160 concurrent users across 20 keys have one holder per key and independent handoffs',async()=>{
 const objects=new Map();const env={MIAO_KEY_QUEUE:{idFromName:name=>name,get(id){if(!objects.has(id))objects.set(id,new MiaoKeyQueue(context()));return objects.get(id);}}};
 const request=async(path,body)=>{const r=await worker.fetch(new Request('https://queue.test'+path,{method:'POST',body:JSON.stringify(body)}),env);assert.equal(r.status,200);return r.json();};
 const groups=Array.from({length:20},(_,k)=>Array.from({length:8},(_,u)=>{const who=identity('release-key-'+k,'group-'+k+'-user-'+u);if(u%2)who.key_hash=who.key_hash.toUpperCase();return who;}));
 const initial=await Promise.all(groups.map(users=>Promise.all(users.map(who=>request('/join-queue',who)))));
 assert.equal(objects.size,20);assert.equal(initial.flat().filter(state=>state.your_turn).length,20);
 for(const row of initial){assert.equal(row[0].your_turn,true);assert.ok(row.slice(1).every(state=>!state.your_turn));}
 let tokens=initial.map(row=>row[0].lock_token);
 for(let turn=0;turn<8;turn++){
  await Promise.all(groups.map((users,k)=>request('/complete',{...users[turn],lock_token:tokens[k]})));
  if(turn<7){const next=await Promise.all(groups.map(users=>request('/my-turn',users[turn+1])));assert.ok(next.every(state=>state.your_turn));tokens=next.map(state=>state.lock_token);}
 }
 for(const object of objects.values())assert.deepEqual(object.queue.stats(),{active:0,waiting:0});
});

import {randomUUID,timingSafeEqual} from 'node:crypto';
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);};
export class LeaseQueue {
    constructor({now=Date.now,leaseMs=240000,waitingMs=90000,maxHoldMs=600000,maxJobs=1000}={}){Object.assign(this,{now,leaseMs,waitingMs,maxHoldMs,maxJobs});this.lanes=new Map();}
    validate(input){
        if(!input||'key' in input||!/^([a-f0-9]{64})$/i.test(input.key_hash||'')||!/^[-a-zA-Z0-9_]{8,100}$/.test(input.user_id||'')||!/^[-a-zA-Z0-9_]{8,100}$/.test(input.task_id||''))throw new Error('无效排队信息');
    }
    cleanup(){
        const now=this.now();
        for(const [hash,lane] of this.lanes){
            lane.waiting=lane.waiting.filter(job=>now-job.seen<this.waitingMs);
            if(lane.active&&now>=lane.active.expires)lane.active=null;
            if(!lane.active&&lane.waiting.length){const job=lane.waiting.shift();lane.active={...job,token:randomUUID(),started:now,expires:now+this.leaseMs};}
            if(!lane.active&&!lane.waiting.length)this.lanes.delete(hash);
        }
    }
    find(lane,input){return lane.active?.user===input.user_id&&lane.active?.task===input.task_id?lane.active:lane.waiting.find(j=>j.user===input.user_id&&j.task===input.task_id);}
    view(lane,job){const active=lane.active===job;return {your_turn:active,status:active?'granted':'waiting',position:active?0:lane.waiting.indexOf(job)+1,...(active?{lock_token:job.token}:{})};}
    join(input){
        this.validate(input);this.cleanup();const hash=input.key_hash.toLowerCase();let lane=this.lanes.get(hash);
        if(!lane){lane={active:null,waiting:[]};this.lanes.set(hash,lane);}
        const previous=this.find(lane,input);if(previous){previous.seen=this.now();return this.view(lane,previous);}
        const total=[...this.lanes.values()].reduce((sum,l)=>sum+l.waiting.length+(l.active?1:0),0);
        if(total>=this.maxJobs||lane.waiting.length>=64)throw new Error('队列暂时满了');
        const job={user:input.user_id,task:input.task_id,seen:this.now()};
        if(!lane.active){lane.active={...job,token:randomUUID(),started:this.now(),expires:this.now()+this.leaseMs};return this.view(lane,lane.active);}
        lane.waiting.push(job);return this.view(lane,job);
    }
    turn(input){
        this.validate(input);this.cleanup();const lane=this.lanes.get(input.key_hash.toLowerCase()),job=lane&&this.find(lane,input);
        if(!job)throw new Error('排队任务已过期，请重新生成');
        job.seen=this.now();
        if(lane.active===job)job.expires=Math.min(this.now()+this.leaseMs,job.started+this.maxHoldMs);
        return this.view(lane,job);
    }
    release(input){
        this.validate(input);this.cleanup();const hash=input.key_hash.toLowerCase(),lane=this.lanes.get(hash);
        if(!lane)return {released:false};const job=this.find(lane,input);if(!job)return {released:false};
        if(lane.active===job){if(!equal(job.token,input.lock_token))throw new Error('无效队列凭据');lane.active=null;}
        else lane.waiting=lane.waiting.filter(j=>j!==job);
        this.cleanup();return {released:true};
    }
    stats(){this.cleanup();return {active:[...this.lanes.values()].filter(l=>l.active).length,waiting:[...this.lanes.values()].reduce((sum,l)=>sum+l.waiting.length,0)};}
}

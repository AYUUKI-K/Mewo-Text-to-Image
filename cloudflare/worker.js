import {LeaseQueue} from '../queue-service/queue.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export default {
    async fetch(request,env){
        const path=new URL(request.url).pathname;
        if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
        if(request.method==='GET'&&path==='/ping')return reply({ready:true,version:'0.4.1',runtime:'cloudflare'});
        if(request.method==='GET'&&path==='/')return reply({name:'喵喵文生图队列',ready:true,privacy:'只接收 Key 指纹，不接收 Key、提示词或图片'});
        if(request.method!=='POST')return reply({error:'Use POST'},405);
        if(!['/join-queue','/my-turn','/complete','/leave-queue'].includes(path))return reply({error:'Not found'},404);
        try{
            const text=await request.text();if(text.length>8192)return reply({error:'请求过大'},413);
            const input=JSON.parse(text);new LeaseQueue().validate(input);
            const id=env.MIAO_KEY_QUEUE.idFromName(input.key_hash.toLowerCase());
            return env.MIAO_KEY_QUEUE.get(id).fetch(new Request('https://queue.internal'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));
        }catch{return reply({error:'排队请求无效或服务暂不可用'},400);}
    }
};
// Each key gets an independent, strongly consistent SQLite-backed Durable Object.
export class MiaoKeyQueue {
    constructor(ctx){
        this.ctx=ctx;this.queue=new LeaseQueue();
        ctx.blockConcurrencyWhile(async()=>{const lanes=await ctx.storage.get('lanes');if(lanes)this.queue.lanes=new Map(lanes);});
    }
    async persist(){
        if(!this.queue.lanes.size){await this.ctx.storage.deleteAll();await this.ctx.storage.deleteAlarm();return;}
        await this.ctx.storage.put('lanes',[...this.queue.lanes]);
        const deadlines=[];
        for(const lane of this.queue.lanes.values()){if(lane.active)deadlines.push(lane.active.expires);for(const waiting of lane.waiting)deadlines.push(waiting.seen+this.queue.waitingMs);}
        await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,Math.min(...deadlines)));
    }
    async fetch(request){
        return this.ctx.blockConcurrencyWhile(async()=>{
            try{
                const input=await request.json();let result;
                switch(new URL(request.url).pathname){
                    case '/join-queue':result=this.queue.join(input);break;
                    case '/my-turn':result=this.queue.turn(input);break;
                    case '/complete':case '/leave-queue':result=this.queue.release(input);break;
                    default:return reply({error:'Not found'},404);
                }
                await this.persist();return reply(result);
            }catch{return reply({error:'队列请求无效或任务已过期'},400);}
        });
    }
    async alarm(){this.queue.cleanup();await this.persist();}
}

import {randomId,sha256} from './browser-crypto.js';
export function validateQueueURL(value) {
    const url=new URL(value);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('队列地址需要 HTTPS 喵');
    if(url.username||url.password||url.search||url.hash)throw new Error('请填写队列服务的根地址');
    return url.href.replace(/\/$/,'');
}
export async function fingerprintKey(key) {
    return sha256(key.trim());
}
export async function runWithQueue({url,keyHash,greeting='',generate,onStatus=()=>{},canContinue=()=>true,onReleaseError=()=>{},fetchImpl=fetch,pollMs=5000,heartbeatMs=15000}) {
    url=validateQueueURL(url);
    if(!/^[a-f0-9]{64}$/i.test(keyHash||''))throw new Error('请在本插件重新保存一次 NAI Key，用于自动识别队列；Key 不会发送给排队服务。');
    const identity={key_hash:keyHash,user_id:randomId(),task_id:randomId()};
    const call=async(path,extra={})=>{
        const response=await fetchImpl(url+path,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({...identity,...extra})});
        if(!response.ok)throw new Error(`队列连接失败（HTTP ${response.status}）`);
        return response.json();
    };
    let lockToken,heartbeat,renewing=false,uncertain=false;
    try {
        let state=await call('/join-queue',{greeting:greeting.slice(0,15)});
        while(true) {
            if(state.your_turn===true&&state.lock_token)lockToken=state.lock_token;
            if(!canContinue())throw new Error('原消息已变化，已退出待生成队列');
            if(lockToken)break;
            onStatus(`云端排队 · 前面 ${state.position||1} 张`);
            await new Promise(resolve=>setTimeout(resolve,pollMs));state=await call('/my-turn');
        }
        onStatus('正在生图');
        heartbeat=setInterval(async()=>{
            if(renewing)return;renewing=true;
            try {await call('/my-turn',{lock_token:lockToken});}catch {onStatus('排队连接暂时中断');}finally{renewing=false;}
        },heartbeatMs);
        try{return await generate();}
        catch(error){uncertain=['AbortError','TimeoutError','TypeError'].includes(error.name);throw error;}
    }finally {
        clearInterval(heartbeat);
        if(!uncertain){try {await call(lockToken?'/complete':'/leave-queue',lockToken?{lock_token:lockToken}:{});}catch(error){onReleaseError(error);}}
    }
}

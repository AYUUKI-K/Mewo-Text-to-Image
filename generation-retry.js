// Retry only explicit generation HTTP failures, never transport/timeout or save failures.
export async function retryGeneration({run,enabled=false,canContinue=()=>true,onStatus=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),delays=[15000,30000,60000]}){
    for(let attempt=0;;attempt++){
        if(!canContinue())throw Error('原消息已变化，已退出待生成队列');
        try{return await run();}
        catch(error){
            if(!enabled||error.status!==500||attempt>=delays.length)throw error;
            let remaining=delays[attempt];
            while(remaining>0){
                if(!canContinue())throw Error('原消息已变化，已退出待生成队列');
                onStatus(`500 后等待 · ${Math.ceil(remaining/1000)} 秒 · 重试 ${attempt+1}/${delays.length}`);
                const step=Math.min(1000,remaining);await sleep(step);remaining-=step;
            }
        }
    }
}

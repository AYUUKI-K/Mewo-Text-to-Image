// TT forwards text in a query string; bound encoded size, not JS string length.
export function splitTranslationText(text,limit=1800){
    const chunks=[];let chunk='',size=0,boundary=0;
    for(const char of String(text)){
        const cost=encodeURIComponent(char).length;
        while(size+cost>limit&&chunk){
            const at=boundary||chunk.length;
            chunks.push(chunk.slice(0,at));chunk=chunk.slice(at);
            size=encodeURIComponent(chunk).length;boundary=0;
        }
        chunk+=char;size+=cost;
        if(/[\s,，;；]/u.test(char))boundary=chunk.length;
    }
    if(chunk)chunks.push(chunk);return chunks;
}
export function createPromptTranslator({getHeaders,fetchImpl=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
    const cache=new Map(),pending=new Map();
    async function translateChunk(text){
        if(cache.has(text))return cache.get(text);
        if(pending.has(text))return pending.get(text);
        const task=(async()=>{
            for(let attempt=0;attempt<2;attempt++){
                try{
                    const response=await fetchImpl('/api/translate/google',{method:'POST',headers:getHeaders(),body:JSON.stringify({text,lang:'zh-CN'}),signal:AbortSignal.timeout(15000)});
                    if(!response.ok){
                        const error=Error(`翻译失败（HTTP ${response.status}）`);
                        error.retryable=[408,429,500,502,503,504].includes(response.status);throw error;
                    }
                    const result=await response.text();
                    if(!result.trim()||/^\s*(?:<!doctype|<html)/i.test(result))throw Error('未收到有效译文');
                    if(cache.size>=50)cache.delete(cache.keys().next().value);
                    cache.set(text,result);return result;
                }catch(error){
                    const retryable=error.retryable||error instanceof TypeError||['TimeoutError','AbortError'].includes(error.name);
                    if(attempt||!retryable)throw error;
                    await wait(600);
                }
            }
        })();
        pending.set(text,task);
        try{return await task;}finally{pending.delete(text);}
    }
    return async(text,onProgress=()=>{})=>{
        const chunks=splitTranslationText(text),results=[];
        for(const [index,chunk] of chunks.entries()){
            onProgress(index+1,chunks.length);results.push(await translateChunk(chunk));
        }
        return results.join('\n');
    };
}

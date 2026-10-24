// Some native bridges do not settle fetch on abort; race the response as well.
export async function hostFetch(url,options={}, {fetchImpl=fetch,timeoutMs=30000}={}){
    const controller=new AbortController();let timer;
    try{return await Promise.race([
        Promise.resolve().then(()=>fetchImpl(url,{...options,signal:controller.signal})),
        new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('酒馆请求超时，请刷新列表后确认结果'));controller.abort();},timeoutMs);}),
    ]);}finally{clearTimeout(timer);}
}

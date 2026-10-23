// Key material never enters extension settings or uploaded Vibe files.
export function createKeyVault(scope,{indexedDBImpl=globalThis.indexedDB}={}){
    let sessionKey='';
    const database=()=>new Promise((resolve,reject)=>{
        if(!indexedDBImpl)return reject(Error('此浏览器不支持记住 Key，请取消勾选「在此设备记住」'));
        const request=indexedDBImpl.open('miao-nai-direct-key',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('keys');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const operation=async(mode,run)=>{const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('keys',mode),request=run(tx.objectStore('keys'));let value;request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Key 保存中断'));});}finally{db.close();}};
    const forgetPersistent=async()=>{if(indexedDBImpl)await operation('readwrite',store=>store.delete(scope));};
    return {
        async get(){if(sessionKey)return sessionKey;if(!indexedDBImpl)return '';return (await operation('readonly',store=>store.get(scope)))||'';},
        async set(value,remember=false){if(remember)await operation('readwrite',store=>store.put(value,scope));else await forgetPersistent();sessionKey=value;},
        forgetPersistent,
        async clear(){await forgetPersistent();sessionKey='';},
    };
}

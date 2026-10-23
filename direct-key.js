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
    const get=async()=>{if(sessionKey)return sessionKey;if(!indexedDBImpl)return '';sessionKey=(await operation('readonly',store=>store.get(scope)))||'';return sessionKey;};
    return {
        get,
        async set(value,remember=false){if(remember)await operation('readwrite',store=>store.put(value,scope));else await forgetPersistent();sessionKey=value;},
        async remember(remember){const key=await get();if(remember&&key)await operation('readwrite',store=>store.put(key,scope));else if(!remember)await forgetPersistent();return Boolean(key);},
        async status(){const key=await get(),stored=indexedDBImpl?(await operation('readonly',store=>store.get(scope)))||'':'';return {available:!!key,persistent:!!key&&stored===key};},
        forgetPersistent,
        async clear(){await forgetPersistent();sessionKey='';},
    };
}

// An empty/masked input means save the actual current key again, never a no-op.
export async function saveCurrentKey({input,vault,settings,writeServerKey,fingerprint,save}){
    const supplied=String(input||'').trim(),key=supplied||await vault.get();
    if(!key)throw Error('酒馆端保存过 Key，但当前浏览器没有可用的 Vibe Key。请补填一次并保存，圆点只是状态提示，不能还原 Key。');
    const hash=await fingerprint(key);
    if(!supplied&&settings.keyHash&&settings.keyHash!==hash)throw Error('本设备 Key 与酒馆当前 Key 不匹配，请重新填写');
    const result=await writeServerKey(key);if(result===null)throw Error('酒馆未能保存 Key，请检查连接或权限后重试');
    settings.keyHash=hash;save();
    await vault.set(key,!!settings.rememberDirectKey);
}

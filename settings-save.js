// SillyTavern reports success by event; TT also returns false on failure.
export async function persistHostSettings({saveNow,source,event}){
    let confirmed=false;
    const saved=()=>{confirmed=true;};
    if(event)source.on(event,saved);
    try{
        const result=await saveNow();
        if(result===false||(!confirmed&&result!==true))throw Error('保存失败，请重试');
    }finally{if(event)source.removeListener(event,saved);}
}

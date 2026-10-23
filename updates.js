export function createExtensionUpdater({moduleURL,getGlobal=()=>false,getHeaders,fetchImpl=fetch,now=Date.now}){
    const path=new URL(moduleURL).pathname.split('/third-party/')[1];
    const name=path?decodeURIComponent(path.split('/')[0]):'';
    if(!name||/[\\/]/.test(name)||name==='.'||name==='..')throw Error('无法识别当前插件安装目录');
    let cached=null,checkedAt=0,pending=null,installed=false;
    const request=async endpoint=>{
        const response=await fetchImpl('/api/extensions/'+endpoint,{method:'POST',headers:getHeaders(),body:JSON.stringify({extensionName:name,global:getGlobal('third-party/'+name)===true}),signal:AbortSignal.timeout(60000)});
        if(!response.ok)throw Error(`插件${endpoint==='version'?'检查':'更新'}失败：HTTP ${response.status}。请检查酒馆服务器网络或插件管理权限。`);
        const data=await response.json();if(typeof data.isUpToDate!=='boolean')throw Error('酒馆返回了无效的更新信息');return data;
    };
    return {
        check(force=false){
            if(pending)return pending;
            if(!force&&cached&&now()-checkedAt<600000)return Promise.resolve(cached);
            pending=request('version').then(data=>{cached={...data,needsReload:installed};checkedAt=now();return cached;}).finally(()=>{pending=null;});return pending;
        },
        async install(){const result=await request('update');installed=true;cached=null;return result;}
    };
}

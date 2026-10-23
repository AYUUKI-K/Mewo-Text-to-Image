export function imageVersions(record){
    if(!record)return [];
    return record.versions?.length?record.versions:record.url?[{url:record.url,request:record.request,created:record.created,deleted:record.deleted||false}]:[];
}
export function appendImageVersion(record,image){
    const versions=[...imageVersions(record),image];
    return {...image,versions,selected:versions.length-1};
}
export function selectImageVersion(record,offset){
    const versions=imageVersions(record);
    if(!versions.some(v=>v.url&&!v.deleted))return null;
    let selected=Math.max(0,Math.min(Number(record.selected??versions.length-1),versions.length-1));
    const step=offset<0?-1:1;
    for(let i=0;i<versions.length;i++){
        selected=(selected+step+versions.length)%versions.length;
        if(versions[selected].url&&!versions[selected].deleted)break;
    }
    const item=versions[selected];
    Object.assign(record,{versions,selected,url:item.url,request:item.request,created:item.created,deleted:false});
    return item;
}

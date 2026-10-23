export function imageVersions(record){
    if(!record)return [];
    return record.versions?.length?record.versions:record.url?[{url:record.url,request:record.request,created:record.created,deleted:record.deleted||false}]:[];
}
export function appendImageVersion(record,image){
    const versions=[...imageVersions(record),image];
    return {...image,versions,selected:versions.length-1};
}

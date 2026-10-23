// Use the same browser Blob download as an image in the chat floor.
export async function downloadImageSelection(images,{saveBlob,fetchImpl=fetch}){
    if(!images.length)throw Error('请先勾选图片');
    for(const image of images){
        const response=await fetchImpl(image.url);
        if(!response.ok)throw Error(`图片下载失败：${image.name}（HTTP ${response.status}）`);
        const result=await saveBlob(await response.blob(),image.name);
        if(result?.delivered===false)break;
    }
}

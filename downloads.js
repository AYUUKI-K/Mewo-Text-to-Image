export async function downloadImageSelection(images,{makeArchive,saveBlob,fetchImpl=fetch}){
    if(!images.length)throw Error('请先勾选图片');
    const archive=await makeArchive();
    for(const image of images){
        const response=await fetchImpl(image.url);if(!response.ok)throw Error(`图片下载失败：${image.name}（HTTP ${response.status}）`);
        archive.file(image.name,await response.blob());
    }
    const blob=await archive.generateAsync({type:'blob',compression:'STORE'});
    await saveBlob(blob,`miao-images-${images.length}.zip`);
}

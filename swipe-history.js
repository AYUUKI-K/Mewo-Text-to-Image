const ID='miao_nai_image',STORE='miao_nai_image_swipes';
// ST replaces message.extra when switching/regenerating swipes. This ledger
// lives on the message itself; mirrors keep native swipe snapshots compatible.
export function migrateSwipeImages(message){
    let changed=false;
    for(const extra of [message.extra,...(message.swipe_info||[]).map(info=>info?.extra)]){
        for(const [legacyKey,record] of Object.entries(extra?.[ID]||{})){
            const match=/^(\d+):([\s\S]+)$/.exec(legacyKey);if(!match||!record?.url&&!record?.versions?.length)continue;
            const pages=message[STORE]??={},page=pages[match[1]]??={};
            if(!page[match[2]]){page[match[2]]=structuredClone(record);changed=true;}
        }
    }
    return changed;
}
export function readSwipeImage(message,swipe,slot){migrateSwipeImages(message);return message[STORE]?.[swipe]?.[slot];}
export function writeSwipeImage(message,swipe,slot,record){
    const pages=message[STORE]??={};(pages[swipe]??={})[slot]=record;
    const legacyKey=`${swipe}:${slot}`;
    if((message.swipe_id??0)===swipe){message.extra??={};(message.extra[ID]??={})[legacyKey]=structuredClone(record);}
    message.swipe_info??=[];message.swipe_info[swipe]??={};message.swipe_info[swipe].extra??={};
    (message.swipe_info[swipe].extra[ID]??={})[legacyKey]=structuredClone(record);
}
export function swipeImageRecords(message){
    migrateSwipeImages(message);
    return Object.entries(message[STORE]||{}).flatMap(([swipe,records])=>Object.entries(records).map(([slot,record])=>({swipe:Number(swipe),slot,record})));
}
export function removeSwipeImages(message,removed){
    if(!message[STORE])return;
    const shifted={};for(const [swipe,records] of Object.entries(message[STORE]))if(Number(swipe)!==removed)shifted[Number(swipe)>removed?Number(swipe)-1:Number(swipe)]=records;
    message[STORE]=shifted;
    if(message.extra)delete message.extra[ID];for(const info of message.swipe_info||[])if(info?.extra)delete info.extra[ID];
    for(const [swipe,records] of Object.entries(shifted))for(const [slot,record] of Object.entries(records))writeSwipeImage(message,Number(swipe),slot,record);
}

import {randomId} from './browser-crypto.js';
export const RESOURCE_VERSION='2.1-1024';
export const WORLD_NAME='[喵喵]文生图 2.1';
const validEntries=book=>book&&book.entries&&typeof book.entries==='object'&&!Array.isArray(book.entries)&&Object.values(book.entries).every(entry=>entry&&typeof entry==='object'&&!Array.isArray(entry));
export function mergeWorldEntries(existing,incoming){
    if(!validEntries(incoming)||!validEntries(existing))throw Error('世界书需要有效的 entries 字段');
    const entries=structuredClone(existing.entries);
    for(const source of Object.values(incoming.entries)){
        const title=String(source.comment||'').trim();
        const matches=title?Object.entries(entries).filter(([,entry])=>String(entry.comment||'').trim()===title):[];
        let key=matches[0]?.[0];
        if(key===undefined){
            key=String(source.uid??0);
            if(!/^\d+$/.test(key)||Object.hasOwn(entries,key)){let uid=0;while(Object.hasOwn(entries,String(uid)))uid++;key=String(uid);}
        }
        for(const [duplicate] of matches.slice(1))delete entries[duplicate];
        entries[key]={...structuredClone(source),uid:Number(key)};
    }
    return {...structuredClone(existing),...structuredClone(incoming),entries};
}
const regexFamily=name=>/^喵喵文生图[1-4]-/.test(name||'')?name.replace(/-\d{4}$/,''):null;
export function mergeRegexRules(existing,incoming,makeId=randomId){
    const list=Array.isArray(incoming)?incoming:[incoming];
    for(const rule of list)if(!rule||typeof rule.findRegex!=='string'||!rule.findRegex||typeof rule.replaceString!=='string')throw Error('不是有效的酒馆正则文件');
    let merged=structuredClone(existing);
    for(const rule of list){
        const family=regexFamily(rule.scriptName);
        const matches=merged.map((item,index)=>({item,index})).filter(({item})=>rule.id&&item.id===rule.id||rule.scriptName&&item.scriptName===rule.scriptName||family&&regexFamily(item.scriptName)===family);
        const replacement={...structuredClone(rule),id:matches[0]?.item.id||rule.id||makeId()};
        if(!matches.length){merged.push(replacement);continue;}
        const first=matches[0].index,duplicates=new Set(matches.slice(1).map(({index})=>index));
        merged=merged.map((item,index)=>index===first?replacement:item).filter((_,index)=>!duplicates.has(index));
    }
    return merged;
}
export function bundledWorldTargets(names,preferred){
    const existing=names.filter(name=>/^\[喵喵\]文生图\s*2\.[01]$/.test(name));
    const primary=existing.includes(preferred)?preferred:existing.find(name=>/2\.0$/.test(name))||existing[0]||WORLD_NAME;
    return [primary,...existing.filter(name=>name!==primary)];
}
export function migrateWorldBindings({selected=[],worldInfo={},powerUser={},chatMetadata={}},oldNames,newName=WORLD_NAME){
    const old=new Set(oldNames),replace=name=>old.has(name)?newName:name;
    const remap=list=>[...new Set(list.map(replace))];
    selected.splice(0,selected.length,...remap(selected));
    worldInfo.globalSelect=[...selected];
    for(const lore of worldInfo.charLore||[])if(Array.isArray(lore.extraBooks))lore.extraBooks=remap(lore.extraBooks);
    if(old.has(powerUser.persona_description_lorebook))powerUser.persona_description_lorebook=newName;
    for(const persona of Object.values(powerUser.persona_descriptions||{}))if(old.has(persona.lorebook))persona.lorebook=newName;
    const chatChanged=old.has(chatMetadata.world_info);
    if(chatChanged)chatMetadata.world_info=newName;
    return chatChanged;
}

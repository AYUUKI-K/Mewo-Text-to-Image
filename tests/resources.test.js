import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeWorldEntries,mergeRegexRules,bundledWorldTargets,WORLD_NAME} from '../resources.js';

test('world updates replace matching titles, keep entry IDs, and retain unrelated user entries',()=>{
    const old={name:'user metadata',entries:{7:{uid:7,comment:'主体',content:'old',disable:true},3:{uid:3,comment:'用户追加',content:'keep'},9:{uid:9,comment:'主体',content:'duplicate'}}};
    const incoming={entries:{0:{uid:0,comment:'主体',content:'2.1',disable:false},3:{uid:3,comment:'新增条目',content:'new'}}};
    const result=mergeWorldEntries(old,incoming);
    assert.equal(result.entries[7].content,'2.1');assert.equal(result.entries[7].uid,7);assert.equal(result.entries[7].disable,false);
    assert.equal(result.entries[3].content,'keep');assert.equal(result.entries[9],undefined);
    assert.equal(Object.values(result.entries).filter(entry=>entry.comment==='主体').length,1);
    const added=Object.values(result.entries).find(entry=>entry.comment==='新增条目');assert.notEqual(added.uid,3);assert.equal(result.name,'user metadata');
    assert.deepEqual(mergeWorldEntries(result,incoming),result);
    assert.equal(old.entries[7].content,'old');assert.equal(incoming.entries[0].uid,0);
});
test('invalid world resources fail before merging and bundled world names retain old bindings',()=>{
    for(const entries of [null,[],{0:null}])assert.throws(()=>mergeWorldEntries({entries:{}},{entries}),/entries/);
    assert.deepEqual(bundledWorldTargets([],''),[WORLD_NAME]);
    assert.deepEqual(bundledWorldTargets(['其他书','[喵喵]文生图 2.0'],'其他书'),['[喵喵]文生图 2.0']);
    assert.deepEqual(bundledWorldTargets(['[喵喵]文生图 2.0',WORLD_NAME],WORLD_NAME),[WORLD_NAME,'[喵喵]文生图 2.0']);
    assert.deepEqual(bundledWorldTargets(['自定义 2.0','[喵喵]文生图 2.2'],''),[WORLD_NAME]);
});
test('regex overwrites old dated copies even with changed IDs and removes duplicates',()=>{
    const old=[{id:'unrelated',scriptName:'用户规则',findRegex:'x',replaceString:'keep'},{id:'imported-id',scriptName:'喵喵文生图1-去标签-0820',findRegex:'old',replaceString:'old'},{id:'copy-id',scriptName:'喵喵文生图1-去标签-1024',findRegex:'copy',replaceString:'copy'},{id:'other',scriptName:'用户规则-0820',findRegex:'y',replaceString:'keep'}];
    const incoming=[{id:'author-id',scriptName:'喵喵文生图1-去标签-1024',findRegex:'new',replaceString:'',disabled:false}];
    const result=mergeRegexRules(old,incoming);
    assert.equal(result.length,3);assert.equal(result[1].id,'imported-id');assert.equal(result[1].findRegex,'new');assert.equal(result[1].scriptName,incoming[0].scriptName);
    assert.deepEqual(result[0],old[0]);assert.deepEqual(result[2],old[3]);assert.deepEqual(mergeRegexRules(result,incoming),result);
    assert.equal(old[1].findRegex,'old');
});
test('regex also replaces by ID or exact name, without conflating unrelated dated rules',()=>{
    const byId=mergeRegexRules([{id:'same',scriptName:'renamed',findRegex:'old',replaceString:''}],{id:'same',scriptName:'新版',findRegex:'new',replaceString:'ok'});
    assert.equal(byId.length,1);assert.equal(byId[0].findRegex,'new');
    const byName=mergeRegexRules([{id:'keep-id',scriptName:'标题',findRegex:'old',replaceString:''}],{id:'other-id',scriptName:'标题',findRegex:'new',replaceString:''});
    assert.equal(byName.length,1);assert.equal(byName[0].id,'keep-id');
    const dated=mergeRegexRules([{id:'old',scriptName:'其他规则-0820',findRegex:'old',replaceString:''}],{scriptName:'其他规则-1024',findRegex:'new',replaceString:''},()=> 'new-id');
    assert.equal(dated.length,2);assert.equal(dated[1].id,'new-id');
    assert.throws(()=>mergeRegexRules([], [{findRegex:'x',replaceString:''},{findRegex:'y'}]),/正则/);
});
test('bundled pack is exactly world 2.1 and the four supplied regex versions',async()=>{
    const book=JSON.parse(await readFile(new URL('../assets/worldbook.json',import.meta.url),'utf8'));
    const rules=JSON.parse(await readFile(new URL('../assets/regex.json',import.meta.url),'utf8'));
    assert.equal(Object.keys(book.entries).length,13);
    assert.ok(book.entries[10].content.includes('easter_egg'));
    assert.deepEqual(rules.map(rule=>rule.scriptName),['喵喵文生图1-去标签-1024','喵喵文生图2-去imagethink-1024','喵喵文生图3-居中美化-0511','喵喵文生图4-彩蛋介绍美化-1024']);
    assert.deepEqual(mergeWorldEntries(mergeWorldEntries({entries:{}},book),book),mergeWorldEntries({entries:{}},book));
    assert.equal(mergeRegexRules(mergeRegexRules([],rules),rules).length,4);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {selectVibes,resolveVibes} from '../vibe.js';
import {normalizeProfile} from '../core.js';

const vibes=Array.from({length:12},(_,i)=>({id:`v${i}`,key:'hash',strength:0.6}));
const library=vibes.map(v=>({...v,name:`氛围 ${v.id}`,encodings:{'v4-5full':{hash:{encoding:'YQ=='}}}}));
test('random pools may exceed four but each generation sends exactly one encoding',()=>{
    const profile={vibeMode:'random',vibes};
    for(let i=0;i<vibes.length;i++){
        const chosen=selectVibes(profile,library,()=>(i+0.5)/vibes.length);
        assert.equal(chosen.length,1);
        assert.equal(chosen[0].id,`v${i}`);
        assert.equal(chosen[0].name,`氛围 v${i}`);
        assert.equal(resolveVibes('nai-diffusion-4-5-full',chosen,library).reference_image_multiple.length,1);
    }
    assert.equal(profile.vibes.length,12);
});
test('queued selections are independent snapshots, rerolls select afresh',()=>{
    const profile={vibeMode:'random',vibes:structuredClone(vibes)};
    let draws=0;
    const first=selectVibes(profile,library,()=>{draws++;return 0;});
    const second=selectVibes(profile,library,()=>0.99);
    profile.vibes[0].strength=0.1;
    assert.equal(draws,1);
    assert.equal(first[0].id,'v0');assert.equal(first[0].strength,0.6);
    assert.equal(second[0].id,'v11');
});
test('multiple mode and legacy configs retain a strict four-item limit',()=>{
    assert.throws(()=>selectVibes({vibes},library),/4/);
    assert.throws(()=>selectVibes({vibeMode:'multiple',vibes},library),/4/);
    const selected=selectVibes({vibes:vibes.slice(0,4)},library);
    assert.equal(selected.length,4);
    assert.equal(resolveVibes('nai-diffusion-4-5-full',selected,library).reference_image_multiple.length,4);
    assert.equal(normalizeProfile({}).vibeMode,'multiple');
    assert.equal(normalizeProfile({vibeMode:'random'}).vibeMode,'random');
});
test('empty pools produce ordinary images and invalid modes fail explicitly',()=>{
    assert.deepEqual(selectVibes({vibeMode:'random'}),[]);
    assert.deepEqual(selectVibes({vibes:[]}),[]);
    assert.throws(()=>selectVibes({vibeMode:'invalid',vibes}),/方式/);
});

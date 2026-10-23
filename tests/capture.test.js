import test from 'node:test';
import assert from 'node:assert/strict';
import {sizePresets,delimiterPattern,parseBlocks} from '../core.js';
test('three standard sizes',()=>{
 assert.deepEqual(sizePresets.map(p=>[p.width,p.height]),[[1024,1024],[832,1216],[1216,832]]);
});
test('custom delimiters are literal, including regex metacharacters',()=>{
 for(const [start,end] of [['image###','###'],['<draw>','</draw>'],['[a](1)+','[/a]$'],['.*','?+']]){
  const pattern=delimiterPattern(start,end);
  assert.deepEqual(parseBlocks(`text ${start}cat${end} ${start}dog${end}`,pattern).map(b=>b.prompt),['cat','dog']);
  assert.equal(parseBlocks(start+'unfinished',pattern).length,0);
 }
 assert.throws(()=>delimiterPattern('','###'));assert.throws(()=>delimiterPattern('###',''));
});

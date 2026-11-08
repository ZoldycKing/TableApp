const assert = require('node:assert/strict');
const { parts, project, render } = require('../model.js');
const assembled = parts({explosion:0}), exploded = parts({explosion:1});
assert.equal(assembled.length,2);
const offset = project([160,0,0]);
for(let i=0;i<assembled.length;i++){
 assert.equal(assembled[i].surfaces.length,exploded[i].surfaces.length);
 for(let j=0;j<assembled[i].surfaces.length;j++){
  const before=assembled[i].surfaces[j],after=exploded[i].surfaces[j];
  assert.equal(before.id,after.id);
  for(let k=0;k<before.points.length;k++)for(let axis=0;axis<2;axis++){
   assert.ok(Number.isFinite(before.points[k][axis]));
   const expected=before.points[k][axis]+(assembled[i].id==='paper'?offset[axis]:0);
   assert.ok(Math.abs(expected-after.points[k][axis])<1e-9,'Part translation must preserve its shape and shared camera');
  }
 }
}
assert.deepEqual(parts({isolated:'paper'})[0].surfaces,assembled[0].surfaces,'Isolation must restore complete paper geometry');
for(const explosion of [0,.5,1,1.5]){
 const markup=render({explosion}).markup;
 const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size);
 assert.ok(!/NaN|Infinity|undefined/.test(markup));
}
console.log('Passed stable part inventory, finite projection, assembled/exploded correspondence and complete isolated geometry.');

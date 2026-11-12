const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),{prepare}=require('../test-profile.cjs');
test('test profiles are opt-in, confined to temporary filerrrr folders and reject junction escapes',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-profile-test-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'other-profile-'));
  try{
    assert.equal(prepare(undefined),null);assert.throws(()=>prepare('relative'),/absolute/);
    assert.throws(()=>prepare(path.resolve('test-profile')),/temporary/);assert.throws(()=>prepare(outside),/temporary/);
    const profile=prepare(path.join(dir,'profile'));assert.ok(fs.statSync(profile).isDirectory());
    fs.symlinkSync(outside,path.join(dir,'escape'),'junction');assert.throws(()=>prepare(path.join(dir,'escape','profile')),/escape/);
    assert.ok(!fs.existsSync(path.join(outside,'profile')));
  }finally{fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
});

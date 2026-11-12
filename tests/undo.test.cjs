const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {createUndo,TTL}=require('../undo.cjs');

test('Undo is owned, expires, protects originals and consumes its receipt once',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-undo-test-'));
  try{
    let now=0;const trashed=[];
    const undo=createUndo({now:()=>now,trash:async file=>{trashed.push(file);fs.renameSync(file,`${file}.recycled`);}});
    const input=path.join(dir,'original.txt'),output=path.join(dir,'converted.md');fs.writeFileSync(input,'original');fs.writeFileSync(output,'converted');
    const receipt=await undo.register([{input,output,outputs:[input,output]}],1);
    assert.equal(receipt.expiresAt,TTL);
    assert.match((await undo.undo(receipt.token,2)).error,/unavailable/);assert.ok(fs.existsSync(output));
    const result=await undo.undo(receipt.token,1);
    assert.deepEqual(result.undone,[output]);assert.deepEqual(trashed,[output]);assert.equal(fs.readFileSync(input,'utf8'),'original');
    assert.match((await undo.undo(receipt.token,1)).error,/unavailable/);
    fs.writeFileSync(output,'new');const expired=await undo.register([{input,output}],1);now=TTL+1;
    assert.match((await undo.undo(expired.token,1)).error,/expired/);assert.ok(fs.existsSync(output));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Undo keeps changed or replaced files and changed extracted folders, while recycling untouched outputs',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-undo-changes-'));
  try{
    const input=path.join(dir,'source.zip'),files=['edited.txt','replaced.txt','untouched.txt'].map(name=>path.join(dir,name)),folder=path.join(dir,'extracted');
    fs.writeFileSync(input,'source');for(const file of files)fs.writeFileSync(file,'same');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'child.txt'),'nested');
    const undo=createUndo({trash:async file=>fs.renameSync(file,`${file}.recycled`)});
    const receipt=await undo.register([{input,outputs:[...files,folder]}],1);
    fs.writeFileSync(files[0],'edited');fs.renameSync(files[1],`${files[1]}.old`);fs.writeFileSync(files[1],'replacement');fs.writeFileSync(path.join(folder,'child.txt'),'edited nested');
    const result=await undo.undo(receipt.token,1);
    assert.deepEqual(result.undone,[files[2]]);assert.equal(result.skipped.length,3);
    assert.equal(fs.readFileSync(files[1],'utf8'),'replacement');assert.ok(fs.existsSync(folder));assert.ok(fs.existsSync(input));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Undo handles partial Recycle Bin failure without deleting failed outputs',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-undo-failure-'));
  try{
    const input=path.join(dir,'source'),output=path.join(dir,'output');fs.writeFileSync(input,'source');fs.writeFileSync(output,'result');
    const undo=createUndo({trash:async()=>{throw new Error('Recycle Bin unavailable');}}),receipt=await undo.register([{input,output}],1);
    const result=await undo.undo(receipt.token,1);assert.equal(result.undone.length,0);assert.equal(result.skipped.length,1);assert.ok(fs.existsSync(output));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

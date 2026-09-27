const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function ui(){
 const html=fs.readFileSync('ui.html','utf8');const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,{value:id==='format'?'auto':'',disabled:true,textContent:'Chưa chọn file.',style:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return elements.get(id);}};
 vm.runInNewContext(script,{document,console,setTimeout,clearTimeout,parent:{postMessage(){}}});return elements;
}
test('shipped UI bundle parses and installs file/import handlers',()=>{const e=ui();assert.equal(typeof e.get('file').listeners.change,'function');assert.equal(typeof e.get('importBtn').listeners.click,'function');});
test('selecting valid JSON updates status and enables import',async()=>{const e=ui();e.get('file').files=[{name:'scene.json',size:200,text:async()=>fs.readFileSync('examples/scene.json','utf8')}];await e.get('file').listeners.change();assert.match(e.get('status').textContent,/scene.json.*Sẵn sàng import/);assert.equal(e.get('importBtn').disabled,false);});
test('file read failure is reported instead of leaving no-file status',async()=>{const e=ui();e.get('file').files=[{name:'broken.html',size:20,text:async()=>{throw Error('Read failed')}}];await e.get('file').listeners.change();assert.match(e.get('status').textContent,/broken.html: Read failed/);assert.equal(e.get('importBtn').disabled,true);});

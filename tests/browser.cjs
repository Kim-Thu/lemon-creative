const fs=require('node:fs');const assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'.']}));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();await page.setContent(fs.readFileSync('ui.html','utf8'));
 await page.evaluate(()=>{delayEl.value='0';});
 const html=fs.readFileSync('examples/responsive.html','utf8');
 const snapshots=[];
 for(const width of [1440,768,390]){
 const result=await page.evaluate(async({html,width})=>{sourceHtml=html;const doc=await renderSource(width);return snapshot(doc);},{html,width});
 const all=[];function collect(n){all.push(n);(n.children||[]).forEach(collect)}collect(result.root);
 assert(all.some(n=>n.type==='TEXT'&&n.text==='Lemon Creative'));
 assert(all.some(n=>n.component==='Button / Primary'));
 const grid=all.find(n=>n.layout?.mode==='GRID');assert.equal(grid.layout.columnCount,width===1440?3:width===768?2:1);
 assert(all.filter(n=>n.type==='FRAME'&&n.children.length).some(n=>n.layout.mode==='VERTICAL'));
 snapshots.push(result);
 }
 const security=await page.evaluate(async()=>{sourceHtml='<script>parent.hacked=true</'+'script><p onclick="alert(1)">Safe</p>';const d=await renderSource(390);return {scripts:d.scripts.length,event:d.querySelector('p').hasAttribute('onclick'),hacked:window.hacked};});
 assert.equal(security.scripts,0);assert.equal(security.event,false);assert(!security.hacked);
 const order=await page.evaluate(async()=>{sourceHtml='<div>Hello <b>bold</b> after</div>';return snapshot(await renderSource(390));});
 const text=[];function read(n){if(n.type==='TEXT')text.push(n.text);(n.children||[]).forEach(read)}read(order.root);assert.deepEqual(text,['Hello ','bold',' after']);
 fs.writeFileSync('/tmp/lemon-snapshots.json',JSON.stringify({screens:snapshots,tokens:snapshots[0].tokens}));
 console.log('PASS browser: desktop/tablet/mobile, text, DOM order, components, safe HTML');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

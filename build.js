const fs = require('node:fs');
const shared=fs.readFileSync('src/normalize.js','utf8');
fs.writeFileSync('code.js',shared+'\n'+fs.readFileSync('src/renderer.js','utf8'));
fs.writeFileSync('ui.html',fs.readFileSync('src/ui.template.html','utf8').replace('<!-- BUNDLE -->','<script>\n'+shared+'\n'+fs.readFileSync('src/ui.js','utf8')+'\n</script>'));
const ui=fs.readFileSync('src/ui.js','utf8');
const capture=ui.slice(ui.indexOf('const wait ='),ui.indexOf('async function renderSource('));
fs.writeFileSync('export-devtools.js',`;(async()=>{\n${shared}\nlet captureWarnings=[]; const iframe={style:{width:String(innerWidth)}};\n${capture}\nconst data=await snapshot(document); data.viewport.width=innerWidth; data.warnings=[...new Set(captureWarnings)];\nconst json=JSON.stringify(data);\nawait navigator.clipboard.writeText(json).catch(()=>{});\nconst a=document.createElement('a'),url=URL.createObjectURL(new Blob([json],{type:'application/json'}));\na.href=url;a.download='figma-snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);\nconsole.log('Đã xuất snapshot',data.warnings);\n})();\n`);

// Emits the current renderer with only the plugin UI/lifecycle removed.
// Run this output through use_figma in a dedicated empty QA file.
const fs=require('node:fs');
let code=fs.readFileSync('code.js','utf8').replace(/figma\.showUI\([^\n]+\);/,'');
code=code.slice(0,code.indexOf('let importing=false;'));
const fixture=JSON.parse(fs.readFileSync('examples/scene.json','utf8'));
fixture.root.children.push(structuredClone(fixture.root.children[1]));
console.log(code+`\nconst data=Lemon.normalize(${JSON.stringify(fixture)});\n`+`
context={title:'QA v4',options:{tokens:true,components:true},warnings:new Set(),variables:new Map(),values:new Map(),createdVariables:[],components:new Map(),libraryHeight:0};
context.library=figma.createFrame();context.library.name='QA v4 Components';context.library.fills=[];context.library.clipsContent=false;context.library.x=1300;context.library.y=100;
for(const [name,value] of Object.entries(data.tokens)) tokenVariable(name,value);
const roots=[];
for(const width of [390,240]) {
 const root=figma.createFrame();roots.push(root);root.name='QA v4 / '+width;root.resize(width,600);root.layoutMode='VERTICAL';root.primaryAxisSizingMode='AUTO';root.counterAxisSizingMode='FIXED';root.x=1800+roots.length*500;root.y=100;root.clipsContent=false;
 await build(data.screens[0].root,root,{rect:{x:0,y:0,w:width,h:600}});
}
context.library.resize(342,context.libraryHeight);
const all=[context.library,...context.library.findAll(),...roots.flatMap(r=>[r,...r.findAll()])];
const texts=roots.map(r=>r.findAll(n=>n.type==='TEXT').map(n=>({id:n.id,text:n.characters,width:n.width,height:n.height})));
const instances=all.filter(n=>n.type==='INSTANCE');
const checks={componentReuse:context.components.size===1,instanceCount:instances.length===4,narrowTextWrap:texts[1][0].height>texts[0][0].height,explicitToken:instances[0].boundVariables.fills[0].id===context.variables.get('color/brand').id};
await roots[1].screenshot({scale:1});
return {checks,createdNodeIds:all.map(n=>n.id),rootIds:roots.map(r=>r.id),collectionId:context.collection.id,variables:context.createdVariables.map(v=>({id:v.id,name:v.name})),texts,warnings:[...context.warnings]};
`);

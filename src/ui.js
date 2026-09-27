
const fileEl = document.getElementById("file");
const widthEl = document.getElementById("width");
const delayEl = document.getElementById("delay");
const importBtn = document.getElementById("importBtn");
const closeBtn = document.getElementById("closeBtn");
const statusEl = document.getElementById("status");
const iframe = document.getElementById("preview");
const wrap = document.getElementById("previewWrap");

let sourceHtml = "";
let inputText = "", fileName = "", captureWarnings=[];
const sourceEl=document.getElementById('source');
const formatEl=document.getElementById('format');
const mappingEl=document.getElementById('mapping');
const viewportsEl=document.getElementById('viewports');
function prepareSource(){
  const value=sourceEl.value.trim() || inputText.trim();
  if(value.length>20*1024*1024) throw new Error('Nội dung vượt 20 MB.');
  const format=formatEl.value;
  if(format==='html' || format==='auto' && value.startsWith('<')) return {html:value};
  const data=JSON.parse(value);
  if(format==='dom' || format==='auto' && (data.tag || data.root?.tag && !data.root?.rect)) return {html:Lemon.domHTML(data,JSON.parse(mappingEl.value)),tokens:data.tokens||{}};
  return {scene:Lemon.normalize(data)};
}
function isTailwindV4Source(src){
  try {const u=new URL(src);return u.protocol==='https:' && ['cdn.jsdelivr.net','unpkg.com'].includes(u.hostname) && /^\/(?:npm\/)?@tailwindcss\/browser@4(?:\.\d+){0,2}(?:\/dist\/index\.global\.js)?\/?$/.test(u.pathname);}catch(_){return false;}
}
function sanitizedHTML(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  const scripts=[...doc.querySelectorAll('script')];
  const tailwind=scripts.some(n=>isTailwindV4Source(n.getAttribute('src')||''));
  if(scripts.some(n=>!isTailwindV4Source(n.getAttribute('src')||''))) captureWarnings.push('Script ứng dụng không chạy trong preview; chỉ trình biên dịch Tailwind v4 được tải.');
  if(doc.querySelector('style[type="text/tailwindcss"]') && !tailwind) throw new Error('HTML có CSS Tailwind nhưng thiếu trình biên dịch Tailwind v4 được hỗ trợ.');
  doc.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv]').forEach(n=>n.remove());
  doc.querySelectorAll('*').forEach(el=>{for(const a of [...el.attributes]) if(/^on/i.test(a.name) || ['srcdoc'].includes(a.name) || /^(?:javascript|vbscript):/i.test(a.value.trim())) el.removeAttribute(a.name);});
  if(tailwind){
    const marker=doc.createElement('div');marker.id='lemon-tailwind-ready';marker.className='hidden';marker.setAttribute('aria-hidden','true');doc.body.appendChild(marker);
    const compiler=doc.createElement('script');compiler.src='https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';doc.head.appendChild(compiler);
  }
  return '<!doctype html>'+doc.documentElement.outerHTML;
}
function timeout(promise,ms,label){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))]);}


const wait = ms => new Promise(r => setTimeout(r, ms));
const px = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round = n => Math.round(n * 100) / 100;

function rgba(s){
  const m = String(s || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
  if(!m) return Lemon.color(s);
  return {r:+m[1]/255,g:+m[2]/255,b:+m[3]/255,a:m[4]==null?1:+m[4]};
}

function parseShadow(s){
  if(!s || s === "none") return null;
  const color = s.match(/rgba?\([^)]+\)/)?.[0] || null;
  const nums = s.replace(/rgba?\([^)]+\)/,"").match(/-?\d*\.?\d+px/g) || [];
  return {
    color:rgba(color),x:px(nums[0]),y:px(nums[1]),
    blur:px(nums[2]),spread:px(nums[3]),inset:/\binset\b/.test(s)
  };
}

function visible(el,cs,r){
  return r.width>.5 && r.height>.5 && cs.display!=="none" &&
    cs.visibility!=="hidden" && px(cs.opacity||1)>.001;
}

function rectOf(el){
  const r=el.getBoundingClientRect();
  return {x:round(r.left),y:round(r.top),w:round(r.width),h:round(r.height)};
}

function rangeRect(doc,node){
  const rg=doc.createRange();
  rg.selectNodeContents(node);
  const r=rg.getBoundingClientRect();
  return {x:round(r.left),y:round(r.top),w:round(r.width),h:round(r.height)};
}

function styleInfo(cs){
  return {
    opacity:px(cs.opacity||1),
    background:rgba(cs.backgroundColor),
    color:rgba(cs.color),
    border:{
      top:px(cs.borderTopWidth),right:px(cs.borderRightWidth),
      bottom:px(cs.borderBottomWidth),left:px(cs.borderLeftWidth),
      color:rgba(cs.borderTopColor)
    },
    radius:{
      tl:px(cs.borderTopLeftRadius),tr:px(cs.borderTopRightRadius),
      br:px(cs.borderBottomRightRadius),bl:px(cs.borderBottomLeftRadius)
    },
    shadow:parseShadow(cs.boxShadow),
    overflow:{x:cs.overflowX,y:cs.overflowY},
    font:{
      family:cs.fontFamily.split(",")[0].replace(/["']/g,"").trim(),
      size:px(cs.fontSize),weight:parseInt(cs.fontWeight,10)||400,
      lineHeight:cs.lineHeight==="normal"?px(cs.fontSize)*1.2:px(cs.lineHeight),
      letterSpacing:cs.letterSpacing==="normal"?0:px(cs.letterSpacing),
      align:cs.textAlign,style:cs.fontStyle||"normal"
    }
  };
}

function tracks(value){
  if(!value || value==="none") return [];
  return value.trim().split(/\s+/).map(px).filter(n=>n>0);
}

function layoutInfo(el,cs){
  const p=el.parentElement;
  const pcs=p?el.ownerDocument.defaultView.getComputedStyle(p):null;
  const pr=p?p.getBoundingClientRect():null;
  const r=el.getBoundingClientRect();
  const innerW=pr&&pcs?pr.width-px(pcs.paddingLeft)-px(pcs.paddingRight):null;
  const innerH=pr&&pcs?pr.height-px(pcs.paddingTop)-px(pcs.paddingBottom):null;

  const typed=el.computedStyleMap?.();
  const common={
    autoHeight:typed?.get("height")?.toString()==="auto",
    centered:typed?.get("margin-left")?.toString()==="auto" && typed?.get("margin-right")?.toString()==="auto",
    order:px(cs.order),
    minWidth:cs.minWidth==='auto'?null:px(cs.minWidth),maxWidth:cs.maxWidth==='none'?null:px(cs.maxWidth),
    minHeight:cs.minHeight==='auto'?null:px(cs.minHeight),maxHeight:cs.maxHeight==='none'?null:px(cs.maxHeight),
    padding:{top:px(cs.paddingTop),right:px(cs.paddingRight),bottom:px(cs.paddingBottom),left:px(cs.paddingLeft)},
    display:cs.display,position:cs.position,
    zIndex:cs.zIndex==="auto"?null:parseInt(cs.zIndex,10)||0,
    margin:{top:px(cs.marginTop),right:px(cs.marginRight),bottom:px(cs.marginBottom),left:px(cs.marginLeft)},
    flexItem:{grow:px(cs.flexGrow),shrink:px(cs.flexShrink),basis:cs.flexBasis},
    alignSelf:cs.alignSelf,
    fillsParentWidth:innerW!=null&&Math.abs(r.width-innerW)<=2,
    fillsParentHeight:innerH!=null&&Math.abs(r.height-innerH)<=2,
    contentSized:["inline","inline-block","inline-flex"].includes(cs.display)
  };

  if(cs.display==="flex"||cs.display==="inline-flex"){
    const horizontal=["row","row-reverse"].includes(cs.flexDirection);
    return {
      ...common,mode:horizontal?"HORIZONTAL":"VERTICAL",
      reverse:cs.flexDirection.endsWith("reverse"),
      wrap:cs.flexWrap!=="nowrap",gap:px(horizontal?cs.columnGap:cs.rowGap),
      rowGap:px(cs.rowGap||cs.gap),columnGap:px(cs.columnGap||cs.gap),
      padding:{top:px(cs.paddingTop),right:px(cs.paddingRight),bottom:px(cs.paddingBottom),left:px(cs.paddingLeft)},
      justify:cs.justifyContent,align:cs.alignItems
    };
  }

  if(cs.display==="grid"||cs.display==="inline-grid"){
    const columns=tracks(cs.gridTemplateColumns);
    const rows=tracks(cs.gridTemplateRows);
    return {
      ...common,mode:"GRID",
      padding:{top:px(cs.paddingTop),right:px(cs.paddingRight),bottom:px(cs.paddingBottom),left:px(cs.paddingLeft)},
      columnGap:px(cs.columnGap||cs.gap),rowGap:px(cs.rowGap||cs.gap),
      columns,rows,
      columnCount:Math.max(1,columns.length||1),
      rowCount:Math.max(1,rows.length||Math.ceil(el.children.length/Math.max(1,columns.length||1)))
    };
  }

  return {...common,mode:"NONE"};
}

function getName(el){
  return el.getAttribute("data-figma-name") ||
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    (el.tagName==="IMG"?el.getAttribute("alt"):"") ||
    (el.id?el.tagName.toLowerCase()+"#"+el.id:el.tagName.toLowerCase());
}

async function imageData(src,doc){
  if(!src) return null;
  if(src.startsWith("data:")) return src;
  try{
    const absolute=new URL(src,doc.baseURI).href;
    const res=await fetch(absolute,{mode:"cors",credentials:"omit"});
    if(!res.ok) return null;
    const blob=await res.blob();
    return await new Promise((resolve,reject)=>{
      const fr=new FileReader();
      fr.onload=()=>resolve(fr.result);
      fr.onerror=reject;
      fr.readAsDataURL(blob);
    });
  }catch(_){ return null; }
}

async function snapshot(doc){
  const win=doc.defaultView;
  let captured=0;
  const skip=new Set(["SCRIPT","STYLE","NOSCRIPT","LINK","META","HEAD","TEMPLATE"]);

  async function walk(el,depth=0){
    if(depth>80 || ++captured>20000) throw new Error("HTML vượt giới hạn 20.000 node / 80 cấp.");
    if(skip.has(el.tagName)) return null;

    const cs=win.getComputedStyle(el);
    const r=el.getBoundingClientRect();
    if(!visible(el,cs,r)) return null;

    const style=styleInfo(cs);
    const type=el.tagName.toLowerCase()==="img"?"IMAGE":el.tagName.toLowerCase()==="svg"?"SVG":"FRAME";

    const node={
      type,tag:el.tagName.toLowerCase(),name:getName(el),component:el.getAttribute("data-figma-component")||(el.tagName.toLowerCase()==="button"?"Button":undefined),
      rect:rectOf(el),style,layout:layoutInfo(el,cs),children:[]
    };

    if(type==="IMAGE"){
      node.src=el.currentSrc||el.src;
      node.alt=el.alt||"Image";
      node.objectFit=cs.objectFit||"cover";
      node.dataUrl=await imageData(node.src,doc);
      return node;
    }

    if(type==="SVG"){
      node.svg=el.outerHTML;
      return node;
    }

    if(cs.backgroundImage!=='none') captureWarnings.push(getName(el)+': background-image/gradient chưa chuyển được; dùng thẻ img cho ảnh.');
    for(const pseudo of ['::before','::after']) {const p=win.getComputedStyle(el,pseudo);if(p.content && !['none','normal','""'].includes(p.content)) captureWarnings.push(getName(el)+': có nội dung '+pseudo+' chưa được nhập.');}
    for(const childNode of [...el.childNodes]){
      if(childNode.nodeType===Node.ELEMENT_NODE){const c=await walk(childNode,depth+1);if(c) node.children.push(c);continue;}
      if(childNode.nodeType!==Node.TEXT_NODE) continue;
      const text=childNode.textContent.replace(/\s+/g," ");
      if(!text.trim()) continue;
      const tr=rangeRect(doc,childNode);
      if(tr.w<=.5||tr.h<=.5) continue;
      const lineHeight=style.font.lineHeight||style.font.size*1.2;
      node.children.push({
        type:"TEXT",name:text.slice(0,80),text,rect:tr,style,
        layout:{mode:"NONE",position:"static",contentSized:tr.h<=lineHeight*1.35,fillsParentWidth:false,fillsParentHeight:false},
        textLayout:{wrapped:tr.h>lineHeight*1.35},children:[]
      });
    }

    if(node.layout.mode==='GRID') {
      const regular=node.children.filter(c=>!['absolute','fixed'].includes(c.layout.position));
      const widths=regular.map(c=>c.rect.w);
      const spans=[...el.children].some(c=>/span/.test(win.getComputedStyle(c).gridColumn)||/span/.test(win.getComputedStyle(c).gridRow));
      if(spans || widths.some(w=>Math.abs(w-widths[0])>2)) {node.layout.mode='NONE';node.layout.freeform=true;captureWarnings.push(node.name+': grid có span/cột không đều; giữ tọa độ để tránh đổi bố cục.');}
    }
    if(!node.layout.freeform) inferFlow(node);
    return node;
  }

  return {
    version:4,
    tokens:cssTokens(doc),
    title:doc.title||"HTML Import",
    viewport:{
      width:Math.max(doc.documentElement.scrollWidth,doc.body.scrollWidth,parseInt(iframe.style.width)||1440),
      height:Math.max(doc.documentElement.scrollHeight,doc.body.scrollHeight)
    },
    root:await walk(doc.body)
  };
}

function cssTokens(doc){
  const cs=doc.defaultView.getComputedStyle(doc.documentElement),result={};
  for(const prop of [...cs]) if(prop.startsWith('--')) {
    const value=cs.getPropertyValue(prop).trim(),c=rgba(value);
    if(c) result[prop.slice(2)]=c;
    else if(/^-?[\d.]+(?:px)?$/.test(value)) result[prop.slice(2)]=parseFloat(value);
  }
  return result;
}
function inferFlow(node){
  const children=node.children.filter(c=>!['absolute','fixed'].includes(c.layout?.position));
  const l=node.layout;
  if(l.mode!=='NONE' || !children.length) return;
  const vertical=children.every((c,i)=>!i || c.rect.y>=children[i-1].rect.y+children[i-1].rect.h-2);
  const horizontal=children.every((c,i)=>!i || c.rect.x>=children[i-1].rect.x+children[i-1].rect.w-2);
  if(!vertical && !horizontal){captureWarnings.push(node.name+': luồng chồng lấn/inline phức tạp, giữ vị trí tự do.');return;}
  l.mode=vertical?'VERTICAL':'HORIZONTAL';
  l.autoHeight=l.autoHeight!==false;
  // Measured gaps preserve collapsed margins and each child's actual alignment.
  const axis=vertical?'y':'x',size=vertical?'h':'w',cross=vertical?'x':'y',crossSize=vertical?'w':'h';
  const start=vertical?'top':'left',end=vertical?'bottom':'right';
  const crossStart=vertical?'left':'top',crossEnd=vertical?'right':'bottom';
  l.padding=l.padding||{};
  l.padding[start]=Math.max(0,children[0].rect[axis]-node.rect[axis]);
  const last=children[children.length-1];
  l.padding[end]=Math.max(0,node.rect[axis]+node.rect[size]-last.rect[axis]-last.rect[size]);
  l.gap=0;
  node.children=node.children.map(c=>{
    const i=children.indexOf(c);if(i<0)return c;
    const gap=i?Math.max(0,c.rect[axis]-children[i-1].rect[axis]-children[i-1].rect[size]):0;
    let offset=Math.max(0,c.rect[cross]-node.rect[cross]-(l.padding[crossStart]||0));
    let remaining=Math.max(0,node.rect[crossSize]-(l.padding[crossStart]||0)-(l.padding[crossEnd]||0)-offset-c.rect[crossSize]);
    const centered=vertical && c.layout.centered;
    if(centered){offset=0;remaining=0;}
    if(!centered && !gap && !offset && !remaining) {if(vertical && c.type==='TEXT') c.layout.width='FILL';return c;}
    const padding={top:0,right:0,bottom:0,left:0};padding[start]=gap;padding[crossStart]=offset;padding[crossEnd]=remaining;
    c={...c,layout:{...c.layout,width:vertical?'FILL':c.layout.width,height:vertical?c.type==='TEXT'?'HUG':c.layout.height:'FILL'}};
    return {type:'FRAME',name:c.name+' / spacing',rect:{...c.rect,[axis]:c.rect[axis]-gap,[size]:c.rect[size]+gap,[cross]:node.rect[cross]+(l.padding[crossStart]||0),[crossSize]:node.rect[crossSize]-(l.padding[crossStart]||0)-(l.padding[crossEnd]||0)},style:{},layout:{mode:vertical?'VERTICAL':'HORIZONTAL',padding,align:centered?'center':'start',width:vertical?'FILL':'HUG',height:vertical?'HUG':'FIXED'},children:[c]};
  });
}
async function renderSource(viewportWidth=Number(widthEl.value)||1440){
  iframe.style.width=viewportWidth+'px';iframe.style.height='1200px';
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('HTML render timeout')),15000);
    iframe.onload=()=>{clearTimeout(timer);resolve();};
    iframe.srcdoc=sanitizedHTML(sourceHtml);
  });
  const doc=iframe.contentDocument;
  const marker=doc.getElementById('lemon-tailwind-ready');
  if(marker){
    const deadline=Date.now()+15000;
    while(doc.defaultView.getComputedStyle(marker).display!=='none'){
      if(Date.now()>deadline) throw new Error('Tailwind chưa tải/biên dịch xong. Dừng import để tránh tạo bố cục mất CSS. Kiểm tra kết nối CDN rồi thử lại.');
      await wait(50);
    }
    marker.remove();
  }
  if(doc.fonts) await timeout(doc.fonts.ready,10000,'Font tải quá lâu');
  await timeout(Promise.all([...doc.images].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r;}))),10000,'Ảnh tải quá lâu').catch(e=>captureWarnings.push(e.message));
  await wait(Math.max(0,Math.min(10000,Number(delayEl.value)||0)));
  const scale=Math.min(wrap.clientWidth/viewportWidth,.28);
  iframe.style.transform='scale('+scale+')';
  return doc;
}
sourceEl.addEventListener('input',()=>{importBtn.disabled=!sourceEl.value.trim()&&!inputText;});
fileEl.addEventListener('change',async()=>{
  const file=fileEl.files&&fileEl.files[0];if(!file)return;
  inputText='';sourceHtml='';sourceEl.value='';importBtn.disabled=true;
  statusEl.textContent='Đang đọc '+file.name+'…';
  try {
    if(file.size>20*1024*1024) throw new Error('File vượt 20 MB.');
    inputText=await file.text();fileName=file.name;captureWarnings=[];
    if(!inputText.trim()) throw new Error('File không có nội dung.');
    const prepared=prepareSource();
    statusEl.textContent='Đã đọc '+fileName+'.';
    if(prepared.html){sourceHtml=prepared.html;statusEl.textContent='Đã chọn '+fileName+'. Đang tạo preview…';await renderSource();}
    statusEl.textContent='Đã đọc '+fileName+'. Sẵn sàng import.';
    importBtn.disabled=false;
  }catch(e){statusEl.textContent='Không đọc được '+file.name+': '+e.message;}
});
importBtn.addEventListener('click',async()=>{
  importBtn.disabled=true;captureWarnings=[];
  try{
    const prepared=prepareSource();let payload=prepared.scene;
    if(prepared.html){
      sourceHtml=prepared.html;
      const widths=[...new Set([Number(widthEl.value),...viewportsEl.value.split(',').filter(x=>x.trim()).map(Number)])];
      if(widths.length>6 || widths.some(w=>!Number.isInteger(w)||w<320||w>3840)) throw new Error('Dùng tối đa 6 chiều rộng từ 320 đến 3840.');
      const screens=[];let tokens=prepared.tokens||{};
      for(const width of widths){statusEl.textContent='Đang đo layout ở '+width+'px…';const doc=await renderSource(width);const screen=await snapshot(doc);screen.viewport.width=width;screens.push(screen);tokens={...screen.tokens,...tokens};}
      payload={version:4,screens,tokens,warnings:[...new Set(captureWarnings)]};
    }
    parent.postMessage({pluginMessage:{type:'import',raw:JSON.stringify(payload),options:{components:document.getElementById('components').checked,tokens:document.getElementById('tokens').checked}}},'*');
    statusEl.textContent='Đang tạo layer, component và token…';
  }catch(e){statusEl.textContent='Lỗi: '+e.message;importBtn.disabled=false;}
});

closeBtn.addEventListener("click",()=>{
  parent.postMessage({pluginMessage:{type:"close"}},"*");
});

onmessage=(event)=>{
  if(event.source!==parent)return;
  const msg=event.data.pluginMessage;
  if(!msg)return;
  if(msg.type==="import-done"){
    statusEl.textContent=`Đã nhập ${msg.screens} màn hình, ${msg.components} component, ${msg.tokens} token.`+(msg.warnings?.length?'\nLưu ý:\n'+msg.warnings.join('\n'):'');
    statusEl.style.whiteSpace='pre-wrap';
    importBtn.disabled=false;
  }
  if(msg.type==="import-error"){
    statusEl.textContent="Import lỗi: "+msg.message;
    importBtn.disabled=false;
  }
};

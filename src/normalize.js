/* Shared contract: adapters never assume that arbitrary JSON is a DOM tree. */
const Lemon = (() => {
  const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
  const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const color = value => {
    if (value == null) return null;
    if (typeof value === 'object' && ['r','g','b'].every(k => Number.isFinite(value[k]) && value[k]>=0 && value[k]<=1))
      return {r:value.r,g:value.g,b:value.b,a:Math.max(0,Math.min(1,value.a ?? 1))};
    const h = String(value).match(/^#([\da-f]{3,8})$/i);
    if (h && [3,4,6,8].includes(h[1].length)) {
      const hex = h[1].length < 5 ? [...h[1]].map(x=>x+x).join('') : h[1];
      return {r:parseInt(hex.slice(0,2),16)/255,g:parseInt(hex.slice(2,4),16)/255,b:parseInt(hex.slice(4,6),16)/255,a:hex.length===8?parseInt(hex.slice(6),16)/255:1};
    }
    const rgb=String(value).match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
    return rgb ? {r:+rgb[1]/255,g:+rgb[2]/255,b:+rgb[3]/255,a:rgb[4]==null?1:+rgb[4]} : null;
  };
  function tokens(input = {}, prefix = '', out = {}) {
    for (const [key, value] of Object.entries(input)) {
      const name = prefix ? `${prefix}/${key}` : key;
      if(value && typeof value === 'object' && ('$value' in value || 'value' in value)) out[name]=value.$value ?? value.value;
      else if(value && typeof value === 'object' && !('r' in value)) tokens(value,name,out);
      else out[name]=value;
    }
    const resolve=(name, seen=new Set())=>{
      if(seen.has(name)) fail('tokens/'+name,'Tham chiếu vòng');
      const v=out[name], ref=typeof v==='string' && v.match(/^\{([^}]+)\}$/);
      if(!ref) return v;
      const target=ref[1].replace(/\./g,'/');
      if(!(target in out)) fail('tokens/'+name,`Không tìm thấy ${target}`);
      return resolve(target,new Set([...seen,name]));
    };
    for(const name of Object.keys(out)) out[name]=resolve(name);
    return out;
  }
  function normalize(input) {
    if (!input || typeof input!=='object' || Array.isArray(input)) fail('$','Cần object chứa root, nodes hoặc screens');
    const warnings = [...(input.warnings || [])], flatTokens=tokens(input.tokens || {});
    const resolve=v=>typeof v==='string' && /^\{.+\}$/.test(v) ? flatTokens[v.slice(1,-1).replace(/\./g,'/')] ?? fail('$','Token không tồn tại: '+v) : v;
    let count=0;
    function node(raw,path,depth=0,parentWidth=1440) {
      if(++count>20000 || depth>80) fail(path,'Vượt giới hạn 20.000 layer / 80 cấp');
      if(!raw || typeof raw!=='object' || Array.isArray(raw)) fail(path,'Layer phải là object');
      const type=String(raw.type || (raw.text!=null?'TEXT':'FRAME')).toUpperCase();
      if(!['FRAME','TEXT','IMAGE','SVG','COMPONENT','INSTANCE'].includes(type)) fail(path,`Loại layer chưa hỗ trợ: ${type}`);
      if(type==='INSTANCE') fail(path,'Dùng component trên một cây đầy đủ; instance chỉ có ID chưa đủ dữ liệu');
      const rect=raw.rect || raw.bounds || {};
      const dimension=(v,fallback)=> v==null?fallback : Number.isFinite(Number(v)) && Number(v)>0 ? Number(v) : fail(path,'Kích thước phải là số dương');
      const w=dimension(rect.w ?? rect.width ?? raw.width,parentWidth),h=dimension(rect.h ?? rect.height ?? raw.height,type==='TEXT'?24:100);
      const tokenBindings={...(raw.tokenBindings||{})};
      const ref=v=>typeof v==='string' && /^\{.+\}$/.test(v)?v.slice(1,-1).replace(/\./g,'/'):null;
      for(const [field,value] of Object.entries({fills:raw.style?.background,color:raw.style?.color,fontSize:raw.style?.font?.size,itemSpacing:raw.layout?.gap})) if(ref(value)) tokenBindings[field]=ref(value);
      for(const [field,value] of Object.entries({paddingTop:raw.layout?.padding?.top??raw.layout?.padding,paddingRight:raw.layout?.padding?.right??raw.layout?.padding,paddingBottom:raw.layout?.padding?.bottom??raw.layout?.padding,paddingLeft:raw.layout?.padding?.left??raw.layout?.padding,topLeftRadius:raw.style?.radius?.tl??raw.style?.radius,topRightRadius:raw.style?.radius?.tr??raw.style?.radius,bottomLeftRadius:raw.style?.radius?.bl??raw.style?.radius,bottomRightRadius:raw.style?.radius?.br??raw.style?.radius})) if(ref(value)) tokenBindings[field]=ref(value);
      const style=JSON.parse(JSON.stringify(raw.style || {}));
      for(const k of ['background','color']) if(style[k]!=null) {
        style[k]=color(resolve(style[k])); if(!style[k]) fail(path+'.style.'+k,'Màu chưa hỗ trợ; dùng HEX hoặc RGBA');
      }
      if(typeof style.radius==='number' || typeof style.radius==='string') {const r=number(resolve(style.radius));style.radius={tl:r,tr:r,br:r,bl:r};}
      if(style.font?.size!=null) style.font.size=number(resolve(style.font.size),16);
      const l={...(raw.layout||{})};
      l.mode=String(l.mode || 'VERTICAL').toUpperCase();
      if(!['NONE','VERTICAL','HORIZONTAL','GRID'].includes(l.mode)) fail(path+'.layout','Mode không hợp lệ');
      if(l.gap!=null) l.gap=number(resolve(l.gap));
      if(typeof l.padding==='number' || typeof l.padding==='string') {const p=number(resolve(l.padding));l.padding={top:p,right:p,bottom:p,left:p};}
      if(l.padding) for(const k of ['top','right','bottom','left']) l.padding[k]=Math.max(0,number(resolve(l.padding[k])));
      for(const axis of ['width','height']) if(l[axis]!=null && !['FILL','HUG','FIXED'].includes(l[axis])) fail(path+'.layout.'+axis,'Dùng FILL, HUG hoặc FIXED');
      const text=raw.characters ?? (typeof raw.text==='string'?raw.text:raw.text?.value);
      if(type==='TEXT' && typeof text!=='string') fail(path+'.text','Thiếu nội dung chữ. Export cũ có thể đã ghi đè text; hãy xuất lại');
      const result={...raw,tokenBindings,type:type==='COMPONENT'?'FRAME':type,style,layout:l,text,
        component:raw.component || (type==='COMPONENT'?raw.name || path:undefined),
        textLayout:raw.textLayout || (typeof raw.text==='object'?raw.text:{}),
        rect:{x:number(rect.x),y:number(rect.y),w,h},children:[]};
      const children=raw.children || [];
      if(!Array.isArray(children)) fail(path+'.children','Cần một mảng');
      result.children=children.map((c,i)=>node(c,`${path}.children[${i}]`,depth+1,Math.max(1,w-(l.padding?.left||0)-(l.padding?.right||0))));
      if(result.type==='FRAME' && l.mode==='NONE' && result.children.length) warnings.push(`${raw.name||path}: giữ vị trí tự do vì dữ liệu không có quy tắc layout.`);
      if(result.type==='SVG' && typeof raw.svg!=='string') fail(path+'.svg','Thiếu SVG');
      return result;
    }
    const sources=input.screens || [input];
    if(!Array.isArray(sources) || !sources.length || sources.length>10) fail('screens','Cần 1–10 màn hình');
    const screens=sources.map((s,i)=>{
      const root=s.root || (s.nodes?{name:s.name||'Page',children:s.nodes,layout:{mode:'VERTICAL',width:'FILL',height:'HUG'}}:s.type?s:null);
      if(!root) fail(`screens[${i}]`,'Không nhận diện được cấu trúc. Chọn JSON dạng DOM và ánh xạ tên trường nếu cần');
      const width=number(s.viewport?.width ?? s.width ?? root.rect?.w ?? root.width,1440);
      if(width<1 || width>10000) fail('viewport.width','Giá trị phải từ 1 đến 10000');
      return {title:s.title||s.name||input.title||`Screen ${i+1}`,viewport:{width,height:number(s.viewport?.height,900)},root:node(root,`screens[${i}].root`,0,width)};
    });
    return {version:4,screens,tokens:flatTokens,warnings:[...new Set(warnings)]};
  }
  // JSON DOM adapter: maps independent field names; output is sanitized before rendering.
  function domHTML(input, mapping={}) {
    const m={tag:'tag',children:'children',text:'text',style:'style',attributes:'attributes',...mapping};
    const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let count=0;
    function walk(n,depth=0){
      if(++count>20000 || depth>80) fail('JSON DOM','Quá nhiều node');
      if(typeof n==='string' || typeof n==='number') return escape(n);
      if(!n || typeof n!=='object') fail('JSON DOM','Node không hợp lệ');
      if(Array.isArray(n)) return n.map(x=>walk(x,depth+1)).join('');
      const tag=n[m.tag];
      if(typeof tag!=='string' || !/^[a-z][a-z0-9-]*$/i.test(tag)) fail('JSON DOM',`Không tìm thấy thẻ HTML ở trường "${m.tag}"`);
      if(['script','iframe','object','embed','base','meta','link'].includes(tag.toLowerCase())) fail('JSON DOM',`Thẻ không hỗ trợ: ${tag}`);
      let attrs='';
      for(const [key,value] of Object.entries(n[m.attributes]||{})) if(/^[\w-]+$/.test(key) && !/^on/i.test(key) && !['srcdoc','style'].includes(key)) attrs+=` ${key}="${escape(value)}"`;
      const css=n[m.style];
      if(css) attrs+=` style="${escape(typeof css==='string'?css:Object.entries(css).map(([k,v])=>k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+v).join(';'))}"`;
      if(n.component) attrs+=` data-figma-component="${escape(n.component)}"`;
      const text=n[m.text]==null?'':escape(n[m.text]);
      const children=n[m.children]||[];
      if(!Array.isArray(children)) fail('JSON DOM',m.children+' phải là mảng');
      return `<${tag}${attrs}>${text}${children.map(c=>walk(c,depth+1)).join('')}</${tag}>`;
    }
    return '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>'+walk(input.root || input)+'</body></html>';
  }
  return {normalize,domHTML,color,tokens};
})();
if(typeof module!=='undefined') module.exports=Lemon;

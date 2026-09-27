figma.showUI(__html__, { width: 480, height: 760, themeColors: true });

function track(node){if(context) (context.createdNodes ||= []).push(node);return node;}

const weightStyles = {
  100:["Thin"],
  200:["ExtraLight","Extra Light"],
  300:["Light"],
  400:["Regular"],
  500:["Medium"],
  600:["SemiBold","Semi Bold"],
  700:["Bold"],
  800:["ExtraBold","Extra Bold"],
  900:["Black"]
};

function paint(c) {
  if (!c || c.a <= 0) return [];
  return [{ type:"SOLID", color:{ r:c.r, g:c.g, b:c.b }, opacity:c.a }];
}

function base64ToBytes(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !/;base64/i.test(dataUrl.slice(0, comma))) return null;
  return figma.base64Decode(dataUrl.slice(comma + 1));
}

async function loadFont(style) {
  const family = style?.font?.family || "Inter";
  const weight = Math.max(100, Math.min(900, Math.round((style?.font?.weight || 400) / 100) * 100));
  const candidates = [...(weightStyles[weight] || ["Regular"])];

  if (style?.font?.style === "italic") {
    candidates.unshift(...candidates.map(s => s === "Regular" ? "Italic" : s + " Italic"));
  }

  for (const fontStyle of candidates) {
    try {
      const f = { family, style: fontStyle };
      await figma.loadFontAsync(f);
      return f;
    } catch (_) {}
  }

  if(context) warn(`Font ${family} không có style phù hợp; dùng Inter thay thế.`);
  for (const fontStyle of ["Regular", "Medium"]) {
    try {
      const f = { family:"Inter", style:fontStyle };
      await figma.loadFontAsync(f);
      return f;
    } catch (_) {}
  }

  throw new Error("Không load được font.");
}

function applyCommon(node, data) {
  const s = data.style || {};

  if ("opacity" in node && s.opacity != null) {
    node.opacity = Math.max(0, Math.min(1, s.opacity));
  }

  if ("fills" in node) {
    node.fills = paint(s.background);
  }

  if ("topLeftRadius" in node && s.radius) {
    node.topLeftRadius = s.radius.tl || 0;
    node.topRightRadius = s.radius.tr || 0;
    node.bottomRightRadius = s.radius.br || 0;
    node.bottomLeftRadius = s.radius.bl || 0;
  }

  if ("strokes" in node && s.border?.color &&
      (s.border.top || s.border.right || s.border.bottom || s.border.left)) {
    node.strokes = paint(s.border.color);
    node.strokeWeight = Math.max(
      s.border.top || 0,
      s.border.right || 0,
      s.border.bottom || 0,
      s.border.left || 0
    );
    node.strokeAlign = "INSIDE";
  }

  if ("effects" in node && s.shadow?.color && !s.shadow.inset) {
    const c = s.shadow.color;
    node.effects = [{
      type:"DROP_SHADOW",
      color:{ r:c.r, g:c.g, b:c.b, a:c.a },
      offset:{ x:s.shadow.x || 0, y:s.shadow.y || 0 },
      radius:Math.max(0, s.shadow.blur || 0),
      spread:Math.max(0, s.shadow.spread || 0),
      visible:true,
      blendMode:"NORMAL"
    }];
  }

  if ("clipsContent" in node && s.overflow) {
    node.clipsContent =
      ["hidden","clip"].includes(s.overflow.x) ||
      ["hidden","clip"].includes(s.overflow.y);
  }
}

function mapPrimary(v) {
  if (v === "center") return "CENTER";
  if (v === "flex-end" || v === "end") return "MAX";
  if (v === "space-between") return "SPACE_BETWEEN";
  return "MIN";
}

function mapCounter(v) {
  if (v === "center") return "CENTER";
  if (v === "flex-end" || v === "end") return "MAX";
  return "MIN";
}

function configureFlex(frame, data) {
  const l = data.layout || {};
  frame.layoutMode = l.mode;
  frame.layoutWrap = l.wrap && l.mode === "HORIZONTAL" ? "WRAP" : "NO_WRAP";
  frame.itemSpacing = (l.mode === "HORIZONTAL" ? l.columnGap : l.rowGap) ?? l.gap ?? 0;

  if (l.wrap) {
    try { frame.counterAxisSpacing = l.rowGap ?? l.gap ?? 0; } catch (_) {}
  }

  frame.paddingTop = l.padding?.top || 0;
  frame.paddingRight = l.padding?.right || 0;
  frame.paddingBottom = l.padding?.bottom || 0;
  frame.paddingLeft = l.padding?.left || 0;
  frame.primaryAxisAlignItems = mapPrimary(l.justify);
  frame.counterAxisAlignItems = mapCounter(l.align);
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  try { frame.strokesIncludedInLayout = true; } catch (_) {}
}

function configureFrame(frame, data) {
  const mode = data.layout?.mode || "NONE";
  if (mode === "HORIZONTAL" || mode === "VERTICAL") {
    configureFlex(frame, data);
  } else {
    frame.layoutMode = "NONE";
  }
}

function setRelativePosition(node, data, parent, parentData) {
  if (!parent || !parentData) return;

  const x = data.rect.x - parentData.rect.x;
  const y = data.rect.y - parentData.rect.y;

  if (parent.layoutMode === "NONE") {
    node.x = x;
    node.y = y;
    return;
  }

  if (data.layout?.position === "absolute" || data.layout?.position === "fixed") {
    try {
      node.layoutPositioning = "ABSOLUTE";
      node.x = x;
      node.y = y;
    } catch (_) {}
  }
}

function applyAutoChildSizing(node, data, parent) {
  if (!parent || parent.layoutMode === "NONE") {
    if("layoutMode" in node && node.layoutMode!=="NONE") {
      if(data.layout?.width==="HUG") node.layoutSizingHorizontal="HUG";
      if(data.layout?.height==="HUG" || data.layout?.autoHeight) node.layoutSizingVertical="HUG";
    }
    return;
  }
  if (data.layout?.position === "absolute" || data.layout?.position === "fixed") return;

  const l = data.layout || {};

  const canHug = node.type === "TEXT" || ("layoutMode" in node && node.layoutMode !== "NONE");
  const horizontal = l.width || (parent.layoutMode === "VERTICAL" && l.fillsParentWidth || parent.layoutMode === "HORIZONTAL" && l.flexItem?.grow > 0 ? "FILL" : l.contentSized && canHug ? "HUG" : "FIXED");
  const vertical = l.height || (parent.layoutMode === "HORIZONTAL" && l.fillsParentHeight ? "FILL" : canHug && (l.contentSized || l.autoHeight) ? "HUG" : "FIXED");
  node.layoutSizingHorizontal = horizontal === "HUG" && !canHug ? "FIXED" : horizontal;
  node.layoutSizingVertical = vertical === "HUG" && !canHug ? "FIXED" : vertical;
  if (l.minWidth != null) node.minWidth = Math.max(0,l.minWidth);
  if (l.maxWidth != null) node.maxWidth = Math.max(1,l.maxWidth);
  if (l.minHeight != null) node.minHeight = Math.max(0,l.minHeight);
  if (l.maxHeight != null) node.maxHeight = Math.max(1,l.maxHeight);
}

async function buildText(data, parent, parentData) {
  const t = track(figma.createText());
  t.name = data.name || "Text";
  t.fontName = await loadFont(data.style);
  t.characters = data.text || "";
  t.fontSize = Math.max(1, data.style?.font?.size || 16);

  if (data.style?.font?.lineHeight) {
    t.lineHeight = { unit:"PIXELS", value:data.style.font.lineHeight };
  }

  if (data.style?.font?.letterSpacing != null) {
    t.letterSpacing = { unit:"PIXELS", value:data.style.font.letterSpacing };
  }

  const fills = paint(data.style?.color);
  t.fills = fills.length ? fills : [{ type:"SOLID", color:{ r:0, g:0, b:0 } }];

  const align = data.style?.font?.align;
  t.textAlignHorizontal =
    align === "center" ? "CENTER" :
    align === "right" || align === "end" ? "RIGHT" :
    align === "justify" ? "JUSTIFIED" : "LEFT";

  parent.appendChild(t);

  if (data.textLayout?.wrapped || data.layout?.width === "FILL") {
    t.textAutoResize = "HEIGHT";
    t.resize(Math.max(1, data.rect.w), Math.max(1, data.rect.h));
  } else {
    t.textAutoResize = "WIDTH_AND_HEIGHT";
  }

  setRelativePosition(t, data, parent, parentData);
  applyAutoChildSizing(t, data, parent);
  return t;
}

async function buildImage(data, parent, parentData) {
  const r = track(figma.createRectangle());
  r.name = data.alt || data.name || "Image";
  r.resize(Math.max(1, data.rect.w), Math.max(1, data.rect.h));
  applyCommon(r, data);

  const bytes = base64ToBytes(data.dataUrl);
  if (bytes) {
    try {
      const image = figma.createImage(bytes);
      r.fills = [{
        type:"IMAGE",
        imageHash:image.hash,
        scaleMode:data.objectFit === "contain" ? "FIT" : "FILL"
      }];
    } catch (_) {
      r.fills = [{ type:"SOLID", color:{r:.92,g:.92,b:.92} }];
    }
  } else {
    r.fills = [{ type:"SOLID", color:{r:.92,g:.92,b:.92} }];
  }

  parent.appendChild(r);
  setRelativePosition(r, data, parent, parentData);
  applyAutoChildSizing(r, data, parent);
  return r;
}

async function buildSvg(data, parent, parentData) {
  try {
    const n = track(figma.createNodeFromSvg(data.svg));
    n.name = data.name || "SVG";
    n.resize(Math.max(1, data.rect.w), Math.max(1, data.rect.h));
    parent.appendChild(n);
    setRelativePosition(n, data, parent, parentData);
    applyAutoChildSizing(n, data, parent);
    return n;
  } catch (_) {
    return null;
  }
}

async function buildGrid(data, parent, parentData) {
  // Equal/regular CSS tracks become a wrapping Auto Layout. Re-rendered screens
  // capture CSS breakpoint changes; Figma does not run media queries.
  const l=data.layout;
  const converted={...data,layout:{...l,mode:"HORIZONTAL",wrap:true,gap:l.columnGap||0},children:(data.children||[]).map(c=>({...c,layout:{...c.layout,width:"FIXED"}}))};
  return buildFrame(converted,parent,parentData);
}

async function buildFrame(data, parent, parentData) {
  if (data.layout?.mode === "GRID") {
    return buildGrid(data, parent, parentData);
  }

  const f = track(figma.createFrame());
  f.name = data.name || data.tag || "Frame";
  f.resize(Math.max(1, data.rect.w), Math.max(1, data.rect.h));
  applyCommon(f, data);
  configureFrame(f, data);

  parent.appendChild(f);
  setRelativePosition(f, data, parent, parentData);
  applyAutoChildSizing(f, data, parent);

  for (const child of orderedChildren(data)) {
    await build(child, f, data);
  }
  applyAutoChildSizing(f, data, parent);

  return f;
}

function orderedChildren(data) {
  const children=[...(data.children||[])];
  children.sort((a,b)=>(a.layout?.order||0)-(b.layout?.order||0));
  if(data.layout?.reverse) children.reverse();
  return children;
}
let context = null;
function warn(message) { context.warnings.add(message); }
function tokenVariable(name,value) {
  const c=Lemon.color(value),type=c?"COLOR":typeof value==="number"?"FLOAT":typeof value==="boolean"?"BOOLEAN":typeof value==="string"?"STRING":null;
  if(!type) {warn(`Token ${name}: kiểu dữ liệu chưa hỗ trợ.`);return null;}
  const category=type==="COLOR"?"color":/font|typography/.test(name)?"font-size":/radius/.test(name)?"radius":/spac|gap|padding|margin/.test(name)?"spacing":name.split("/")[0];
  const key=category+type+JSON.stringify(c||value);
  if(context.variables.has(name)) return context.variables.get(name);
  if(!context.collection) context.collection=figma.variables.createVariableCollection(context.title+" / Tokens");
  const v=figma.variables.createVariable(name.replace(/[.{}]/g,"-"),context.collection,type);
  v.scopes=type==="COLOR"?["ALL_FILLS","STROKE_COLOR"]:type==="FLOAT"?["GAP","CORNER_RADIUS","FONT_SIZE","WIDTH_HEIGHT"]:type==="STRING"?["TEXT_CONTENT"]:[];
  v.setVariableCodeSyntax("WEB","var(--"+name.replace(/[^a-zA-Z0-9_-]/g,"-")+")");
  context.createdVariables.push(v);
  v.setValueForMode(context.collection.defaultModeId,c||value);
  context.variables.set(name,v);
  if(!context.values.has(key)) context.values.set(key,v);
  return v;
}
function inferredToken(category,value) {
  const c=Lemon.color(value),type=c?"COLOR":"FLOAT",key=category+type+JSON.stringify(c||value);
  return context.values.get(key) || tokenVariable(`${category}/${context.values.size+1}`,value);
}
function bindTokens(node,data) {
  if(!context.options.tokens) return;
  for(const field of ["fills","strokes"]) if(field in node && Array.isArray(node[field])) {
    node[field]=node[field].map(p=>p.type!=="SOLID"?p:figma.variables.setBoundVariableForPaint(p,"color",context.variables.get(data.tokenBindings?.[node.type==="TEXT"?"color":field]) || inferredToken("color",{...p.color,a:p.opacity??1})));
  }
  for(const field of ["itemSpacing","paddingTop","paddingRight","paddingBottom","paddingLeft","topLeftRadius","topRightRadius","bottomLeftRadius","bottomRightRadius","fontSize"]) {
    if(typeof node[field]==="number" && node[field]>=0 && typeof node.setBoundVariable==="function") node.setBoundVariable(field,context.variables.get(data.tokenBindings?.[field]) || inferredToken(field==="fontSize"?"font-size":field.includes("Radius")?"radius":"spacing",node[field]));
  }
}
function signature(data) {
  // Exact signatures keep differing text/images safe. Never merge by name alone.
  const relative=(n,origin)=>({type:n.type,name:n.name,text:n.text,svg:n.svg,dataUrl:n.dataUrl,style:n.style,layout:n.layout,rect:{...n.rect,x:n.rect.x-origin.x,y:n.rect.y-origin.y},children:(n.children||[]).map(c=>relative(c,n.rect))});
  return JSON.stringify(relative(data,data.rect));
}
async function build(data, parent, parentData, skipComponent=false) {
  if (!data) return null;
  const componentName=data.component;
  if(context.options.components && componentName && !skipComponent && data.type==="FRAME") {
    const key=componentName+signature(data);
    let master=context.components.get(key);
    if(!master) {
      const frame=await build(data,context.library,{rect:{x:0,y:0}},true);
      master=track(figma.createComponentFromNode(frame));
      const siblings=[...context.components.values()].filter(c=>c.name===componentName || c.name.startsWith(componentName+" / ")).length;
      master.name=componentName+(siblings?" / "+(siblings+1):"");
      master.x=0;master.y=context.libraryHeight;
      context.libraryHeight+=master.height+40;
      context.components.set(key,master);
    }
    const instance=track(master.createInstance());
    parent.appendChild(instance);
    instance.name=data.name||componentName;
    setRelativePosition(instance,data,parent,parentData);
    applyAutoChildSizing(instance,data,parent);
    return instance;
  }
  let node;
  if(data.type==="TEXT") node=await buildText(data,parent,parentData);
  else if(data.type==="IMAGE") {node=await buildImage(data,parent,parentData);if(!data.dataUrl) warn(`${data.name||'Image'}: không tải được ảnh; dùng ô giữ chỗ.`);}
  else if(data.type==="SVG") {node=await buildSvg(data,parent,parentData);if(!node) warn(`${data.name||'SVG'}: SVG không hợp lệ.`);}
  else node=await buildFrame(data,parent,parentData);
  if(node) bindTokens(node,data);
  return node;
}
let importing=false;
figma.ui.onmessage = async (msg) => {
  if (msg.type === "close") {figma.closePlugin();return;}
  if (msg.type !== "import" || importing) return;
  importing=true;
  const roots=[];
  try {
    const data=Lemon.normalize(JSON.parse(msg.raw));
    context={title:data.screens[0].title,options:{tokens:msg.options?.tokens!==false,components:msg.options?.components!==false},warnings:new Set(data.warnings),variables:new Map(),values:new Map(),createdVariables:[],components:new Map(),libraryHeight:0};
    context.library=track(figma.createFrame());
    context.library.name=context.title+" / Components";
    context.library.fills=[];context.library.clipsContent=false;
    context.library.x=figma.viewport.center.x-2000;
    context.library.y=figma.viewport.center.y;
    if(context.options.tokens) for(const [name,value] of Object.entries(data.tokens)) tokenVariable(name,value);
    let x=Math.max(figma.viewport.center.x,...figma.currentPage.children.filter(n=>n!==context.library).map(n=>n.x+n.width+100));
    for(const screen of data.screens) {
      const root=track(figma.createFrame());roots.push(root);
      root.name=screen.title+" / "+screen.viewport.width;
      root.resize(screen.viewport.width,Math.max(1,screen.viewport.height));
      root.layoutMode="VERTICAL";
      root.primaryAxisSizingMode="AUTO";root.counterAxisSizingMode="FIXED";
      root.fills=[];root.clipsContent=false;root.x=x;root.y=figma.viewport.center.y;
      await build(screen.root,root,{rect:{x:0,y:0,w:screen.viewport.width,h:screen.viewport.height}});
      x+=root.width+100;
    }
    if(!context.components.size) context.library.remove();
    else context.library.resize(Math.max(1,...context.library.children.map(c=>c.width)),Math.max(1,context.libraryHeight));
    figma.currentPage.selection=roots;
    figma.viewport.scrollAndZoomIntoView(roots);
    figma.notify(`Đã nhập ${roots.length} màn hình.`);
    figma.ui.postMessage({type:"import-done",warnings:[...context.warnings],screens:roots.length,components:context.components.size,tokens:context.variables.size});
  } catch(e) {
    for(const n of context?.createdNodes||[]) if(!n.removed) n.remove();
    for(const root of roots) if(!root.removed) root.remove();
    if(context?.library && !context.library.removed) context.library.remove();
    for(const v of context?.createdVariables||[]) v.remove();
    if(context?.collection) context.collection.remove();
    const message=e?.message||String(e);
    figma.notify("Import lỗi: "+message,{timeout:5000});
    figma.ui.postMessage({type:"import-error",message});
  } finally {context=null;importing=false;}
};

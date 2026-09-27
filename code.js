figma.showUI(__html__, { width: 430, height: 410 });

const weightStyles = {
  100:["Thin"],200:["ExtraLight","Extra Light"],300:["Light"],400:["Regular"],
  500:["Medium"],600:["SemiBold","Semi Bold"],700:["Bold"],800:["ExtraBold","Extra Bold"],900:["Black"]
};

function paint(c) {
  if (!c || c.a <= 0) return [];
  return [{ type:"SOLID", color:{r:c.r,g:c.g,b:c.b}, opacity:c.a }];
}

async function loadFont(style) {
  const fam = style?.font?.family || "Inter";
  const w = Math.max(100, Math.min(900, Math.round((style?.font?.weight || 400)/100)*100));
  for (const st of (weightStyles[w] || ["Regular"])) {
    try {
      const f = { family:fam, style:st };
      await figma.loadFontAsync(f);
      return f;
    } catch (_) {}
  }
  const fb = { family:"Inter", style:"Regular" };
  await figma.loadFontAsync(fb);
  return fb;
}

function applyCommon(node, data) {
  const s = data.style || {};
  if ("opacity" in node && s.opacity != null) node.opacity = Math.max(0, Math.min(1, s.opacity));

  if ("fills" in node) node.fills = paint(s.background);

  if ("topLeftRadius" in node && s.radius) {
    node.topLeftRadius = s.radius.tl || 0;
    node.topRightRadius = s.radius.tr || 0;
    node.bottomRightRadius = s.radius.br || 0;
    node.bottomLeftRadius = s.radius.bl || 0;
  }

  if ("strokes" in node && s.border?.color && (s.border.top || s.border.right || s.border.bottom || s.border.left)) {
    node.strokes = paint(s.border.color);
    node.strokeWeight = Math.max(s.border.top || 0, s.border.right || 0, s.border.bottom || 0, s.border.left || 0);
    node.strokeAlign = "INSIDE";
  }

  if ("effects" in node && s.shadow?.color) {
    const c = s.shadow.color;
    node.effects = [{
      type:"DROP_SHADOW",
      color:{r:c.r,g:c.g,b:c.b,a:c.a},
      offset:{x:s.shadow.x || 0,y:s.shadow.y || 0},
      radius:Math.max(0,s.shadow.blur || 0),
      spread:Math.max(0,s.shadow.spread || 0),
      visible:true,
      blendMode:"NORMAL"
    }];
  }
}

function mapJustify(v) {
  if (v === "center") return "CENTER";
  if (v === "flex-end" || v === "end") return "MAX";
  if (v === "space-between") return "SPACE_BETWEEN";
  return "MIN";
}

function mapAlign(v) {
  if (v === "center") return "CENTER";
  if (v === "flex-end" || v === "end") return "MAX";
  return "MIN";
}

function applyLayout(frame, data) {
  const l = data.layout || { mode:"NONE" };

  if (l.mode === "HORIZONTAL" || l.mode === "VERTICAL") {
    frame.layoutMode = l.mode;
    frame.itemSpacing = l.gap || 0;
    if ("layoutWrap" in frame) frame.layoutWrap = l.wrap ? "WRAP" : "NO_WRAP";
    frame.paddingTop = l.padding?.top || 0;
    frame.paddingRight = l.padding?.right || 0;
    frame.paddingBottom = l.padding?.bottom || 0;
    frame.paddingLeft = l.padding?.left || 0;
    frame.primaryAxisAlignItems = mapJustify(l.justify);
    frame.counterAxisAlignItems = mapAlign(l.align);
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "FIXED";
    return true;
  }

  if (l.mode === "GRID") {
    frame.layoutMode = "HORIZONTAL";
    if ("layoutWrap" in frame) frame.layoutWrap = "WRAP";
    frame.itemSpacing = l.columnGap || l.gap || 0;
    frame.counterAxisSpacing = l.rowGap || l.gap || 0;
    frame.paddingTop = l.padding?.top || 0;
    frame.paddingRight = l.padding?.right || 0;
    frame.paddingBottom = l.padding?.bottom || 0;
    frame.paddingLeft = l.padding?.left || 0;
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "FIXED";
    return true;
  }

  frame.layoutMode = "NONE";
  return false;
}

async function build(data, parent, parentAbsRect) {
  if (!data) return null;

  if (data.type === "TEXT") {
    const t = figma.createText();
    t.name = data.name || "Text";
    const f = await loadFont(data.style);
    t.fontName = f;
    t.characters = data.text || "";
    t.fontSize = Math.max(1, data.style?.font?.size || 16);

    if (data.style?.font?.lineHeight) {
      t.lineHeight = { unit:"PIXELS", value:data.style.font.lineHeight };
    }
    if (data.style?.font?.letterSpacing != null) {
      t.letterSpacing = { unit:"PIXELS", value:data.style.font.letterSpacing };
    }

    t.fills = paint(data.style?.color);
    t.textAutoResize = "NONE";
    t.resize(Math.max(1, data.rect.w), Math.max(1, data.rect.h));

    parent.appendChild(t);

    if (parent.layoutMode === "NONE") {
      t.x = data.rect.x - parentAbsRect.x;
      t.y = data.rect.y - parentAbsRect.y;
    }
    return t;
  }

  if (data.type === "SVG") {
    try {
      const n = figma.createNodeFromSvg(data.svg);
      n.name = data.name || "SVG";
      parent.appendChild(n);
      n.resize(Math.max(1,data.rect.w), Math.max(1,data.rect.h));
      if (parent.layoutMode === "NONE") {
        n.x = data.rect.x - parentAbsRect.x;
        n.y = data.rect.y - parentAbsRect.y;
      }
      return n;
    } catch (_) {
      return null;
    }
  }

  if (data.type === "IMAGE") {
    const r = figma.createRectangle();
    r.name = data.alt || data.name || "Image";
    parent.appendChild(r);
    r.resize(Math.max(1,data.rect.w), Math.max(1,data.rect.h));
    applyCommon(r,data);

    r.fills = [{ type:"SOLID", color:{r:.92,g:.92,b:.92} }];

    if (parent.layoutMode === "NONE") {
      r.x = data.rect.x - parentAbsRect.x;
      r.y = data.rect.y - parentAbsRect.y;
    }
    return r;
  }

  const f = figma.createFrame();
  f.name = data.name || data.tag || "Frame";
  parent.appendChild(f);
  f.resize(Math.max(1,data.rect.w), Math.max(1,data.rect.h));
  applyCommon(f,data);
  f.clipsContent = false;
  applyLayout(f,data);

  if (parent.layoutMode === "NONE") {
    f.x = data.rect.x - parentAbsRect.x;
    f.y = data.rect.y - parentAbsRect.y;
  }

  for (const child of (data.children || [])) {
    await build(child, f, data.rect);
  }

  if (f.layoutMode !== "NONE") {
    for (let i = 0; i < f.children.length; i++) {
      const child = f.children[i];
      const source = (data.children || [])[i];
      if (!source) continue;

      try {
        child.layoutSizingHorizontal = "FIXED";
        child.layoutSizingVertical = "FIXED";
        child.resize(Math.max(1,source.rect.w), Math.max(1,source.rect.h));
      } catch (_) {}
    }
  }

  return f;
}

figma.ui.onmessage = async msg => {
  if (msg.type !== "import") return;

  try {
    const data = JSON.parse(msg.raw);
    const root = figma.createFrame();
    root.name = data.title || "HTML Import";
    root.resize(Math.max(1,data.viewport.width), Math.max(1,data.viewport.height));
    root.layoutMode = "NONE";
    root.fills = [{ type:"SOLID", color:{r:1,g:1,b:1} }];

    root.x = figma.viewport.center.x - root.width/2;
    root.y = figma.viewport.center.y - Math.min(root.height,900)/2;

    await build(data.root, root, {x:0,y:0,w:data.viewport.width,h:data.viewport.height});

    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    figma.notify("Import xong: hierarchy + Auto Layout đã được dựng lại.");
  } catch (e) {
    figma.notify("Import lỗi: " + (e?.message || e));
  }
};
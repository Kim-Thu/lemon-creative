figma.showUI(__html__, { width: 430, height: 410 });

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
  frame.layoutWrap = l.wrap ? "WRAP" : "NO_WRAP";
  frame.itemSpacing = l.gap || 0;

  if (l.wrap) {
    try { frame.counterAxisSpacing = l.rowGap || l.gap || 0; } catch (_) {}
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
  if (!parent || parent.layoutMode === "NONE") return;
  if (data.layout?.position === "absolute" || data.layout?.position === "fixed") return;

  const l = data.layout || {};

  try {
    if (parent.layoutMode === "VERTICAL") {
      node.layoutSizingHorizontal = l.fillsParentWidth ? "FILL" : (l.contentSized ? "HUG" : "FIXED");
      node.layoutSizingVertical = l.flexItem?.grow > 0 ? "FILL" : (l.contentSized ? "HUG" : "FIXED");
    } else if (parent.layoutMode === "HORIZONTAL") {
      node.layoutSizingHorizontal = l.flexItem?.grow > 0 ? "FILL" : (l.contentSized ? "HUG" : "FIXED");
      node.layoutSizingVertical = l.fillsParentHeight ? "FILL" : (l.contentSized ? "HUG" : "FIXED");
    }
  } catch (_) {}
}

async function buildText(data, parent, parentData) {
  const t = figma.createText();
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

  if (data.text?.wrapped) {
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
  const r = figma.createRectangle();
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
    const n = figma.createNodeFromSvg(data.svg);
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

function chunkChildren(children, count) {
  const rows = [];
  for (let i = 0; i < children.length; i += count) {
    rows.push(children.slice(i, i + count));
  }
  return rows;
}

async function buildGrid(data, parent, parentData) {
  const grid = figma.createFrame();
  grid.name = data.name || "Grid";
  grid.resize(Math.max(1, data.rect.w), Math.max(1, data.rect.h));
  applyCommon(grid, data);

  // Figma-native reconstruction: CSS Grid => vertical Auto Layout of horizontal rows.
  // This is stable and editable; it avoids relying on Grid API support/version differences.
  grid.layoutMode = "VERTICAL";
  grid.layoutWrap = "NO_WRAP";
  grid.itemSpacing = data.layout?.rowGap || 0;
  grid.paddingTop = data.layout?.padding?.top || 0;
  grid.paddingRight = data.layout?.padding?.right || 0;
  grid.paddingBottom = data.layout?.padding?.bottom || 0;
  grid.paddingLeft = data.layout?.padding?.left || 0;
  grid.primaryAxisSizingMode = "FIXED";
  grid.counterAxisSizingMode = "FIXED";
  grid.primaryAxisAlignItems = "MIN";
  grid.counterAxisAlignItems = "MIN";

  parent.appendChild(grid);
  setRelativePosition(grid, data, parent, parentData);
  applyAutoChildSizing(grid, data, parent);

  const count = Math.max(1, data.layout?.columnCount || 1);
  const rows = chunkChildren(data.children || [], count);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const rowChildren = rows[rowIndex];
    const row = figma.createFrame();
    row.name = "Row " + (rowIndex + 1);
    row.layoutMode = "HORIZONTAL";
    row.layoutWrap = "NO_WRAP";
    row.itemSpacing = data.layout?.columnGap || 0;
    row.primaryAxisSizingMode = "FIXED";
    row.counterAxisSizingMode = "FIXED";
    row.primaryAxisAlignItems = "MIN";
    row.counterAxisAlignItems = "MIN";
    row.fills = [];

    const rowHeight = Math.max(...rowChildren.map(c => c.rect.h), 1);
    const innerWidth = Math.max(
      1,
      data.rect.w -
        (data.layout?.padding?.left || 0) -
        (data.layout?.padding?.right || 0)
    );
    row.resize(innerWidth, rowHeight);

    grid.appendChild(row);
    try { row.layoutSizingHorizontal = "FILL"; } catch (_) {}

    const syntheticParentData = {
      rect: {
        x: data.rect.x + (data.layout?.padding?.left || 0),
        y: Math.min(...rowChildren.map(c => c.rect.y)),
        w: innerWidth,
        h: rowHeight
      }
    };

    for (const child of rowChildren) {
      await build(child, row, syntheticParentData);
    }
  }

  return grid;
}

async function buildFrame(data, parent, parentData) {
  if (data.layout?.mode === "GRID") {
    return buildGrid(data, parent, parentData);
  }

  const f = figma.createFrame();
  f.name = data.name || data.tag || "Frame";
  f.resize(Math.max(1, data.rect.w), Math.max(1, data.rect.h));
  applyCommon(f, data);
  configureFrame(f, data);

  parent.appendChild(f);
  setRelativePosition(f, data, parent, parentData);
  applyAutoChildSizing(f, data, parent);

  for (const child of data.children || []) {
    await build(child, f, data);
  }

  return f;
}

async function build(data, parent, parentData) {
  if (!data) return null;
  if (data.type === "TEXT") return buildText(data, parent, parentData);
  if (data.type === "IMAGE") return buildImage(data, parent, parentData);
  if (data.type === "SVG") return buildSvg(data, parent, parentData);
  return buildFrame(data, parent, parentData);
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "close") {
    figma.closePlugin();
    return;
  }

  if (msg.type !== "import") return;

  let root = null;

  try {
    const data = JSON.parse(msg.raw);

    root = figma.createFrame();
    root.name = data.title || "HTML Import";
    root.resize(Math.max(1, data.viewport.width), Math.max(1, data.viewport.height));
    root.layoutMode = "NONE";
    root.fills = [{ type:"SOLID", color:{ r:1, g:1, b:1 } }];
    root.clipsContent = false;
    root.x = figma.viewport.center.x - root.width / 2;
    root.y = figma.viewport.center.y - Math.min(root.height, 900) / 2;

    if (data.root) {
      await build(data.root, root, {
        rect:{ x:0, y:0, w:data.viewport.width, h:data.viewport.height }
      });
    }

    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    figma.notify("Import xong.");
    figma.ui.postMessage({ type:"import-done" });
  } catch (e) {
    if (root) {
      try { root.remove(); } catch (_) {}
    }

    const message = e?.message || String(e);
    console.error("HTML → Figma import failed:", e);
    figma.notify("Import lỗi: " + message, { timeout: 5000 });
    figma.ui.postMessage({ type:"import-error", message });
  }
};
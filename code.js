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
  return [{
    type:"SOLID",
    color:{ r:c.r, g:c.g, b:c.b },
    opacity:c.a
  }];
}

function base64ToBytes(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  if (!/;base64/i.test(header)) return null;
  return figma.base64Decode(body);
}

async function loadFont(style) {
  const fam = style?.font?.family || "Inter";
  const weight = Math.max(
    100,
    Math.min(900, Math.round((style?.font?.weight || 400) / 100) * 100)
  );

  const styles = [...(weightStyles[weight] || ["Regular"])];
  if (style?.font?.style === "italic") {
    styles.unshift(...styles.map((s) => s === "Regular" ? "Italic" : s + " Italic"));
  }

  for (const fontStyle of styles) {
    try {
      const font = { family:fam, style:fontStyle };
      await figma.loadFontAsync(font);
      return font;
    } catch (_) {}
  }

  for (const fallback of ["Regular", "Medium"]) {
    try {
      const font = { family:"Inter", style:fallback };
      await figma.loadFontAsync(font);
      return font;
    } catch (_) {}
  }

  throw new Error("Không load được font fallback.");
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

  if (
    "strokes" in node &&
    s.border?.color &&
    (s.border.top || s.border.right || s.border.bottom || s.border.left)
  ) {
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
      ["hidden", "clip"].includes(s.overflow.x) ||
      ["hidden", "clip"].includes(s.overflow.y);
  }
}

function mapPrimaryAlign(v) {
  if (v === "center") return "CENTER";
  if (v === "flex-end" || v === "end") return "MAX";
  if (v === "space-between") return "SPACE_BETWEEN";
  if (v === "space-around") return "SPACE_AROUND";
  if (v === "space-evenly") return "SPACE_EVENLY";
  return "MIN";
}

function mapCounterAlign(v) {
  if (v === "center") return "CENTER";
  if (v === "flex-end" || v === "end") return "MAX";
  if (v === "baseline") return "BASELINE";
  return "MIN";
}

function configureLayout(frame, data) {
  const l = data.layout || { mode:"NONE" };

  if (l.mode === "HORIZONTAL" || l.mode === "VERTICAL") {
    frame.layoutMode = l.mode;
    frame.layoutWrap = l.wrap ? "WRAP" : "NO_WRAP";
    frame.itemSpacing = l.gap || 0;
    if (l.wrap) frame.counterAxisSpacing = l.rowGap || l.gap || 0;

    frame.paddingTop = l.padding?.top || 0;
    frame.paddingRight = l.padding?.right || 0;
    frame.paddingBottom = l.padding?.bottom || 0;
    frame.paddingLeft = l.padding?.left || 0;

    frame.primaryAxisAlignItems = mapPrimaryAlign(l.justify);
    frame.counterAxisAlignItems = mapCounterAlign(l.align);
    frame.primaryAxisSizingMode = "FIXED";
    frame.counterAxisSizingMode = "FIXED";
    frame.strokesIncludedInLayout = true;
    return;
  }

  if (l.mode === "GRID") {
    frame.layoutMode = "GRID";
    frame.gridColumnCount = Math.max(1, l.columnCount || 1);
    frame.gridRowCount = Math.max(1, l.rowCount || 1);
    frame.gridColumnGap = l.columnGap || 0;
    frame.gridRowGap = l.rowGap || 0;
    frame.gridItemsPositioning = "ROW_AUTO_FLOW";

    frame.paddingTop = l.padding?.top || 0;
    frame.paddingRight = l.padding?.right || 0;
    frame.paddingBottom = l.padding?.bottom || 0;
    frame.paddingLeft = l.padding?.left || 0;

    if (Array.isArray(l.columns)) {
      for (let i = 0; i < Math.min(l.columns.length, frame.gridColumnSizes.length); i++) {
        try {
          frame.gridColumnSizes[i].type = "FIXED";
          frame.gridColumnSizes[i].value = Math.max(1, l.columns[i]);
        } catch (_) {}
      }
    }

    if (Array.isArray(l.rows)) {
      for (let i = 0; i < Math.min(l.rows.length, frame.gridRowSizes.length); i++) {
        try {
          frame.gridRowSizes[i].type = "FIXED";
          frame.gridRowSizes[i].value = Math.max(1, l.rows[i]);
        } catch (_) {}
      }
    }

    frame.strokesIncludedInLayout = true;
    return;
  }

  frame.layoutMode = "NONE";
}

function isAutoParent(parent) {
  return parent && ["HORIZONTAL", "VERTICAL", "GRID"].includes(parent.layoutMode);
}

function setAbsolutePosition(node, data, parent, parentData) {
  if (!parent || !parentData) return;

  const x = data.rect.x - parentData.rect.x;
  const y = data.rect.y - parentData.rect.y;

  if (isAutoParent(parent)) {
    if (data.layout?.position === "absolute" || data.layout?.position === "fixed") {
      try {
        node.layoutPositioning = "ABSOLUTE";
        node.x = x;
        node.y = y;
      } catch (_) {}
    }
  } else {
    node.x = x;
    node.y = y;
  }
}

function applyChildSizing(node, data, parent) {
  if (!isAutoParent(parent)) return;
  if (data.layout?.position === "absolute" || data.layout?.position === "fixed") return;

  const l = data.layout || {};

  try {
    if (parent.layoutMode === "VERTICAL") {
      node.layoutSizingHorizontal =
        l.fillsParentWidth ? "FILL" :
        l.contentSized ? "HUG" : "FIXED";
      node.layoutSizingVertical =
        l.flexItem?.grow > 0 ? "FILL" :
        l.contentSized ? "HUG" : "FIXED";
    } else if (parent.layoutMode === "HORIZONTAL") {
      node.layoutSizingHorizontal =
        l.flexItem?.grow > 0 ? "FILL" :
        l.contentSized ? "HUG" : "FIXED";
      node.layoutSizingVertical =
        l.fillsParentHeight ? "FILL" :
        l.contentSized ? "HUG" : "FIXED";
    } else if (parent.layoutMode === "GRID") {
      node.layoutSizingHorizontal = "FIXED";
      node.layoutSizingVertical = "FIXED";
    }
  } catch (_) {}
}

async function buildText(data, parent, parentData) {
  const t = figma.createText();
  t.name = data.name || "Text";

  const font = await loadFont(data.style);
  t.fontName = font;
  t.characters = data.text || "";
  t.fontSize = Math.max(1, data.style?.font?.size || 16);

  if (data.style?.font?.lineHeight) {
    t.lineHeight = {
      unit:"PIXELS",
      value:data.style.font.lineHeight
    };
  }

  if (data.style?.font?.letterSpacing != null) {
    t.letterSpacing = {
      unit:"PIXELS",
      value:data.style.font.letterSpacing
    };
  }

  t.fills = paint(data.style?.color);
  if (!t.fills.length) {
    t.fills = [{ type:"SOLID", color:{ r:0, g:0, b:0 } }];
  }

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

  setAbsolutePosition(t, data, parent, parentData);
  applyChildSizing(t, data, parent);

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
  setAbsolutePosition(r, data, parent, parentData);
  applyChildSizing(r, data, parent);
  return r;
}

async function buildSvg(data, parent, parentData) {
  try {
    const n = figma.createNodeFromSvg(data.svg);
    n.name = data.name || "SVG";
    n.resize(Math.max(1, data.rect.w), Math.max(1, data.rect.h));
    parent.appendChild(n);
    setAbsolutePosition(n, data, parent, parentData);
    applyChildSizing(n, data, parent);
    return n;
  } catch (_) {
    return null;
  }
}

async function buildFrame(data, parent, parentData) {
  const f = figma.createFrame();
  f.name = data.name || data.tag || "Frame";
  f.resize(Math.max(1, data.rect.w), Math.max(1, data.rect.h));
  applyCommon(f, data);
  configureLayout(f, data);

  parent.appendChild(f);
  setAbsolutePosition(f, data, parent, parentData);
  applyChildSizing(f, data, parent);

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
  if (msg.type !== "import") return;

  try {
    const data = JSON.parse(msg.raw);

    const root = figma.createFrame();
    root.name = data.title || "HTML Import";
    root.resize(
      Math.max(1, data.viewport.width),
      Math.max(1, data.viewport.height)
    );
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
    figma.notify("Import xong: DOM hierarchy + Auto Layout/Grid đã được dựng lại.");
  } catch (e) {
    figma.notify("Import lỗi: " + (e?.message || e));
    console.error(e);
  }
};
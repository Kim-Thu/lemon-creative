;(async () => {
  const cfg = {
    maxDepth: 60,
    copyToClipboard: true,
    download: true,
    embedImages: true,
    imageConcurrency: 6
  };

  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const rgba = (s) => {
    const m = String(s || "").match(
      /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i
    );
    if (!m) return null;
    return {
      r: +m[1] / 255,
      g: +m[2] / 255,
      b: +m[3] / 255,
      a: m[4] == null ? 1 : +m[4]
    };
  };

  const round = (n) => Math.round(n * 100) / 100;

  const elementRect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: round(r.left + scrollX),
      y: round(r.top + scrollY),
      w: round(r.width),
      h: round(r.height)
    };
  };

  const rangeRect = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    return {
      x: round(r.left + scrollX),
      y: round(r.top + scrollY),
      w: round(r.width),
      h: round(r.height)
    };
  };

  const isVisible = (el, cs, r) =>
    r.width > 0.5 &&
    r.height > 0.5 &&
    cs.display !== "none" &&
    cs.visibility !== "hidden" &&
    px(cs.opacity || 1) > 0.001;

  const parseShadow = (s) => {
    if (!s || s === "none") return null;
    const color = s.match(/rgba?\([^)]+\)/)?.[0] || null;
    const nums = s.replace(/rgba?\([^)]+\)/, "").match(/-?\d*\.?\d+px/g) || [];
    return {
      color: rgba(color),
      x: px(nums[0]),
      y: px(nums[1]),
      blur: px(nums[2]),
      spread: px(nums[3]),
      inset: /\binset\b/.test(s)
    };
  };

  const parseTrackSizes = (value) => {
    if (!value || value === "none") return [];
    return value
      .trim()
      .split(/\s+/)
      .map(px)
      .filter((n) => n > 0);
  };

  const getDirectTextNodes = (el) =>
    [...el.childNodes].filter(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.replace(/\s+/g, " ").trim()
    );

  const getName = (el) => {
    const explicit = el.getAttribute("data-figma-name");
    if (explicit) return explicit;

    const semantic =
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      (el.tagName === "IMG" ? el.getAttribute("alt") : "");
    if (semantic) return semantic.slice(0, 80);

    if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;

    const usefulClasses = [...el.classList]
      .filter((c) => !c.includes("[") && !c.includes(":") && c.length < 40)
      .slice(0, 2);

    return usefulClasses.length
      ? `${el.tagName.toLowerCase()}.${usefulClasses.join(".")}`
      : el.tagName.toLowerCase();
  };

  const styleInfo = (cs) => ({
    opacity: px(cs.opacity || 1),
    background: rgba(cs.backgroundColor),
    color: rgba(cs.color),
    border: {
      top: px(cs.borderTopWidth),
      right: px(cs.borderRightWidth),
      bottom: px(cs.borderBottomWidth),
      left: px(cs.borderLeftWidth),
      color: rgba(cs.borderTopColor)
    },
    radius: {
      tl: px(cs.borderTopLeftRadius),
      tr: px(cs.borderTopRightRadius),
      br: px(cs.borderBottomRightRadius),
      bl: px(cs.borderBottomLeftRadius)
    },
    shadow: parseShadow(cs.boxShadow),
    overflow: {
      x: cs.overflowX,
      y: cs.overflowY
    },
    font: {
      family: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      size: px(cs.fontSize),
      weight: parseInt(cs.fontWeight, 10) || 400,
      lineHeight: cs.lineHeight === "normal" ? px(cs.fontSize) * 1.2 : px(cs.lineHeight),
      letterSpacing: cs.letterSpacing === "normal" ? 0 : px(cs.letterSpacing),
      align: cs.textAlign,
      style: cs.fontStyle || "normal"
    }
  });

  const layoutInfo = (el, cs) => {
    const display = cs.display;
    const p = el.parentElement;
    const pcs = p ? getComputedStyle(p) : null;
    const pr = p ? p.getBoundingClientRect() : null;
    const r = el.getBoundingClientRect();

    const parentInnerW = pr && pcs
      ? pr.width - px(pcs.paddingLeft) - px(pcs.paddingRight)
      : null;
    const parentInnerH = pr && pcs
      ? pr.height - px(pcs.paddingTop) - px(pcs.paddingBottom)
      : null;

    const fillsParentWidth =
      parentInnerW != null && Math.abs(r.width - parentInnerW) <= 2;
    const fillsParentHeight =
      parentInnerH != null && Math.abs(r.height - parentInnerH) <= 2;

    const common = {
      display,
      position: cs.position,
      zIndex: cs.zIndex === "auto" ? null : parseInt(cs.zIndex, 10) || 0,
      margin: {
        top: px(cs.marginTop),
        right: px(cs.marginRight),
        bottom: px(cs.marginBottom),
        left: px(cs.marginLeft)
      },
      flexItem: {
        grow: px(cs.flexGrow),
        shrink: px(cs.flexShrink),
        basis: cs.flexBasis
      },
      alignSelf: cs.alignSelf,
      fillsParentWidth,
      fillsParentHeight,
      contentSized:
        display === "inline" ||
        display === "inline-block" ||
        display === "inline-flex"
    };

    if (display === "flex" || display === "inline-flex") {
      const horizontal = ["row", "row-reverse"].includes(cs.flexDirection);
      return {
        ...common,
        mode: horizontal ? "HORIZONTAL" : "VERTICAL",
        reverse: cs.flexDirection.endsWith("reverse"),
        wrap: cs.flexWrap !== "nowrap",
        gap: px(cs.gap),
        rowGap: px(cs.rowGap || cs.gap),
        columnGap: px(cs.columnGap || cs.gap),
        padding: {
          top: px(cs.paddingTop),
          right: px(cs.paddingRight),
          bottom: px(cs.paddingBottom),
          left: px(cs.paddingLeft)
        },
        justify: cs.justifyContent,
        align: cs.alignItems
      };
    }

    if (display === "grid" || display === "inline-grid") {
      const columns = parseTrackSizes(cs.gridTemplateColumns);
      const rows = parseTrackSizes(cs.gridTemplateRows);
      return {
        ...common,
        mode: "GRID",
        padding: {
          top: px(cs.paddingTop),
          right: px(cs.paddingRight),
          bottom: px(cs.paddingBottom),
          left: px(cs.paddingLeft)
        },
        columnGap: px(cs.columnGap || cs.gap),
        rowGap: px(cs.rowGap || cs.gap),
        columns,
        rows,
        columnCount: Math.max(1, columns.length || 1),
        rowCount: Math.max(1, rows.length || Math.ceil(el.children.length / Math.max(1, columns.length || 1)))
      };
    }

    return { ...common, mode: "NONE" };
  };

  const shouldSkip = (el) =>
    ["SCRIPT", "STYLE", "NOSCRIPT", "LINK", "META", "HEAD", "TEMPLATE"].includes(el.tagName);

  const nodeType = (el) => {
    if (el.tagName === "IMG") return "IMAGE";
    if (el.tagName === "SVG") return "SVG";
    return "FRAME";
  };

  const textNodeData = (node, parentStyle) => {
    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (!text) return null;

    const r = rangeRect(node);
    if (r.w <= 0.5 || r.h <= 0.5) return null;

    const lineHeight = parentStyle.font.lineHeight || parentStyle.font.size * 1.2;
    return {
      type: "TEXT",
      name: text.slice(0, 80),
      text,
      rect: r,
      style: parentStyle,
      layout: {
        mode: "NONE",
        position: "static",
        contentSized: r.h <= lineHeight * 1.35,
        fillsParentWidth: false,
        fillsParentHeight: false
      },
      text: {
        wrapped: r.h > lineHeight * 1.35
      },
      children: []
    };
  };

  function walk(el, depth = 0) {
    if (depth > cfg.maxDepth || shouldSkip(el)) return null;

    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!isVisible(el, cs, r)) return null;

    const style = styleInfo(cs);
    const node = {
      type: nodeType(el),
      tag: el.tagName.toLowerCase(),
      name: getName(el),
      rect: elementRect(el),
      style,
      layout: layoutInfo(el, cs),
      children: []
    };

    if (node.type === "IMAGE") {
      node.src = el.currentSrc || el.src;
      node.alt = el.alt || "Image";
      node.objectFit = cs.objectFit || "cover";
      return node;
    }

    if (node.type === "SVG") {
      node.svg = el.outerHTML;
      return node;
    }

    for (const textNode of getDirectTextNodes(el)) {
      const t = textNodeData(textNode, style);
      if (t) node.children.push(t);
    }

    for (const child of el.children) {
      const c = walk(child, depth + 1);
      if (c) node.children.push(c);
    }

    return node;
  }

  const imageNodes = [];
  const collectImages = (node) => {
    if (!node) return;
    if (node.type === "IMAGE" && node.src) imageNodes.push(node);
    for (const child of node.children || []) collectImages(child);
  };

  async function srcToDataUrl(src) {
    if (!src || src.startsWith("data:")) return src || null;
    try {
      const response = await fetch(src, { mode: "cors", credentials: "omit" });
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async function runPool(items, worker, limit) {
    let cursor = 0;
    async function runner() {
      while (cursor < items.length) {
        const index = cursor++;
        await worker(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  }

  const page = {
    version: 3,
    title: document.title || "HTML Import",
    viewport: {
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)
    },
    root: walk(document.body)
  };

  if (cfg.embedImages) {
    collectImages(page.root);
    await runPool(
      imageNodes,
      async (node) => {
        node.dataUrl = await srcToDataUrl(node.src);
      },
      cfg.imageConcurrency
    );
  }

  const json = JSON.stringify(page);

  if (cfg.copyToClipboard) {
    await navigator.clipboard.writeText(json).catch(() => {});
  }

  if (cfg.download) {
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const safe = (document.title || "page").replace(/[^\w\-]+/g, "-");
    a.href = url;
    a.download = `${safe}-figma.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  console.log("✅ Export HTML → Figma JSON v3 xong.");
  console.log("Giữ DOM hierarchy, flex/grid, absolute positioning, text bounds và image data khi CORS cho phép.");
})();
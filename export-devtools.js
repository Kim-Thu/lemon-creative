(() => {
  const cfg = {
    maxDepth: 40,
    copyToClipboard: true,
    download: true
  };

  const px = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const rgba = s => {
    const m = String(s || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
    if (!m) return null;
    return {
      r: +m[1] / 255,
      g: +m[2] / 255,
      b: +m[3] / 255,
      a: m[4] == null ? 1 : +m[4]
    };
  };

  const isVisible = (el, cs, r) =>
    r.width > .5 &&
    r.height > .5 &&
    cs.display !== "none" &&
    cs.visibility !== "hidden" &&
    px(cs.opacity || 1) > .001;

  const rect = el => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left + scrollX,
      y: r.top + scrollY,
      w: r.width,
      h: r.height
    };
  };

  const textDirect = el => [...el.childNodes]
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");

  const parseShadow = s => {
    if (!s || s === "none") return null;
    const color = s.match(/rgba?\([^)]+\)/)?.[0] || null;
    const nums = s.replace(/rgba?\([^)]+\)/, "").match(/-?\d*\.?\d+px/g) || [];
    return {
      color: rgba(color),
      x: px(nums[0]),
      y: px(nums[1]),
      blur: px(nums[2]),
      spread: px(nums[3])
    };
  };

  const layoutInfo = (el, cs) => {
    const display = cs.display;

    if (display === "flex" || display === "inline-flex") {
      const dir = cs.flexDirection;
      const horizontal = dir === "row" || dir === "row-reverse";
      return {
        mode: horizontal ? "HORIZONTAL" : "VERTICAL",
        wrap: cs.flexWrap !== "nowrap",
        gap: px(horizontal ? (cs.columnGap || cs.gap) : (cs.rowGap || cs.gap)),
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
      return {
        mode: "GRID",
        wrap: true,
        gap: px(cs.gap),
        rowGap: px(cs.rowGap || cs.gap),
        columnGap: px(cs.columnGap || cs.gap),
        padding: {
          top: px(cs.paddingTop),
          right: px(cs.paddingRight),
          bottom: px(cs.paddingBottom),
          left: px(cs.paddingLeft)
        },
        columns: cs.gridTemplateColumns
          .split(/\s+/)
          .filter(Boolean)
          .map(px)
          .filter(n => n > 0)
      };
    }

    return { mode: "NONE" };
  };

  const styleInfo = cs => ({
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
    font: {
      family: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      size: px(cs.fontSize),
      weight: parseInt(cs.fontWeight, 10) || 400,
      lineHeight: cs.lineHeight === "normal" ? null : px(cs.lineHeight),
      letterSpacing: cs.letterSpacing === "normal" ? 0 : px(cs.letterSpacing),
      align: cs.textAlign
    }
  });

  const nodeType = el => {
    if (el.tagName === "IMG") return "IMAGE";
    if (el.tagName === "SVG") return "SVG";
    return "FRAME";
  };

  const shouldSkipElement = el =>
    ["SCRIPT", "STYLE", "NOSCRIPT", "LINK", "META", "HEAD"].includes(el.tagName);

  function walk(el, depth = 0) {
    if (depth > cfg.maxDepth || shouldSkipElement(el)) return null;

    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!isVisible(el, cs, r)) return null;

    const node = {
      type: nodeType(el),
      tag: el.tagName.toLowerCase(),
      name: el.id
        ? `${el.tagName.toLowerCase()}#${el.id}`
        : el.classList?.length
          ? `${el.tagName.toLowerCase()}.${[...el.classList].slice(0,2).join(".")}`
          : el.tagName.toLowerCase(),
      rect: rect(el),
      style: styleInfo(cs),
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

    const direct = textDirect(el);

    if (direct) {
      node.children.push({
        type: "TEXT",
        name: direct.slice(0, 80),
        text: direct,
        rect: rect(el),
        style: styleInfo(cs),
        layout: { mode: "NONE" },
        children: []
      });
    }

    for (const child of el.children) {
      const c = walk(child, depth + 1);
      if (c) node.children.push(c);
    }

    return node;
  }

  const page = {
    version: 2,
    title: document.title || "HTML Import",
    viewport: {
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)
    },
    root: walk(document.body)
  };

  const json = JSON.stringify(page);

  if (cfg.copyToClipboard) {
    navigator.clipboard.writeText(json).catch(() => {});
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

  console.log("✅ Export xong JSON cấu trúc cho Figma.");
  console.log("JSON cũng đã được copy vào clipboard.");
})();
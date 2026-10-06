(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const Geometry = window.BubbleGeometry;
  const Editor = window.SpeechbubbleState;
  const history = Editor.createHistory();
  const byId = (id) => document.getElementById(id);
  const canvas = byId("canvas");
  const canvasFrame = byId("canvas-frame");
  const stage = byId("stage");
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");

  let nextId = 1;
  let selectedId = null;
  let interaction = null;
  let wordMode = false;
  let selectedWord = null;
  let toastTimer = null;
  let photopeaTransferPending = null;
  let photopeaTimer = null;
  let backgroundRequest = 0;
  const photopeaOrigin = "https://www.photopea.com";
  const bundledFamilies = ["Comic Neue", "Patrick Hand", "Bangers", "Permanent Marker"];
  const fontFamilies = ["Arial", "Georgia", "Comic Sans MS", "Impact", "Courier New", "Verdana", ...bundledFamilies];
  let fontsSettled = false;
  const fontWaiters = [];
  const Lines = window.SpeechbubbleLines;
  // app.js?v=… : load fonts.js with the same cache key.
  const assetQuery = document.currentScript && document.currentScript.src ? new URL(document.currentScript.src).search : "";
  const newSeed = () => Math.floor(Math.random() * 2147483647);
  const projectKey = "speechbubble:project";
  const backgroundKey = "speechbubble:background";
  let saveTimer = null;
  let savedBackground = null;

  const photopeaMode = new URLSearchParams(window.location.search).get("photopea") === "1";

  const state = {
    canvas: {
      width: 1200,
      height: 800,
      background: null,
      backgroundMode: "white"
    },
    bubbles: []
  };

  function uniqueId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    const id = `bubble-${Date.now()}-${nextId}`;
    nextId += 1;
    return id;
  }

  function createBubble(overrides = {}) {
    return {
      id: uniqueId(),
      text: "WHO'S\n[SORRY](#d62828)\n**NOW?**",
      x: 600,
      y: 355,
      width: 500,
      height: 300,
      style: "speech",
      shape: "oval",
      tailX: 700,
      tailY: 650,
      tailWidth: 72,
      tailBend: 0,
      fill: "#ffffff",
      stroke: "#171717",
      strokeWidth: 4,
      lineStyle: "clean",
      shadow: "none",
      seed: newSeed(),
      opacity: 100,
      fontFamily: "Arial",
      fontSize: 42,
      textColour: "#171717",
      bold: false,
      italic: false,
      autoFit: true,
      // Edited words, keyed "WORD#n" (nth occurrence): { x, y } offset in
      // ems of the bubble's text size and a size multiplier, { scale }.
      words: {},
      ...overrides
    };
  }

  state.bubbles.push(createBubble());
  selectedId = state.bubbles[0].id;

  function selectedBubble() {
    return state.bubbles.find((bubble) => bubble.id === selectedId) || null;
  }

  const snapshot = () => Editor.snapshot(state, selectedId);
  function remember(key = null) {
    history.record(snapshot(), key);
    syncHistory();
  }
  function syncHistory() {
    byId("undo").disabled = !history.canUndo;
    byId("redo").disabled = !history.canRedo;
  }
  function restoreHistory(direction) {
    if (interaction) return;
    const previous = history[direction](snapshot());
    if (!previous) return;
    backgroundRequest += 1;
    state.canvas = previous.canvas;
    state.bubbles = previous.bubbles;
    selectedId = previous.selectedId;
    syncAll();
  }

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => {
      if (value !== undefined && value !== null) element.setAttribute(name, String(value));
    });
    return element;
  }

  function safeColour(value, fallback) {
    return window.CSS && CSS.supports("color", value) ? value : fallback;
  }

  function styleKey(style) {
    return `${style.bold ? 1 : 0}|${style.italic ? 1 : 0}|${style.colour}`;
  }

  function parseInlineText(text, bubble) {
    const parts = [];
    const regex = /(\[[^\]]*?\]\([^)]*?\))|(\*\*[^*]*?\*\*)|(\*[^*]*?\*)/g;
    let cursor = 0;
    let match;

    function addPart(content, additions = {}) {
      if (!content) return;
      parts.push({
        text: content,
        bold: bubble.bold || Boolean(additions.bold),
        italic: bubble.italic || Boolean(additions.italic),
        colour: safeColour(additions.colour || bubble.textColour, bubble.textColour)
      });
    }

    while ((match = regex.exec(text)) !== null) {
      if (match.index > cursor) addPart(text.slice(cursor, match.index));
      const value = match[0];
      if (value.startsWith("[")) {
        const colourMatch = value.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
        if (colourMatch) addPart(colourMatch[1], { colour: colourMatch[2] });
        else addPart(value);
      } else if (value.startsWith("**")) {
        addPart(value.slice(2, -2), { bold: true });
      } else {
        addPart(value.slice(1, -1), { italic: true });
      }
      cursor = regex.lastIndex;
    }
    if (cursor < text.length) addPart(text.slice(cursor));
    if (parts.length === 0) addPart(text || " ");
    return parts;
  }

  function fontString(style, fontSize, fontFamily) {
    const family = fontFamily.includes(" ") ? `"${fontFamily}"` : fontFamily;
    return `${style.italic ? "italic " : ""}${style.bold ? "700 " : "400 "}${fontSize}px ${family}`;
  }

  function measureText(text, style, fontSize, fontFamily) {
    measureContext.font = fontString(style, fontSize, fontFamily);
    return measureContext.measureText(text).width;
  }

  function appendSpan(line, text, style, fontSize, fontFamily) {
    if (!text) return;
    const last = line.spans[line.spans.length - 1];
    const width = measureText(text, style, fontSize, fontFamily);
    if (last && styleKey(last) === styleKey(style) && last.word === style.word) {
      last.text += text;
      last.width += width;
    } else {
      line.spans.push({ ...style, text, width });
    }
    line.width += width;
  }

  // Returns wrapped lines whose spans carry the index of the word they belong
  // to (null for spaces), plus the text of each word.
  function wrapText(bubble, fontSize, maxWidth) {
    const lines = [{ spans: [], width: 0 }];
    const words = [];
    let pendingSpace = null;
    let word = null;

    function currentLine() {
      return lines[lines.length - 1];
    }

    function newLine() {
      lines.push({ spans: [], width: 0 });
      pendingSpace = null;
    }

    function addLongWord(word, style) {
      for (const character of word) {
        const width = measureText(character, style, fontSize, bubble.fontFamily);
        if (currentLine().spans.length && currentLine().width + width > maxWidth) newLine();
        appendSpan(currentLine(), character, { ...style, word }, fontSize, bubble.fontFamily);
      }
    }

    parseInlineText(bubble.text, bubble).forEach((part) => {
      // "|" splits a word into separately editable pieces without a space.
      const tokens = part.text.match(/\n|\||[^\S\n]+|[^\s|]+/g) || [];
      tokens.forEach((token) => {
        if (token === "\n") {
          newLine();
          word = null;
          return;
        }
        if (token === "|") {
          word = null;
          return;
        }
        if (/^\s+$/.test(token)) {
          pendingSpace = { text: " ", style: part };
          word = null;
          return;
        }
        // Formatting can change mid-word, e.g. **NO**W: it is still one word.
        if (word === null) {
          word = words.length;
          words.push("");
        }
        words[word] += token;

        const line = currentLine();
        const wordWidth = measureText(token, part, fontSize, bubble.fontFamily);
        const spaceWidth = line.spans.length && pendingSpace
          ? measureText(" ", pendingSpace.style, fontSize, bubble.fontFamily)
          : 0;

        if (line.spans.length && line.width + spaceWidth + wordWidth > maxWidth) newLine();
        if (pendingSpace && currentLine().spans.length) {
          appendSpan(currentLine(), " ", { ...pendingSpace.style, word: null }, fontSize, bubble.fontFamily);
        }
        pendingSpace = null;

        if (wordWidth > maxWidth) addLongWord(token, part);
        else appendSpan(currentLine(), token, { ...part, word }, fontSize, bubble.fontFamily);
      });
    });

    return { lines, words };
  }

  // Name repeated words by occurrence, so a dragged word keeps its place when
  // other words are added or removed, and editing the word itself resets it.
  function wordKeys(words) {
    const seen = new Map();
    return words.map((word) => {
      const count = seen.get(word) || 0;
      seen.set(word, count + 1);
      return `${word}#${count}`;
    });
  }

  // Auto-fit wraps the text at up to 97 sizes. Dragging only moves a bubble,
  // so reuse layouts instead of re-measuring every bubble on each pointermove.
  const layoutCache = new Map();
  function layoutText(bubble) {
    const key = JSON.stringify([bubble.text, bubble.width, bubble.height, bubble.style, bubble.shape,
      bubble.fontFamily, bubble.fontSize, bubble.bold, bubble.italic, bubble.autoFit, bubble.textColour]);
    let layout = layoutCache.get(key);
    if (!layout) {
      if (layoutCache.size >= 200) layoutCache.clear();
      layout = computeLayout(bubble);
      layoutCache.set(key, layout);
    }
    return layout;
  }

  function computeLayout(bubble) {
    const bounds = Geometry.textBounds(bubble);
    const lineHeightRatio = 1.14;
    const minimum = 14;
    const requestedSize = Geometry.clamp(Number(bubble.fontSize) || 42, minimum, 110);

    if (!bubble.autoFit) {
      const wrapped = wrapText(bubble, requestedSize, bounds.width);
      return {
        lines: wrapped.lines,
        words: wordKeys(wrapped.words),
        fontSize: requestedSize,
        lineHeight: requestedSize * lineHeightRatio
      };
    }

    let chosen = minimum;
    let wrapped = wrapText(bubble, chosen, bounds.width);

    for (let size = 110; size >= minimum; size -= 1) {
      const candidate = wrapText(bubble, size, bounds.width);
      if (candidate.lines.length * size * lineHeightRatio <= bounds.height && candidate.lines.every((line) => line.width <= bounds.width)) {
        chosen = size;
        wrapped = candidate;
        break;
      }
    }

    return { lines: wrapped.lines, words: wordKeys(wrapped.words), fontSize: chosen, lineHeight: chosen * lineHeightRatio };
  }

  // Position every span on the canvas, applying edited words' offsets and
  // sizes. Each edited word scales about its own centre.
  function placeText(bubble) {
    const layout = layoutText(bubble);
    const edits = bubble.words || {};
    const size = layout.fontSize;
    const startY = bubble.y - (layout.lines.length - 1) * layout.lineHeight / 2;
    const lines = layout.lines.map((line, index) => {
      const y = startY + index * layout.lineHeight;
      let cursor = bubble.x - line.width / 2;
      const spans = line.spans.map((span) => {
        const placed = { ...span, key: span.word === null ? null : layout.words[span.word], moved: false, x: cursor, y, size };
        cursor += span.width;
        return placed;
      });
      for (let start = 0, end = 1; start < spans.length; start = end, end = start + 1) {
        while (end < spans.length && spans[end].word === spans[start].word) end += 1;
        const edit = spans[start].key ? edits[spans[start].key] : null;
        if (!edit) continue;
        const left = spans[start].x;
        const width = spans[end - 1].x + spans[end - 1].width - left;
        const shift = (width - width * edit.scale) / 2;
        for (let i = start; i < end; i += 1) {
          const span = spans[i];
          span.moved = true;
          span.x = left + shift + (span.x - left) * edit.scale + edit.x * size;
          span.y = y + edit.y * size;
          span.width *= edit.scale;
          span.size = size * edit.scale;
        }
      }
      return spans;
    });
    return { lines, fontSize: size, words: layout.words };
  }

  // Returns bubble.words with one word's edit changed. A word back in its
  // place at its normal size has no edit at all.
  function editWord(words, key, change, snap = false) {
    const round = (value) => Math.round(value * 1000) / 1000;
    const next = { x: 0, y: 0, scale: 1, ...(words || {})[key], ...change };
    next.x = round(next.x);
    next.y = round(next.y);
    next.scale = round(Geometry.clamp(next.scale, 0.25, 5));
    // Dropping a word near home snaps it back into the line.
    if (snap && Math.hypot(next.x, next.y) < 0.1) { next.x = 0; next.y = 0; }
    const result = { ...words };
    if (!next.x && !next.y && next.scale === 1) delete result[key];
    else result[key] = next;
    return result;
  }

  function activeWord(bubble) {
    return wordMode && bubble && selectedWord && layoutText(bubble).words.includes(selectedWord) ? selectedWord : null;
  }

  function selectWord(key) {
    if (selectedWord === key) return;
    selectedWord = key;
    renderCanvas();
    syncInspector();
  }

  // Unmoved words stay together as one <text> per line; each dragged word
  // gets its own. A space next to a dragged word has nothing to separate.
  function textRuns(spans) {
    const runs = [];
    let run = null;
    spans.forEach((span) => {
      const group = span.moved ? span.word : "flow";
      if (!run || run.group !== group) {
        if (span.word === null) return;
        run = { group, x: span.x, y: span.y, size: span.size, spans: [] };
        runs.push(run);
      }
      const last = run.spans[run.spans.length - 1];
      if (last && styleKey(last) === styleKey(span)) last.text += span.text;
      else run.spans.push({ ...span });
    });
    return runs;
  }

  function wordBoxes(placed) {
    const boxes = [];
    placed.lines.forEach((spans, line) => spans.forEach((span) => {
      if (span.word === null) return;
      const last = boxes[boxes.length - 1];
      if (last && last.word === span.word && last.line === line) {
        last.width += span.width;
        return;
      }
      boxes.push({ word: span.word, key: span.key, line, moved: span.moved, x: span.x, y: span.y - span.size * 0.6, width: span.width, height: span.size * 1.2 });
    }));
    return boxes;
  }

  function hasMovedWords(bubble) {
    return placeText(bubble).lines.some((spans) => spans.some((span) => span.moved));
  }

  function renderBubbleText(group, bubble) {
    const placed = placeText(bubble);
    const textGroup = svgElement("g", { "pointer-events": "none", "aria-hidden": "true" });

    placed.lines.flatMap(textRuns).forEach((run) => {
      const text = svgElement("text", {
        x: run.x,
        y: run.y,
        "dominant-baseline": "middle",
        "font-family": bubble.fontFamily,
        "font-size": Math.round(run.size * 1000) / 1000
      });
      run.spans.forEach((span) => {
        const tspan = svgElement("tspan", {
          fill: span.colour,
          "font-weight": span.bold ? 700 : 400,
          "font-style": span.italic ? "italic" : "normal"
        });
        tspan.textContent = span.text;
        text.appendChild(tspan);
      });
      textGroup.appendChild(text);
    });
    group.appendChild(textGroup);
  }

  function selectedBubbleBounds(bubble) {
    const shapeScale = bubble.style === "thought" ? 0.6 : 0.5;
    const bendPadding = bubble.style === "speech" ? Math.abs(bubble.tailBend) : 0;
    // Hand-drawn lines wobble outwards; brush lines are up to twice as thick.
    const lineReach = bubble.lineStyle === "hand" ? 2 + bubble.strokeWidth : bubble.lineStyle === "brush" ? bubble.strokeWidth : bubble.strokeWidth / 2;
    const padding = Math.max(8, lineReach + 5) + bendPadding;
    let left = bubble.x - bubble.width * shapeScale - padding;
    let right = bubble.x + bubble.width * shapeScale + padding;
    let top = bubble.y - bubble.height * shapeScale - padding;
    let bottom = bubble.y + bubble.height * shapeScale + padding;

    if (bubble.style !== "shout") {
      left = Math.min(left, bubble.tailX - padding);
      right = Math.max(right, bubble.tailX + padding);
      top = Math.min(top, bubble.tailY - padding);
      bottom = Math.max(bottom, bubble.tailY + padding);
    }

    if (bubble.shadow !== "none") {
      right += shadowOffset(bubble);
      bottom += shadowOffset(bubble);
    }

    // Include dragged words, which may sit outside the bubble.
    placeText(bubble).lines.flat().forEach((span) => {
      left = Math.min(left, span.x - 2);
      right = Math.max(right, span.x + span.width + 2);
      top = Math.min(top, span.y - span.size * 0.7);
      bottom = Math.max(bottom, span.y + span.size * 0.7);
    });

    const x = Math.floor(left);
    const y = Math.floor(top);
    return {
      x,
      y,
      width: Math.max(1, Math.ceil(right) - x),
      height: Math.max(1, Math.ceil(bottom) - y)
    };
  }

  function serialisedSelectedBubble(editable = false) {
    const bubble = selectedBubble();
    if (!bubble) return null;
    const sourceGroup = [...canvas.querySelectorAll(".bubble-layer")]
      .find((group) => group.dataset.bubbleId === bubble.id);
    if (!sourceGroup) return null;

    const bounds = selectedBubbleBounds(bubble);
    const output = svgElement("svg", {
      width: bounds.width,
      height: bounds.height,
      viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`
    });
    if (editable) {
      output.appendChild(svgElement("path", { id: "bubble-preview", d: Geometry.bodyPath(bubble), fill: bubble.fill }));
      const textGroup = svgElement("g", { id: "bubble-text" });
      renderBubbleText(textGroup, bubble);
      output.appendChild(textGroup);
    } else output.appendChild(sourceGroup.cloneNode(true));
    return new XMLSerializer().serializeToString(output);
  }

  function binaryDataUrl(bytes, type) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return `data:${type};base64,${window.btoa(binary)}`;
  }

  function svgDataUrl(svg) {
    return binaryDataUrl(new TextEncoder().encode(svg), "image/svg+xml");
  }

  function insertInPhotopea() {
    if (photopeaTransferPending) return;
    const svg = serialisedSelectedBubble(true);
    if (!svg) {
      toast("Select a bubble first");
      return;
    }
    if (window.parent === window) {
      toast("Open Speechbubble from Photopea's Plugins panel first");
      return;
    }

    const bubble = selectedBubble();
    const bounds = selectedBubbleBounds(bubble);
    const token = `speechbubble:${uniqueId()}`;
    let shapeUrl;
    try {
      // A hand-drawn outline keeps its wobble; the line itself becomes
      // Photopea's even layer stroke.
      const paths = Geometry.editablePaths(bubble).map((path, part) => bubble.lineStyle === "hand"
        ? Lines.styled(path, { style: "hand", width: bubble.strokeWidth, seed: bubble.seed, part }).centre
        : path);
      shapeUrl = binaryDataUrl(window.SpeechbubbleShape.psd(paths, bounds, bubble.fill), "application/octet-stream");
    } catch (error) {
      toast("Could not prepare the editable bubble. Try a smaller bubble.");
      return;
    }
    photopeaTransferPending = {
      token, stage: "preparing", destination: null,
      shadow: bubble.shadow !== "none",
      data: { dataUrl: svgDataUrl(svg), shapeUrl, name: cleanLayerName(bubble.text).slice(0, 80),
        stroke: bubble.stroke, strokeWidth: bubble.strokeWidth, opacity: bubble.opacity,
        width: bounds.width, height: bounds.height }
    };
    byId("insert-photopea").disabled = true;
    byId("insert-photopea").textContent = "Inserting…";
    photopeaTimer = window.setTimeout(() => finishPhotopeaTransfer("Photopea did not confirm insertion. Check its document tabs before trying again."), 40000);
    window.parent.postMessage(window.SpeechbubblePhotopea.prepareScript(token), photopeaOrigin);
  }

  function finishPhotopeaTransfer(message) {
    photopeaTransferPending = null;
    window.clearTimeout(photopeaTimer);
    byId("insert-photopea").disabled = !selectedBubble();
    byId("insert-photopea").textContent = "Insert in Photopea";
    toast(message);
  }

  function renderSelection(bubble) {
    const group = svgElement("g", { class: "selection-ui", "data-bubble-id": bubble.id });
    const padding = Math.max(8, bubble.strokeWidth + 4);
    group.appendChild(svgElement("rect", {
      class: "selection-box",
      x: bubble.x - bubble.width / 2 - padding,
      y: bubble.y - bubble.height / 2 - padding,
      width: bubble.width + padding * 2,
      height: bubble.height + padding * 2,
      rx: 8
    }));
    if (wordMode) {
      const active = activeWord(bubble);
      const boxes = wordBoxes(placeText(bubble));
      boxes.forEach((box) => {
        const classes = ["word-handle", box.moved ? "moved" : "", box.key === active ? "selected" : ""];
        group.appendChild(svgElement("rect", {
          class: classes.filter(Boolean).join(" "),
          x: box.x - 2,
          y: box.y,
          width: box.width + 4,
          height: box.height,
          rx: 4,
          "data-handle": "word",
          "data-word": box.key
        }));
      });
      // The selected word's corner handle resizes it, like a bubble's.
      const last = boxes.filter((box) => box.key === active).pop();
      if (last) {
        group.appendChild(svgElement("circle", {
          class: "selection-handle word-size",
          cx: last.x + last.width + 2,
          cy: last.y + last.height,
          r: 7,
          "data-handle": "word-size",
          "data-word": last.key
        }));
      }
    }
    group.appendChild(svgElement("circle", {
      class: "selection-handle resize",
      cx: bubble.x + bubble.width / 2,
      cy: bubble.y + bubble.height / 2,
      r: Math.max(9, Math.min(bubble.width, bubble.height) * 0.025),
      "data-handle": "resize"
    }));
    if (bubble.style !== "shout") {
      group.appendChild(svgElement("circle", {
        class: "selection-handle tail",
        cx: bubble.tailX,
        cy: bubble.tailY,
        r: Math.max(9, Math.min(bubble.width, bubble.height) * 0.025),
        "data-handle": "tail"
      }));
    }
    canvas.appendChild(group);
  }

  function shadowOffset(bubble) {
    return Math.round(Geometry.clamp(Math.min(bubble.width, bubble.height) * 0.035 + bubble.strokeWidth * 0.8, 5, 30));
  }

  // The body and any thought dots, each restyled for the bubble's line.
  const outlineCache = new Map();
  function outlines(bubble) {
    const paths = [Geometry.bodyPath(bubble)];
    if (bubble.style === "thought") Geometry.thoughtDots(bubble).forEach((dot) => paths.push(Geometry.circlePath(dot)));
    return paths.map((path, part) => {
      const key = [bubble.lineStyle, bubble.strokeWidth, bubble.seed, part, path].join("|");
      let styled = outlineCache.get(key);
      if (!styled) {
        if (outlineCache.size >= 400) outlineCache.clear();
        styled = Lines.styled(path, { style: bubble.lineStyle, width: bubble.strokeWidth, seed: bubble.seed, part });
        outlineCache.set(key, styled);
      }
      return styled;
    });
  }

  function renderBubbleShape(group, bubble, index) {
    const shapes = outlines(bubble);
    const opacity = bubble.opacity / 100;
    if (bubble.shadow !== "none") {
      let fill = bubble.stroke;
      if (bubble.shadow === "halftone") {
        const spacing = Geometry.clamp(Math.min(bubble.width, bubble.height) * 0.026, 5, 12);
        const id = `halftone-${index}`;
        const defs = svgElement("defs");
        const pattern = svgElement("pattern", { id, width: spacing, height: spacing, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
        pattern.appendChild(svgElement("circle", { cx: spacing / 2, cy: spacing / 2, r: spacing * 0.3, fill: bubble.stroke }));
        defs.appendChild(pattern);
        group.appendChild(defs);
        fill = `url(#${id})`;
      }
      const offset = shadowOffset(bubble);
      shapes.forEach((shape) => group.appendChild(svgElement("path", {
        class: "bubble-shadow", d: shape.centre, fill, opacity, transform: `translate(${offset} ${offset})`
      })));
    }
    if (bubble.lineStyle !== "hand" && bubble.lineStyle !== "brush") {
      shapes.forEach((shape, part) => group.appendChild(svgElement("path", {
        class: part === 0 ? "bubble-body" : "bubble-dot",
        "data-bubble-id": bubble.id,
        d: shape.centre,
        fill: bubble.fill,
        stroke: bubble.stroke,
        "stroke-width": bubble.strokeWidth,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        opacity
      })));
      return;
    }
    // A drawn line is a filled ribbon over the fill; group opacity keeps the
    // overlap from looking darker, as with an ordinary stroke.
    const body = svgElement("g", { opacity });
    shapes.forEach((shape, part) => {
      body.appendChild(svgElement("path", { class: part === 0 ? "bubble-body" : "bubble-dot", "data-bubble-id": bubble.id, d: shape.centre, fill: bubble.fill }));
      if (shape.ribbon) body.appendChild(svgElement("path", { class: "bubble-line", d: shape.ribbon, fill: bubble.stroke }));
    });
    group.appendChild(body);
  }

  function renderCanvas() {
    canvas.replaceChildren();
    canvas.setAttribute("viewBox", `0 0 ${state.canvas.width} ${state.canvas.height}`);
    canvas.setAttribute("width", state.canvas.width);
    canvas.setAttribute("height", state.canvas.height);

    if (state.canvas.backgroundMode === "white") {
      canvas.appendChild(svgElement("rect", {
        class: "canvas-background",
        x: 0,
        y: 0,
        width: state.canvas.width,
        height: state.canvas.height,
        fill: "#ffffff"
      }));
    }
    if (state.canvas.background) {
      canvas.appendChild(svgElement("image", {
        class: "canvas-image",
        href: state.canvas.background.dataUrl,
        x: 0,
        y: 0,
        width: state.canvas.width,
        height: state.canvas.height,
        preserveAspectRatio: "none"
      }));
    }

    state.bubbles.forEach((bubble, index) => {
      const group = svgElement("g", {
        class: "bubble-layer",
        "data-bubble-id": bubble.id
      });
      renderBubbleShape(group, bubble, index);
      renderBubbleText(group, bubble);
      canvas.appendChild(group);
    });

    const selected = selectedBubble();
    if (selected) renderSelection(selected);
    scheduleSave();
  }

  function cleanLayerName(text) {
    const cleaned = text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/\|/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || "Empty bubble";
  }

  function renderBubbleList() {
    const list = byId("bubble-list");
    list.replaceChildren();
    [...state.bubbles].reverse().forEach((bubble, reverseIndex) => {
      const actualIndex = state.bubbles.length - reverseIndex;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.bubbleId = bubble.id;
      button.setAttribute("aria-current", String(bubble.id === selectedId));

      const number = document.createElement("span");
      number.className = "layer-number";
      number.textContent = actualIndex;
      const copy = document.createElement("span");
      copy.className = "layer-copy";
      copy.textContent = cleanLayerName(bubble.text);
      const kind = document.createElement("span");
      kind.className = "layer-kind";
      kind.textContent = bubble.style;
      button.append(number, copy, kind);
      item.appendChild(button);
      list.appendChild(item);
    });
    byId("bubble-count").textContent = state.bubbles.length;
  }

  function setSegmented(groupId, attribute, value) {
    byId(groupId).querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset[attribute] === value));
    });
  }

  function syncInspector() {
    const bubble = selectedBubble();
    const controls = byId("selection-controls");
    controls.querySelectorAll("input, textarea, select, button").forEach((control) => {
      control.disabled = !bubble;
    });
    controls.style.opacity = bubble ? "1" : ".45";

    const actionIds = ["duplicate-bubble", "send-backward", "bring-forward", "delete-bubble"];
    actionIds.forEach((id) => { byId(id).disabled = !bubble; });
    byId("insert-photopea").disabled = !bubble || Boolean(photopeaTransferPending);
    if (!bubble) return;

    byId("text-input").value = bubble.text;
    byId("font-family").value = bubble.fontFamily;
    byId("text-colour").value = bubble.textColour;
    byId("font-bold").checked = bubble.bold;
    byId("font-italic").checked = bubble.italic;
    byId("auto-fit").checked = bubble.autoFit;
    byId("drag-words").checked = wordMode;
    byId("reset-words").disabled = !hasMovedWords(bubble);
    const active = activeWord(bubble);
    byId("word-help").classList.toggle("is-hidden", !wordMode);
    byId("word-size-field").classList.toggle("is-hidden", !active);
    if (active) {
      const scale = (bubble.words[active] || {}).scale || 1;
      byId("word-size").value = Math.round(scale * 100);
      byId("word-size-output").textContent = `${Math.round(scale * 100)}%`;
      byId("word-size-label").textContent = `Size of “${active.replace(/#\d+$/, "")}”`;
    }
    const effectiveFontSize = layoutText(bubble).fontSize;
    byId("font-size").value = bubble.autoFit ? effectiveFontSize : bubble.fontSize;
    byId("font-size").disabled = false;
    byId("font-size-output").textContent = bubble.autoFit
      ? `${effectiveFontSize} auto`
      : bubble.fontSize;

    setSegmented("bubble-style", "style", bubble.style);
    byId("bubble-shape").value = bubble.shape;
    byId("stroke-width").value = bubble.strokeWidth;
    byId("stroke-width-output").textContent = bubble.strokeWidth;
    byId("line-style").value = bubble.lineStyle;
    byId("bubble-shadow").value = bubble.shadow;
    byId("redraw-field").classList.toggle("is-hidden", bubble.lineStyle !== "hand");
    byId("shadow-field").classList.toggle("span-two", bubble.lineStyle !== "hand");
    byId("fill-colour").value = bubble.fill;
    byId("stroke-colour").value = bubble.stroke;
    byId("bubble-opacity").value = bubble.opacity;
    byId("bubble-width").value = Math.round(bubble.width);
    byId("bubble-height").value = Math.round(bubble.height);
    byId("tail-width").value = bubble.tailWidth;
    byId("tail-width-output").textContent = Math.round(bubble.tailWidth);
    byId("tail-bend").value = bubble.tailBend;
    byId("tail-bend-output").textContent = Math.round(bubble.tailBend);

    byId("speech-shape-field").classList.toggle("is-hidden", bubble.style !== "speech");
    byId("line-style-field").classList.toggle("span-two", bubble.style !== "speech");
    byId("tail-controls").classList.toggle("is-hidden", bubble.style !== "speech");

    const index = state.bubbles.findIndex((item) => item.id === bubble.id);
    byId("send-backward").disabled = index <= 0;
    byId("bring-forward").disabled = index < 0 || index >= state.bubbles.length - 1;
  }

  function syncCanvasControls() {
    const background = state.canvas.background;
    byId("canvas-width").value = state.canvas.width;
    byId("canvas-height").value = state.canvas.height;
    byId("canvas-width").disabled = Boolean(background);
    byId("canvas-height").disabled = Boolean(background);
    byId("remove-image").hidden = !background;
    byId("image-details").textContent = background
      ? `${background.name} · ${state.canvas.width} × ${state.canvas.height}`
      : `No image: using a ${state.canvas.width} × ${state.canvas.height} canvas.`;
    setSegmented("background-mode", "background", state.canvas.backgroundMode);
  }

  function syncAll() {
    syncHistory();
    renderBubbleList();
    syncInspector();
    syncCanvasControls();
    renderCanvas();
    requestAnimationFrame(fitCanvas);
  }

  function toast(message) {
    const element = byId("toast");
    element.textContent = message;
    element.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.remove("visible"), 2400);
  }

  function constrainBubble(bubble) {
    const maxW = state.canvas.width * 1.4;
    const maxH = state.canvas.height * 1.4;
    bubble.width = Geometry.clamp(Number(bubble.width) || 120, 120, Math.max(120, maxW));
    bubble.height = Geometry.clamp(Number(bubble.height) || 90, 90, Math.max(90, maxH));
    bubble.x = bubble.width >= state.canvas.width
      ? state.canvas.width / 2
      : Geometry.clamp(bubble.x, bubble.width / 2, state.canvas.width - bubble.width / 2);
    bubble.y = bubble.height >= state.canvas.height
      ? state.canvas.height / 2
      : Geometry.clamp(bubble.y, bubble.height / 2, state.canvas.height - bubble.height / 2);
    bubble.tailX = Geometry.clamp(bubble.tailX, 0, state.canvas.width);
    bubble.tailY = Geometry.clamp(bubble.tailY, 0, state.canvas.height);
  }

  function patchSelected(patch, options = {}) {
    const bubble = selectedBubble();
    if (!bubble) return;
    const next = { ...bubble, ...patch };
    constrainBubble(next);
    // A value clamped back to the current one is not an undoable edit.
    if (Object.keys(next).every((key) => next[key] === bubble[key])) {
      if (options.inspector) syncInspector();
      return;
    }
    remember(`edit:${bubble.id}:${Object.keys(patch).join(",")}`);
    Object.assign(bubble, next);
    renderCanvas();
    if (options.list) renderBubbleList();
    if (options.inspector) syncInspector();
    else if (bubble.autoFit) {
      const size = layoutText(bubble).fontSize;
      byId("font-size").value = size;
      byId("font-size-output").textContent = `${size} auto`;
    }
  }

  function addBubble() {
    remember();
    const source = selectedBubble();
    const offset = state.bubbles.length * 24;
    const bubble = createBubble({
      text: "NEW BUBBLE",
      x: source ? source.x + 32 : state.canvas.width / 2,
      y: source ? source.y + 32 : state.canvas.height / 2,
      width: source ? source.width : Math.min(500, state.canvas.width * 0.46),
      height: source ? source.height : Math.min(280, state.canvas.height * 0.36),
      tailX: source ? source.tailX + 32 : state.canvas.width * 0.6 + offset,
      tailY: source ? source.tailY + 32 : state.canvas.height * 0.78,
      style: source ? source.style : "speech",
      shape: source ? source.shape : "oval",
      fill: source ? source.fill : "#ffffff",
      stroke: source ? source.stroke : "#171717",
      strokeWidth: source ? source.strokeWidth : 4,
      lineStyle: source ? source.lineStyle : "clean",
      shadow: source ? source.shadow : "none",
      fontFamily: source ? source.fontFamily : "Arial",
      textColour: source ? source.textColour : "#171717"
    });
    constrainBubble(bubble);
    state.bubbles.push(bubble);
    selectedId = bubble.id;
    syncAll();
    byId("text-input").focus();
    byId("text-input").select();
  }

  function duplicateBubble() {
    const source = selectedBubble();
    if (!source) return;
    remember();
    const bubble = {
      ...source,
      id: uniqueId(),
      x: source.x + 30,
      y: source.y + 30,
      tailX: source.tailX + 30,
      tailY: source.tailY + 30
    };
    constrainBubble(bubble);
    state.bubbles.push(bubble);
    selectedId = bubble.id;
    syncAll();
    toast("Bubble duplicated");
  }

  function deleteBubble() {
    const index = state.bubbles.findIndex((bubble) => bubble.id === selectedId);
    if (index < 0) return;
    remember();
    state.bubbles.splice(index, 1);
    selectedId = state.bubbles[Math.min(index, state.bubbles.length - 1)]?.id || null;
    syncAll();
    toast("Bubble removed");
  }

  function moveLayer(direction) {
    const index = state.bubbles.findIndex((bubble) => bubble.id === selectedId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.bubbles.length) return;
    remember();
    [state.bubbles[index], state.bubbles[target]] = [state.bubbles[target], state.bubbles[index]];
    syncAll();
  }

  function selectBubble(id) {
    if (selectedId === id) return;
    selectedId = id;
    selectedWord = null;
    renderBubbleList();
    syncInspector();
    renderCanvas();
  }

  function cancelCanvasInteraction() {
    const bubble = selectedBubble();
    const { pointerId, recorded, bubble: original } = interaction;
    interaction = null;
    if (bubble) Object.assign(bubble, original);
    if (recorded) {
      history.discard();
      syncHistory();
    }
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    renderCanvas();
    syncInspector();
  }

  function canvasPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * state.canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * state.canvas.height
    };
  }

  function beginCanvasInteraction(event) {
    if (interaction || event.isPrimary === false) return;
    if (event.button !== undefined && event.button !== 0) return;
    const handle = event.target.closest("[data-handle]");
    const bubbleTarget = event.target.closest("[data-bubble-id]");
    if (!bubbleTarget) {
      selectBubble(null);
      return;
    }

    const id = bubbleTarget.dataset.bubbleId;
    const bubble = state.bubbles.find((item) => item.id === id);
    if (!bubble) return;
    selectBubble(id);
    const word = handle && handle.dataset.word ? handle.dataset.word : null;
    selectWord(word);

    interaction = {
      pointerId: event.pointerId,
      mode: handle ? handle.dataset.handle : "move",
      start: canvasPoint(event),
      bubble: { ...bubble },
      word,
      fontSize: layoutText(bubble).fontSize
    };
    if (interaction.mode === "word-size") {
      const boxes = wordBoxes(placeText(bubble)).filter((box) => box.key === word);
      const left = Math.min(...boxes.map((box) => box.x)), right = Math.max(...boxes.map((box) => box.x + box.width));
      const top = Math.min(...boxes.map((box) => box.y)), bottom = Math.max(...boxes.map((box) => box.y + box.height));
      interaction.centre = { x: (left + right) / 2, y: (top + bottom) / 2 };
    }
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function updateCanvasInteraction(event) {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const bubble = selectedBubble();
    if (!bubble) return;
    const point = canvasPoint(event);
    if (!interaction.recorded && (Math.abs(point.x - interaction.start.x) > 0.1 || Math.abs(point.y - interaction.start.y) > 0.1)) {
      remember();
      interaction.recorded = true;
    }

    if (interaction.mode === "move") {
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      Editor.moveBubble(bubble, interaction.bubble, dx, dy, state.canvas);
    } else if (interaction.mode === "word") {
      const original = interaction.bubble.words;
      const edit = original[interaction.word] || { x: 0, y: 0 };
      bubble.words = editWord(original, interaction.word, {
        x: edit.x + (point.x - interaction.start.x) / interaction.fontSize,
        y: edit.y + (point.y - interaction.start.y) / interaction.fontSize
      }, true);
    } else if (interaction.mode === "word-size") {
      const original = interaction.bubble.words;
      const { centre, start } = interaction;
      const ratio = Math.hypot(point.x - centre.x, point.y - centre.y) / Math.max(1, Math.hypot(start.x - centre.x, start.y - centre.y));
      bubble.words = editWord(original, interaction.word, { scale: ((original[interaction.word] || {}).scale || 1) * ratio });
    } else if (interaction.mode === "tail") {
      bubble.tailX = point.x;
      bubble.tailY = point.y;
    } else if (interaction.mode === "resize") {
      let width = Math.max(120, (point.x - interaction.bubble.x) * 2);
      let height = Math.max(90, (point.y - interaction.bubble.y) * 2);
      if (event.shiftKey) {
        const source = interaction.bubble;
        const ratio = Geometry.clamp(Math.max(width / source.width, height / source.height), Math.max(120 / source.width, 90 / source.height), Math.min(state.canvas.width * 1.4 / source.width, state.canvas.height * 1.4 / source.height));
        width = source.width * ratio; height = source.height * ratio;
      }
      bubble.width = width;
      bubble.height = height;
    }

    constrainBubble(bubble);
    renderCanvas();
    event.preventDefault();
  }

  function endCanvasInteraction(event) {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interaction = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    syncInspector();
    renderBubbleList();
  }

  function fitCanvas() {
    const availableWidth = Math.max(120, stage.clientWidth - 56);
    const availableHeight = Math.max(120, stage.clientHeight - 56);
    const scale = Math.min(
      1,
      availableWidth / state.canvas.width,
      availableHeight / state.canvas.height
    );
    canvasFrame.style.width = `${Math.max(1, state.canvas.width * scale)}px`;
    canvasFrame.style.height = `${Math.max(1, state.canvas.height * scale)}px`;
    byId("zoom-readout").textContent = `${Math.round(scale * 100)}%`;
  }

  function resizeCanvas(width, height, scaleContents, record = true) {
    const oldWidth = state.canvas.width;
    const oldHeight = state.canvas.height;
    const nextWidth = Geometry.clamp(Math.round(Number(width) || oldWidth), state.canvas.background ? 1 : 320, 8000);
    const nextHeight = Geometry.clamp(Math.round(Number(height) || oldHeight), state.canvas.background ? 1 : 240, 8000);
    if (record && (nextWidth !== oldWidth || nextHeight !== oldHeight)) remember();

    if (scaleContents) {
      const scaleX = nextWidth / oldWidth;
      const scaleY = nextHeight / oldHeight;
      const sizeScale = Math.min(scaleX, scaleY);
      state.bubbles.forEach((bubble) => {
        bubble.x *= scaleX;
        bubble.y *= scaleY;
        bubble.tailX *= scaleX;
        bubble.tailY *= scaleY;
        bubble.width *= sizeScale;
        bubble.height *= sizeScale;
        bubble.tailWidth = Geometry.clamp(bubble.tailWidth * sizeScale, 25, 180);
        bubble.tailBend = Geometry.clamp(bubble.tailBend * sizeScale, -140, 140);
        bubble.fontSize = Geometry.clamp(bubble.fontSize * sizeScale, 14, 110);
      });
    }

    state.canvas.width = nextWidth;
    state.canvas.height = nextHeight;
    state.bubbles.forEach(constrainBubble);
    syncAll();
  }

  function loadBackground(file) {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      toast("Please choose a PNG, JPEG, WebP or GIF image");
      return;
    }
    const request = ++backgroundRequest;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        if (request !== backgroundRequest) return;
        const dimensions = Editor.imageDimensions(image.naturalWidth, image.naturalHeight);
        // Freeze animated GIFs and downsample once, so preview and export match.
        const backgroundCanvas = document.createElement("canvas");
        backgroundCanvas.width = dimensions.width;
        backgroundCanvas.height = dimensions.height;
        const context = backgroundCanvas.getContext("2d");
        try {
          if (!context) throw new Error("Image canvas is unavailable");
          context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
          const dataUrl = backgroundCanvas.toDataURL("image/png");
          if (dataUrl === "data:,") throw new Error("Image is too large");
          remember();
          state.canvas.background = { dataUrl, name: file.name };
          resizeCanvas(dimensions.width, dimensions.height, true, false);
          toast(file.type === "image/gif" ? "Image added (still frame)" : "Image added");
        } catch (error) { toast("That image is too large to open in this browser"); }
      };
      image.onerror = () => { if (request === backgroundRequest) toast("That image could not be opened"); };
      image.src = reader.result;
    };
    reader.onerror = () => { if (request === backgroundRequest) toast("That image could not be read"); };
    reader.readAsDataURL(file);
  }

  // Projects are plain JSON. Anything read back is checked field by field, so
  // a damaged or hand-edited file cannot inject markup or break the editor.
  function readBackground(raw) {
    if (!raw || typeof raw.dataUrl !== "string" || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(raw.dataUrl)) return null;
    return { dataUrl: raw.dataUrl, name: typeof raw.name === "string" ? raw.name.slice(0, 200) : "Image" };
  }

  function readBubble(raw) {
    const base = createBubble();
    const number = (value, fallback, min = -Infinity, max = Infinity) => Number.isFinite(value) ? Geometry.clamp(value, min, max) : fallback;
    const colour = (value, fallback) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
    const choice = (value, options, fallback) => options.includes(value) ? value : fallback;
    const words = {};
    if (raw.words && typeof raw.words === "object") {
      Object.entries(raw.words).slice(0, 1000).forEach(([key, edit]) => {
        if (key.length > 300 || !/#\d+$/.test(key) || !edit || typeof edit !== "object") return;
        const next = { x: number(edit.x, 0, -200, 200), y: number(edit.y, 0, -200, 200), scale: number(edit.scale, 1, 0.25, 5) };
        if (next.x || next.y || next.scale !== 1) words[key] = next;
      });
    }
    return {
      ...base,
      id: typeof raw.id === "string" && raw.id && raw.id.length <= 100 ? raw.id : base.id,
      text: typeof raw.text === "string" ? raw.text.slice(0, 5000) : base.text,
      x: number(raw.x, base.x),
      y: number(raw.y, base.y),
      width: number(raw.width, base.width),
      height: number(raw.height, base.height),
      style: choice(raw.style, ["speech", "thought", "shout"], base.style),
      shape: choice(raw.shape, ["oval", "rounded"], base.shape),
      tailX: number(raw.tailX, base.tailX),
      tailY: number(raw.tailY, base.tailY),
      tailWidth: number(raw.tailWidth, base.tailWidth, 25, 180),
      tailBend: number(raw.tailBend, base.tailBend, -140, 140),
      fill: colour(raw.fill, base.fill),
      stroke: colour(raw.stroke, base.stroke),
      strokeWidth: Math.round(number(raw.strokeWidth, base.strokeWidth, 0, 24)),
      lineStyle: choice(raw.lineStyle, ["clean", "hand", "brush"], base.lineStyle),
      shadow: choice(raw.shadow, ["none", "solid", "halftone"], base.shadow),
      seed: Number.isInteger(raw.seed) && raw.seed >= 0 && raw.seed <= 2147483647 ? raw.seed : base.seed,
      opacity: number(raw.opacity, base.opacity, 10, 100),
      fontFamily: choice(raw.fontFamily, fontFamilies, base.fontFamily),
      fontSize: number(raw.fontSize, base.fontSize, 14, 110),
      textColour: colour(raw.textColour, base.textColour),
      bold: raw.bold === true,
      italic: raw.italic === true,
      autoFit: raw.autoFit !== false,
      words
    };
  }

  function readProject(data) {
    if (!data || typeof data !== "object" || data.app !== "speechbubble" || !Array.isArray(data.bubbles)) {
      throw new Error("Not a Speechbubble project");
    }
    const source = data.canvas && typeof data.canvas === "object" ? data.canvas : {};
    const background = readBackground(source.background);
    // Image canvases take the image's size, which may be below the minimum.
    const fromImage = Boolean(background) || source.hasBackground === true;
    const size = (value, min, fallback) => Number.isFinite(value) ? Geometry.clamp(Math.round(value), min, 8000) : fallback;
    const ids = new Set();
    const bubbles = data.bubbles.slice(0, 500).filter((item) => item && typeof item === "object").map((item) => {
      const bubble = readBubble(item);
      if (ids.has(bubble.id)) bubble.id = uniqueId();
      ids.add(bubble.id);
      return bubble;
    });
    return {
      canvas: {
        width: size(source.width, fromImage ? 1 : 320, 1200),
        height: size(source.height, fromImage ? 1 : 240, 800),
        background,
        backgroundMode: source.backgroundMode === "transparent" ? "transparent" : "white"
      },
      bubbles,
      selectedId: ids.has(data.selectedId) ? data.selectedId : null,
      hasBackground: source.hasBackground === true
    };
  }

  function projectData(includeBackground) {
    const background = state.canvas.background;
    return {
      app: "speechbubble",
      version: 1,
      canvas: {
        width: state.canvas.width,
        height: state.canvas.height,
        backgroundMode: state.canvas.backgroundMode,
        background: includeBackground ? background : null,
        hasBackground: Boolean(background)
      },
      bubbles: state.bubbles,
      selectedId
    };
  }

  function applyProject(project) {
    backgroundRequest += 1;
    state.canvas = project.canvas;
    state.bubbles = project.bubbles;
    state.bubbles.forEach(constrainBubble);
    selectedId = project.selectedId;
    selectedWord = null;
  }

  function storage() {
    try {
      return window.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  // The image is stored apart from the bubbles and rewritten only when it
  // changes, so dragging never re-serialises megabytes of image data.
  function autosave() {
    window.clearTimeout(saveTimer);
    saveTimer = null;
    const store = storage();
    if (!store) return;
    try {
      const background = state.canvas.background;
      const dataUrl = background ? background.dataUrl : "";
      if (dataUrl !== savedBackground) {
        savedBackground = dataUrl;
        try {
          if (background) store.setItem(backgroundKey, JSON.stringify(background));
          else store.removeItem(backgroundKey);
        } catch (error) {
          store.removeItem(backgroundKey);
          toast("This image is too large to keep after a reload. Use Save project to keep a copy.");
        }
      }
      const project = JSON.stringify(projectData(false));
      try {
        store.setItem(projectKey, project);
      } catch (error) {
        // Better to lose the stored image than to restore out-of-date bubbles.
        store.removeItem(backgroundKey);
        store.setItem(projectKey, project);
        toast("This image is too large to keep after a reload. Use Save project to keep a copy.");
      }
    } catch (error) {
      // Storage is full or blocked; editing still works without autosave.
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(autosave, 300);
  }

  function restoreAutosave() {
    const store = storage();
    if (!store) return;
    try {
      const saved = store.getItem(projectKey);
      if (!saved) return;
      const project = readProject(JSON.parse(saved));
      if (project.hasBackground) {
        project.canvas.background = readBackground(JSON.parse(store.getItem(backgroundKey) || "null"));
        if (!project.canvas.background) toast("Your bubbles are back, but the image was too large to keep. Choose it again.");
      }
      savedBackground = project.canvas.background ? project.canvas.background.dataUrl : "";
      applyProject(project);
    } catch (error) {
      // A damaged save starts a fresh canvas rather than a broken one.
    }
  }

  function saveProjectFile() {
    const blob = new Blob([JSON.stringify(projectData(true))], { type: "application/json" });
    triggerDownload(blob, "speechbubble-project.json");
    toast("Project saved");
  }

  function openProjectFile(file) {
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) {
      toast("That project file is too large");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let project;
      try {
        project = readProject(JSON.parse(reader.result));
      } catch (error) {
        toast("That file is not a Speechbubble project");
        return;
      }
      remember();
      applyProject(project);
      syncAll();
      toast("Project opened");
    };
    reader.onerror = () => toast("That project file could not be read");
    reader.readAsText(file);
  }

  function startOver() {
    remember();
    applyProject({
      canvas: { width: 1200, height: 800, background: null, backgroundMode: "white" },
      bubbles: [createBubble()],
      selectedId: null
    });
    selectedId = state.bubbles[0].id;
    syncAll();
    toast("Started over. Undo brings your work back.");
  }

  const isProjectFile = (file) => Boolean(file) && (/\.json$/i.test(file.name || "") || file.type === "application/json");

  // Exported files embed the bundled fonts they use, so a PNG made from the
  // SVG, or the SVG opened elsewhere, shows the same lettering.
  function embeddedFontCss() {
    const used = new Set(state.bubbles.map((bubble) => bubble.fontFamily));
    return (window.SpeechbubbleFonts || []).filter((face) => used.has(face.family)).map((face) =>
      `@font-face{font-family:"${face.family}";font-weight:${face.weight};font-style:${face.style};unicode-range:${face.unicodeRange};src:url(data:font/woff2;base64,${face.data}) format("woff2")}`
    ).join("");
  }

  function serialisedSvg() {
    const clone = canvas.cloneNode(true);
    clone.querySelectorAll(".selection-ui").forEach((node) => node.remove());
    const fontCss = embeddedFontCss();
    if (fontCss) {
      const style = svgElement("style");
      style.textContent = fontCss;
      const defs = svgElement("defs");
      defs.appendChild(style);
      clone.insertBefore(defs, clone.firstChild);
    }
    clone.setAttribute("xmlns", SVG_NS);
    clone.setAttribute("width", state.canvas.width);
    clone.setAttribute("height", state.canvas.height);
    return new XMLSerializer().serializeToString(clone);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportSvg() {
    const blob = new Blob([serialisedSvg()], { type: "image/svg+xml;charset=utf-8" });
    triggerDownload(blob, "speechbubble.svg");
    toast("SVG downloaded");
  }

  function exportPng() {
    const scale = Number(byId("export-scale").value) || 1;
    const outputWidth = state.canvas.width * scale;
    const outputHeight = state.canvas.height * scale;
    if (outputWidth > 16000 || outputHeight > 16000 || outputWidth * outputHeight > 100000000) {
      toast("That export is too large. Choose a smaller scale.");
      return;
    }

    const svgBlob = new Blob([serialisedSvg()], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const output = document.createElement("canvas");
      output.width = outputWidth;
      output.height = outputHeight;
      const context = output.getContext("2d");
      try {
        if (!context) throw new Error("Export canvas is unavailable");
        context.drawImage(image, 0, 0, outputWidth, outputHeight);
        output.toBlob((blob) => {
          if (!blob) {
            toast("The PNG could not be created");
            return;
          }
          triggerDownload(blob, "speechbubble.png");
          toast(`${scale}× PNG downloaded`);
        }, "image/png");
      } catch (error) { toast("The PNG could not be created. Try a smaller scale."); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast("The PNG could not be created");
    };
    image.src = url;
  }

  function bindSelected(id, eventName, property, transform = (value) => value, options = {}) {
    byId(id).addEventListener(eventName, (event) => {
      const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      patchSelected({ [property]: transform(value) }, options);
    });
  }

  bindSelected("text-input", "input", "text", String, { list: true });
  bindSelected("font-family", "change", "fontFamily");
  bindSelected("text-colour", "input", "textColour");
  bindSelected("font-bold", "change", "bold", Boolean);
  bindSelected("font-italic", "change", "italic", Boolean);
  bindSelected("auto-fit", "change", "autoFit", Boolean, { inspector: true });
  byId("font-size").addEventListener("input", (event) => {
    patchSelected({ fontSize: Number(event.target.value), autoFit: false }, { inspector: true });
  });
  bindSelected("bubble-shape", "change", "shape");
  bindSelected("stroke-width", "input", "strokeWidth", Number, { inspector: true });
  bindSelected("line-style", "change", "lineStyle", String, { inspector: true });
  bindSelected("bubble-shadow", "change", "shadow", String);
  byId("redraw-line").addEventListener("click", () => patchSelected({ seed: newSeed() }));
  bindSelected("fill-colour", "input", "fill");
  bindSelected("stroke-colour", "input", "stroke");
  bindSelected("bubble-opacity", "change", "opacity", (value) => Geometry.clamp(Number(value), 10, 100));
  bindSelected("bubble-width", "change", "width", Number, { inspector: true });
  bindSelected("bubble-height", "change", "height", Number, { inspector: true });
  bindSelected("tail-width", "input", "tailWidth", Number);
  bindSelected("tail-bend", "input", "tailBend", Number);

  byId("font-size").addEventListener("input", (event) => { byId("font-size-output").textContent = event.target.value; });
  byId("drag-words").addEventListener("change", (event) => {
    wordMode = event.target.checked;
    selectedWord = null;
    syncInspector();
    byId("workspace-hint").innerHTML = wordMode
      ? "<strong>Drag</strong> a word to place it. Drop it back near its spot to rejoin the line."
      : "<strong>Drag</strong> the bubble, blue tail point or corner handle.";
    renderCanvas();
  });
  byId("word-size").addEventListener("input", (event) => {
    const bubble = selectedBubble(), key = activeWord(bubble);
    if (!key) return;
    patchSelected({ words: editWord(bubble.words, key, { scale: Number(event.target.value) / 100 }) }, { inspector: true });
  });
  byId("reset-words").addEventListener("click", () => {
    patchSelected({ words: {} }, { inspector: true });
    toast("Words returned to their lines");
  });
  byId("tail-width").addEventListener("input", (event) => { byId("tail-width-output").textContent = event.target.value; });
  byId("tail-bend").addEventListener("input", (event) => { byId("tail-bend-output").textContent = event.target.value; });

  byId("bubble-style").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-style]");
    if (!button) return;
    patchSelected({ style: button.dataset.style }, { inspector: true, list: true });
  });

  byId("background-mode").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-background]");
    if (!button) return;
    if (state.canvas.backgroundMode === button.dataset.background) return;
    remember();
    state.canvas.backgroundMode = button.dataset.background;
    setSegmented("background-mode", "background", state.canvas.backgroundMode);
    renderCanvas();
  });

  byId("bubble-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-bubble-id]");
    if (button) selectBubble(button.dataset.bubbleId);
  });

  byId("add-bubble").addEventListener("click", addBubble);
  byId("undo").addEventListener("click", () => restoreHistory("undo"));
  byId("redo").addEventListener("click", () => restoreHistory("redo"));
  byId("duplicate-bubble").addEventListener("click", duplicateBubble);
  byId("delete-bubble").addEventListener("click", deleteBubble);
  byId("send-backward").addEventListener("click", () => moveLayer(-1));
  byId("bring-forward").addEventListener("click", () => moveLayer(1));

  canvas.addEventListener("pointerdown", beginCanvasInteraction);
  canvas.addEventListener("pointermove", updateCanvasInteraction);
  canvas.addEventListener("pointerup", endCanvasInteraction);
  canvas.addEventListener("pointercancel", endCanvasInteraction);
  canvas.addEventListener("lostpointercapture", endCanvasInteraction);

  byId("image-upload").addEventListener("change", (event) => {
    loadBackground(event.target.files[0]);
    event.target.value = "";
  });
  const imageFile = (items) => [...(items || [])].find((file) => file && /^image\//.test(file.type));
  stage.addEventListener("dragover", (event) => {
    if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  stage.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    if (!files || !files.length) return;
    event.preventDefault();
    const file = imageFile(files) || files[0];
    if (isProjectFile(file)) openProjectFile(file);
    else loadBackground(file);
  });
  document.addEventListener("paste", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return;
    const file = imageFile(event.clipboardData?.files);
    if (!file) return;
    event.preventDefault();
    loadBackground(file);
  });
  byId("remove-image").addEventListener("click", () => {
    remember();
    backgroundRequest += 1;
    state.canvas.background = null;
    syncAll();
    toast("Image removed");
  });
  byId("canvas-width").addEventListener("change", (event) => resizeCanvas(Number(event.target.value), state.canvas.height, false));
  byId("canvas-height").addEventListener("change", (event) => resizeCanvas(state.canvas.width, Number(event.target.value), false));
  byId("export-svg").addEventListener("click", () => afterFonts(exportSvg));
  byId("save-project").addEventListener("click", saveProjectFile);
  byId("project-upload").addEventListener("change", (event) => {
    openProjectFile(event.target.files[0]);
    event.target.value = "";
  });
  byId("start-over").addEventListener("click", startOver);
  window.addEventListener("pagehide", autosave);
  byId("export-png").addEventListener("click", () => afterFonts(exportPng));
  byId("insert-photopea").addEventListener("click", insertInPhotopea);

  window.addEventListener("message", (event) => {
    const transfer = photopeaTransferPending;
    if (!photopeaMode || !transfer || event.source !== window.parent || event.origin !== photopeaOrigin || typeof event.data !== "string") return;
    const prefix = transfer.token + ":";
    if (event.data === prefix + "inserted" && transfer.stage === "finishing") {
      finishPhotopeaTransfer(transfer.shadow
        ? "Bubble inserted. Its shadow isn't included: add one with Layer Style → Drop Shadow."
        : "Editable bubble inserted into Photopea");
    } else if (event.data === prefix + "shaped" && transfer.stage === "shaping") {
      transfer.stage = "shaped";
    } else if (event.data.startsWith(prefix + "error:")) {
      finishPhotopeaTransfer(event.data.slice((prefix + "error:").length));
    } else if (event.data.startsWith(prefix + "ready:") && transfer.stage === "preparing") {
      try {
        transfer.destination = JSON.parse(event.data.slice((prefix + "ready:").length));
        const destination = transfer.destination;
        if (!Number.isInteger(destination.index) || !Number.isInteger(destination.count) || destination.index < 0 || destination.index >= destination.count || typeof destination.name !== "string" || typeof destination.source !== "string") throw new Error("Invalid destination");
        transfer.stage = "prepared";
      } catch (error) { finishPhotopeaTransfer("Photopea returned an invalid response"); }
    } else if (event.data === "done") {
      if (transfer.stage === "prepared") {
        transfer.stage = "opening";
        window.parent.postMessage(window.SpeechbubblePhotopea.openScript(transfer.data.dataUrl, transfer.token), photopeaOrigin);
      } else if (transfer.stage === "opening") {
        transfer.stage = "opening-shape";
        window.parent.postMessage(window.SpeechbubblePhotopea.openScript(transfer.data.shapeUrl, transfer.token), photopeaOrigin);
      } else if (transfer.stage === "opening-shape") {
        transfer.stage = "shaping";
        window.parent.postMessage(window.SpeechbubblePhotopea.shapeScript(transfer.data, transfer.destination, transfer.token), photopeaOrigin);
      } else if (transfer.stage === "shaped") {
        transfer.stage = "finishing";
        window.parent.postMessage(window.SpeechbubblePhotopea.finishScript(transfer.data, transfer.destination, transfer.token), photopeaOrigin);
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
    if (editing || typeof event.key !== "string") return;

    if (interaction) {
      // Only Escape acts mid-drag; deleting or nudging would fight the pointer.
      if (event.key === "Escape") {
        event.preventDefault();
        cancelCanvasInteraction();
      }
      return;
    }
    if (event.key === "Escape") {
      if (activeWord(selectedBubble())) selectWord(null);
      else selectBubble(null);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      restoreHistory(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateBubble();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      // Deleting the whole bubble would surprise someone working on a word.
      if (activeWord(selectedBubble())) toast("To remove a word, edit the text");
      else deleteBubble();
      return;
    }

    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };
    if (!directions[event.key] || event.ctrlKey || event.metaKey || event.altKey) return;
    const bubble = selectedBubble();
    if (!bubble) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const [dx, dy] = directions[event.key];
    const word = activeWord(bubble);
    if (word) {
      const edit = bubble.words[word] || { x: 0, y: 0 };
      const size = layoutText(bubble).fontSize;
      remember(`nudge-word:${bubble.id}:${word}`);
      bubble.words = editWord(bubble.words, word, { x: edit.x + dx * amount / size, y: edit.y + dy * amount / size });
      renderCanvas();
      syncInspector();
      return;
    }
    remember(`nudge:${bubble.id}`);
    Editor.moveBubble(bubble, { ...bubble }, dx * amount, dy * amount, state.canvas);
    constrainBubble(bubble);
    renderCanvas();
    syncInspector();
  });

  if (document.fonts && typeof document.fonts.addEventListener === "function") {
    document.fonts.addEventListener("loadingdone", () => {
      layoutCache.clear();
      renderCanvas();
      syncInspector();
    });
  }

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(fitCanvas);
    resizeObserver.observe(stage);
  } else {
    window.addEventListener("resize", fitCanvas);
  }

  if (photopeaMode) {
    document.body.classList.add("photopea-mode");
    byId("insert-photopea").hidden = false;
  }
  // Bundled fonts arrive as data (fonts.js), so they also work offline and
  // from a downloaded copy. Text is re-measured once they are ready.
  function fontsDone() {
    fontsSettled = true;
    fontWaiters.splice(0).forEach((action) => action());
  }

  // An export using a bundled font waits until the font data has arrived and
  // the text has been re-measured with it, so the file embeds the right font.
  function afterFonts(action) {
    if (fontsSettled || !state.bubbles.some((bubble) => bundledFamilies.includes(bubble.fontFamily))) {
      action();
      return;
    }
    toast("Loading fonts…");
    if (!fontWaiters.includes(action)) fontWaiters.push(action);
  }

  function registerFonts() {
    const faces = window.SpeechbubbleFonts;
    if (!Array.isArray(faces) || typeof window.FontFace !== "function" || !document.fonts) {
      fontsDone();
      return;
    }
    Promise.all(faces.map((face) => {
      const font = new window.FontFace(face.family, `url(data:font/woff2;base64,${face.data})`, {
        weight: face.weight, style: face.style, unicodeRange: face.unicodeRange
      });
      document.fonts.add(font);
      return font.load().catch(() => null);
    })).then(() => {
      layoutCache.clear();
      renderCanvas();
      syncInspector();
      fontsDone();
    });
  }

  function loadFonts() {
    if (window.SpeechbubbleFonts) {
      registerFonts();
      return;
    }
    const script = document.createElement("script");
    script.src = `fonts.js${assetQuery}`;
    script.onload = registerFonts;
    // Without the data, exports fall back to the browser's fonts.
    script.onerror = fontsDone;
    document.head.appendChild(script);
  }

  restoreAutosave();
  syncAll();
  loadFonts();
}());

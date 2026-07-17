(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const Geometry = window.BubbleGeometry;
  const byId = (id) => document.getElementById(id);
  const canvas = byId("canvas");
  const canvasFrame = byId("canvas-frame");
  const stage = byId("stage");
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");

  let nextId = 1;
  let selectedId = null;
  let interaction = null;
  let toastTimer = null;
  let photopeaTransferPending = false;

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
      opacity: 100,
      fontFamily: "Arial",
      fontSize: 42,
      textColour: "#171717",
      bold: false,
      italic: false,
      autoFit: true,
      ...overrides
    };
  }

  state.bubbles.push(createBubble());
  selectedId = state.bubbles[0].id;

  function selectedBubble() {
    return state.bubbles.find((bubble) => bubble.id === selectedId) || null;
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
    if (last && styleKey(last) === styleKey(style)) {
      last.text += text;
      last.width += width;
    } else {
      line.spans.push({ ...style, text, width });
    }
    line.width += width;
  }

  function wrapText(bubble, fontSize, maxWidth) {
    const lines = [{ spans: [], width: 0 }];
    let pendingSpace = null;

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
        appendSpan(currentLine(), character, style, fontSize, bubble.fontFamily);
      }
    }

    parseInlineText(bubble.text, bubble).forEach((part) => {
      const tokens = part.text.match(/\n|[^\S\n]+|[^\s\n]+/g) || [];
      tokens.forEach((token) => {
        if (token === "\n") {
          newLine();
          return;
        }
        if (/^\s+$/.test(token)) {
          pendingSpace = { text: " ", style: part };
          return;
        }

        const line = currentLine();
        const wordWidth = measureText(token, part, fontSize, bubble.fontFamily);
        const spaceWidth = line.spans.length && pendingSpace
          ? measureText(" ", pendingSpace.style, fontSize, bubble.fontFamily)
          : 0;

        if (line.spans.length && line.width + spaceWidth + wordWidth > maxWidth) newLine();
        if (pendingSpace && currentLine().spans.length) {
          appendSpan(currentLine(), " ", pendingSpace.style, fontSize, bubble.fontFamily);
        }
        pendingSpace = null;

        if (wordWidth > maxWidth) addLongWord(token, part);
        else appendSpan(currentLine(), token, part, fontSize, bubble.fontFamily);
      });
    });

    return lines.length ? lines : [{ spans: [], width: 0 }];
  }

  function layoutText(bubble) {
    const bounds = Geometry.textBounds(bubble);
    const lineHeightRatio = 1.14;
    const minimum = 14;
    const requestedSize = Geometry.clamp(Number(bubble.fontSize) || 42, minimum, 110);

    if (!bubble.autoFit) {
      return {
        lines: wrapText(bubble, requestedSize, bounds.width),
        fontSize: requestedSize,
        lineHeight: requestedSize * lineHeightRatio
      };
    }

    let chosen = minimum;
    let lines = wrapText(bubble, chosen, bounds.width);

    for (let size = 110; size >= minimum; size -= 1) {
      const candidate = wrapText(bubble, size, bounds.width);
      if (candidate.length * size * lineHeightRatio <= bounds.height) {
        chosen = size;
        lines = candidate;
        break;
      }
    }

    return { lines, fontSize: chosen, lineHeight: chosen * lineHeightRatio };
  }

  function renderBubbleText(group, bubble) {
    const layout = layoutText(bubble);
    const totalHeight = (layout.lines.length - 1) * layout.lineHeight;
    const startY = bubble.y - totalHeight / 2;
    const textGroup = svgElement("g", { "pointer-events": "none", "aria-hidden": "true" });

    layout.lines.forEach((line, index) => {
      const text = svgElement("text", {
        x: bubble.x - line.width / 2,
        y: startY + index * layout.lineHeight,
        "dominant-baseline": "middle",
        "font-family": bubble.fontFamily,
        "font-size": layout.fontSize
      });
      line.spans.forEach((span) => {
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
    const padding = Math.max(8, bubble.strokeWidth / 2 + 5) + bendPadding;
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

    const layout = layoutText(bubble);
    const totalHeight = (layout.lines.length - 1) * layout.lineHeight;
    const startY = bubble.y - totalHeight / 2;
    layout.lines.forEach((line, index) => {
      const lineY = startY + index * layout.lineHeight;
      left = Math.min(left, bubble.x - line.width / 2 - 2);
      right = Math.max(right, bubble.x + line.width / 2 + 2);
      top = Math.min(top, lineY - layout.fontSize * 0.7);
      bottom = Math.max(bottom, lineY + layout.fontSize * 0.7);
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

  function serialisedSelectedBubble() {
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
    output.appendChild(sourceGroup.cloneNode(true));
    return new XMLSerializer().serializeToString(output);
  }

  function svgDataUrl(svg) {
    const bytes = new TextEncoder().encode(svg);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return `data:image/svg+xml;base64,${window.btoa(binary)}`;
  }

  function insertInPhotopea() {
    const svg = serialisedSelectedBubble();
    if (!svg) {
      toast("Select a bubble first");
      return;
    }
    if (window.parent === window) {
      toast("Open Speechbubble from Photopea's Plugins panel first");
      return;
    }

    const bubble = selectedBubble();
    const layerName = cleanLayerName(bubble.text).slice(0, 80) || "Speechbubble";
    const script = [
      "try {",
      `app.open(${JSON.stringify(svgDataUrl(svg))}, null, true);`,
      `if (app.activeDocument && app.activeDocument.activeLayer) app.activeDocument.activeLayer.name = ${JSON.stringify(layerName)};`,
      "app.echoToOE('speechbubble:inserted');",
      "} catch (error) {",
      "app.echoToOE('speechbubble:error:' + error.toString());",
      "}"
    ].join("\n");

    photopeaTransferPending = true;
    byId("insert-photopea").disabled = true;
    byId("insert-photopea").textContent = "Inserting…";
    window.parent.postMessage(script, "*");
  }

  function finishPhotopeaTransfer(message) {
    photopeaTransferPending = false;
    byId("insert-photopea").disabled = false;
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

    state.bubbles.forEach((bubble) => {
      const group = svgElement("g", {
        class: "bubble-layer",
        "data-bubble-id": bubble.id
      });
      const path = svgElement("path", {
        class: "bubble-body",
        "data-bubble-id": bubble.id,
        d: Geometry.bodyPath(bubble),
        fill: bubble.fill,
        stroke: bubble.stroke,
        "stroke-width": bubble.strokeWidth,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        opacity: bubble.opacity / 100
      });
      group.appendChild(path);

      if (bubble.style === "thought") {
        Geometry.thoughtDots(bubble).forEach((dot) => {
          group.appendChild(svgElement("circle", {
            cx: dot.x,
            cy: dot.y,
            r: dot.radius,
            fill: bubble.fill,
            stroke: bubble.stroke,
            "stroke-width": bubble.strokeWidth,
            opacity: bubble.opacity / 100
          }));
        });
      }
      renderBubbleText(group, bubble);
      canvas.appendChild(group);
    });

    const selected = selectedBubble();
    if (selected) renderSelection(selected);
  }

  function cleanLayerName(text) {
    const cleaned = text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
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
    if (!bubble) return;

    byId("text-input").value = bubble.text;
    byId("font-family").value = bubble.fontFamily;
    byId("text-colour").value = bubble.textColour;
    byId("font-bold").checked = bubble.bold;
    byId("font-italic").checked = bubble.italic;
    byId("auto-fit").checked = bubble.autoFit;
    const effectiveFontSize = layoutText(bubble).fontSize;
    byId("font-size").value = bubble.autoFit ? effectiveFontSize : bubble.fontSize;
    byId("font-size").disabled = false;
    byId("font-size-output").textContent = bubble.autoFit
      ? `${effectiveFontSize} auto`
      : bubble.fontSize;

    setSegmented("bubble-style", "style", bubble.style);
    byId("bubble-shape").value = bubble.shape;
    byId("stroke-width").value = String(bubble.strokeWidth);
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
    byId("stroke-width-field").classList.toggle("span-two", bubble.style !== "speech");
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
    Object.assign(bubble, patch);
    constrainBubble(bubble);
    renderCanvas();
    if (options.list) renderBubbleList();
    if (options.inspector) syncInspector();
  }

  function addBubble() {
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
    state.bubbles.splice(index, 1);
    selectedId = state.bubbles[Math.min(index, state.bubbles.length - 1)]?.id || null;
    syncAll();
    toast("Bubble removed");
  }

  function moveLayer(direction) {
    const index = state.bubbles.findIndex((bubble) => bubble.id === selectedId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.bubbles.length) return;
    [state.bubbles[index], state.bubbles[target]] = [state.bubbles[target], state.bubbles[index]];
    syncAll();
  }

  function canvasPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * state.canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * state.canvas.height
    };
  }

  function beginCanvasInteraction(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const handle = event.target.closest("[data-handle]");
    const bubbleTarget = event.target.closest("[data-bubble-id]");
    if (!bubbleTarget) return;

    const id = bubbleTarget.dataset.bubbleId;
    const bubble = state.bubbles.find((item) => item.id === id);
    if (!bubble) return;
    if (selectedId !== id) {
      selectedId = id;
      renderBubbleList();
      syncInspector();
      renderCanvas();
    }

    interaction = {
      pointerId: event.pointerId,
      mode: handle ? handle.dataset.handle : "move",
      start: canvasPoint(event),
      bubble: { ...bubble }
    };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function updateCanvasInteraction(event) {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const bubble = selectedBubble();
    if (!bubble) return;
    const point = canvasPoint(event);

    if (interaction.mode === "move") {
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      bubble.x = interaction.bubble.x + dx;
      bubble.y = interaction.bubble.y + dy;
      bubble.tailX = interaction.bubble.tailX + dx;
      bubble.tailY = interaction.bubble.tailY + dy;
    } else if (interaction.mode === "tail") {
      bubble.tailX = point.x;
      bubble.tailY = point.y;
    } else if (interaction.mode === "resize") {
      const width = Math.max(120, Math.abs(point.x - bubble.x) * 2);
      let height = Math.max(90, Math.abs(point.y - bubble.y) * 2);
      if (event.shiftKey) height = width / (interaction.bubble.width / interaction.bubble.height);
      bubble.width = width;
      bubble.height = height;
    }

    constrainBubble(bubble);
    renderCanvas();
    event.preventDefault();
  }

  function endCanvasInteraction(event) {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    interaction = null;
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

  function resizeCanvas(width, height, scaleContents) {
    const oldWidth = state.canvas.width;
    const oldHeight = state.canvas.height;
    const nextWidth = Geometry.clamp(Math.round(width), 320, 8000);
    const nextHeight = Geometry.clamp(Math.round(height), 240, 8000);

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
        bubble.tailWidth *= sizeScale;
        bubble.tailBend *= sizeScale;
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
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        state.canvas.background = {
          dataUrl: reader.result,
          name: file.name
        };
        resizeCanvas(image.naturalWidth, image.naturalHeight, true);
        toast("Image added");
      };
      image.onerror = () => toast("That image could not be opened");
      image.src = reader.result;
    };
    reader.onerror = () => toast("That image could not be read");
    reader.readAsDataURL(file);
  }

  function serialisedSvg() {
    const clone = canvas.cloneNode(true);
    clone.querySelectorAll(".selection-ui").forEach((node) => node.remove());
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
      context.drawImage(image, 0, 0, outputWidth, outputHeight);
      URL.revokeObjectURL(url);
      output.toBlob((blob) => {
        if (!blob) {
          toast("The PNG could not be created");
          return;
        }
        triggerDownload(blob, "speechbubble.png");
        toast(`${scale}× PNG downloaded`);
      }, "image/png");
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
  bindSelected("stroke-width", "change", "strokeWidth", Number);
  bindSelected("fill-colour", "input", "fill");
  bindSelected("stroke-colour", "input", "stroke");
  bindSelected("bubble-opacity", "change", "opacity", (value) => Geometry.clamp(Number(value), 10, 100));
  bindSelected("bubble-width", "change", "width", Number, { inspector: true });
  bindSelected("bubble-height", "change", "height", Number, { inspector: true });
  bindSelected("tail-width", "input", "tailWidth", Number);
  bindSelected("tail-bend", "input", "tailBend", Number);

  byId("font-size").addEventListener("input", (event) => { byId("font-size-output").textContent = event.target.value; });
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
    state.canvas.backgroundMode = button.dataset.background;
    setSegmented("background-mode", "background", state.canvas.backgroundMode);
    renderCanvas();
  });

  byId("bubble-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-bubble-id]");
    if (!button) return;
    selectedId = button.dataset.bubbleId;
    renderBubbleList();
    syncInspector();
    renderCanvas();
  });

  byId("add-bubble").addEventListener("click", addBubble);
  byId("duplicate-bubble").addEventListener("click", duplicateBubble);
  byId("delete-bubble").addEventListener("click", deleteBubble);
  byId("send-backward").addEventListener("click", () => moveLayer(-1));
  byId("bring-forward").addEventListener("click", () => moveLayer(1));

  canvas.addEventListener("pointerdown", beginCanvasInteraction);
  canvas.addEventListener("pointermove", updateCanvasInteraction);
  canvas.addEventListener("pointerup", endCanvasInteraction);
  canvas.addEventListener("pointercancel", endCanvasInteraction);

  byId("image-upload").addEventListener("change", (event) => {
    loadBackground(event.target.files[0]);
    event.target.value = "";
  });
  byId("remove-image").addEventListener("click", () => {
    state.canvas.background = null;
    syncAll();
    toast("Image removed");
  });
  byId("canvas-width").addEventListener("change", (event) => resizeCanvas(Number(event.target.value), state.canvas.height, false));
  byId("canvas-height").addEventListener("change", (event) => resizeCanvas(state.canvas.width, Number(event.target.value), false));
  byId("export-svg").addEventListener("click", exportSvg);
  byId("export-png").addEventListener("click", exportPng);
  byId("insert-photopea").addEventListener("click", insertInPhotopea);

  window.addEventListener("message", (event) => {
    if (!photopeaMode || event.source !== window.parent || typeof event.data !== "string") return;
    if (event.data === "speechbubble:inserted") {
      finishPhotopeaTransfer("Bubble inserted into Photopea");
    } else if (event.data.startsWith("speechbubble:error:")) {
      finishPhotopeaTransfer("Photopea could not insert that bubble");
    } else if (event.data === "done" && photopeaTransferPending) {
      window.setTimeout(() => {
        if (photopeaTransferPending) finishPhotopeaTransfer("Bubble sent to Photopea");
      }, 350);
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (editing) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateBubble();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteBubble();
      return;
    }

    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };
    if (!directions[event.key]) return;
    const bubble = selectedBubble();
    if (!bubble) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const [dx, dy] = directions[event.key];
    bubble.x += dx * amount;
    bubble.y += dy * amount;
    bubble.tailX += dx * amount;
    bubble.tailY += dy * amount;
    constrainBubble(bubble);
    renderCanvas();
    syncInspector();
  });

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
  syncAll();
}());

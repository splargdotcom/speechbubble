(function () {
  "use strict";
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function imageDimensions(width, height, maximum = 8000) {
    const scale = Math.min(1, maximum / width, maximum / height);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  function moveBubble(bubble, source, dx, dy, canvas) {
    const left = Math.min(source.x - source.width / 2, source.style === "shout" ? Infinity : source.tailX);
    const right = Math.max(source.x + source.width / 2, source.style === "shout" ? -Infinity : source.tailX);
    const top = Math.min(source.y - source.height / 2, source.style === "shout" ? Infinity : source.tailY);
    const bottom = Math.max(source.y + source.height / 2, source.style === "shout" ? -Infinity : source.tailY);
    // Move the body and tail by the same actual distance at the canvas edge.
    const x = clamp(dx, Math.min(0, -left), Math.max(0, canvas.width - right));
    const y = clamp(dy, Math.min(0, -top), Math.max(0, canvas.height - bottom));
    bubble.x = source.x + x; bubble.y = source.y + y;
    bubble.tailX = source.tailX + x; bubble.tailY = source.tailY + y;
  }

  function snapshot(state, selectedId) {
    // Background data URLs are immutable strings: snapshots share their bytes.
    return { canvas: { ...state.canvas }, bubbles: state.bubbles.map((bubble) => ({ ...bubble })), selectedId };
  }

  function createHistory(limit = 60) {
    const undo = [], redo = [];
    let lastKey = null, lastTime = 0;
    return {
      record(value, key = null, now = Date.now()) {
        if (!key || key !== lastKey || now - lastTime > 650) {
          undo.push(value);
          if (undo.length > limit) undo.shift();
        }
        lastKey = key; lastTime = now; redo.length = 0;
      },
      undo(current) { lastKey = null; if (!undo.length) return null; redo.push(current); return undo.pop(); },
      redo(current) { lastKey = null; if (!redo.length) return null; undo.push(current); return redo.pop(); },
      get canUndo() { return undo.length > 0; },
      get canRedo() { return redo.length > 0; }
    };
  }

  window.SpeechbubbleState = { createHistory, snapshot, moveBubble, imageDimensions };
}());

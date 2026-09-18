(function () {
  "use strict";

  // Convert the absolute SVG commands emitted by geometry.js to cubic knots.
  // Each knot holds incoming handle, anchor and outgoing handle coordinates.
  function knots(path) {
    const tokens = path.match(/[A-Za-z]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi);
    const result = [];
    let index = 0;
    const number = () => Number(tokens[index++]);
    const add = (x, y, c1, c2) => {
      const previous = result[result.length - 1];
      if (previous && c1) { previous[4] = c1[0]; previous[5] = c1[1]; }
      result.push([...(c2 || [x, y]), x, y, x, y]);
    };
    while (index < tokens.length) {
      const command = tokens[index++];
      const previous = result[result.length - 1];
      const x = previous ? previous[2] : 0, y = previous ? previous[3] : 0;
      if (command === "M" || command === "L") add(number(), number());
      else if (command === "H") add(number(), y);
      else if (command === "V") add(x, number());
      else if (command === "Q") {
        const cx = number(), cy = number(), ex = number(), ey = number();
        add(ex, ey, [x + (cx - x) * 2 / 3, y + (cy - y) * 2 / 3], [ex + (cx - ex) * 2 / 3, ey + (cy - ey) * 2 / 3]);
      } else if (command === "A") {
        let rx = number(), ry = number();
        const rotation = number(), large = number(), sweep = number(), ex = number(), ey = number();
        if (rotation !== 0) throw new Error("Unsupported rotated bubble arc");
        const dx = (x - ex) / 2, dy = (y - ey) / 2;
        const scale = Math.max(1, Math.hypot(dx / rx, dy / ry));
        rx *= scale; ry *= scale;
        const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0,
          (rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx) /
          (rx * rx * dy * dy + ry * ry * dx * dx)));
        const cx = (x + ex) / 2 + factor * rx * dy / ry;
        const cy = (y + ey) / 2 - factor * ry * dx / rx;
        let angle = Math.atan2((y - cy) / ry, (x - cx) / rx);
        let delta = Math.atan2((ey - cy) / ry, (ex - cx) / rx) - angle;
        if (sweep && delta < 0) delta += Math.PI * 2;
        if (!sweep && delta > 0) delta -= Math.PI * 2;
        const count = Math.ceil(Math.abs(delta) / (Math.PI / 2));
        const step = delta / count, k = 4 / 3 * Math.tan(step / 4);
        for (let segment = 0; segment < count; segment++) {
          const end = angle + step;
          add(segment === count - 1 ? ex : cx + rx * Math.cos(end), segment === count - 1 ? ey : cy + ry * Math.sin(end),
            [cx + rx * (Math.cos(angle) - k * Math.sin(angle)), cy + ry * (Math.sin(angle) + k * Math.cos(angle))],
            [cx + rx * (Math.cos(end) + k * Math.sin(end)), cy + ry * (Math.sin(end) - k * Math.cos(end))]);
          angle = end;
        }
      } else if (command === "Z") {
        const first = result[0], last = result[result.length - 1];
        if (result.length > 1 && Math.hypot(first[2] - last[2], first[3] - last[3]) < 1e-8) {
          first[0] = last[0]; first[1] = last[1]; result.pop();
        }
      } else throw new Error(`Unsupported bubble path command: ${command}`);
    }
    return result;
  }

  class Bytes {
    constructor() { this.data = []; }
    byte(n) { this.data.push(n & 255); return this; }
    u16(n) { return this.byte(n >>> 8).byte(n); }
    u32(n) { return this.u16(n >>> 16).u16(n); }
    raw(bytes) { for (const byte of bytes) this.byte(byte); return this; }
    zero(n) { for (let i = 0; i < n; i++) this.byte(0); return this; }
    text(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); return this; }
    key(s) { return this.u32(0).text(s); }
    double(n) { const buffer = new ArrayBuffer(8); new DataView(buffer).setFloat64(0, n); return this.raw(new Uint8Array(buffer)); }
    tag(key, bytes) { return this.text("8BIM").text(key).u32(bytes.length).raw(bytes).zero(bytes.length % 2); }
    get length() { return this.data.length; }
  }

  // A small RGB PSD with one solid-colour vector layer. Explicit Combine
  // operations on each closed subpath make separate Photopea Unite components;
  // SVG compound paths alone are imported as one selectable component.
  function psd(paths, bounds, fill) {
    const { x, y, width, height } = bounds;
    const vector = new Bytes().u32(3).u32(0).u16(6).zero(24).u16(8).u16(0).zero(22);
    for (const path of paths) {
      const points = knots(path);
      vector.u16(0).u16(points.length).u16(1).u16(2).zero(18);
      for (const point of points) {
        vector.u16(2);
        for (let i = 0; i < 6; i += 2) {
          vector.u32(Math.round((point[i + 1] - y) / height * 0x1000000));
          vector.u32(Math.round((point[i] - x) / width * 0x1000000));
        }
      }
    }
    const colour = new Bytes().u32(16).u32(0).key("null").u32(1).key("Clr ").text("Objc")
      .u32(0).key("RGBC").u32(3);
    ["Rd  ", "Grn ", "Bl  "].forEach((key, i) => colour.key(key).text("doub").double(parseInt(fill.slice(1 + i * 2, 3 + i * 2), 16)));
    const name = "bubble-shape";
    const extra = new Bytes().u32(0).u32(0).byte(name.length).text(name).zero((4 - (name.length + 1) % 4) % 4)
      .tag("SoCo", colour.data).tag("vmsk", vector.data);
    const layer = new Bytes().zero(16).u16(4);
    [-1, 0, 1, 2].forEach(id => layer.u16(id).u32(2));
    layer.text("8BIMnorm").byte(255).byte(0).byte(8).byte(0).u32(extra.length).raw(extra.data);
    const info = new Bytes().u16(1).raw(layer.data).zero(8);
    const masks = new Bytes().u32(info.length).raw(info.data).u32(0);
    const output = new Bytes().text("8BPS").u16(1).zero(6).u16(3).u32(height).u32(width).u16(8).u16(3)
      .u32(0).u32(0).u32(masks.length).raw(masks.data).u16(1);
    // Valid PackBits composite preview. Photopea renders the vector layer.
    const row = new Bytes();
    for (let left = width; left > 0; left -= 128) {
      const count = Math.min(left, 128);
      row.byte(count === 1 ? 0 : 257 - count).byte(255);
    }
    for (let i = 0; i < height * 3; i++) output.u16(row.length);
    for (let i = 0; i < height * 3; i++) output.raw(row.data);
    return Uint8Array.from(output.data);
  }

  window.SpeechbubbleShape = { psd, knots };
}());

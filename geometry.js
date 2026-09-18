(function () {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;

  const pointOnEllipse = (cx, cy, rx, ry, angle, scale = 1) => ({
    x: cx + Math.cos(angle) * rx * scale,
    y: cy + Math.sin(angle) * ry * scale
  });

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function ellipseBody(bubble) {
    const rx = bubble.width / 2, ry = bubble.height / 2;
    return `M ${bubble.x + rx} ${bubble.y} A ${rx} ${ry} 0 1 1 ${bubble.x - rx} ${bubble.y} A ${rx} ${ry} 0 1 1 ${bubble.x + rx} ${bubble.y} Z`;
  }

  function roundedBody(bubble) {
    const x = bubble.x - bubble.width / 2, y = bubble.y - bubble.height / 2;
    const w = bubble.width, h = bubble.height;
    const r = clamp(Math.min(w, h) * 0.14, 18, 64);
    return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }

  function tailIsInside(bubble) {
    const dx = Math.abs(bubble.tailX - bubble.x), dy = Math.abs(bubble.tailY - bubble.y);
    const rx = bubble.width / 2, ry = bubble.height / 2;
    if (bubble.shape !== "rounded") return (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;
    const r = clamp(Math.min(bubble.width, bubble.height) * 0.14, 18, 64);
    if (dx > rx || dy > ry) return false;
    return Math.max(0, dx - rx + r) ** 2 + Math.max(0, dy - ry + r) ** 2 <= r * r;
  }

  function tailControls(baseA, tip, baseB, bend) {
    const angle = Math.atan2(tip.y - (baseA.y + baseB.y) / 2, tip.x - (baseA.x + baseB.x) / 2);
    const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
    return {
      a: {
        x: lerp(baseA.x, tip.x, 0.55) + normal.x * bend,
        y: lerp(baseA.y, tip.y, 0.55) + normal.y * bend
      },
      b: {
        x: lerp(tip.x, baseB.x, 0.45) + normal.x * bend,
        y: lerp(tip.y, baseB.y, 0.45) + normal.y * bend
      }
    };
  }

  function ovalTail(bubble) {
    const rx = bubble.width / 2;
    const ry = bubble.height / 2;
    const tip = { x: bubble.tailX, y: bubble.tailY };
    const theta = Math.atan2((tip.y - bubble.y) / ry, (tip.x - bubble.x) / rx);
    const delta = clamp(bubble.tailWidth / Math.max(80, Math.min(rx, ry) * 2), 0.08, 0.48);
    const baseA = pointOnEllipse(bubble.x, bubble.y, rx, ry, theta - delta);
    const baseB = pointOnEllipse(bubble.x, bubble.y, rx, ry, theta + delta);
    return { baseA, baseB, tip, controls: tailControls(baseA, tip, baseB, bubble.tailBend) };
  }

  function ovalSpeechPath(bubble) {
    if (tailIsInside(bubble)) return ellipseBody(bubble);
    const rx = bubble.width / 2, ry = bubble.height / 2;
    const { baseA, baseB, tip, controls } = ovalTail(bubble);

    return [
      `M ${baseA.x} ${baseA.y}`,
      `Q ${controls.a.x} ${controls.a.y} ${tip.x} ${tip.y}`,
      `Q ${controls.b.x} ${controls.b.y} ${baseB.x} ${baseB.y}`,
      `A ${rx} ${ry} 0 1 1 ${baseA.x} ${baseA.y}`,
      "Z"
    ].join(" ");
  }

  function roundedRectPoints(bubble) {
    const halfW = bubble.width / 2;
    const halfH = bubble.height / 2;
    const radius = clamp(Math.min(bubble.width, bubble.height) * 0.14, 18, 64);
    const corners = [
      { x: bubble.x + halfW - radius, y: bubble.y - halfH + radius, start: -Math.PI / 2 },
      { x: bubble.x + halfW - radius, y: bubble.y + halfH - radius, start: 0 },
      { x: bubble.x - halfW + radius, y: bubble.y + halfH - radius, start: Math.PI / 2 },
      { x: bubble.x - halfW + radius, y: bubble.y - halfH + radius, start: Math.PI }
    ];
    const points = [];
    const steps = 10;

    corners.forEach((corner) => {
      for (let i = 0; i <= steps; i += 1) {
        const angle = corner.start + (i / steps) * (Math.PI / 2);
        points.push({
          x: corner.x + Math.cos(angle) * radius,
          y: corner.y + Math.sin(angle) * radius
        });
      }
    });
    // Include straight edges, so tails attach to the middle of a side too.
    const sampled = [];
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      const steps = Math.max(1, Math.ceil(distance(point, next) / 8));
      for (let step = 0; step < steps; step += 1) {
        sampled.push({ x: lerp(point.x, next.x, step / steps), y: lerp(point.y, next.y, step / steps) });
      }
    });
    return sampled;
  }

  function roundedTail(bubble) {
    const points = roundedRectPoints(bubble);
    const tip = { x: bubble.tailX, y: bubble.tailY };
    let closestLength = 0;
    let closestDistance = Infinity;
    let length = 0;
    const lengths = [];

    points.forEach((point, index) => {
      lengths.push(length);
      const next = points[(index + 1) % points.length];
      const segment = distance(point, next);
      const t = segment ? clamp(((tip.x - point.x) * (next.x - point.x) + (tip.y - point.y) * (next.y - point.y)) / (segment * segment), 0, 1) : 0;
      const projected = { x: lerp(point.x, next.x, t), y: lerp(point.y, next.y, t) };
      const current = distance(projected, tip);
      if (current < closestDistance) {
        closestDistance = current;
        closestLength = length + t * segment;
      }
      length += segment;
    });

    const halfSpan = clamp(bubble.tailWidth / 2, 4, length / 5);
    const at = (s) => {
      const value = (s + length) % length;
      let index = lengths.findIndex((start, i) => value >= start && value < (lengths[i + 1] ?? length));
      if (index < 0) index = points.length - 1;
      const next = points[(index + 1) % points.length];
      const t = (value - lengths[index]) / distance(points[index], next);
      return { x: lerp(points[index].x, next.x, t), y: lerp(points[index].y, next.y, t) };
    };
    const start = (closestLength + halfSpan) % length;
    const travel = length - halfSpan * 2;
    const remainder = points.map((point, i) => ({ point, offset: (lengths[i] - start + length) % length }))
      .filter((item) => item.offset > 0 && item.offset < travel)
      .sort((a, b) => a.offset - b.offset).map((item) => item.point);
    const baseA = at(closestLength - halfSpan), baseB = at(closestLength + halfSpan);
    const controls = tailControls(baseA, tip, baseB, bubble.tailBend);
    return { baseA, baseB, tip, controls, remainder };
  }

  function roundedSpeechPath(bubble) {
    if (tailIsInside(bubble)) return roundedBody(bubble);
    const { baseA, baseB, tip, controls, remainder } = roundedTail(bubble);
    const commands = [
      `M ${baseA.x} ${baseA.y}`,
      `Q ${controls.a.x} ${controls.a.y} ${tip.x} ${tip.y}`,
      `Q ${controls.b.x} ${controls.b.y} ${baseB.x} ${baseB.y}`
    ];

    remainder.forEach((point) => commands.push(`L ${point.x} ${point.y}`));
    commands.push(`L ${baseA.x} ${baseA.y} Z`);
    return commands.join(" ");
  }

  function cloudPath(bubble) {
    const lobes = clamp(Math.round((bubble.width + bubble.height) / 58), 11, 18);
    const rx = bubble.width / 2;
    const ry = bubble.height / 2;
    const baseScale = 0.88;
    const first = pointOnEllipse(bubble.x, bubble.y, rx, ry, 0, baseScale);
    const commands = [`M ${first.x} ${first.y}`];

    for (let i = 0; i < lobes; i += 1) {
      const endAngle = ((i + 1) / lobes) * Math.PI * 2;
      const midAngle = ((i + 0.5) / lobes) * Math.PI * 2;
      const end = pointOnEllipse(bubble.x, bubble.y, rx, ry, endAngle, baseScale);
      const control = pointOnEllipse(bubble.x, bubble.y, rx, ry, midAngle, 1.12);
      commands.push(`Q ${control.x} ${control.y} ${end.x} ${end.y}`);
    }
    commands.push("Z");
    return commands.join(" ");
  }

  function thoughtDots(bubble) {
    const tip = { x: bubble.tailX, y: bubble.tailY };
    const angle = Math.atan2((tip.y - bubble.y) / bubble.height, (tip.x - bubble.x) / bubble.width);
    const edge = pointOnEllipse(bubble.x, bubble.y, bubble.width / 2, bubble.height / 2, angle, 0.98);
    const minSize = Math.min(bubble.width, bubble.height);
    const fractions = [0.3, 0.58, 0.83];
    const radii = [0.052, 0.037, 0.024];

    return fractions.map((fraction, index) => ({
      x: lerp(edge.x, tip.x, fraction),
      y: lerp(edge.y, tip.y, fraction),
      radius: clamp(minSize * radii[index], 5, 20)
    }));
  }

  function burstPath(bubble) {
    const spikes = clamp(Math.round((bubble.width + bubble.height) / 38), 20, 34);
    const rx = bubble.width / 2;
    const ry = bubble.height / 2;
    const points = [];

    for (let i = 0; i < spikes * 2; i += 1) {
      const angle = -Math.PI / 2 + (i / (spikes * 2)) * Math.PI * 2;
      const scale = i % 2 === 0 ? 1 : 0.79;
      points.push(pointOnEllipse(bubble.x, bubble.y, rx, ry, angle, scale));
    }

    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ") + " Z";
  }

  function bodyPath(bubble) {
    if (bubble.style === "thought") return cloudPath(bubble);
    if (bubble.style === "shout") return burstPath(bubble);
    return bubble.shape === "rounded" ? roundedSpeechPath(bubble) : ovalSpeechPath(bubble);
  }

  // Closed, consistently wound body/tail contours for vector editing.
  function editablePath(bubble) {
    if (bubble.style !== "speech") {
      const dots = bubble.style === "thought" ? thoughtDots(bubble).map((dot) => ellipseBody({ x: dot.x, y: dot.y, width: dot.radius * 2, height: dot.radius * 2 })) : [];
      return [bodyPath(bubble), ...dots].join(" ");
    }
    const body = bubble.shape === "rounded" ? roundedBody(bubble) : ellipseBody(bubble);
    if (tailIsInside(bubble)) return body;
    const { baseA, baseB, tip, controls } = bubble.shape === "rounded" ? roundedTail(bubble) : ovalTail(bubble);
    return `${body} M ${baseA.x} ${baseA.y} Q ${controls.a.x} ${controls.a.y} ${tip.x} ${tip.y} Q ${controls.b.x} ${controls.b.y} ${baseB.x} ${baseB.y} L ${bubble.x} ${bubble.y} Z`;
  }

  function textBounds(bubble) {
    if (bubble.style === "thought") {
      return { width: bubble.width * 0.68, height: bubble.height * 0.56 };
    }
    if (bubble.style === "shout") {
      return { width: bubble.width * 0.62, height: bubble.height * 0.52 };
    }
    return {
      width: bubble.width * (bubble.shape === "rounded" ? 0.76 : 0.7),
      height: bubble.height * 0.58
    };
  }

  window.BubbleGeometry = {
    bodyPath,
    editablePath,
    editablePaths: (bubble) => editablePath(bubble).split(/(?=M )/).map((part) => part.trim()).filter(Boolean),
    clamp,
    textBounds,
    thoughtDots
  };
}());

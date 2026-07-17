(function () {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;

  const pointOnEllipse = (cx, cy, rx, ry, angle, scale = 1) => ({
    x: cx + Math.cos(angle) * rx * scale,
    y: cy + Math.sin(angle) * ry * scale
  });

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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

  function ovalSpeechPath(bubble) {
    const rx = bubble.width / 2;
    const ry = bubble.height / 2;
    const tip = { x: bubble.tailX, y: bubble.tailY };
    const theta = Math.atan2(tip.y - bubble.y, tip.x - bubble.x);
    const delta = clamp(bubble.tailWidth / Math.max(80, Math.min(rx, ry) * 2), 0.08, 0.48);
    const baseA = pointOnEllipse(bubble.x, bubble.y, rx, ry, theta - delta);
    const baseB = pointOnEllipse(bubble.x, bubble.y, rx, ry, theta + delta);
    const controls = tailControls(baseA, tip, baseB, bubble.tailBend);

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
    return points;
  }

  function perimeterLength(points) {
    return points.reduce((total, point, index) => {
      const next = points[(index + 1) % points.length];
      return total + distance(point, next);
    }, 0);
  }

  function roundedSpeechPath(bubble) {
    const points = roundedRectPoints(bubble);
    const tip = { x: bubble.tailX, y: bubble.tailY };
    let closestIndex = 0;
    let closestDistance = Infinity;

    points.forEach((point, index) => {
      const current = distance(point, tip);
      if (current < closestDistance) {
        closestDistance = current;
        closestIndex = index;
      }
    });

    const span = clamp(
      Math.round((bubble.tailWidth / (2 * perimeterLength(points))) * points.length),
      1,
      Math.floor(points.length / 5)
    );
    const count = points.length;
    const indexA = (closestIndex - span + count) % count;
    const indexB = (closestIndex + span) % count;
    const baseA = points[indexA];
    const baseB = points[indexB];
    const controls = tailControls(baseA, tip, baseB, bubble.tailBend);
    const commands = [
      `M ${baseA.x} ${baseA.y}`,
      `Q ${controls.a.x} ${controls.a.y} ${tip.x} ${tip.y}`,
      `Q ${controls.b.x} ${controls.b.y} ${baseB.x} ${baseB.y}`
    ];

    let cursor = (indexB + 1) % count;
    while (cursor !== indexA) {
      commands.push(`L ${points[cursor].x} ${points[cursor].y}`);
      cursor = (cursor + 1) % count;
    }
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
    const angle = Math.atan2(tip.y - bubble.y, tip.x - bubble.x);
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
    clamp,
    textBounds,
    thoughtDots
  };
}());

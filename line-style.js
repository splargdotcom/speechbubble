(function () {
  "use strict";

  // Restyles a closed bubble outline from geometry.js as a hand-drawn or
  // brush-inked line. Corners (tail tips, burst spikes, cloud joins) stay
  // exactly in place; the smooth stretches between them wobble or thicken.
  // A seed fixes each bubble's wobble, so it does not shimmer while dragged.
  const TAU = Math.PI * 2;
  const DENSE = 3;
  const COARSE_EVERY = 3;
  const LIGHT = { x: -0.55, y: -0.83 };

  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const point = (x, y) => ({ x, y });
  const minus = (a, b) => point(a.x - b.x, a.y - b.y);
  const length = (v) => Math.hypot(v.x, v.y);
  const unit = (v) => { const l = length(v) || 1; return point(v.x / l, v.y / l); };
  const mid = (a, b) => point((a.x + b.x) / 2, (a.y + b.y) / 2);
  const fmt = (p) => `${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`;

  function cubic(seg, t) {
    const u = 1 - t;
    return point(
      u * u * u * seg.p0.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t * t * t * seg.p3.x,
      u * u * u * seg.p0.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t * t * t * seg.p3.y
    );
  }

  // Cubic segments of a single closed subpath, each with a length table.
  function segments(path) {
    const knots = window.SpeechbubbleShape.knots(path);
    return knots.map((k, i) => {
      const n = knots[(i + 1) % knots.length];
      const seg = { p0: point(k[2], k[3]), c1: point(k[4], k[5]), c2: point(n[0], n[1]), p3: point(n[2], n[3]) };
      const steps = Math.max(8, Math.min(200, Math.ceil((length(minus(seg.c1, seg.p0)) + length(minus(seg.c2, seg.c1)) + length(minus(seg.p3, seg.c2))) / 2)));
      seg.table = [{ t: 0, s: 0, p: seg.p0 }];
      for (let i2 = 1; i2 <= steps; i2 += 1) {
        const t = i2 / steps, p = cubic(seg, t), last = seg.table[seg.table.length - 1];
        seg.table.push({ t, s: last.s + length(minus(p, last.p)), p });
      }
      seg.length = seg.table[seg.table.length - 1].s;
      return seg;
    }).filter((seg) => seg.length > 1e-6);
  }

  function startTangent(seg) {
    for (const c of [seg.c1, seg.c2, seg.p3]) if (length(minus(c, seg.p0)) > 1e-6) return unit(minus(c, seg.p0));
    return point(1, 0);
  }
  function endTangent(seg) {
    for (const c of [seg.c2, seg.c1, seg.p0]) if (length(minus(seg.p3, c)) > 1e-6) return unit(minus(seg.p3, c));
    return point(1, 0);
  }

  function at(seg, s) {
    const table = seg.table;
    let i = 1;
    while (i < table.length - 1 && table[i].s < s) i += 1;
    const a = table[i - 1], b = table[i], f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    return point(a.p.x + (b.p.x - a.p.x) * f, a.p.y + (b.p.y - a.p.y) * f);
  }

  // Evenly spaced samples around the outline. Corners are always sampled,
  // and spacing is even between consecutive corners.
  function sample(path) {
    const segs = segments(path);
    if (!segs.length) return null;
    const corner = segs.map((seg, i) => {
      const before = endTangent(segs[(i - 1 + segs.length) % segs.length]), after = startTangent(seg);
      return before.x * after.x + before.y * after.y < Math.cos(20 * Math.PI / 180);
    });
    const first = corner.indexOf(true);
    const start = first < 0 ? 0 : first;
    const order = segs.map((_, i) => (start + i) % segs.length);
    const runs = [];
    order.forEach((index) => {
      if (!runs.length || corner[index]) runs.push([]);
      runs[runs.length - 1].push(segs[index]);
    });
    const points = [];
    let offset = 0;
    runs.forEach((run) => {
      const runLength = run.reduce((sum, seg) => sum + seg.length, 0);
      const count = Math.max(1, Math.round(runLength / DENSE));
      for (let k = 0; k < count; k += 1) {
        let s = runLength * k / count, j = 0;
        while (j < run.length - 1 && s > run[j].length) { s -= run[j].length; j += 1; }
        const p = at(run[j], Math.min(s, run[j].length));
        points.push({ x: p.x, y: p.y, s: offset + runLength * k / count, corner: k === 0 && first >= 0 });
      }
      offset += runLength;
    });
    // Unit normals by central difference; a corner takes the bisector.
    const n = points.length;
    points.forEach((p, i) => {
      const prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
      const t = p.corner
        ? unit(point(unit(minus(p, prev)).x + unit(minus(next, p)).x, unit(minus(p, prev)).y + unit(minus(next, p)).y))
        : unit(minus(next, prev));
      p.nx = t.y;
      p.ny = -t.x;
    });
    // Point the normals outwards.
    const centre = points.reduce((c, p) => point(c.x + p.x / n, c.y + p.y / n), point(0, 0));
    const outward = points.reduce((sum, p) => sum + p.nx * (p.x - centre.x) + p.ny * (p.y - centre.y), 0);
    if (outward < 0) points.forEach((p) => { p.nx = -p.nx; p.ny = -p.ny; });
    // Distance along the outline to the nearest corner, for fading wobble.
    const corners = points.filter((p) => p.corner).map((p) => p.s);
    let previous = corners.length ? corners[corners.length - 1] - offset : -Infinity;
    points.forEach((p) => {
      if (p.corner) previous = p.s;
      p.toCorner = p.s - previous;
    });
    let following = corners.length ? corners[0] + offset : Infinity;
    for (let i = n - 1; i >= 0; i -= 1) {
      if (points[i].corner) following = points[i].s;
      points[i].toCorner = Math.min(points[i].toCorner, following - points[i].s);
    }
    return { points, length: offset, hasCorners: first >= 0 };
  }

  // Smooth periodic noise in [-1, 1]; whole cycles keep the seam invisible.
  function noise(rand, total, wavelengths) {
    const waves = wavelengths.map(([wavelength, weight]) => ({
      cycles: Math.max(1, Math.round(total / wavelength)), phase: rand() * TAU, weight
    }));
    const sum = waves.reduce((total2, wave) => total2 + wave.weight, 0);
    return (s) => waves.reduce((value, wave) => value + wave.weight * Math.sin(TAU * wave.cycles * s / total + wave.phase), 0) / sum;
  }

  // Closed path through the samples: quadratic smoothing, sharp at corners.
  function smoothPath(points, hasCorners) {
    if (!hasCorners) {
      const n = points.length;
      const commands = [`M ${fmt(mid(points[n - 1], points[0]))}`];
      points.forEach((p, i) => commands.push(`Q ${fmt(p)} ${fmt(mid(p, points[(i + 1) % n]))}`));
      return commands.join(" ") + " Z";
    }
    const loop = [...points, points[0]];
    const commands = [`M ${fmt(loop[0])}`];
    for (let i = 1; i < loop.length; i += 1) {
      const p = loop[i];
      if (p.corner) {
        if (loop[i - 1].corner) commands.push(`L ${fmt(p)}`);
        continue;
      }
      const next = loop[i + 1];
      commands.push(`Q ${fmt(p)} ${fmt(next.corner ? next : mid(p, next))}`);
    }
    return commands.join(" ") + " Z";
  }

  function ribbon(points, widths) {
    const outer = points.map((p, i) => point(p.x + p.nx * widths[i] / 2, p.y + p.ny * widths[i] / 2));
    const inner = points.map((p, i) => point(p.x - p.nx * widths[i] / 2, p.y - p.ny * widths[i] / 2)).reverse();
    const loop = (list) => `M ${list.map(fmt).join(" L ")} Z`;
    // Opposite windings under the nonzero rule leave the inside unfilled.
    return `${loop(outer)} ${loop(inner)}`;
  }

  // Returns the outline to fill (centre) and, for drawn styles, a filled
  // ribbon to use as the line instead of a stroke.
  function styled(path, options) {
    const style = options.style || "clean";
    const width = Math.max(0, Number(options.width) || 0);
    if (style !== "hand" && style !== "brush") return { centre: path, ribbon: null };
    const outline = sample(path);
    if (!outline || outline.points.length < 3) return { centre: path, ribbon: null };
    const rand = random((Number(options.seed) || 1) * 7919 + (options.part || 0) * 104729);
    let points = outline.points;
    let widths;
    if (style === "hand") {
      const wobble = noise(rand, outline.length, [[150, 0.75], [60, 0.4]]);
      const weight = noise(rand, outline.length, [[190, 0.7], [75, 0.35]]);
      const amount = (0.8 + width * 0.3) * Math.min(1.6, Math.max(0.6, outline.length / 1200));
      points = points.map((p) => {
        const fade = Math.min(1, p.toCorner / 14);
        const d = wobble(p.s) * amount * fade * fade * (3 - 2 * fade);
        return { ...p, x: p.x + p.nx * d, y: p.y + p.ny * d };
      });
      widths = points.map((p) => width * (0.7 + 0.3 * (1 + weight(p.s))));
    } else {
      // Heavier where the outline faces away from a top-left light.
      widths = points.map((p) => width * (0.3 + 1.7 * Math.max(0, -(p.nx * LIGHT.x + p.ny * LIGHT.y)) ** 1.3));
    }
    const coarse = points.filter((p, i) => p.corner || i % COARSE_EVERY === 0);
    return {
      centre: style === "hand" ? smoothPath(coarse, outline.hasCorners) : path,
      ribbon: width > 0 ? ribbon(points, widths) : null
    };
  }

  window.SpeechbubbleLines = { styled };
}());

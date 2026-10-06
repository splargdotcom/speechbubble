const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
for (const file of ['geometry.js', 'editor-state.js', 'native-shape.js', 'line-style.js', 'photopea.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const G = context.window.BubbleGeometry;
const E = context.window.SpeechbubbleState;
const base = { x: 600, y: 355, width: 500, height: 300, style: 'speech', shape: 'oval', tailX: 700, tailY: 650, tailWidth: 72, tailBend: 0 };

test('editable speech exports contain independently closed body and tail subpaths', () => {
  for (const shape of ['oval', 'rounded']) {
    const d = G.editablePath({ ...base, shape });
    assert.equal((d.match(/M /g) || []).length, 2);
    assert.equal((d.match(/Z/g) || []).length, 2);
    assert.match(d, /700 650/);
    assert.doesNotMatch(d, /NaN|Infinity/);
  }
});

test('a tail dragged inside the body does not cut a hole in the bubble', () => {
  for (const shape of ['oval', 'rounded']) {
    const bubble = { ...base, shape, tailX: 600, tailY: 355 };
    assert.equal((G.editablePath(bubble).match(/M /g) || []).length, 1);
    assert.doesNotMatch(G.bodyPath(bubble), /NaN|Infinity/);
  }
});

test('thought dots are hidden when the tail point is inside the cloud', () => {
  const thought = { ...base, style: 'thought' };
  assert.equal(G.thoughtDots(thought).length, 3);
  assert.equal(G.thoughtDots({ ...thought, tailX: 650, tailY: 380 }).length, 0);
  assert.equal(G.editablePaths({ ...thought, tailX: 650, tailY: 380 }).length, 1);
});

test('a discarded history step leaves earlier steps intact', () => {
  const history = E.createHistory();
  history.record('a', null, 0); history.record('b', null, 1000);
  history.discard();
  assert.equal(history.undo('current'), 'a');
  assert.equal(history.canUndo, false);
});

test('rounded tails can attach at the centre of a straight edge at their requested width', () => {
  const d = G.bodyPath({ ...base, shape: 'rounded', tailX: 600, tailY: 650, tailWidth: 80 });
  const points = [...d.matchAll(/[MLQ] ([\d.e+-]+) ([\d.e+-]+)/g)];
  assert.ok(Math.abs(Number(points[0][1]) - 640) < 0.01);
  assert.ok(Math.abs(Number(points[0][2]) - 505) < 0.01);
});

test('all styles remain finite for extreme supported dimensions and tail positions', () => {
  for (const width of [120, 500, 8000]) for (const height of [90, 300, 8000]) {
    for (const style of ['speech', 'thought', 'shout']) for (const shape of ['oval', 'rounded']) {
      for (const tail of [[0, 0], [8000, 0], [0, 8000], [8000, 8000]]) {
        const bubble = { ...base, x: width / 2, y: height / 2, width, height, style, shape, tailX: tail[0], tailY: tail[1], tailBend: -140 };
        assert.doesNotMatch(G.bodyPath(bubble) + G.editablePath(bubble), /NaN|Infinity/);
      }
    }
  }
});

test('movement clamps the whole bubble without changing the tail offset', () => {
  for (const [dx, dy] of [[-5000, 0], [5000, 0], [0, -5000], [0, 5000]]) {
    const moved = { ...base };
    E.moveBubble(moved, base, dx, dy, { width: 1200, height: 800 });
    assert.equal(moved.tailX - moved.x, base.tailX - base.x);
    assert.equal(moved.tailY - moved.y, base.tailY - base.y);
    assert.ok(moved.x - moved.width / 2 >= 0 && moved.x + moved.width / 2 <= 1200);
    assert.ok(moved.tailY >= 0 && moved.tailY <= 800);
  }
});

test('small images retain their dimensions and large images retain their aspect ratio', () => {
  assert.equal(JSON.stringify(E.imageDimensions(100, 50)), '{"width":100,"height":50}');
  assert.equal(JSON.stringify(E.imageDimensions(16000, 2000)), '{"width":8000,"height":1000}');
  assert.equal(JSON.stringify(E.imageDimensions(400, 16000)), '{"width":200,"height":8000}');
});

test('undo groups typing, preserves independent changes and invalidates redo after a new edit', () => {
  const h = E.createHistory(3);
  h.record('before typing', 'text:1', 0);
  h.record('half typed', 'text:1', 100);
  h.record('after typing', null, 200);
  assert.equal(h.undo('after delete'), 'after typing');
  assert.equal(h.undo('after typing'), 'before typing');
  assert.equal(h.redo('before typing'), 'after typing');
  h.record('before new edit', null, 300);
  assert.equal(h.canRedo, false);
});

test('undo snapshots isolate bubble and canvas edits without copying large image data', () => {
  const background = { dataUrl: 'image bytes' };
  const state = { canvas: { width: 1200, background }, bubbles: [{ ...base }] };
  const saved = E.snapshot(state, 'selected');
  state.canvas.width = 500; state.bubbles[0].x = 80;
  assert.equal(saved.canvas.width, 1200);
  assert.equal(saved.bubbles[0].x, 600);
  assert.equal(saved.canvas.background, background);
});

test('Photopea scripts safely quote user text and parse as JavaScript', () => {
  const api = context.window.SpeechbubblePhotopea;
  const name = 'Unicode: £ 😃 "quotes"\n\\app.remove()';
  const data = { dataUrl: 'data:test', shapeUrl: 'data:shape', stroke: '#123456', strokeWidth: 4, opacity: 50, name };
  const destination = { index: 1, count: 2, name, source: 'local,test' };
  for (const script of [api.prepareScript('test'), api.openScript('data:test', 'test'), api.shapeScript(data, destination, 'test'), api.finishScript(data, destination, 'test')]) {
    assert.doesNotThrow(() => new vm.Script(script));
  }
});

test('cubic conversion preserves ellipse tangents and quadratic tail controls', () => {
  const S = context.window.SpeechbubbleShape;
  const paths = G.editablePaths(base);
  const ellipse = S.knots(paths[0]);
  assert.equal(ellipse.length, 4);
  assert.deepEqual(Array.from(ellipse[0].slice(2, 4)), [850, 355]);
  assert.ok(Math.abs(ellipse[0][5] - (355 + 150 * 0.5522847498307936)) < 1e-8);
  const tail = S.knots(paths[1]);
  assert.equal(tail.length, 4);
  assert.deepEqual(Array.from(tail[1].slice(2, 4)), [700, 650]);
  for (const style of ['speech', 'thought', 'shout']) for (const shape of ['oval', 'rounded']) {
    for (const path of G.editablePaths({...base,style,shape})) assert.ok(S.knots(path).flat().every(Number.isFinite));
  }
});

test('native PSD encodes two independent Combine contours and valid image dimensions', () => {
  const bytes = Buffer.from(context.window.SpeechbubbleShape.psd(G.editablePaths(base), {x:342,y:197,width:516,height:461}, '#ffffff'));
  assert.equal(bytes.toString('ascii',0,4), '8BPS');
  assert.equal(bytes.readUInt32BE(14), 461);
  assert.equal(bytes.readUInt32BE(18), 516);
  const mask = bytes.indexOf('8BIMvmsk');
  const length = bytes.readUInt32BE(mask + 8);
  const counts = [];
  for (let i = mask + 20; i < mask + 12 + length; i += 26) {
    if (bytes.readUInt16BE(i) === 0) {
      counts.push(bytes.readUInt16BE(i + 2));
      assert.equal(bytes.readUInt16BE(i + 4), 1); // Combine / Unite, not Exclude.
      assert.equal(bytes.readUInt16BE(i + 6), 2); // Nonzero winding.
    }
  }
  assert.deepEqual(counts, [4, 4]);
});

const L = context.window.SpeechbubbleLines;

test('drawn line styles stay finite, keep sharp points and wobble the same way for the same seed', () => {
  for (const style of ['speech', 'thought', 'shout']) {
    for (const lineStyle of ['hand', 'brush']) {
      const result = L.styled(G.bodyPath({ ...base, style }), { style: lineStyle, width: 5, seed: 42 });
      assert.doesNotMatch(result.centre + result.ribbon, /NaN|Infinity/);
      assert.ok(result.ribbon.length > 0);
    }
  }
  const path = G.bodyPath(base);
  const hand = L.styled(path, { style: 'hand', width: 5, seed: 42 });
  assert.match(hand.centre, /\b700 650\b/);
  assert.notEqual(hand.centre, path);
  assert.equal(L.styled(path, { style: 'hand', width: 5, seed: 42 }).centre, hand.centre);
  assert.notEqual(L.styled(path, { style: 'hand', width: 5, seed: 43 }).centre, hand.centre);
  assert.equal(L.styled(path, { style: 'brush', width: 5, seed: 42 }).centre, path);
  const clean = L.styled(path, { style: 'clean', width: 5, seed: 42 });
  assert.equal(clean.centre, path);
  assert.equal(clean.ribbon, null);
  assert.equal(L.styled(path, { style: 'hand', width: 0, seed: 42 }).ribbon, null);
});

test('brush ink is heavier on the shadow side', () => {
  const ribbon = L.styled(G.circlePath({ x: 0, y: 0, radius: 100 }), { style: 'brush', width: 10, seed: 1 }).ribbon;
  const [outer, inner] = ribbon.split(' Z ').map((loop) => loop.replace(/[MZ]/g, '').trim().split(' L ').map((pair) => pair.split(' ').map(Number)));
  const thickness = (angle) => {
    const radius = (points) => Math.max(...points.filter(([x, y]) => Math.abs(Math.atan2(y, x) - angle) < 0.05).map(([x, y]) => Math.hypot(x, y)));
    const innerRadius = (points) => Math.min(...points.filter(([x, y]) => Math.abs(Math.atan2(y, x) - angle) < 0.05).map(([x, y]) => Math.hypot(x, y)));
    return radius(outer) - innerRadius(inner);
  };
  assert.ok(thickness(Math.PI / 4) > 15, 'lower right is heavy');
  assert.ok(thickness(-3 * Math.PI / 4) < 4, 'upper left is light');
});

test('a hand-drawn outline converts to native Photopea contours', () => {
  const S = context.window.SpeechbubbleShape;
  const paths = G.editablePaths({ ...base, shape: 'rounded' }).map((path, part) => L.styled(path, { style: 'hand', width: 4, seed: 9, part }).centre);
  assert.equal(paths.length, 2);
  paths.forEach((path) => S.knots(path).flat().forEach((value) => assert.ok(Number.isFinite(value))));
  assert.ok(S.psd(paths, { x: 300, y: 150, width: 700, height: 560 }, '#ffffff').length > 100);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
for (const file of ['geometry.js', 'editor-state.js', 'native-shape.js', 'photopea.js']) {
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

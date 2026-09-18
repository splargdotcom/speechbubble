const {test} = require('node:test');
const assert = require('node:assert/strict');
const {editor} = require('./dom-harness.cjs');

test('editor starts, duplicate/delete can be undone and redone, then text edits render',()=>{
  const e=editor();
  assert.equal(e.ids.canvas.querySelectorAll('.bubble-layer').length,1);
  e.ids['duplicate-bubble'].click();
  assert.equal(e.ids.canvas.querySelectorAll('.bubble-layer').length,2);
  e.ids['delete-bubble'].click();
  assert.equal(e.ids.canvas.querySelectorAll('.bubble-layer').length,1);
  e.ids.undo.click();
  assert.equal(e.ids.canvas.querySelectorAll('.bubble-layer').length,2);
  e.ids.redo.click();
  assert.equal(e.ids.canvas.querySelectorAll('.bubble-layer').length,1);
  e.change('text-input','**Hello** world','input');
  assert.equal(e.ids.canvas.querySelectorAll('text').map(line=>line.querySelectorAll('tspan').map(n=>n.textContent).join('')).join(' '),'Hello world');
  assert.equal(e.ids.redo.disabled,true);
});

test('blank or invalid canvas fields never produce NaN geometry',()=>{
  const e=editor();
  e.change('canvas-width',''); e.change('canvas-height','not a number');
  assert.equal(e.ids.canvas.getAttribute('viewBox'),'0 0 1200 800');
  e.change('bubble-width','');
  assert.doesNotMatch(e.ids.canvas.querySelectorAll('.bubble-body')[0].getAttribute('d'),/NaN|Infinity/);
});

test('insertion without a selected bubble stays disabled',()=>{
  const e=editor(true); e.ids['delete-bubble'].click();
  assert.equal(e.ids['insert-photopea'].disabled,true);
  e.ids.undo.click();
  assert.equal(e.ids['insert-photopea'].disabled,false);
});

test('Photopea handshake waits for import completion and ignores foreign or stale acknowledgements',()=>{
  const e=editor(true); e.ids['insert-photopea'].click();
  assert.equal(e.scripts.length,1);
  assert.equal(e.scripts[0].origin,'https://www.photopea.com');
  const token=e.scripts[0].script.match(/(speechbubble:id-\d+):ready:/)[1];
  e.message(token+':inserted','https://example.org');
  e.message('speechbubble:old:inserted');
  assert.equal(e.ids['insert-photopea'].disabled,true);
  e.message(token+':ready:'+JSON.stringify({index:0,count:1,name:'Test',source:'local,test'}));
  assert.equal(e.scripts.length,1);
  e.message('done');
  assert.equal(e.scripts.length,2);
  assert.match(e.scripts[1].script,/null, false/);
  e.message('done');
  assert.equal(e.scripts.length,3);
  assert.match(e.scripts[2].script,/data:application\/octet-stream/);
  e.message('done');
  assert.equal(e.scripts.length,4);
  e.message('done'); // The shape must confirm it was copied before finishing.
  assert.equal(e.scripts.length,4);
  e.message(token+':shaped');
  e.message('done');
  assert.equal(e.scripts.length,5);
  assert.equal(e.ids['insert-photopea'].disabled,true);
  e.message(token+':inserted');
  assert.equal(e.ids['insert-photopea'].disabled,false);
  assert.equal(e.ids.toast.textContent,'Editable bubble inserted into Photopea');
});

test('missing Photopea acknowledgement releases the insert button with an honest timeout',()=>{
  const e=editor(true); e.ids['insert-photopea'].click();
  const timeout=[...e.timers.values()][0]; timeout();
  assert.equal(e.ids['insert-photopea'].disabled,false);
  assert.match(e.ids.toast.textContent,/did not confirm/);
});

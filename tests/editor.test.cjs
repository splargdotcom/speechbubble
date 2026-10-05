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
  const timeout=[...e.timers.values()].at(-1); timeout();
  assert.equal(e.ids['insert-photopea'].disabled,false);
  assert.match(e.ids.toast.textContent,/did not confirm/);
});

const pointer=(e,name,target,x,y)=>e.ids.canvas.fire(name,{target,pointerId:1,isPrimary:true,button:0,clientX:x,clientY:y});
const body=e=>e.ids.canvas.querySelectorAll('.bubble-body')[0];
const key=(e,name)=>e.document.fire('keydown',{key:name,target:e.document.body});

test('Escape cancels a drag without leaving an empty undo step',()=>{
  const e=editor(); const before=body(e).getAttribute('d');
  pointer(e,'pointerdown',body(e),600,355); pointer(e,'pointermove',body(e),700,400);
  assert.notEqual(body(e).getAttribute('d'),before);
  assert.equal(e.ids.undo.disabled,false);
  key(e,'Escape');
  assert.equal(body(e).getAttribute('d'),before);
  assert.equal(e.ids.undo.disabled,true);
  pointer(e,'pointerup',body(e),700,400);
  assert.equal(body(e).getAttribute('d'),before);
});

test('Delete and arrow keys are ignored while a bubble is being dragged',()=>{
  const e=editor();
  pointer(e,'pointerdown',body(e),600,355); pointer(e,'pointermove',body(e),650,355);
  const during=body(e).getAttribute('d');
  key(e,'Delete'); key(e,'ArrowLeft');
  assert.equal(e.ids.canvas.querySelectorAll('.bubble-layer').length,1);
  assert.equal(body(e).getAttribute('d'),during);
  pointer(e,'pointerup',body(e),650,355);
  key(e,'Delete');
  assert.equal(e.ids.canvas.querySelectorAll('.bubble-layer').length,0);
});

test('clicking empty canvas or pressing Escape deselects the bubble',()=>{
  const e=editor();
  pointer(e,'pointerdown',e.ids.canvas.querySelectorAll('.canvas-background')[0],20,20);
  assert.equal(e.ids.canvas.querySelectorAll('.selection-ui').length,0);
  assert.equal(e.ids['delete-bubble'].disabled,true);
  pointer(e,'pointerdown',body(e),600,355); pointer(e,'pointerup',body(e),600,355);
  assert.equal(e.ids.canvas.querySelectorAll('.selection-ui').length,1);
  key(e,'Escape');
  assert.equal(e.ids.canvas.querySelectorAll('.selection-ui').length,0);
  assert.equal(e.ids.undo.disabled,true);
});

test('a value clamped back to the current one adds no undo step and resets the field',()=>{
  const e=editor();
  e.change('bubble-width','120');
  e.change('bubble-height','200');
  e.change('bubble-width','60');
  assert.equal(String(e.ids['bubble-width'].value),'120');
  e.ids.undo.click();
  assert.equal(String(e.ids['bubble-height'].value),'300');
  assert.equal(String(e.ids['bubble-width'].value),'120');
});

const texts=e=>e.ids.canvas.querySelectorAll('.bubble-layer')[0].querySelectorAll('text').map(t=>({text:t.querySelectorAll('tspan').map(n=>n.textContent).join(''),x:Number(t.getAttribute('x')),y:Number(t.getAttribute('y'))}));
const wordHandle=(e,key)=>e.ids.canvas.querySelectorAll('.word-handle').find(n=>n.getAttribute('data-word')===key);
const dragWord=(e,key,dx,dy)=>{const h=wordHandle(e,key),x=Number(h.getAttribute('x'))+5,y=Number(h.getAttribute('y'))+5;pointer(e,'pointerdown',h,x,y);pointer(e,'pointermove',h,x+dx,y+dy);pointer(e,'pointerup',h,x+dx,y+dy);};
const fixedSize=e=>{e.ids['auto-fit'].checked=false;e.ids['auto-fit'].fire('change');};
const wordMode=(e,on)=>{e.ids['drag-words'].checked=on;e.ids['drag-words'].fire('change');};

test('Drag words shows a handle per word and moves only the dragged word',()=>{
  const e=editor();
  assert.equal(e.ids.canvas.querySelectorAll('.word-handle').length,0);
  wordMode(e,true);
  assert.deepEqual(e.ids.canvas.querySelectorAll('.word-handle').map(n=>n.getAttribute('data-word')),["WHO'S#0",'SORRY#0','NOW?#0']);
  const before=texts(e);
  assert.equal(e.ids['reset-words'].disabled,true);
  dragWord(e,'SORRY#0',100,40);
  const after=texts(e);
  assert.deepEqual(after.map(t=>t.text),before.map(t=>t.text));
  assert.equal(after[1].x-before[1].x,100); assert.equal(after[1].y-before[1].y,40);
  assert.deepEqual([after[0],after[2]],[before[0],before[2]]);
  assert.equal(e.ids['reset-words'].disabled,false);
  e.ids.undo.click();
  assert.deepEqual(texts(e),before);
  e.ids.redo.click();
  e.ids['reset-words'].click();
  assert.deepEqual(texts(e),before);
  assert.equal(e.ids['reset-words'].disabled,true);
});

test('a dragged word splits from its line, and dropping it home rejoins the line',()=>{
  const e=editor(); fixedSize(e); e.change('text-input','ONE TWO THREE','input'); wordMode(e,true);
  assert.deepEqual(texts(e).map(t=>t.text),['ONE TWO THREE']);
  dragWord(e,'TWO#0',0,-60);
  assert.deepEqual(texts(e).map(t=>t.text),['ONE ','TWO','THREE']);
  dragWord(e,'TWO#0',1,61);
  assert.deepEqual(texts(e).map(t=>t.text),['ONE TWO THREE']);
});

test('a dragged word keeps its place when other words change, and moves with its bubble',()=>{
  const e=editor(); fixedSize(e); e.change('text-input','HEY YOU','input'); wordMode(e,true);
  dragWord(e,'YOU#0',0,80);
  const moved=texts(e).find(t=>t.text==='YOU');
  e.change('text-input','OI YOU','input');
  assert.equal(texts(e).find(t=>t.text==='YOU').y,moved.y);
  e.change('text-input','OI YOU!','input');
  assert.equal(texts(e).length,1);
  e.change('text-input','OI YOU','input');
  wordMode(e,false);
  const before=texts(e).find(t=>t.text==='YOU');
  pointer(e,'pointerdown',body(e),600,300); pointer(e,'pointermove',body(e),580,290); pointer(e,'pointerup',body(e),580,290);
  const after=texts(e).find(t=>t.text==='YOU');
  assert.ok(Math.abs(after.x-before.x+20)<1e-9); assert.ok(Math.abs(after.y-before.y+10)<1e-9);
});

test('Photopea insertion bounds include a word dragged outside the bubble',()=>{
  const e=editor(true); wordMode(e,true);
  dragWord(e,'NOW?#0',-400,0);
  e.ids['insert-photopea'].click();
  const token=e.scripts[0].script.match(/(speechbubble:id-\d+):ready:/)[1];
  e.message(token+':ready:'+JSON.stringify({index:0,count:1,name:'Test',source:'local,test'}));
  e.message('done');
  const svg=Buffer.from(e.scripts[1].script.match(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/)[1],'base64').toString();
  const [left]=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const now=[...svg.matchAll(/<text x="([^"]+)"[^>]*>(?:<tspan[^>]*>[^<]*<\/tspan>)+/g)].find(m=>m[0].includes('NOW?'));
  assert.ok(Number(now[1])>=left,`NOW? at ${now[1]} starts left of the inserted bounds ${left}`);
  assert.ok(Number(now[1])<350);
});

const textNodes=e=>e.ids.canvas.querySelectorAll('.bubble-layer')[0].querySelectorAll('text');
const nodeFor=(e,word)=>textNodes(e).find(t=>t.querySelectorAll('tspan').map(n=>n.textContent).join('')===word);
const clickWord=(e,key)=>{const h=wordHandle(e,key),x=Number(h.getAttribute('x'))+5,y=Number(h.getAttribute('y'))+5;pointer(e,'pointerdown',h,x,y);pointer(e,'pointerup',h,x,y);};

test('a selected word resizes about its centre from its corner handle or the slider',()=>{
  const e=editor(); fixedSize(e); e.change('text-input','ONE TWO THREE','input'); wordMode(e,true);
  assert.equal(e.ids['word-size-field'].className.includes('is-hidden'),true);
  clickWord(e,'TWO#0');
  assert.equal(e.ids['word-size-field'].className.includes('is-hidden'),false);
  assert.equal(e.ids['word-size-label'].textContent,'Size of “TWO”');
  const box=wordHandle(e,'TWO#0'), centre=Number(box.getAttribute('x'))+Number(box.getAttribute('width'))/2;
  const corner=e.ids.canvas.querySelectorAll('.word-size')[0];
  const cx=Number(corner.getAttribute('cx')), cy=Number(corner.getAttribute('cy'));
  const midY=Number(box.getAttribute('y'))+Number(box.getAttribute('height'))/2;
  // Twice as far from the word's centre doubles its size.
  pointer(e,'pointerdown',corner,cx,cy); pointer(e,'pointermove',corner,centre+(cx-centre)*2,midY+(cy-midY)*2); pointer(e,'pointerup',corner,0,0);
  const two=nodeFor(e,'TWO');
  assert.equal(Number(two.getAttribute('font-size')),84);
  assert.equal(e.ids['word-size-output'].textContent,'200%');
  const grown=wordHandle(e,'TWO#0');
  assert.ok(Math.abs(Number(grown.getAttribute('x'))+Number(grown.getAttribute('width'))/2-centre)<1e-6);
  assert.equal(Number(nodeFor(e,'ONE ').getAttribute('font-size')),42);
  e.change('word-size','50','input');
  assert.equal(Number(nodeFor(e,'TWO').getAttribute('font-size')),21);
  e.ids.undo.click();
  assert.equal(Number(nodeFor(e,'TWO').getAttribute('font-size')),84);
  e.change('word-size','100','input');
  assert.deepEqual(textNodes(e).map(t=>t.querySelectorAll('tspan').map(n=>n.textContent).join('')),['ONE TWO THREE']);
});

test('arrow keys nudge the selected word, Delete keeps the bubble and Escape steps back out',()=>{
  const e=editor(); fixedSize(e); wordMode(e,true); clickWord(e,'NOW?#0');
  const before=nodeFor(e,'NOW?'); const x=Number(before.getAttribute('x'));
  key(e,'ArrowRight'); e.document.fire('keydown',{key:'ArrowDown',shiftKey:true,target:e.document.body});
  const after=nodeFor(e,'NOW?');
  assert.ok(Math.abs(Number(after.getAttribute('x'))-x-1)<0.05);
  assert.ok(Math.abs(Number(after.getAttribute('y'))-Number(before.getAttribute('y'))-10)<0.05);
  key(e,'Delete');
  assert.equal(e.ids.canvas.querySelectorAll('.bubble-layer').length,1);
  key(e,'Escape');
  assert.equal(e.ids.canvas.querySelectorAll('.word-handle.selected').length,0);
  assert.equal(e.ids.canvas.querySelectorAll('.selection-ui').length,1);
  key(e,'Escape');
  assert.equal(e.ids.canvas.querySelectorAll('.selection-ui').length,0);
});

test('a | splits a word into pieces that drag separately but read as one word',()=>{
  const e=editor(); fixedSize(e); e.change('text-input','SO|RRY NOW','input'); wordMode(e,true);
  assert.deepEqual(textNodes(e).map(t=>t.querySelectorAll('tspan').map(n=>n.textContent).join('')),['SORRY NOW']);
  assert.deepEqual(e.ids.canvas.querySelectorAll('.word-handle').map(n=>n.getAttribute('data-word')),['SO#0','RRY#0','NOW#0']);
  dragWord(e,'RRY#0',0,50);
  assert.deepEqual(textNodes(e).map(t=>t.querySelectorAll('tspan').map(n=>n.textContent).join('')),['SO','RRY','NOW']);
  assert.equal(e.ids['bubble-list'].querySelectorAll('.layer-copy')[0].textContent,'SORRY NOW');
});

const {memoryStorage}=require('./dom-harness.cjs');
const layerNames=e=>e.ids['bubble-list'].querySelectorAll('.layer-copy').map(n=>n.textContent);

test('work is saved automatically and comes back after a reload, words included',()=>{
  const storage=memoryStorage();
  const first=editor(false,{storage}); fixedSize(first);
  first.change('text-input','HELLO THERE','input');
  wordMode(first,true); dragWord(first,'THERE#0',30,60);
  first.change('fill-colour','#ffd400','input'); first.change('canvas-width','1000');
  const placed=texts(first);
  first.flush();
  const second=editor(false,{storage});
  assert.deepEqual(layerNames(second),['HELLO THERE']);
  assert.deepEqual(texts(second),placed);
  assert.equal(second.ids.canvas.querySelectorAll('.bubble-body')[0].getAttribute('fill'),'#ffd400');
  assert.equal(second.ids.canvas.getAttribute('viewBox'),'0 0 1000 800');
  assert.equal(second.ids.undo.disabled,true);
});

test('a damaged or hostile saved project is cleaned up instead of breaking the editor',()=>{
  const storage=memoryStorage();
  storage.setItem('speechbubble:project','{not json');
  assert.deepEqual(layerNames(editor(false,{storage})),["WHO'S SORRY NOW?"]);
  storage.setItem('speechbubble:project',JSON.stringify({app:'speechbubble',canvas:{width:'huge',height:1e9,backgroundMode:'neon'},bubbles:[
    {text:42,fill:'red" onload="alert(1)',style:'evil',fontFamily:'url(x)',strokeWidth:5,x:NaN,words:{'__proto__':{x:1},'A#0':{x:'1',y:2,scale:99},'B#0':null}},
    null,'text']}));
  const e=editor(false,{storage});
  assert.equal(e.ids.canvas.getAttribute('viewBox'),'0 0 1200 8000');
  const svg=e.ids.canvas.querySelectorAll('.bubble-body')[0];
  assert.equal(svg.getAttribute('fill'),'#ffffff');
  assert.doesNotMatch(svg.getAttribute('d'),/NaN|Infinity/);
  assert.equal(e.ids['bubble-list'].querySelectorAll('.layer-kind')[0].textContent,'speech');
  assert.equal(e.ids.canvas.querySelectorAll('.bubble-layer').length,1);
});

test('a lost background image still restores the bubbles and says so',()=>{
  const storage=memoryStorage();
  storage.setItem('speechbubble:project',JSON.stringify({app:'speechbubble',canvas:{width:200,height:150,backgroundMode:'white',hasBackground:true},bubbles:[{text:'KEPT'}]}));
  const e=editor(false,{storage});
  assert.deepEqual(layerNames(e),['KEPT']);
  assert.equal(e.ids.canvas.getAttribute('viewBox'),'0 0 200 150');
  assert.match(e.ids.toast.textContent,/image was too large/);
});

test('a project file saves everything and opens back in as an undoable change',async()=>{
  const e=editor(); e.change('text-input','SAVED','input');
  e.ids['save-project'].click();
  const saved=await e.downloads[0].text();
  assert.equal(JSON.parse(saved).app,'speechbubble');
  const other=editor(); other.ids['add-bubble'].click();
  other.ids['project-upload'].files=[{name:'speechbubble-project.json',size:saved.length,text:saved}];
  other.ids['project-upload'].fire('change');
  assert.deepEqual(layerNames(other),['SAVED']);
  assert.match(other.ids.toast.textContent,/Project opened/);
  other.ids.undo.click();
  assert.equal(layerNames(other).length,2);
  other.ids.stage.fire('drop',{dataTransfer:{files:[{name:'notes.json',type:'application/json',size:5,text:'{"a":1}'}]}});
  assert.match(other.ids.toast.textContent,/not a Speechbubble project/);
  assert.equal(layerNames(other).length,2);
});

test('Start over clears the canvas and can be undone',()=>{
  const e=editor(); e.ids['add-bubble'].click(); e.change('canvas-width','900');
  e.ids['start-over'].click();
  assert.deepEqual(layerNames(e),["WHO'S SORRY NOW?"]);
  assert.equal(e.ids.canvas.getAttribute('viewBox'),'0 0 1200 800');
  e.ids.undo.click();
  assert.equal(layerNames(e).length,2);
  assert.equal(e.ids.canvas.getAttribute('viewBox'),'0 0 900 800');
});

test('when storage is too full for the bubbles, the stored image makes room for them',()=>{
  const storage=memoryStorage(1500);
  storage.setItem('speechbubble:background',JSON.stringify({dataUrl:'data:image/png;base64,'+'A'.repeat(1000),name:'big.png'}));
  storage.setItem('speechbubble:project',JSON.stringify({app:'speechbubble',canvas:{width:300,height:200,hasBackground:true},bubbles:[{id:'b1',text:'HI'}],selectedId:'b1'}));
  const e=editor(false,{storage});
  assert.equal(e.ids.canvas.querySelectorAll('.canvas-image').length,1);
  e.change('text-input','HELLO','input'); e.flush();
  assert.equal(storage.getItem('speechbubble:background'),null);
  assert.equal(JSON.parse(storage.getItem('speechbubble:project')).bubbles[0].text,'HELLO');
  assert.match(e.ids.toast.textContent,/too large to keep/);
});

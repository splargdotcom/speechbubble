// Minimal DOM fixture for event/state regression tests. It deliberately does
// not emulate browser layout, font metrics or Photopea's scripting engine.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function editor(photopea = false) {
  class Element {
    constructor(tag) { this.tagName = tag; this.attributes = {}; this.dataset = {}; this.children = []; this.events = {}; this.style = {}; this.value = ''; this.disabled = false; this.clientWidth = 1000; this.clientHeight = 800; }
    setAttribute(key, value) { this.attributes[key] = String(value); if (['value','type','id'].includes(key)) this[key] = value; if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    get className() { return this.attributes.class || ''; }
    set className(value) { this.attributes.class = value; }
    get classList() { return { add: c => this.className += ` ${c}`, remove: c => { this.className = this.className.split(' ').filter(x => x !== c).join(' '); }, toggle: (c, on) => on ? this.classList.add(c) : this.classList.remove(c) }; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); }
    matches(selector) { if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1)); const attr = selector.match(/^\[([^\]]+)\]$/); return attr ? this.getAttribute(attr[1]) !== null : this.tagName === selector; }
    querySelectorAll(selector) { const selectors = selector.split(',').map(x => x.trim()); return this.children.flatMap(child => [...(selectors.some(s => child.matches(s)) ? [child] : []), ...child.querySelectorAll(selector)]); }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    fire(name, additions = {}) { const event = { target: this, preventDefault() {}, ...additions }; (this.events[name] || []).forEach(fn => fn(event)); }
    click() { if (!this.disabled) this.fire('click'); }
    focus() {} select() {}
    getBoundingClientRect() { return {left:0,top:0,width:1200,height:800}; }
    setPointerCapture() {} hasPointerCapture() { return false; } releasePointerCapture() {}
    getContext() { return { font:'42px Arial', measureText(text) { return { width: text.length * (parseFloat(this.font.match(/([\d.]+)px/)[1])) * 0.55 }; } }; }
    cloneNode() { const clone = new Element(this.tagName); Object.entries(this.attributes).forEach(([k,v])=>clone.setAttribute(k,v)); clone.textContent=this.textContent; this.children.forEach(c=>clone.appendChild(c.cloneNode(true))); return clone; }
  }
  class Input extends Element {} class Textarea extends Element {} class Select extends Element {}
  const create = tag => new (tag === 'input' ? Input : tag === 'textarea' ? Textarea : tag === 'select' ? Select : Element)(tag);
  const document = new Element('document'), ids = {}, stack = [document];
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const match of html.matchAll(/<\/?([\w-]+)\b([^>]*)>/g)) {
    const [token, tag, attrs] = match;
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    const el = create(tag);
    for (const a of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) el.setAttribute(a[1], a[2] ?? '');
    if (el.id) ids[el.id] = el;
    if ('checked' in el.attributes) el.checked = true;
    if ('disabled' in el.attributes) el.disabled = true;
    stack.at(-1).appendChild(el);
    if (!['input','meta','link','br','img'].includes(tag) && !token.endsWith('/>')) stack.push(el);
  }
  document.getElementById = id => ids[id];
  document.createElement = create;
  document.createElementNS = (_, tag) => create(tag);
  document.body = document.querySelectorAll('body')[0];
  const scripts = [], timers = new Map(); let timerId = 0, uuid = 0;
  const window = new Element('window');
  Object.assign(window, { location: {search:photopea?'?photopea=1':''}, crypto:{randomUUID:()=>`id-${++uuid}`}, CSS:{supports:()=>true}, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id=>timers.delete(id), btoa:s=>Buffer.from(s,'binary').toString('base64') });
  window.parent = photopea ? {postMessage:(script,origin)=>scripts.push({script,origin})} : window;
  const escape = text => String(text ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  function serialize(node) { return `<${node.tagName}${Object.entries(node.attributes).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>${escape(node.textContent)}${node.children.map(serialize).join('')}</${node.tagName}>`; }
  const context = {window,document,CSS:window.CSS,HTMLInputElement:Input,HTMLTextAreaElement:Textarea,HTMLSelectElement:Select,URLSearchParams,TextEncoder,Blob,XMLSerializer:class { serializeToString(node) {return serialize(node);} },requestAnimationFrame:fn=>fn()};
  for (const file of ['geometry.js','editor-state.js','native-shape.js','photopea.js','app.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
  return {ids,document,window,scripts,timers,change(id,value,event='change') {ids[id].value=value; ids[id].fire(event);},message(data,origin='https://www.photopea.com',source=window.parent) {window.fire('message',{data,origin,source});}};
}
module.exports = {editor};

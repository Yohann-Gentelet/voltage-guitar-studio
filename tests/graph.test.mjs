import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createAmpGraph} from '../dist/audio-engine.js';
import {DEFAULT_SETTINGS,clone} from '../dist/settings.js';
import {AmpDSP,VOICE_IDS} from '../dist/amp-dsp.js';

// Native-node contract doubles verify graph topology/parameters, not native DSP.
class Param {
  constructor(owner,value=0){this.owner=owner;this.value=value;}
  set value(value){assert.ok(Number.isFinite(value),'AudioParam must be finite');this.current=value;}
  get value(){return this.current;}
  cancelScheduledValues(){}
  setTargetAtTime(value){this.value=value;}
}
class Node {
  constructor(ctx,kind){this.ctx=ctx;this.kind=kind;this.connections=[];ctx.nodes.push(this);for(const name of ['gain','frequency','Q','threshold','knee','ratio','attack','release','delayTime'])this[name]=new Param(this,name==='gain'?1:0);}
  connect(to){assert.ok(to instanceof Node||to instanceof Param);this.connections.push(to);return to;}
  start(){this.started=true;}
  stop(){this.stopped=true;}
}
class Context {
  constructor(){this.sampleRate=48000;this.currentTime=0;this.nodes=[];this.processors={};this.audioWorklet={addModule:async url=>vm.runInNewContext(readFileSync(url,'utf8').replace(/^import .+;$/gm,''),{AmpDSP,VOICE_IDS,sampleRate:this.sampleRate,Math,Float32Array,Float64Array,AudioWorkletProcessor:class{},registerProcessor:(name,klass)=>this.processors[name]=klass})};}
  createGain(){return new Node(this,'gain');}
  createAnalyser(){return new Node(this,'analyser');}
  createDynamicsCompressor(){return new Node(this,'compressor');}
  createWaveShaper(){return new Node(this,'waveshaper');}
  createBiquadFilter(){return new Node(this,'filter');}
  createConvolver(){return new Node(this,'convolver');}
  createOscillator(){return new Node(this,'oscillator');}
  createDelay(){return new Node(this,'delay');}
  createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return{sampleRate:rate,numberOfChannels:channels,length,getChannelData:c=>data[c]};}
}
async function withGraph(run,makeBuffers=()=>({})){
  const previous=globalThis.AudioWorkletNode;
  globalThis.AudioWorkletNode=class extends Node{
    constructor(ctx,name){super(ctx,name);assert.ok(ctx.processors[name],'worklet must be registered before construction');this.parameters=new Map((ctx.processors[name].parameterDescriptors||[]).map(p=>[p.name,new Param(this,p.defaultValue)]));this.port={closed:false,close(){this.closed=true;}};}
  };
  let graph;
  try{const ctx=new Context();graph=await createAmpGraph(ctx,clone(DEFAULT_SETTINGS),{cabinetBuffers:makeBuffers(ctx)});await run(ctx,graph);}finally{graph?.dispose();globalThis.AudioWorkletNode=previous;}
}
const find=(ctx,name)=>ctx.nodes.find(n=>n.kind===name);
function reaches(from,to){const seen=new Set(),queue=[from];while(queue.length){const n=queue.shift();if(n===to)return true;if(seen.has(n)||!(n instanceof Node))continue;seen.add(n);queue.push(...n.connections);}return false;}

test('new pedal routing preserves a dry bypass and follows the displayed chain',async()=>withGraph((ctx,graph)=>{
  const names=['voltage-octave','voltage-wah','voltage-crusher','voltage-noise'];
  for(const name of names){const node=find(ctx,name),entry=ctx.nodes.find(n=>n.connections.includes(node)),dry=entry.connections.find(n=>n!==node),wet=node.connections[0];assert.equal(dry.gain.value,1,name+' dry');assert.equal(wet.gain.value,0,name+' wet');assert.equal(dry.connections[0],wet.connections[0]);}
  const nodes=names.map(name=>find(ctx,name));for(let i=0;i<nodes.length-1;i++){assert.ok(reaches(nodes[i],nodes[i+1]));assert.ok(!reaches(nodes[i+1],nodes[i]));}
  assert.ok(reaches(find(ctx,'voltage-noise'),find(ctx,'voltage-looper')));assert.ok(reaches(find(ctx,'voltage-looper'),graph.master));
  const settings=clone(DEFAULT_SETTINGS);for(const id of ['octave','wah','bitcrusher','noise'])settings.effects[id].enabled=true;graph.update(settings);
  assert.equal(find(ctx,'voltage-noise').connections[0].gain.value,1);assert.equal(find(ctx,'voltage-crusher').connections[0].gain.value,.55);
  settings.fxBypassed=true;graph.update(settings);for(const node of nodes)assert.equal(node.connections[0].gain.value,0);
}));
test('ring modulation drives a zero-offset multiplier and independently filters the wet sound',async()=>withGraph((ctx,graph)=>{
  const carrier=ctx.nodes.find(n=>n.kind==='oscillator'&&n.frequency.value===80);assert.ok(carrier?.started);
  const modulation=carrier.connections[0];assert.ok(modulation instanceof Param);assert.equal(modulation.value,0);
  const multiplier=modulation.owner,dc=multiplier.connections[0],tone=dc.connections[0];assert.equal(dc.type,'highpass');assert.equal(dc.frequency.value,20);assert.equal(tone.kind,'filter');assert.equal(tone.type,'lowpass');
  const wet=tone.connections[0];assert.equal(wet.gain.value,0);
  const s=clone(DEFAULT_SETTINGS);s.effects.ringmod={enabled:true,frequency:37,tone:100,mix:100};graph.update(s);
  assert.equal(carrier.frequency.value,37);assert.equal(tone.frequency.value,9600);assert.equal(wet.gain.value,1);
  s.fxBypassed=true;graph.update(s);assert.equal(wet.gain.value,0);assert.equal(modulation.value,0);
}));
test('graph cleanup stops every modulation oscillator and closes every worklet port',async()=>withGraph((ctx,graph)=>{
  graph.dispose();const oscillators=ctx.nodes.filter(n=>n.kind==='oscillator'),worklets=ctx.nodes.filter(n=>n.port);
  assert.equal(oscillators.length,4);assert.equal(worklets.length,7);assert.ok(oscillators.every(n=>n.stopped));assert.ok(worklets.every(n=>n.port.closed));
}));

test('measured and custom cabinets replace modeled filters and share only the final high cut',async()=>withGraph((ctx,graph)=>{
  const amp=find(ctx,'voltage-amp'),cabIn=amp.connections[0],s=clone(DEFAULT_SETTINGS);
  const convolvers=cabIn.connections.filter(n=>n.kind==='convolver');assert.equal(convolvers.length,2);assert.ok(convolvers.every(n=>n.normalize===false));
  const measured=convolvers.find(n=>n.buffer),custom=convolvers.find(n=>!n.buffer),wet=measured.connections[0],processed=wet.connections[0],cut=processed.connections[0];
  const modelGain=ctx.nodes.find(n=>n.kind==='gain'&&n.connections.includes(processed)&&n!==wet&&n!==custom.connections[0]);
  assert.equal(cut.type,'lowpass');assert.equal(cut.frequency.value,8000);
  s.cabinet='greenback';s.cabHighCut=6500;graph.update(s);assert.equal(wet.gain.value,1);assert.equal(modelGain.gain.value,0);assert.equal(custom.connections[0].gain.value,0);assert.equal(cut.frequency.value,6500);assert.equal(graph.cabinetFallback,false);
  const impulse=ctx.createBuffer(1,4096,48000);impulse.getChannelData(0)[0]=1;graph.setIR(impulse);s.cabinet='custom';graph.update(s);
  assert.equal(custom.normalize,false);assert.ok(Math.abs(custom.buffer.getChannelData(0)[0]-.8)<1e-6);assert.equal(custom.connections[0].gain.value,1);assert.equal(wet.gain.value,0);assert.equal(modelGain.gain.value,0);
  s.cabinet='off';graph.update(s);const dry=cabIn.connections.find(n=>n.kind==='gain');assert.equal(dry.gain.value,1);assert.ok(!reaches(dry,cut));assert.equal(custom.connections[0].gain.value,0);
},ctx=>({greenback:ctx.createBuffer(1,4080,48000)})));

test('a missing measured cabinet activates its modeled fallback',async()=>withGraph((ctx,graph)=>{
  const s=clone(DEFAULT_SETTINGS);s.cabinet='v30';graph.update(s);assert.equal(graph.cabinetFallback,true);
  const cabinetEntry=find(ctx,'voltage-amp').connections[0],hp=cabinetEntry.connections.find(n=>n.kind==='filter');
  assert.equal(hp.type,'highpass');assert.equal(hp.frequency.value,75);assert.equal(hp.connections[0].connections[0].frequency.value,4500);
  s.cabinet='open';graph.update(s);assert.equal(graph.cabinetFallback,false);
}));

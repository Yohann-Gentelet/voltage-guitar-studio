import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { detectPitch, makeCurve } from '../dist/dsp.js';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../dist/settings.js';

test('tuner resolves all six open strings and harmonic-rich tones within 2 cents',()=>{
  for(const rate of [44100,48000,96000])for(const hz of [55,82.4069,110,146.8324,195.9977,246.9417,329.6276,440,1318.51]){
    const signal=Float32Array.from({length:4096},(_,i)=>0.3*Math.sin(2*Math.PI*hz*i/rate)+0.15*Math.sin(4*Math.PI*hz*i/rate));
    const result=detectPitch(signal,rate);assert.ok(result,`${rate}/${hz}`);assert.ok(Math.abs(1200*Math.log2(result.frequency/hz))<2,`${rate}/${hz}: ${result.frequency}`);
  }
});
test('tuner rejects silence and an input below the detection floor',()=>{assert.equal(detectPitch(new Float32Array(4096),48000),null);assert.equal(detectPitch(Float32Array.from({length:4096},(_,i)=>0.001*Math.sin(i/10)),48000),null);});
test('persisted controls are bounded and invalid values cannot reach AudioParams',()=>{const s=sanitizeSettings({model:'bogus',gain:Infinity,bass:120,cabinet:'missing',effects:{delay:{feedback:900,time:-20},reverb:{decay:'many'}}});assert.equal(s.model,'clean');assert.equal(s.gain,DEFAULT_SETTINGS.gain);assert.equal(s.bass,100);assert.equal(s.cabinet,'open');assert.equal(s.effects.delay.feedback,85);assert.equal(s.effects.delay.time,50);assert.equal(s.effects.reverb.decay,DEFAULT_SETTINGS.effects.reverb.decay);});
test('amp curves remain finite, bounded, and model dependent',()=>{const clean=makeCurve('clean');for(const model of ['clean','chime','crunch','lead']){const curve=makeCurve(model);assert.ok(curve.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));if(model!=='clean')assert.notDeepEqual(curve,clean);}});
function processors(){const registry={};vm.runInNewContext(readFileSync(new URL('../dist/gate-worklet.js',import.meta.url),'utf8'),{AudioWorkletProcessor:class{constructor(){this.port={onmessage:null,postMessage(){}};}},sampleRate:48000,Float32Array,Math,registerProcessor:(name,processor)=>registry[name]=processor});return registry;}
test('gate rejects quiet noise, opens for guitar, and smoothly closes',()=>{const Gate=processors()['voltage-gate'],gate=new Gate(),out=[new Float32Array(128)],params={threshold:[-40],release:[20],enabled:[1]};const run=(amplitude,blocks)=>{const input=[new Float32Array(128).fill(amplitude)];for(let b=0;b<blocks;b++)gate.process([input],[out],params);return Math.max(...out[0].map(Math.abs));};assert.equal(run(0.001,100),0);assert.ok(run(0.1,20)>0.095);assert.ok(run(0.001,200)<0.00001);params.enabled=[0];assert.ok(run(0.001,20)>0.00095);});
test('looper preserves genuine right-channel zeros',()=>{const Loop=processors()['voltage-looper'],loop=new Loop(),out=[new Float32Array(3),new Float32Array(3)];loop.process([[Float32Array.of(.1,.2,.3),Float32Array.of(0,.4,0)]],[out]);assert.equal(out[1][0],0);assert.equal(out[1][2],0);assert.ok(Math.abs(out[1][1]-.4)<1e-6);});
test('looper records, loops in time, overdubs and clears',()=>{const Loop=processors()['voltage-looper'],loop=new Loop(),out=[new Float32Array(128),new Float32Array(128)],live=[new Float32Array(128).fill(.2)],silence=[new Float32Array(128)];const action=a=>loop.port.onmessage({data:{action:a}});action('record');for(let i=0;i<75;i++)loop.process([live],[out]);assert.equal(loop.length,9600);action('finish');assert.equal(loop.mode,'playing');for(let i=0;i<4;i++)loop.process([silence],[out]);assert.ok(out[0][64]>.19);action('overdub');loop.process([live],[out]);assert.ok(out[0][64]>.39);action('finish');action('stop');loop.process([silence],[out]);assert.equal(out[0][64],0);action('clear');assert.equal(loop.length,0);assert.equal(loop.mode,'empty');});

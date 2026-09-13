import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {EFFECTS,PRESETS,DEFAULT_SETTINGS,sanitizeSettings,clone} from '../dist/settings.js';

const source=readFileSync(new URL('../dist/texture-worklet.js',import.meta.url),'utf8'),registries=new Map();
function registry(rate){
  if(!registries.has(rate)){
    const classes={};vm.runInNewContext(source,{sampleRate:rate,Math,Float32Array,Float64Array,AudioWorkletProcessor:class{constructor(){this.port={close(){}};}},registerProcessor:(name,value)=>classes[name]=value});registries.set(rate,classes);
  }
  return registries.get(rate);
}
function render(name,patch={},options={}){
  const {rate=48000,seconds=.5,input=(i)=>.25*Math.sin(2*Math.PI*110*i/rate),channels=1,blockSize=128,emptyAfter=Infinity}=options;
  const Processor=registry(rate)['voltage-'+name],processor=new Processor();
  const params=Object.fromEntries(Processor.parameterDescriptors.map(p=>[p.name,Float32Array.of(patch[p.name]??p.defaultValue)]));
  const count=Math.round(rate*seconds),data=Array.from({length:channels},()=>new Float32Array(count));
  for(let offset=0;offset<count;){
    const size=Math.min(blockSize,count-offset),output=Array.from({length:channels},()=>new Float32Array(size));
    const captured=offset>=emptyAfter?[]:Array.from({length:channels},(_,c)=>Float32Array.from({length:size},(_,i)=>input(offset+i,c)));
    assert.equal(processor.process([captured],[output],params),true);
    output.forEach((channel,c)=>data[c].set(channel,offset));offset+=size;
  }
  return {data,processor};
}
function energy(data,start=0){let sum=0;for(let i=start;i<data.length;i++)sum+=data[i]**2;return sum/(data.length-start);}
function bin(data,frequency,rate,start=0){let real=0,imaginary=0;for(let i=start;i<data.length;i++){const angle=2*Math.PI*frequency*i/rate;real+=data[i]*Math.cos(angle);imaginary+=data[i]*Math.sin(angle);}return (real**2+imaginary**2)/(data.length-start)**2;}
const textures=['octave','wah','bitcrusher','noise','ringmod'];

test('existing saved tones migrate with every new pedal off',()=>{
  const old=clone(DEFAULT_SETTINGS);for(const id of textures)delete old.effects[id];old.effects.delay.enabled=true;old.effects.delay.time=375;
  const migrated=sanitizeSettings(old);for(const id of textures)assert.equal(migrated.effects[id].enabled,false);assert.equal(migrated.effects.delay.enabled,true);assert.equal(migrated.effects.delay.time,375);
  const originalIds=['california','british','blues','heavy','dream','haze','jangle-club','bedroom-tape','garage-afterhours','dream-pop','shoegaze-bloom','neon-arpeggios'];
  for(const id of originalIds){const preset=PRESETS.find(p=>p.id===id);assert.ok(preset,id);assert.deepEqual(sanitizeSettings(preset.settings),preset.settings);for(const texture of textures)assert.equal(preset.settings.effects[texture].enabled,false);}
});
test('all new stored controls reject nonfinite/out-of-range values',()=>{
  const settings=clone(DEFAULT_SETTINGS);
  for(const effect of EFFECTS.filter(e=>textures.includes(e.id)))for(const [key,,min,max] of effect.params){
    settings.effects[effect.id][key]=Infinity;assert.ok(Number.isFinite(sanitizeSettings(settings).effects[effect.id][key]));
    settings.effects[effect.id][key]=min-100;assert.equal(sanitizeSettings(settings).effects[effect.id][key],min);
    settings.effects[effect.id][key]=max+100;assert.equal(sanitizeSettings(settings).effects[effect.id][key],max);
  }
});
test('noise, octave, crusher and wah preserve fresh silence at every sample rate',()=>{
  for(const rate of [44100,48000,96000])for(const name of ['noise','octave','crusher','wah']){const {data}=render(name,{}, {rate,input:()=>0,seconds:.1});assert.ok(data[0].every(v=>v===0),name+' '+rate);}
});
test('noise controls add repeatable hiss/crackle, and zero amounts preserve the guitar',()=>{
  const input=i=>.2*Math.sin(i*.02),clean=render('noise',{hiss:0,crackle:0},{input}).data[0];assert.ok(clean.every((v,i)=>v===Math.fround(input(i))));
  for(const patch of [{hiss:100,crackle:0},{hiss:0,crackle:100}]){const a=render('noise',patch,{input}).data[0],b=render('noise',patch,{input}).data[0];assert.deepEqual(a,b);assert.ok(energy(a.map((v,i)=>v-clean[i]))>1e-6);}
});
test('noise follows quiet picking and fully fades after the note',()=>{
  for(const rate of [44100,48000,96000]){
    const input=i=>i<rate*.2?.005*Math.sin(2*Math.PI*110*i/rate):0;
    const {data}=render('noise',{hiss:100,crackle:100},{rate,seconds:1.5,input});
    const difference=data[0].slice(0,Math.floor(rate*.2)).map((v,i)=>v-Math.fround(input(i)));
    assert.ok(energy(difference)>1e-8,'quiet note should open the texture at '+rate);
    assert.ok(data[0].slice(-Math.floor(rate*.1)).every(v=>v===0),'noise tail must stop at '+rate);
  }
});
test('noise tone changes the hiss spectrum',()=>{
  const low=render('noise',{hiss:100,crackle:0,tone:0},{input:()=>.2}).data[0],high=render('noise',{hiss:100,crackle:0,tone:100},{input:()=>.2}).data[0];
  const roughness=a=>energy(a.slice(1).map((v,i)=>v-a[i]));assert.ok(roughness(high)>roughness(low)*10);
});
test('bitcrusher limits resolution to the selected signed bit depth',()=>{
  const {data}=render('crusher',{bits:4,rate:48000},{input:i=>2*Math.sin(i*.03)});assert.equal(new Set(data[0]).size,16);assert.ok(data[0].every(v=>v>=-1&&v<=.875));
});
test('bitcrusher sample holding follows rate at integer and fractional ratios',()=>{
  for(const rate of [44100,48000,96000]){
    const low=render('crusher',{bits:16,rate:6000},{rate,input:i=>i/(rate*.1)*.8,seconds:.1}).data[0];let changes=0;for(let i=1;i<low.length;i++)if(low[i]!==low[i-1])changes++;
    assert.ok(changes>=598&&changes<=601,rate+': '+changes+' sample updates');
    const full=render('crusher',{bits:16,rate:48000},{rate,input:i=>Math.sin(i*.1),seconds:.1}).data[0];assert.ok(energy(low)>0);assert.ok(full.every(Number.isFinite));
  }
});
test('sub octave divides open-string frequencies rather than retaining the input octave',()=>{
  for(const rate of [44100,48000,96000])for(const hz of [82.4069,110,196,329.6276]){
    const {data}=render('octave',{tone:45},{rate,seconds:1,input:i=>.15*Math.sin(2*Math.PI*hz*i/rate)+.04*Math.sin(4*Math.PI*hz*i/rate)});
    const start=Math.floor(rate*.2),sub=bin(data[0],hz/2,rate,start),original=bin(data[0],hz,rate,start);
    assert.ok(sub>1e-5,`missing octave ${rate}/${hz}`);assert.ok(sub>original*4,`incorrect division ${rate}/${hz}`);
  }
});
test('sub octave tracks soft notes and releases without a stuck tone',()=>{
  for(const rate of [44100,48000,96000]){const {data}=render('octave',{}, {rate,seconds:1.2,input:i=>i<rate*.3?.005*Math.sin(2*Math.PI*110*i/rate):0});assert.ok(energy(data[0].slice(0,Math.floor(rate*.3)))>1e-7);assert.ok(data[0].slice(-1000).every(v=>Math.abs(v)<1e-8));}
});
test('auto-wah emphasis rises with picking strength',()=>{
  const rate=48000,signal=(i,level)=>level*(Math.sin(2*Math.PI*300*i/rate)+Math.sin(2*Math.PI*1600*i/rate));
  const soft=render('wah',{sensitivity:60,resonance:5},{input:i=>signal(i,.008),seconds:.5}).data[0],hard=render('wah',{sensitivity:60,resonance:5},{input:i=>signal(i,.12),seconds:.5}).data[0];
  const ratio=a=>bin(a,1600,rate,12000)/bin(a,300,rate,12000);assert.ok(ratio(hard)>ratio(soft)*5);
});
test('worklets preserve silent stereo channels and clear state on disconnected input',()=>{
  for(const name of ['crusher','wah']){const {data}=render(name,{}, {channels:2,input:(i,c)=>c?0:.2*Math.sin(i*.08)});assert.ok(data[1].every(v=>v===0));}
  for(const name of ['noise','crusher','octave','wah']){const {data}=render(name,{}, {seconds:.2,emptyAfter:4096});assert.ok(data[0].slice(4096).every(v=>v===0),name);}
});
test('extreme texture controls and variable render quanta stay finite and bounded',()=>{
  for(const rate of [44100,96000])for(const blockSize of [64,256])for(const [name,patch] of [['noise',{hiss:100,crackle:100,tone:100}],['crusher',{bits:4,rate:1000}],['octave',{tone:100}],['wah',{sensitivity:100,resonance:8}]]){
    const {data}=render(name,patch,{rate,blockSize,seconds:.15,input:i=>.8*(Math.sin(i*.04)+Math.sin(i*.071))});assert.ok(data[0].every(v=>Number.isFinite(v)&&Math.abs(v)<3),name+' '+rate);
  }
});

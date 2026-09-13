import test from 'node:test';
import assert from 'node:assert/strict';
import {AmpDSP,TanhADAA,logCosh,Oversampler4x,VOICE_IDS,halfBandKernel} from '../dist/amp-dsp.js';
import {MODELS,PRESETS,DEFAULT_SETTINGS,sanitizeSettings} from '../dist/settings.js';
import {rms,spectralMetrics,renderAmp,binPower} from './audio-analysis.mjs';

test('analytic saturation handles large values and cancellation without a finite curve endpoint',()=>{
  assert.ok(Number.isFinite(logCosh(1000)));assert.ok(Math.abs(logCosh(1000)-(1000-Math.LN2))<1e-10);
  for(const bias of [0,.12,-.14]){
    const shaper=new TanhADAA();assert.equal(shaper.process(0,bias),0);
    for(const x of [1e-12,1e-12+1e-14,.2,.20000000001,-.2,10,-10,1000,-1000])assert.ok(Number.isFinite(shaper.process(x,bias)));
    const one=new TanhADAA(),two=new TanhADAA();one.process(1);two.process(2);
    assert.ok(two.process(2)>one.process(1)+.1,'The curve does not hard-clamp its input at ±1');
  }
});

test('4x resampling has unity gain, known delay, a flat guitar band and a stopband guard',()=>{
  const os=new Oversampler4x(),impulse=Float64Array.from({length:256},(_,i)=>os.process(i===0?1:0,x=>x));
  const sum=impulse.reduce((a,b)=>a+b,0),delay=impulse.reduce((a,b,i)=>a+b*i,0)/sum;
  assert.ok(Math.abs(sum-1)<1e-8);assert.ok(Math.abs(delay-46.5)<1e-8);
  for(const hz of [80,1000,5000,8000])assert.ok(Math.abs(20*Math.log10(Math.sqrt(binPower(impulse,hz,48000))*impulse.length))<.05,hz+' Hz passband');
  const kernel=halfBandKernel(.2);let response=0,imaginary=0;for(let i=0;i<kernel.length;i++){response+=kernel[i]*Math.cos(Math.PI*.5*i);imaginary+=kernel[i]*Math.sin(Math.PI*.5*i);}
  assert.ok(Math.hypot(response,imaginary)<.0002,'Energy at the folding frequency is suppressed before decimation');
});

test('ADAA plus guarded 4x filtering reduces aliasing relative to ordinary 4x clipping',()=>{
  const frames=16384,bin=997,metrics={};
  for(const variant of ['naive','4x','4x-adaa']){
    const os=new Oversampler4x(),adaa=new TanhADAA(),output=new Float64Array(frames);
    const shape=variant==='4x-adaa'?x=>adaa.process(x*12):x=>Math.tanh(x*12);
    for(let i=0;i<frames+4096;i++){const x=Math.sin(2*Math.PI*bin*i/frames),y=variant==='naive'?shape(x):os.process(x,shape);if(i>=4096)output[i-4096]=y;}
    const m=spectralMetrics(output,bin);metrics[variant]=m.aliasPower/m.signalPower;
  }
  assert.ok(metrics['4x-adaa']<metrics['4x']/50,'At least 17 dB improvement over identical filtering without ADAA');
  assert.ok(metrics['4x-adaa']<metrics.naive/100000,'At least 50 dB improvement over base-rate direct clipping');
});

test('six voices remain finite for soft and hot input at 44.1, 48 and 96 kHz',()=>{
  assert.deepEqual(Object.keys(MODELS),VOICE_IDS);
  for(const rate of [44100,48000,96000])for(const model of VOICE_IDS)for(const amplitude of [.03,.25,.95]){
    const output=renderAmp(AmpDSP,{model,gain:100,bass:100,middle:100,treble:100,presence:100,power:100,sag:100,level:100,odEnabled:true,odDrive:100},{rate,amplitude,frames:2048,warmup:4096});
    assert.ok(output.every(x=>Number.isFinite(x)&&Math.abs(x)<8),model+' '+rate+' '+amplitude);assert.ok(rms(output)>1e-4);
  }
});

test('clean, breakup and high-gain voices have distinct harmonic and picking response',()=>{
  const clean=renderAmp(AmpDSP,{model:'clean',gain:22}),rock=renderAmp(AmpDSP,{model:'crunch',gain:65}),metal=renderAmp(AmpDSP,{model:'modern',gain:65});
  assert.ok(spectralMetrics(clean,113).thd<.02);assert.ok(spectralMetrics(rock,113).thd>.1);assert.ok(spectralMetrics(metal,113).thd>.2);
  const quiet=renderAmp(AmpDSP,{model:'edge',gain:65},{amplitude:.03}),hard=renderAmp(AmpDSP,{model:'edge',gain:65},{amplitude:.25});
  assert.ok(spectralMetrics(hard,113).thd>spectralMetrics(quiet,113).thd*5);
  assert.ok(rms(hard)>rms(quiet)*2&&rms(hard)<rms(quiet)*7,'Pick attack still changes loudness, with gradual compression');
  const lowGain=renderAmp(AmpDSP,{model:'edge',gain:15});assert.ok(spectralMetrics(lowGain,113).thd<spectralMetrics(hard,113).thd*.2);
});

test('tightness controls low-frequency drive before saturation',()=>{
  const response=(tightness,hz)=>{const out=renderAmp(AmpDSP,{model:'modern',gain:60,tightness},{amplitude:.001,input:i=>.001*Math.sin(2*Math.PI*hz*i/48000)});return Math.sqrt(binPower(out,hz,48000));};
  const loose=response(0,80)/response(0,1000),tight=response(100,80)/response(100,1000);
  assert.ok(tight<loose*.6);assert.ok(tight>0,'Low notes remain present');
});

test('physical-frequency response remains consistent across sample rates',()=>{
  for(const model of VOICE_IDS){
    const levels=[44100,48000,96000].map(rate=>rms(renderAmp(AmpDSP,{model,gain:60},{rate,frames:rate/5,warmup:rate/5,input:i=>.1*Math.sin(2*Math.PI*440*i/rate)})));
    assert.ok(20*Math.log10(Math.max(...levels)/Math.min(...levels))<.1,model+' within 0.1 dB at 440 Hz');
  }
});

test('power drive adds saturation and sag recovers with a bounded supply',()=>{
  const low=renderAmp(AmpDSP,{model:'clean',gain:30,power:0}),high=renderAmp(AmpDSP,{model:'clean',gain:30,power:100});
  assert.ok(spectralMetrics(high,113).thd>spectralMetrics(low,113).thd*2);
  const dsp=new AmpDSP(48000);dsp.configure({model:'edge',gain:75,sag:100,power:80});
  for(let i=0;i<12000;i++)dsp.process(.7*Math.sin(i*.13));assert.ok(dsp.supply<.98&&dsp.supply>.72);
  for(let i=0;i<48000;i++)dsp.process(0);assert.ok(dsp.supply>.999);assert.ok(Math.abs(dsp.process(0))<1e-8);
});

test('silence, model transitions and malformed samples do not create runaway/DC output',()=>{
  const dsp=new AmpDSP(48000);
  for(const model of VOICE_IDS){dsp.configure({model,gain:100,power:100,sag:100});for(let i=0;i<8192;i++)assert.ok(Math.abs(dsp.process(0))<.00002);}
  assert.equal(dsp.process(Infinity),0);assert.equal(dsp.process(NaN),0);
  const tone=renderAmp(AmpDSP,{model:'lead',gain:80},{frames:16384});assert.ok(Math.abs(tone.reduce((a,b)=>a+b,0)/tone.length)<.0001);
});

test('preset and stored settings include bounded amp response controls without erasing old tones',()=>{
  for(const key of ['tightness','sag','power']){
    assert.equal(sanitizeSettings({[key]:Infinity})[key],DEFAULT_SETTINGS[key]);assert.equal(sanitizeSettings({[key]:-1})[key],0);assert.equal(sanitizeSettings({[key]:101})[key],100);
  }
  assert.equal(sanitizeSettings({cabHighCut:1}).cabHighCut,3000);assert.equal(sanitizeSettings({cabHighCut:Infinity}).cabHighCut,8000);
  for(const id of VOICE_IDS)assert.ok(PRESETS.some(p=>p.settings.model===id),id+' has a factory example');
  assert.ok(PRESETS.some(p=>p.settings.cabinet==='greenback'));assert.ok(PRESETS.some(p=>p.settings.cabinet==='v30'));
  assert.equal(sanitizeSettings({model:'lead',gain:71}).gain,71);
});

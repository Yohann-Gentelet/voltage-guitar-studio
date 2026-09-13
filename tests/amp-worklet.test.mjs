import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {AmpDSP,VOICE_IDS} from '../dist/amp-dsp.js';

test('real worklet maps every control, handles render quanta, sleeps and resumes',()=>{
  let Processor;
  vm.runInNewContext(readFileSync(new URL('../dist/amp-worklet.js',import.meta.url),'utf8').replace(/^import .+;$/gm,''),{AmpDSP,VOICE_IDS,AudioWorkletProcessor:class{},sampleRate:48000,registerProcessor:(_,p)=>Processor=p});
  const worklet=new Processor(),params=Object.fromEntries(Processor.parameterDescriptors.map(p=>[p.name,Float32Array.of(p.defaultValue)]));params.model[0]=5;params.gain[0]=75;params.odEnabled[0]=1;
  for(const size of [64,128,256]){const input=Float32Array.from({length:size},(_,i)=>.1*Math.sin(i*.15)),output=[new Float32Array(size),new Float32Array(size)];assert.equal(worklet.process([[input]],[output],params),true);assert.ok(output[0].every(Number.isFinite));assert.deepEqual(output[0],output[1]);}
  assert.equal(worklet.controls.model,'modern');assert.equal(worklet.controls.odEnabled,true);
  const silence=[new Float32Array(128)],output=[new Float32Array(128)];for(let i=0;i<190;i++)worklet.process([silence],[output],params);
  assert.equal(worklet.sleeping,true);assert.ok(output[0].every(x=>x===0));
  params.model[0]=2;params.gain[0]=25;params.odEnabled[0]=0;worklet.process([silence],[output],params);
  const input=Float32Array.from({length:128},(_,i)=>.1*Math.sin(i*.2));for(let i=0;i<5;i++)worklet.process([[input]],[output],params);
  assert.equal(worklet.sleeping,false);assert.equal(worklet.controls.model,'edge');assert.ok(output[0].some(x=>Math.abs(x)>.01));
  worklet.process([[]],[output],params);assert.ok(output[0].every(x=>x===0));
});

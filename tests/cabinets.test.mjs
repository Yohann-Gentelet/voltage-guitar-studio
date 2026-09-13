import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cabinetCalibration,prepareCabinetBuffer,loadCabinetBuffers} from '../dist/cabinets.js';
import {binPower} from './audio-analysis.mjs';

const context={sampleRate:48000,createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {sampleRate,numberOfChannels:channels,length,getChannelData:c=>data[c]};}};
function decodePCM24(bytes){
  const buffer=Buffer.from(bytes);assert.equal(buffer.toString('ascii',0,4),'RIFF');assert.equal(buffer.toString('ascii',8,12),'WAVE');let rate,channels,bits,format,data;
  for(let offset=12;offset+8<=buffer.length;){const id=buffer.toString('ascii',offset,offset+4),size=buffer.readUInt32LE(offset+4),start=offset+8;if(id==='fmt '){format=buffer.readUInt16LE(start);channels=buffer.readUInt16LE(start+2);rate=buffer.readUInt32LE(start+4);bits=buffer.readUInt16LE(start+14);}if(id==='data')data=buffer.subarray(start,start+size);offset=start+size+(size%2);}
  assert.equal(format,1);assert.equal(channels,1);assert.equal(bits,24);assert.equal(rate,48000);
  const audio=context.createBuffer(1,data.length/3,rate);for(let i=0;i<audio.length;i++)audio.getChannelData(0)[i]=data.readIntLE(i*3,3)/8388608;return audio;
}
const bytes=id=>readFileSync(new URL('../dist/cabinets/'+id+'.wav',import.meta.url));
context.decodeAudioData=async input=>decodePCM24(input);

test('redistributed measured IRs decode, retain their onset and roll off high-frequency fizz',()=>{
  for(const id of ['greenback','v30']){
    const raw=decodePCM24(bytes(id)),prepared=prepareCabinetBuffer(context,raw,.085),h=prepared.getChannelData(0);
    assert.equal(h.length,4080);assert.ok(h.every(Number.isFinite));assert.ok(h.at(-1)===0);assert.ok(h.slice(0,32).some(x=>Math.abs(x)>.001));
    assert.ok(Math.abs(cabinetCalibration(h,48000)-1)<1e-6,'A common midrange reference controls level');
    const mids=(binPower(h,700,48000)+binPower(h,1000,48000)+binPower(h,1400,48000))/3;
    const high=(binPower(h,8000,48000)+binPower(h,10000,48000))/2;
    assert.ok(high<mids*.1,id+' upper-frequency rolloff');
  }
});

test('custom mono and stereo IRs use the same calibration without collapsing stereo',()=>{
  const raw=decodePCM24(bytes('greenback')),builtin=prepareCabinetBuffer(context,raw,.085),custom=prepareCabinetBuffer(context,raw);
  assert.equal(custom.length,raw.length);assert.ok(Math.abs(cabinetCalibration(custom.getChannelData(0),48000)-cabinetCalibration(builtin.getChannelData(0),48000))<1e-6);
  const stereo=context.createBuffer(2,512,48000);stereo.getChannelData(0)[0]=.2;stereo.getChannelData(1)[0]=.1;
  const result=prepareCabinetBuffer(context,stereo);assert.equal(result.numberOfChannels,2);assert.ok(Math.abs(result.getChannelData(0)[0]/result.getChannelData(1)[0]-2)<1e-7);
  const silent=context.createBuffer(2,512,48000);assert.ok(prepareCabinetBuffer(context,silent).getChannelData(1).every(x=>x===0));
});

test('one missing cabinet keeps the successful cabinet and reports only the failure',async()=>{
  const failed=[];const result=await loadCabinetBuffers(context,{onFailure:id=>failed.push(id),fetcher:async url=>({ok:!url.href.includes('v30'),arrayBuffer:async()=>bytes('greenback')})});
  assert.deepEqual(Object.keys(result),['greenback']);assert.deepEqual(failed,['v30']);
});

test('a stalled cabinet request times out so audio can use the modeled fallback',async()=>{
  const failed=[];const result=await loadCabinetBuffers(context,{timeoutMs:10,onFailure:id=>failed.push(id),fetcher:()=>new Promise(()=>{})});
  assert.deepEqual(result,{});assert.deepEqual(failed.sort(),['greenback','v30']);
});

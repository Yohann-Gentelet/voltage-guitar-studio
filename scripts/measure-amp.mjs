import {mkdirSync,writeFileSync} from 'node:fs';
import {AmpDSP,TanhADAA,Oversampler4x,VOICE_IDS} from '../dist/amp-dsp.js';
import {rms,spectralMetrics,renderAmp} from '../tests/audio-analysis.mjs';

// Isolated waveshaper comparison: identical input and resampling filters.
// This is a reproducible numerical benchmark, not a perceptual score or a
// reconstruction of the old browser-native WaveShaperNode implementation.
const frames=16384,bin=997,rate=48000,aliasDb={};
for(const variant of ['base-rate tanh','4x tanh','4x ADAA']){
  const os=new Oversampler4x(),adaa=new TanhADAA(),out=new Float64Array(frames);
  const shape=variant==='4x ADAA'?x=>adaa.process(12*x):x=>Math.tanh(12*x);
  for(let i=0;i<frames+4096;i++){
    const input=Math.sin(2*Math.PI*bin*i/frames);
    const output=variant==='base-rate tanh'?shape(input):os.process(input,shape);
    if(i>=4096)out[i-4096]=output;
  }
  const m=spectralMetrics(out,bin);
  aliasDb[variant]=10*Math.log10(m.aliasPower/m.signalPower);
}
const harmonicResponse=[];
for(const model of VOICE_IDS)for(const amplitude of [.03,.1,.25]){
  const out=renderAmp(AmpDSP,{model,gain:65},{amplitude});
  harmonicResponse.push({model,inputPeak:amplitude,outputRms:rms(out),thd:spectralMetrics(out,113).thd});
}
const sampleRateResponse=[];
for(const model of VOICE_IDS)for(const rate of [44100,48000,96000]){
  const out=renderAmp(AmpDSP,{model,gain:60},{rate,frames:rate/5,warmup:rate/5,input:i=>.1*Math.sin(2*Math.PI*440*i/rate)});
  sampleRateResponse.push({model,rate,outputRms:rms(out)});
}
const report={method:{sampleRate:rate,frames,warmupFrames:4096,sineHz:rate*bin/frames,drive:12,aliasDefinition:'Power outside DC and exact integer harmonics / total non-DC power. Coherent sine, rectangular FFT, no cabinet or other effects.'},aliasDb,harmonicResponse,sampleRateResponse,limits:'Synthetic double-precision amp-core renders; excludes native cabinet/effects/limiter processing. No real guitar listening, interface, browser CPU, or round-trip latency measurement.'};
const directory=new URL('../artifacts/',import.meta.url);
mkdirSync(directory,{recursive:true});writeFileSync(new URL('amp-report.json',directory),JSON.stringify(report,null,2)+'\n');
console.table(Object.entries(aliasDb).map(([variant,db])=>({variant,aliasDb:db.toFixed(2)})));
console.table(harmonicResponse.map(r=>({...r,outputRms:r.outputRms.toFixed(4),thd:(100*r.thd).toFixed(2)+'%'})));
console.log('Full measurements written to artifacts/amp-report.json. See docs/amp-model.md for interpretation.');

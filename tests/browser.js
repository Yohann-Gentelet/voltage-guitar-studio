import {createAmpGraph} from '/audio-engine.js';
import {DEFAULT_SETTINGS,PRESETS,clone} from '/settings.js';
const results=document.querySelector('#results');results.textContent='';let passed=0,failed=0;
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const report=(name,error)=>{const p=document.createElement('p');p.className=error?'fail':'pass';p.textContent=(error?'FAIL: ':'PASS: ')+name+(error?' — '+error.message:'');results.append(p);error?failed++:passed++;};
async function render(settings,{duration=1,amplitude=.15,tone=110,stop=duration,master=70}={}){
  const sampleRate=48000,ctx=new OfflineAudioContext(2,Math.floor(sampleRate*duration),sampleRate),graph=await createAmpGraph(ctx,settings);
  graph.setMaster(master,false);const buffer=ctx.createBuffer(1,Math.floor(sampleRate*duration),sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<Math.min(data.length,Math.floor(stop*sampleRate));i++)data[i]=amplitude*Math.sin(2*Math.PI*tone*i/sampleRate);
  const source=ctx.createBufferSource();source.buffer=buffer;source.connect(graph.input);graph.outputAnalyser.connect(ctx.destination);source.start();const output=await ctx.startRendering();graph.dispose();return output.getChannelData(0).slice();
}
const energy=(a,start=0)=>{let sum=0;for(let i=Math.floor(start*48000);i<a.length;i++)sum+=a[i]*a[i];return sum/a.length;};
const difference=(a,b)=>{let sum=0;for(let i=10000;i<a.length;i++)sum+=(a[i]-b[i])**2;return sum/a.length;};
async function check(name,fn){try{await fn();report(name);}catch(e){report(name,e);}}
await check('Silence stays silent',async()=>{const a=await render(clone(DEFAULT_SETTINGS),{amplitude:0});assert(a.every(v=>v===0),'nonzero silent output');});
for(const p of PRESETS)await check(p.name+' produces finite, bounded audio',async()=>{const a=await render(clone(p.settings));assert(a.every(v=>Number.isFinite(v)&&Math.abs(v)<=.971),'nonfinite/clipped output');assert(energy(a)>.000001,'silent output');});
await check('Output safety bounds a hot high-gain signal',async()=>{const s=clone(PRESETS[3].settings);s.gain=100;s.level=100;const a=await render(s,{amplitude:.95,master:100});assert(a.every(v=>Number.isFinite(v)&&Math.abs(v)<=.971),'overload exceeds ceiling');});
await check('Gate attenuates quiet input',async()=>{const s=clone(DEFAULT_SETTINGS);s.effects.gate.threshold=-30;s.effects.reverb.enabled=false;s.effects.compressor.enabled=false;const a=await render(s,{amplitude:.005});s.effects.gate.enabled=false;const b=await render(s,{amplitude:.005});assert(energy(a)<energy(b)*.01,'gate ineffective');});
await check('Amp model selection changes the waveform',async()=>{const s=clone(DEFAULT_SETTINGS);s.fxBypassed=true;const a=await render(s);s.model='lead';const b=await render(s);assert(difference(a,b)>1e-5,'models identical');});
for(const id of ['compressor','overdrive','chorus','phaser','tremolo','delay','reverb'])await check(id+' changes rendered audio',async()=>{const s=clone(DEFAULT_SETTINGS);Object.values(s.effects).forEach(e=>e.enabled=false);const a=await render(s,{tone:233});s.effects[id].enabled=true;const b=await render(s,{tone:233});assert(difference(a,b)>1e-8,'effect has no influence');});
await check('Delay leaves an audible echo after the source stops',async()=>{const s=clone(DEFAULT_SETTINGS);Object.values(s.effects).forEach(e=>e.enabled=false);s.effects.delay={enabled:true,time:350,feedback:45,mix:60};const a=await render(s,{duration:1.2,stop:.2});assert(energy(a,.3)>1e-6,'no delay tail');});
await check('Reverb leaves a room tail',async()=>{const s=clone(DEFAULT_SETTINGS);Object.values(s.effects).forEach(e=>e.enabled=false);s.effects.reverb={enabled:true,decay:2,tone:60,mix:60};const a=await render(s,{duration:1.2,stop:.2});assert(energy(a,.3)>1e-7,'no reverb tail');});
await check('Cabinet choice changes frequency response',async()=>{const s=clone(DEFAULT_SETTINGS);s.fxBypassed=true;s.cabinet='off';const a=await render(s,{tone:6000});s.cabinet='stack';const b=await render(s,{tone:6000});assert(energy(b)<energy(a)*.5,'cabinet not filtering highs');});
const summary=document.createElement('h2');summary.textContent=`${passed} passed · ${failed} failed`;results.prepend(summary);document.title=`Voltage tests: ${passed} passed, ${failed} failed`;

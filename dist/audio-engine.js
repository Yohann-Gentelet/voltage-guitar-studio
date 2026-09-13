import { clamp, dbToGain, makeCurve, createRoomImpulse, createDemoRiff } from './dsp.js';
import { MODELS } from './settings.js';

const initializingGraphs=new WeakSet();
const setParam=(param,value,ctx,time=0.02)=>{
  if(initializingGraphs.has(ctx)||ctx.currentTime===0){param.value=value;return;}
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value,ctx.currentTime,time);
};
const filter=(ctx,type,frequency,q=0.707)=>{const n=ctx.createBiquadFilter();n.type=type;n.frequency.value=frequency;n.Q.value=q;return n;};
const serial=(...nodes)=>{for(let i=0;i<nodes.length-1;i++)nodes[i].connect(nodes[i+1]);};
const effect=(ctx,first,last=first)=>{
  const input=ctx.createGain(),output=ctx.createGain(),dry=ctx.createGain(),wet=ctx.createGain();
  input.connect(dry).connect(output);input.connect(first);last.connect(wet).connect(output);
  return {input,output,dry,wet,setMix(mix){setParam(dry.gain,1-mix,ctx);setParam(wet.gain,mix,ctx);}};
};

export async function createAmpGraph(ctx,settings,{onLooper=()=>{},onError=()=>{}}={}) {
  await ctx.audioWorklet.addModule(new URL('./gate-worklet.js',import.meta.url));
  await ctx.audioWorklet.addModule(new URL('./texture-worklet.js',import.meta.url));
  initializingGraphs.add(ctx);
  const input=ctx.createGain();input.channelCount=1;input.channelCountMode='explicit';
  const inputTrim=ctx.createGain(),rawInputAnalyser=ctx.createAnalyser();rawInputAnalyser.fftSize=1024;
  const inputAnalyser=ctx.createAnalyser();inputAnalyser.fftSize=4096;
  const gate=new AudioWorkletNode(ctx,'voltage-gate',{outputChannelCount:[1]});
  gate.onprocessorerror=()=>onError('The noise gate stopped. Disconnect and reconnect the guitar.');
  const compressor=ctx.createDynamicsCompressor();compressor.attack.value=0.006;compressor.release.value=0.16;
  const compressorMakeup=ctx.createGain();compressor.connect(compressorMakeup);
  const comp=effect(ctx,compressor,compressorMakeup);
  const textureNodes=[];
  const textureNode=(processor,channels=2)=>{
    const node=new AudioWorkletNode(ctx,processor,{outputChannelCount:[channels]});
    node.onprocessorerror=()=>onError('A texture effect stopped. Disconnect and reconnect the guitar.');textureNodes.push(node);return node;
  };
  const octaveNode=textureNode('voltage-octave',1),octave=effect(ctx,octaveNode);
  const wahNode=textureNode('voltage-wah',1),wah=effect(ctx,wahNode);
  const odPre=ctx.createGain(),odShape=ctx.createWaveShaper(),odTone=filter(ctx,'lowpass',5000),odLevel=ctx.createGain();
  odShape.curve=makeCurve('overdrive');odShape.oversample='4x';odLevel.gain.value=0.65;
  serial(odPre,odShape,odTone,odLevel);const overdrive=effect(ctx,odPre,odLevel);
  const ampPre=ctx.createGain(),ampShape=ctx.createWaveShaper();ampShape.oversample='4x';
  const dcBlock=filter(ctx,'highpass',30);
  const bass=filter(ctx,'lowshelf',180),middle=filter(ctx,'peaking',750,0.8),treble=filter(ctx,'highshelf',2400),presence=filter(ctx,'peaking',3800,0.6),ampLevel=ctx.createGain();
  serial(ampPre,ampShape,dcBlock,bass,middle,treble,presence,ampLevel);const amp=effect(ctx,ampPre,ampLevel);
  const cabIn=ctx.createGain(),cabOut=ctx.createGain(),cabFilterGain=ctx.createGain(),cabDry=ctx.createGain(),cabIRGain=ctx.createGain();
  const cabHP=filter(ctx,'highpass',75),cabBody=filter(ctx,'peaking',160,0.8),cabLP=filter(ctx,'lowpass',5400,0.7),cabLP2=filter(ctx,'lowpass',6400,0.7),cabIR=ctx.createConvolver();
  serial(cabIn,cabHP,cabBody,cabLP,cabLP2,cabFilterGain,cabOut);
  cabIn.connect(cabDry).connect(cabOut);cabIn.connect(cabIR).connect(cabIRGain).connect(cabOut);
  const crusherNode=textureNode('voltage-crusher'),bitcrusher=effect(ctx,crusherNode);
  const noiseNode=textureNode('voltage-noise'),noise=effect(ctx,noiseNode);
  const chorusDelay=ctx.createDelay(0.1);chorusDelay.delayTime.value=0.018;
  const chorusLfo=ctx.createOscillator(),chorusDepth=ctx.createGain();chorusLfo.connect(chorusDepth).connect(chorusDelay.delayTime);chorusLfo.start();
  const chorus=effect(ctx,chorusDelay);
  const phasers=[300,600,1200,2400].map(hz=>filter(ctx,'allpass',hz,0.6));serial(...phasers);
  const phaserLfo=ctx.createOscillator(),phaserDepth=ctx.createGain();phaserLfo.connect(phaserDepth);
  phasers.forEach(n=>phaserDepth.connect(n.frequency));phaserLfo.start();const phaser=effect(ctx,phasers[0],phasers.at(-1));
  const tremoloGain=ctx.createGain(),tremoloLfo=ctx.createOscillator(),tremoloDepth=ctx.createGain();tremoloLfo.connect(tremoloDepth).connect(tremoloGain.gain);tremoloLfo.start();
  const tremolo=effect(ctx,tremoloGain);
  const ringGain=ctx.createGain(),ringCarrier=ctx.createOscillator(),ringDC=filter(ctx,'highpass',20),ringTone=filter(ctx,'lowpass',4500);
  ringGain.gain.value=0;ringCarrier.connect(ringGain.gain);ringCarrier.start();serial(ringGain,ringDC,ringTone);const ringmod=effect(ctx,ringGain,ringTone);
  const delayNode=ctx.createDelay(1.5),delayFeedback=ctx.createGain(),delayTone=filter(ctx,'lowpass',3500);serial(delayNode,delayTone,delayFeedback,delayNode);
  const delay=effect(ctx,delayNode);
  // Alternate convolvers allow a short crossfade while changing room length.
  const reverbIn=ctx.createGain(),reverbOut=ctx.createGain();
  const reverbs=[ctx.createConvolver(),ctx.createConvolver()],reverbGains=[ctx.createGain(),ctx.createGain()];
  reverbs.forEach((node,i)=>{reverbIn.connect(node).connect(reverbGains[i]).connect(reverbOut);reverbGains[i].gain.value=0;});
  const reverb=effect(ctx,reverbIn,reverbOut);
  const guitarMute=ctx.createGain();
  const looper=new AudioWorkletNode(ctx,'voltage-looper',{outputChannelCount:[2]});looper.port.onmessage=({data})=>onLooper(data);
  looper.onprocessorerror=()=>onError('The looper stopped. Disconnect and reconnect the guitar.');
  const master=ctx.createGain(),preLimiterAnalyser=ctx.createAnalyser(),limiter=ctx.createDynamicsCompressor(),safety=ctx.createWaveShaper(),outputAnalyser=ctx.createAnalyser();
  master.gain.value=0;preLimiterAnalyser.fftSize=1024;
  limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=0.001;limiter.release.value=0.08;
  safety.curve=Float32Array.from({length:4097},(_,i)=>clamp(i/2048-1,-0.97,0.97));
  outputAnalyser.fftSize=1024;
  serial(input,rawInputAnalyser,inputTrim,inputAnalyser,gate,comp.input);
  serial(comp.output,octave.input);serial(octave.output,wah.input);serial(wah.output,overdrive.input);serial(overdrive.output,amp.input);serial(amp.output,cabIn);
  serial(cabOut,bitcrusher.input);serial(bitcrusher.output,noise.input);serial(noise.output,chorus.input);serial(chorus.output,phaser.input);serial(phaser.output,tremolo.input);
  serial(tremolo.output,ringmod.input);serial(ringmod.output,delay.input);serial(delay.output,reverb.input);
  serial(reverb.output,looper,guitarMute,master,preLimiterAnalyser,limiter,safety,outputAnalyser);
  let lastModel,lastRoom,activeRoom=0,roomTimer;
  const graph={input,inputAnalyser,rawInputAnalyser,outputAnalyser,preLimiterAnalyser,master,guitarMute,looper,recordWet:outputAnalyser,recordDry:inputAnalyser,
    update(s){
      const model=MODELS[s.model];
      if(lastModel!==s.model){ampShape.curve=makeCurve(s.model);lastModel=s.model;}
      setParam(ampPre.gain,0.7+(s.gain/100)**1.7*model.drive,ctx);
      setParam(bass.gain,(s.bass-50)*0.24+model.low,ctx);setParam(middle.gain,(s.middle-50)*0.24+model.mid,ctx);setParam(treble.gain,(s.treble-50)*0.24+model.high,ctx);setParam(presence.gain,(s.presence-50)*0.16,ctx);
      setParam(ampLevel.gain,model.output*s.level/100,ctx);amp.setMix(s.ampEnabled?1:0);
      const cab=s.cabinet;const cabinet={open:[75,160,2,5500],british:[90,220,3,4700],stack:[85,130,4,3900]}[cab]||[75,160,2,5500];
      setParam(cabHP.frequency,cabinet[0],ctx);setParam(cabBody.frequency,cabinet[1],ctx);setParam(cabBody.gain,cabinet[2],ctx);setParam(cabLP.frequency,cabinet[3],ctx);setParam(cabLP2.frequency,cabinet[3]*1.2,ctx);
      setParam(cabFilterGain.gain,cab!=='off'&&cab!=='custom'?1:0,ctx);setParam(cabDry.gain,cab==='off'?1:0,ctx);setParam(cabIRGain.gain,cab==='custom'?1:0,ctx);
      const e=s.effects;const enabled=id=>!s.fxBypassed&&e[id].enabled;
      setParam(gate.parameters.get('enabled'),enabled('gate')?1:0,ctx);setParam(gate.parameters.get('threshold'),e.gate.threshold,ctx);setParam(gate.parameters.get('release'),e.gate.release,ctx);
      setParam(compressor.threshold,-12-e.compressor.amount*0.35,ctx);setParam(compressor.ratio,2+e.compressor.amount*0.08,ctx);setParam(compressor.knee,12,ctx);setParam(compressorMakeup.gain,dbToGain(e.compressor.makeup),ctx);comp.setMix(enabled('compressor')?1:0);
      setParam(octaveNode.parameters.get('tone'),e.octave.tone,ctx);octave.setMix(enabled('octave')?e.octave.mix/100:0);
      setParam(wahNode.parameters.get('sensitivity'),e.wah.sensitivity,ctx);setParam(wahNode.parameters.get('resonance'),e.wah.resonance,ctx);wah.setMix(enabled('wah')?e.wah.mix/100:0);
      setParam(odPre.gain,1+e.overdrive.drive*0.14,ctx);setParam(odTone.frequency,800+e.overdrive.tone*75,ctx);overdrive.setMix(enabled('overdrive')?1:0);
      setParam(crusherNode.parameters.get('bits'),e.bitcrusher.bits,ctx);setParam(crusherNode.parameters.get('rate'),e.bitcrusher.rate,ctx);bitcrusher.setMix(enabled('bitcrusher')?e.bitcrusher.mix/100:0);
      setParam(noiseNode.parameters.get('hiss'),e.noise.hiss,ctx);setParam(noiseNode.parameters.get('crackle'),e.noise.crackle,ctx);setParam(noiseNode.parameters.get('tone'),e.noise.tone,ctx);noise.setMix(enabled('noise')?1:0);
      setParam(chorusLfo.frequency,e.chorus.rate,ctx);setParam(chorusDepth.gain,e.chorus.depth*0.00006,ctx);chorus.setMix(enabled('chorus')?e.chorus.mix/100:0);
      setParam(phaserLfo.frequency,e.phaser.rate,ctx);setParam(phaserDepth.gain,e.phaser.depth*2.5,ctx);phaser.setMix(enabled('phaser')?e.phaser.mix/100:0);
      setParam(tremoloLfo.frequency,e.tremolo.rate,ctx);setParam(tremoloDepth.gain,e.tremolo.depth/200,ctx);setParam(tremoloGain.gain,1-e.tremolo.depth/200,ctx);tremolo.setMix(enabled('tremolo')?1:0);
      setParam(ringCarrier.frequency,e.ringmod.frequency,ctx);setParam(ringTone.frequency,400*24**(e.ringmod.tone/100),ctx);ringmod.setMix(enabled('ringmod')?e.ringmod.mix/100:0);
      setParam(delayNode.delayTime,e.delay.time/1000,ctx,0.05);setParam(delayFeedback.gain,e.delay.feedback/100,ctx);delay.setMix(enabled('delay')?e.delay.mix/100:0);
      const roomKey=`${e.reverb.decay}/${e.reverb.tone}`;
      clearTimeout(roomTimer);
      if(lastRoom!==roomKey){
        const assign=()=>{const next=1-activeRoom;reverbs[next].buffer=createRoomImpulse(ctx,e.reverb.decay,e.reverb.tone);setParam(reverbGains[next].gain,1,ctx,0.04);setParam(reverbGains[activeRoom].gain,0,ctx,0.04);activeRoom=next;lastRoom=roomKey;};
        if(!lastRoom)assign();else roomTimer=setTimeout(assign,140);
      }
      reverb.setMix(enabled('reverb')?e.reverb.mix/100:0);
    },
    setMaster(volume,muted){setParam(master.gain,muted?0:(volume/100)**1.6,ctx,0.008);},
    setTrim(db){setParam(inputTrim.gain,dbToGain(db),ctx);},
    setTuning(muted){setParam(guitarMute.gain,muted?0:1,ctx,0.008);},
    setIR(buffer){cabIR.buffer=buffer;},
    dispose(){clearTimeout(roomTimer);[chorusLfo,phaserLfo,tremoloLfo,ringCarrier].forEach(n=>n.stop());looper.port.close();gate.port.close();textureNodes.forEach(n=>n.port.close());}
  };
  graph.update(settings);initializingGraphs.delete(ctx);
  return graph;
}

export class GuitarEngine {
  constructor({onState=()=>{},onError=()=>{},onLooper=()=>{},onBeat=()=>{}}={}){this.onState=onState;this.onError=onError;this.onLooper=onLooper;this.onBeat=onBeat;this.channel=0;this.volume=35;this.muted=false;this.trim=0;this.tuning=false;this.outputId='';this.loopState={mode:'empty',duration:0};}
  async initialize(settings){
    this.latestSettings=settings;
    if(this.initializing)return this.initializing;
    if(this.ctx){await this.ctx.resume();return;}
    if(!globalThis.isSecureContext)throw new Error('Open Voltage over HTTPS or localhost to use live audio.');
    if(!globalThis.AudioContext)throw new Error('Web Audio is unavailable. Open Voltage in Chrome or Edge.');
    const ctx=new AudioContext({latencyHint:'interactive'});this.ctx=ctx;
    // Resume during the click, before worklet or permission awaits consume activation.
    const resume=ctx.resume();
    this.initializing=(async()=>{
      try{
        if(!ctx.audioWorklet)throw new Error('This browser cannot run the audio engine. Try the latest Chrome or Edge.');
        this.graph=await createAmpGraph(ctx,settings,{onError:this.onError,onLooper:data=>{this.loopState=data;this.onLooper(data);}});
        this.graph.update(this.latestSettings);
        this.graph.outputAnalyser.connect(ctx.destination);this.graph.setMaster(this.volume,this.muted);this.graph.setTrim(this.trim);this.graph.setTuning(this.tuning);
        if(this.customIR)this.graph.setIR(await ctx.decodeAudioData(this.customIR.slice(0)));
        if(this.outputId && ctx.setSinkId)await ctx.setSinkId(this.outputId);
        ctx.onstatechange=()=>this.onState();
        await resume;this.onState();
      }catch(error){this.graph?.dispose();this.graph=null;await ctx.close();this.ctx=null;throw error;}finally{this.initializing=null;}
    })();
    return this.initializing;
  }
  async connect(settings,deviceId,channel=0){
    await this.initialize(settings);
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Audio input is unavailable. Open Voltage in Chrome or Edge over HTTPS or localhost.');
    let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),channelCount:{ideal:2},echoCancellation:false,noiseSuppression:false,autoGainControl:false,latency:{ideal:0}},video:false});}
    catch(error){const messages={NotAllowedError:'Audio access was blocked. Allow microphone access for Voltage in your browser, then reconnect.',NotFoundError:'No audio input found. Connect your USB audio interface and try again.',NotReadableError:'The audio input is busy or unavailable. Close other audio apps and reconnect.',OverconstrainedError:'That input is unavailable. Select System default or reconnect your interface.'};throw new Error(messages[error.name]||error.message);}
    // Keep the old input alive until the replacement was successfully acquired.
    this.stopInput();this.stopDemo();this.stream=stream;this.channel=channel;
    this.source=this.ctx.createMediaStreamSource(stream);this.splitter=this.ctx.createChannelSplitter(2);this.source.connect(this.splitter);
    const channels=stream.getAudioTracks()[0].getSettings().channelCount;
    if(channels===1)this.channel=0;
    this.splitter.connect(this.graph.input,this.channel);
    stream.getAudioTracks()[0].onended=()=>{if(this.stream===stream){this.stopInput();this.onError('Your audio interface disconnected. Reconnect it and choose Connect guitar.');this.onState();}};
    this.onState();
  }
  setChannel(channel){this.channel=channel;if(this.splitter){this.splitter.disconnect();this.splitter.connect(this.graph.input,channel);}}
  stopInput(){if(this.stream){this.stream.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;}this.source?.disconnect();this.splitter?.disconnect();this.source=null;this.splitter=null;}
  async disconnect(){
    this.stopInput();this.stopDemo();this.stopMetronome();
    if(this.recorder?.state==='recording')await this.stopRecording();
    this.graph?.dispose();this.graph=null;
    if(this.ctx){this.ctx.onstatechange=null;await this.ctx.close();this.ctx=null;}
    this.loopState={mode:'empty',duration:0};this.onLooper(this.loopState);this.onState();
  }
  update(settings){this.latestSettings=settings;this.graph?.update(settings);}
  setVolume(volume){this.volume=volume;this.graph?.setMaster(volume,this.muted);}
  setMuted(muted){this.muted=muted;this.graph?.setMaster(this.volume,muted);}
  setTrim(trim){this.trim=trim;this.graph?.setTrim(trim);}
  setTuning(muted){this.tuning=muted;this.graph?.setTuning(muted);}
  async setOutput(id){if(!this.ctx?.setSinkId)throw new Error('Choose your output device in your computer’s sound settings.');await this.ctx.setSinkId(id);this.outputId=id;this.onState();}
  async loadIR(file){
    if(!this.ctx)throw new Error('Connect your guitar or start the demo before loading a cabinet IR.');
    if(file.size>10*1024*1024)throw new Error('Choose an impulse response smaller than 10 MB.');
    const bytes=await file.arrayBuffer();let buffer;
    try{buffer=await this.ctx.decodeAudioData(bytes.slice(0));}catch{throw new Error('This file is not supported audio. Try a WAV cabinet impulse response.');}
    if(buffer.duration>2)throw new Error('Cabinet impulse responses must be 2 seconds or shorter.');
    if(buffer.numberOfChannels>2)throw new Error('Choose a mono or stereo cabinet impulse response.');
    this.customIR=bytes;this.customIRId=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');this.graph.setIR(buffer);
  }
  async startDemo(settings){await this.initialize(settings);if(this.stream)throw new Error('Disconnect the guitar before starting the demo riff.');if(this.demo)return;this.demo=this.ctx.createBufferSource();this.demo.buffer=createDemoRiff(this.ctx);this.demo.loop=true;this.demo.connect(this.graph.input);this.demo.start();this.onState();}
  stopDemo(){if(this.demo){this.demo.stop();this.demo.disconnect();this.demo=null;this.onState();}}
  startRecording(format='processed'){
    if(!this.graph||(!this.stream&&!this.demo))throw new Error('Connect your guitar or start the demo before recording.');
    if(!globalThis.MediaRecorder)throw new Error('Recording is unavailable in this browser. Try Chrome or Edge.');
    if(this.recorder?.state==='recording')return;
    const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
    this.recordDestination=this.ctx.createMediaStreamDestination();this.recordSource=format==='dry'?this.graph.recordDry:this.graph.recordWet;this.recordSource.connect(this.recordDestination);
    this.recorder=new MediaRecorder(this.recordDestination.stream,mime?{mimeType:mime}:{});
    this.chunks=[];
    this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
    this.recordResult=new Promise((resolve,reject)=>{
      this.recorder.onstop=()=>{this.recordSource?.disconnect(this.recordDestination);this.recordDestination.stream.getTracks().forEach(t=>t.stop());const type=this.recorder.mimeType;const blob=new Blob(this.chunks,{type});this.chunks=[];this.recordSource=null;this.recordDestination=null;resolve({blob,extension:type.includes('ogg')?'ogg':type.includes('mp4')?'m4a':'webm'});};
      this.recorder.onerror=e=>reject(e.error||new Error('Recording failed.'));
    });
    this.recordResult.catch(error=>this.onError(error.message));this.recorder.start(1000);this.recordStarted=performance.now();
  }
  async stopRecording(){if(this.recorder?.state==='recording')this.recorder.stop();return this.recordResult;}
  looperAction(action){if(!this.graph)throw new Error('Connect your guitar or start the demo before using the looper.');this.graph.looper.port.postMessage({action});}
  startMetronome(bpm){
    this.bpm=bpm;if(this.metroTimer)return;
    this.nextBeat=this.ctx.currentTime+0.05;this.beat=0;this.beatTimers=new Set();this.clicks=new Set();
    const schedule=()=>{
      if(this.ctx.state!=='running')return;
      if(this.nextBeat<this.ctx.currentTime-0.1)this.nextBeat=this.ctx.currentTime+0.03;
      while(this.nextBeat<this.ctx.currentTime+0.12){
        const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.frequency.value=this.beat%4===0?1200:800;gain.gain.setValueAtTime(0.12,this.nextBeat);gain.gain.exponentialRampToValueAtTime(0.001,this.nextBeat+0.05);osc.connect(gain).connect(this.graph.master);osc.start(this.nextBeat);osc.stop(this.nextBeat+0.06);this.clicks.add(osc);osc.onended=()=>{this.clicks.delete(osc);osc.disconnect();gain.disconnect();};
        const beat=this.beat%4;const timer=setTimeout(()=>{this.beatTimers.delete(timer);this.onBeat(beat);},Math.max(0,(this.nextBeat-this.ctx.currentTime)*1000));this.beatTimers.add(timer);
        this.nextBeat+=60/this.bpm;this.beat++;
      }
    };schedule();this.metroTimer=setInterval(schedule,25);this.onState();
  }
  stopMetronome(){clearInterval(this.metroTimer);this.metroTimer=null;this.beatTimers?.forEach(clearTimeout);this.beatTimers?.clear();this.clicks?.forEach(osc=>{try{osc.stop();}catch{}});this.onState();}
}

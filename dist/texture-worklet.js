// Small, allocation-free processors for the audio rendering thread.
const control=(name,defaultValue,minValue,maxValue)=>({name,defaultValue,minValue,maxValue,automationRate:'k-rate'});
const limit=(value,min,max)=>Math.max(min,Math.min(max,value));

class VoltageNoise extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [control('hiss',25,0,100),control('crackle',18,0,100),control('tone',45,0,100)];}
  constructor(){super();this.envelope=0;this.seed=0x196409;this.air=new Float64Array(2);this.dust=new Float64Array(2);}
  random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
  process(inputs,outputs,parameters){
    const input=inputs[0]||[],output=outputs[0];if(!output?.length)return true;
    const attack=Math.exp(-1/(sampleRate*.003)),release=Math.exp(-1/(sampleRate*.12));
    const hiss=.045*(parameters.hiss[0]/100)**1.5,crackle=parameters.crackle[0]/100;
    const alpha=1-Math.exp(-2*Math.PI*(550+parameters.tone[0]*95)/sampleRate);
    const dustDecay=Math.exp(-1/(sampleRate*.0008));
    for(let i=0;i<output[0].length;i++){
      let peak=0;for(let c=0;c<input.length;c++)peak=Math.max(peak,Math.abs(input[c][i]||0));
      const coefficient=peak>this.envelope?attack:release;
      this.envelope=peak+(this.envelope-peak)*coefficient;
      if(peak<1e-7&&this.envelope<.0001)this.envelope=0;
      const activity=limit((this.envelope-.001)/.035,0,1);
      for(let c=0;c<output.length;c++){
        const x=input[c]?.[i]??input[0]?.[i]??0;
        this.air[c]+=alpha*(this.random()*2-1-this.air[c]);
        this.dust[c]*=dustDecay;
        if(this.random()<crackle*36/sampleRate)this.dust[c]+=(this.random()*2-1)*crackle*.13;
        // Add texture without attenuating the dry guitar. Silent input adds nothing.
        output[c][i]=x+activity*(this.air[c]*hiss+this.dust[c]);
      }
    }
    if(!input.length){this.envelope=0;this.air.fill(0);this.dust.fill(0);for(const channel of output)channel.fill(0);}
    return true;
  }
}
registerProcessor('voltage-noise',VoltageNoise);

class VoltageCrusher extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [control('bits',8,4,16),control('rate',6000,1000,48000)];}
  constructor(){super();this.phase=1;this.held=new Float64Array(2);}
  process(inputs,outputs,parameters){
    const input=inputs[0]||[],output=outputs[0];if(!output?.length)return true;
    const steps=2**(Math.round(parameters.bits[0])-1),rate=Math.min(parameters.rate[0],sampleRate)/sampleRate;
    for(let i=0;i<output[0].length;i++){
      const capture=this.phase>=1;if(capture)this.phase-=Math.floor(this.phase);
      for(let c=0;c<output.length;c++){
        if(capture)this.held[c]=limit(Math.round((input[c]?.[i]??input[0]?.[i]??0)*steps),-steps,steps-1)/steps;
        output[c][i]=this.held[c];
      }
      this.phase+=rate;
    }
    if(!input.length){this.held.fill(0);this.phase=1;for(const channel of output)channel.fill(0);}
    return true;
  }
}
registerProcessor('voltage-crusher',VoltageCrusher);

class VoltageOctave extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [control('tone',35,0,100)];}
  constructor(){
    super();this.low1=0;this.low2=0;this.dc=0;this.envelope=0;this.detectorEnvelope=0;
    this.armed=false;this.sign=1;this.toneState=0;this.elapsed=100000;
  }
  process(inputs,outputs,parameters){
    const input=inputs[0]||[],output=outputs[0];if(!output?.length)return true;
    const tracking=1-Math.exp(-2*Math.PI*650/sampleRate),dc=1-Math.exp(-2*Math.PI*25/sampleRate);
    const tone=1-Math.exp(-2*Math.PI*(90+parameters.tone[0]*12)/sampleRate);
    const attack=Math.exp(-1/(sampleRate*.002)),release=Math.exp(-1/(sampleRate*.075));
    const refractory=sampleRate/1400;
    for(let i=0;i<output[0].length;i++){
      const x=input[0]?.[i]??0;
      this.dc+=dc*(x-this.dc);this.low1+=tracking*(x-this.dc-this.low1);this.low2+=tracking*(this.low1-this.low2);
      const peak=Math.abs(x),detectorPeak=Math.abs(this.low2);
      this.envelope=peak+(this.envelope-peak)*(peak>this.envelope?attack:release);
      this.detectorEnvelope=detectorPeak+(this.detectorEnvelope-detectorPeak)*(detectorPeak>this.detectorEnvelope?attack:release);
      const threshold=Math.max(.0003,this.detectorEnvelope*.06);this.elapsed++;
      if(this.low2 < -threshold)this.armed=true;
      if(this.armed&&this.low2>threshold&&this.elapsed>=refractory){this.sign=-this.sign;this.armed=false;this.elapsed=0;}
      // Stop a stale divider on silence or invalid/very slow crossings.
      const active=this.envelope>.001&&this.elapsed<sampleRate/40;
      this.toneState+=tone*((active?this.sign*this.envelope*.9:0)-this.toneState);
      if(Math.abs(this.toneState)<1e-10)this.toneState=0;
      for(const channel of output)channel[i]=this.toneState;
      if(peak<1e-7&&this.envelope<.0001){this.envelope=0;this.detectorEnvelope=0;this.armed=false;this.sign=1;}
    }
    if(!input.length){this.low1=0;this.low2=0;this.dc=0;this.envelope=0;this.detectorEnvelope=0;this.toneState=0;this.armed=false;this.sign=1;this.elapsed=100000;for(const channel of output)channel.fill(0);}
    return true;
  }
}
registerProcessor('voltage-octave',VoltageOctave);

class VoltageWah extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [control('sensitivity',50,0,100),control('resonance',3,1,8)];}
  constructor(){super();this.envelope=0;this.frequency=220;this.ic1=new Float64Array(2);this.ic2=new Float64Array(2);this.tick=0;this.a1=0;this.a2=0;this.a3=0;}
  process(inputs,outputs,parameters){
    const input=inputs[0]||[],output=outputs[0];if(!output?.length)return true;
    const attack=Math.exp(-1/(sampleRate*.0015)),release=Math.exp(-1/(sampleRate*.075));
    const smoothing=1-Math.exp(-1/(sampleRate*.006)),sensitivity=2+parameters.sensitivity[0]*.25,k=1/parameters.resonance[0];
    for(let i=0;i<output[0].length;i++){
      let peak=0;for(let c=0;c<input.length;c++)peak=Math.max(peak,Math.abs(input[c][i]||0));
      this.envelope=peak+(this.envelope-peak)*(peak>this.envelope?attack:release);
      const target=220*14**limit(this.envelope*sensitivity,0,1);this.frequency+=smoothing*(target-this.frequency);
      if(this.tick++%16===0){
        // Topology-preserving state-variable bandpass; normalized resonant gain.
        const g=Math.tan(Math.PI*Math.min(this.frequency,sampleRate*.2)/sampleRate);
        this.a1=1/(1+g*(g+k));this.a2=g*this.a1;this.a3=g*this.a2;
      }
      for(let c=0;c<output.length;c++){
        const x=input[c]?.[i]??input[0]?.[i]??0,v3=x-this.ic2[c];
        const v1=this.a1*this.ic1[c]+this.a2*v3,v2=this.ic2[c]+this.a2*this.ic1[c]+this.a3*v3;
        this.ic1[c]=2*v1-this.ic1[c];this.ic2[c]=2*v2-this.ic2[c];output[c][i]=k*v1;
        if(Math.abs(this.ic1[c])+Math.abs(this.ic2[c])<1e-12){this.ic1[c]=0;this.ic2[c]=0;}
      }
    }
    if(!input.length){this.ic1.fill(0);this.ic2.fill(0);this.envelope=0;for(const channel of output)channel.fill(0);}
    return true;
  }
}
registerProcessor('voltage-wah',VoltageWah);

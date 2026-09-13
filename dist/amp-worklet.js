import { AmpDSP, VOICE_IDS } from './amp-dsp.js';
const control=(name,value,min=0,max=100)=>({name,defaultValue:value,minValue:min,maxValue:max,automationRate:'k-rate'});
class VoltageAmp extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [control('model',0,0,5),control('enabled',1,0,1),control('gain',30),control('bass',50),control('middle',50),control('treble',60),control('presence',50),control('level',65),control('tightness',45),control('sag',35),control('power',35),control('odEnabled',0,0,1),control('odDrive',32),control('odTone',55)];}
  constructor(){super();this.dsp=new AmpDSP(sampleRate);this.controls={};this.wasConnected=false;this.silentFrames=0;this.sleeping=false;}
  process(inputs,outputs,params){
    const input=inputs[0]?.[0],output=outputs[0];if(!output?.length)return true;
    for(const key in params)this.controls[key]=params[key][0];
    this.controls.model=VOICE_IDS[Math.round(this.controls.model)]||'clean';this.controls.enabled=this.controls.enabled>=.5;this.controls.odEnabled=this.controls.odEnabled>=.5;
    this.dsp.configure(this.controls);
    if(!input){if(this.wasConnected)this.dsp.reset(true);this.wasConnected=false;this.silentFrames=0;for(const channel of output)channel.fill(0);return true;}
    this.wasConnected=true;
    let silent=true;for(let i=0;i<input.length;i++)if(input[i]!==0){silent=false;break;}
    this.silentFrames=silent?this.silentFrames+input.length:0;
    // After half a second of exact digital silence, coupling/filter tails are
    // inaudible. Sleep to avoid processing an empty studio (and denormals).
    if(this.silentFrames>=sampleRate*.5){if(!this.sleeping)this.dsp.reset(true);this.sleeping=true;for(const channel of output)channel.fill(0);return true;}
    this.sleeping=false;
    for(let i=0;i<output[0].length;i++){const y=this.dsp.process(input[i]||0);for(let c=0;c<output.length;c++)output[c][i]=y;}
    return true;
  }
}
registerProcessor('voltage-amp',VoltageAmp);

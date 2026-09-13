class VoltageGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{name:'threshold',defaultValue:-55,minValue:-100,maxValue:0,automationRate:'k-rate'}, {name:'release',defaultValue:110,minValue:10,maxValue:1000,automationRate:'k-rate'}, {name:'enabled',defaultValue:1,minValue:0,maxValue:1,automationRate:'k-rate'}];
  }
  constructor() { super(); this.envelope=0; this.gain=0; this.open=false; }
  process(inputs,outputs,params) {
    const input=inputs[0],output=outputs[0];
    if (!output?.length) return true;
    const threshold=10**(params.threshold[0]/20);
    const release=Math.exp(-1/(sampleRate*params.release[0]/1000));
    const attack=Math.exp(-1/(sampleRate*0.001));
    const envelopeRelease=Math.exp(-1/(sampleRate*0.02));
    for (let i=0;i<output[0].length;i++) {
      let peak=0;
      for (let channel=0;channel<input.length;channel++) peak=Math.max(peak,Math.abs(input[channel][i]||0));
      this.envelope = peak>this.envelope ? peak : this.envelope*envelopeRelease;
      if (this.envelope>threshold) this.open=true;
      else if (this.envelope<threshold*0.65) this.open=false;
      const target=params.enabled[0]<0.5 || this.open ? 1 : 0;
      const coefficient=target>this.gain ? attack : release;
      this.gain=target+(this.gain-target)*coefficient;
      for (let channel=0;channel<output.length;channel++) output[channel][i]=(input[channel]?.[i]||0)*this.gain;
    }
    return true;
  }
}
registerProcessor('voltage-gate',VoltageGate);

class VoltageLooper extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity=Math.floor(sampleRate*60);
    this.buffers=[new Float32Array(this.capacity),new Float32Array(this.capacity)];
    this.mode='empty'; this.length=0; this.position=0;
    this.port.onmessage=({data})=>{
      if(data.action==='record'){this.length=0;this.position=0;this.mode='recording';}
      if(data.action==='play' && this.length>128){this.mode='playing';this.position=0;}
      if(data.action==='overdub' && this.length>128){this.mode='overdubbing';}
      if(data.action==='finish' && this.mode==='recording') {
        if(this.length>sampleRate*0.1){this.mode='playing';this.position=0;this.fadeSeam();}else{this.mode='empty';this.length=0;}
      }else if(data.action==='finish' && this.mode==='overdubbing')this.mode='playing';
      if(data.action==='stop')this.mode=this.length>128?'stopped':'empty';
      if(data.action==='clear'){this.mode='empty';this.length=0;this.position=0;}
      this.report();
    };
  }
  fadeSeam(){
    const fade=Math.min(256,Math.floor(this.length/8));
    for(let c=0;c<2;c++) for(let i=0;i<fade;i++){this.buffers[c][i]*=i/fade;this.buffers[c][this.length-1-i]*=i/fade;}
  }
  report(){this.port.postMessage({mode:this.mode,duration:this.length/sampleRate});}
  process(inputs,outputs) {
    const input=inputs[0],output=outputs[0];
    if(!output?.length)return true;
    for(let i=0;i<output[0].length;i++) {
      const recording=this.mode==='recording';
      const playing=this.mode==='playing'||this.mode==='overdubbing';
      for(let c=0;c<output.length;c++) {
        const live=input[c]?.[i]??input[0]?.[i]??0;
        const old=playing?this.buffers[c][this.position]:0;
        if(recording)this.buffers[c][this.length]=live;
        if(this.mode==='overdubbing')this.buffers[c][this.position]=Math.max(-1,Math.min(1,old*0.97+live));
        output[c][i]=live+old;
      }
      if(recording){
        this.length++;
        if(this.length>=this.capacity){this.mode='playing';this.position=0;this.fadeSeam();this.report();}
      }else if(playing)this.position=(this.position+1)%this.length;
    }
    return true;
  }
}
registerProcessor('voltage-looper',VoltageLooper);

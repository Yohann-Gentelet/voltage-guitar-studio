// Original behavioural amp model. See docs/amp-model.md for equations and sources.
// The rendering thread and offline tests use exactly this implementation.
export const VOICE_IDS=['clean','chime','edge','crunch','lead','modern'];
export const AMP_VOICES={
  clean: {gains:[1.7,1,1],range:[2.0,0,0],mix:[1,0,0],bias:[.025,0,0],cuts:[35,35,35],high:11000,low:1,mid:-1.5,top:1,output:.82,sag:.35},
  chime: {gains:[2.2,1.25,1],range:[3.2,1.4,0],mix:[1,1,0],bias:[.12,-.06,0],cuts:[45,75,35],high:8800,low:-1,mid:-.5,top:1.5,output:.65,sag:.65},
  edge: {gains:[1.8,1.2,1],range:[2.8,1.8,0],mix:[1,1,0],bias:[.10,-.08,0],cuts:[35,50,30],high:9300,low:1,mid:1.2,top:-.5,output:.72,sag:.9},
  crunch: {gains:[2.6,1.6,1.05],range:[4.0,2.2,1.0],mix:[1,1,1],bias:[.10,-.12,.045],cuts:[50,95,50],high:7900,low:.5,mid:2,top:-.5,output:.61,sag:.65},
  lead: {gains:[3.0,2.2,1.45],range:[4.8,3.0,2.0],mix:[1,1,1],bias:[.08,-.14,.035],cuts:[65,125,65],high:7400,low:1,mid:.5,top:0,output:.55,sag:.45},
  modern: {gains:[2.8,2.1,1.6],range:[4.6,3.1,2.2],mix:[1,1,1],bias:[.045,-.09,.02],cuts:[65,150,70],high:7200,low:1.5,mid:-.5,top:.5,output:.53,sag:.15}
};
const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
export function logCosh(x){const a=Math.abs(x);return a+Math.log1p(Math.exp(-2*a))-Math.LN2;}

// First-order antiderivative antialiasing. The primitive is evaluated at the
// driven input, so changing gain never mixes antiderivatives of different curves.
export class TanhADAA {
  constructor(){this.previous=0;this.primitive=0;this.bias=0;this.started=false;}
  process(x,bias=0,mix=1){
    const v=x+bias,previousV=this.previous+bias,F=logCosh(v);
    // Use the SAME bias for both integration endpoints when switching voices.
    // Otherwise a changing bias can create a pulse even with zero guitar input.
    const previousF=this.started&&bias===this.bias?this.primitive:logCosh(previousV);
    const delta=x-this.previous,mid=(v+previousV)*.5;
    const nonlinear=Math.abs(delta)<1e-5?Math.tanh(mid):(F-previousF)/delta;
    const offset=Math.tanh(bias),slope=1-offset*offset;
    const linear=(x+this.previous)*.5;
    const result=linear+mix*((nonlinear-offset)/slope-linear);
    this.previous=x;this.primitive=F;this.bias=bias;this.started=true;return result;
  }
  reset(){this.previous=0;this.primitive=0;this.bias=0;this.started=false;}
}

// 63-tap Blackman-windowed sinc. Half-band interpolation and a more conservative
// 0.20-cycle decimation cutoff leave a guard band before each folding frequency.
export function halfBandKernel(cutoff=.25){
  const h=new Float64Array(63);let sum=0;
  for(let i=0;i<h.length;i++){
    const m=i-31,w=.42-.5*Math.cos(2*Math.PI*i/62)+.08*Math.cos(4*Math.PI*i/62);
    h[i]=m===0?2*cutoff:Math.sin(2*Math.PI*cutoff*m)/(Math.PI*m)*w;if(Math.abs(h[i])<1e-15)h[i]=0;sum+=h[i];
  }
  for(let i=0;i<h.length;i++)h[i]/=sum;return h;
}
const HALF_BAND=halfBandKernel();
const DECIMATION=halfBandKernel(.20);
class FIR {
  constructor(kernel=HALF_BAND){this.data=new Float64Array(64);this.index=0;this.taps=[];for(let i=0;i<kernel.length;i++)if(kernel[i]!==0)this.taps.push([i,kernel[i]]);}
  process(x){this.data[this.index]=x;let y=0;for(let i=0;i<this.taps.length;i++){const t=this.taps[i];y+=t[1]*this.data[(this.index-t[0])&63];}this.index=(this.index+1)&63;return y;}
  reset(){this.data.fill(0);this.index=0;}
}
export class Oversampler4x {
  constructor(){this.up1=new FIR();this.up2=new FIR();this.down2=new FIR(DECIMATION);this.down1=new FIR(DECIMATION);}
  process(x,processor){
    let result=0;
    for(let a=0;a<2;a++){
      const u=this.up1.process(a===0?2*x:0);let d=0;
      for(let b=0;b<2;b++){const value=processor(this.up2.process(b===0?2*u:0));const filtered=this.down2.process(value);if(b===0)d=filtered;}
      const filtered=this.down1.process(d);if(a===0)result=filtered;
    }
    return result;
  }
  reset(){this.up1.reset();this.up2.reset();this.down2.reset();this.down1.reset();}
}

// Trapezoidal one-pole RC; its coefficient and state remain well-behaved at
// every supported rate. Used for coupling capacitors and interstage bandwidth.
class RC {
  constructor(rate,hz){this.rate=rate;this.state=0;this.set(hz,true);}
  set(hz,immediate=false){const g=Math.tan(Math.PI*bound(hz,1,this.rate*.4)/this.rate);this.target=g/(1+g);if(immediate)this.a=this.target;}
  low(x){this.a+=(this.target-this.a)*.001;const v=(x-this.state)*this.a,y=v+this.state;this.state=y+v;return y;}
  high(x){return x-this.low(x);}
  reset(){this.state=0;}
}
// RBJ bilinear-transform biquads, coefficients normalized by a0.
export function biquadCoefficients(type,hz,q,db,rate){
  const w=2*Math.PI*bound(hz,1,rate*.45)/rate,c=Math.cos(w),s=Math.sin(w),A=10**(db/40),alpha=s/(2*q),root=2*Math.sqrt(A)*alpha;
  let b0,b1,b2,a0,a1,a2;
  if(type==='peaking'){b0=1+alpha*A;b1=-2*c;b2=1-alpha*A;a0=1+alpha/A;a1=-2*c;a2=1-alpha/A;}
  else if(type==='lowshelf'){b0=A*((A+1)-(A-1)*c+root);b1=2*A*((A-1)-(A+1)*c);b2=A*((A+1)-(A-1)*c-root);a0=(A+1)+(A-1)*c+root;a1=-2*((A-1)+(A+1)*c);a2=(A+1)+(A-1)*c-root;}
  else {b0=A*((A+1)+(A-1)*c+root);b1=-2*A*((A-1)+(A+1)*c);b2=A*((A+1)+(A-1)*c-root);a0=(A+1)-(A-1)*c+root;a1=2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-root;}
  return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
}
class Biquad {
  constructor(){this.c=Float64Array.of(1,0,0,0,0);this.target=this.c.slice();this.x1=0;this.x2=0;this.y1=0;this.y2=0;}
  set(type,hz,q,db,rate,immediate=false){this.target.set(biquadCoefficients(type,hz,q,db,rate));if(immediate)this.c.set(this.target);}
  process(x){const c=this.c;for(let i=0;i<5;i++)c[i]+=(this.target[i]-c[i])*.001;const y=c[0]*x+c[1]*this.x1+c[2]*this.x2-c[3]*this.y1-c[4]*this.y2;this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}
  reset(){this.x1=this.x2=this.y1=this.y2=0;}
}

export class AmpDSP {
  constructor(rate,{oversample=true,antialias=true}={}){
    this.rate=rate;this.internalRate=rate*(oversample?4:1);this.oversample=oversample;this.antialias=antialias;
    this.os=new Oversampler4x();this.shapers=Array.from({length:5},()=>new TanhADAA());
    this.coupling=Array.from({length:3},()=>new RC(this.internalRate,60));this.band=Array.from({length:3},()=>new RC(this.internalRate,8500));
    this.odBass=new RC(this.internalRate,340);this.odTreble=new RC(this.internalRate,5000);this.dc=new RC(this.internalRate,18);this.finalLP=new RC(this.internalRate,14000);
    this.eq=Array.from({length:4},()=>new Biquad());this.current=new Float64Array(15);this.target=new Float64Array(15);this.lastKey='';this.initialized=false;this.supply=1;
    this.smooth=1-Math.exp(-1/(this.internalRate*.02));this.supplyAttack=1-Math.exp(-1/(this.internalRate*.025));this.supplyRelease=1-Math.exp(-1/(this.internalRate*.14));
    this.rendered=false;this.renderInternal=x=>this.processInternal(x);
    this.configure({});
  }
  configure(p){
    const model=AMP_VOICES[p.model]||AMP_VOICES.clean,g=bound((p.gain??30)/100,0,1),tight=bound((p.tightness??45)/100,0,1),power=bound((p.power??35)/100,0,1);
    const key=[p.model,g,tight,p.bass,p.middle,p.treble,p.presence,p.power,p.level,p.sag,p.enabled,p.odEnabled,p.odDrive,p.odTone].join('/');
    if(key===this.lastKey)return;this.lastKey=key;const first=!this.rendered;
    for(let i=0;i<3;i++){
      this.target[i]=model.gains[i]+model.range[i]*g*g;
      this.target[i+3]=model.mix[i];this.target[i+6]=model.bias[i];
      this.coupling[i].set(model.cuts[i]*(.55+tight*1.2),first);this.band[i].set(model.high*(i===0?1.3:1),first);
    }
    this.target[9]=model.output*bound((p.level??65)/100,0,1);
    this.target[10]=.85+power*2.2;this.target[11]=bound((p.sag??35)/100,0,1)*model.sag;
    this.target[12]=p.enabled===false?0:1;this.target[13]=p.odEnabled?1:0;this.target[14]=1.5+bound((p.odDrive??32)/100,0,1)*5;
    this.odTreble.set(1800*4**bound((p.odTone??55)/100,0,1),first);
    this.eq[0].set('lowshelf',150,.707,((p.bass??50)-50)*.18+model.low,this.internalRate,first);
    this.eq[1].set('peaking',750,.65,((p.middle??50)-50)*.2+model.mid,this.internalRate,first);
    this.eq[2].set('highshelf',2400,.707,((p.treble??60)-50)*.16+model.top,this.internalRate,first);
    this.eq[3].set('highshelf',3600,.707,((p.presence??50)-50)*.12,this.internalRate,first);
    if(first)this.current.set(this.target);this.initialized=true;
  }
  shape(index,x,bias=0,mix=1){
    if(this.antialias)return this.shapers[index].process(x,bias,mix);
    const t=Math.tanh(bias);return x+mix*((Math.tanh(x+bias)-t)/(1-t*t)-x);
  }
  processInternal(input){
    const c=this.current;for(let i=0;i<c.length;i++)c[i]+=(this.target[i]-c[i])*this.smooth;
    // Mid-emphasis before the pedal's clipping, with some low end retained.
    const pedalInput=input-this.odBass.low(input)*.78;
    const pedal=this.odTreble.low(this.shape(0,pedalInput*c[14]))*.72;
    let x=input+(pedal-input)*c[13],dry=x;
    for(let i=0;i<3;i++)x=this.band[i].low(this.shape(i+1,this.coupling[i].high(x)*c[i],c[i+6],c[i+3]));
    for(let i=0;i<3;i++)x=this.eq[i].process(x);
    // Bounded normalized RC supply approximation. Load is rectified signal,
    // not a claim to solve a particular transformer/rectifier circuit.
    const load=bound(Math.abs(x)*.55,0,1),targetSupply=1-c[11]*.28*load;
    this.supply+=(targetSupply-this.supply)*(targetSupply<this.supply?this.supplyAttack:this.supplyRelease);
    const drive=c[10],headroom=this.supply;
    x=this.shape(4,x*drive/headroom)*headroom/Math.sqrt(drive);
    x=this.eq[3].process(x);x=this.finalLP.low(this.dc.high(x))*c[9];
    return dry+(x-dry)*c[12];
  }
  process(input){
    this.rendered=true;
    if(!Number.isFinite(input)){this.reset();return 0;}
    const result=this.oversample?this.os.process(input,this.renderInternal):this.processInternal(input);
    if(!Number.isFinite(result)){this.reset();return 0;}return result;
  }
  reset(settle=false){this.os.reset();for(const s of this.shapers)s.reset();for(const f of [...this.coupling,...this.band,this.odBass,this.odTreble,this.dc,this.finalLP,...this.eq])f.reset();this.supply=1;if(settle){this.rendered=false;this.lastKey='';}}
}

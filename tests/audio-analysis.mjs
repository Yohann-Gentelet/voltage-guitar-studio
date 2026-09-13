// Deterministic signal measurements, independent of the browser UI.
export function spectrum(data){
  const n=data.length;if(n&(n-1))throw new Error('FFT length must be a power of two');
  const re=Float64Array.from(data),im=new Float64Array(n);
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const t=re[i];re[i]=re[j];re[j]=t;}}
  for(let length=2;length<=n;length*=2){const angle=-2*Math.PI/length,wr=Math.cos(angle),wi=Math.sin(angle);for(let start=0;start<n;start+=length){let ur=1,ui=0;for(let j=0;j<length/2;j++){const a=start+j,b=a+length/2,tr=ur*re[b]-ui*im[b],ti=ur*im[b]+ui*re[b];re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;}}}
  return Float64Array.from({length:n/2},(_,k)=>(re[k]*re[k]+im[k]*im[k])/(n*n));
}
export function rms(data,start=0){let sum=0;for(let i=start;i<data.length;i++)sum+=data[i]*data[i];return Math.sqrt(sum/(data.length-start));}
export function binPower(data,hz,rate,start=0){let real=0,imaginary=0;for(let i=start;i<data.length;i++){const phase=2*Math.PI*hz*i/rate;real+=data[i]*Math.cos(phase);imaginary-=data[i]*Math.sin(phase);}return(real*real+imaginary*imaginary)/(data.length-start)**2;}
export function spectralMetrics(data,fundamentalBin){const power=spectrum(data);let total=0,harmonics=0;for(let i=1;i<power.length;i++)total+=power[i];for(let i=fundamentalBin;i<power.length;i+=fundamentalBin)harmonics+=power[i];return {aliasPower:Math.max(0,total-harmonics),signalPower:total,thd:Math.sqrt(Math.max(0,harmonics-power[fundamentalBin])/power[fundamentalBin])};}
export function renderAmp(AmpDSP,params,{rate=48000,frames=16384,warmup=8192,amplitude=.1,bin=113,input,options}={}){
  const dsp=new AmpDSP(rate,options);dsp.configure(params);const signal=input||((i)=>amplitude*Math.sin(2*Math.PI*bin*i/frames));
  const output=new Float64Array(frames);for(let i=0;i<warmup+frames;i++){const y=dsp.process(signal(i));if(i>=warmup)output[i-warmup]=y;}return output;
}

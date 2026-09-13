export const CABINETS={
  open:{name:'1×12 Open · modeled',kind:'filter'},
  british:{name:'2×12 British · modeled',kind:'filter'},
  stack:{name:'4×12 Stack · modeled',kind:'filter'},
  greenback:{name:'4×12 Greenback · measured',kind:'ir',file:'greenback.wav',fallback:'british'},
  v30:{name:'4×12 Vintage 30 · measured',kind:'ir',file:'v30.wav',fallback:'stack'},
  off:{name:'Cabinet off',kind:'off'}
};

// RMS response across a common midrange band matches cabinet level without
// destroying resonances. ConvolverNode.normalize is disabled for these buffers.
function cabinetBandRms(data,rate){
  let energy=0;const frequencies=[350,500,700,1000,1400,2000,2800];
  for(const hz of frequencies){let real=0,imaginary=0;const step=2*Math.PI*hz/rate;for(let n=0;n<data.length;n++){real+=data[n]*Math.cos(step*n);imaginary-=data[n]*Math.sin(step*n);}energy+=real*real+imaginary*imaginary;}
  return Math.sqrt(energy/frequencies.length);
}
export function cabinetCalibration(data,rate){const rms=cabinetBandRms(data,rate);return rms>1e-8?.8/rms:1;}
export function prepareCabinetBuffer(context,decoded,seconds=Infinity){
  const frames=Math.min(decoded.length,Math.round(context.sampleRate*seconds)),channels=Math.min(2,decoded.numberOfChannels);
  const buffer=context.createBuffer(channels,frames,context.sampleRate),fade=Math.min(frames,Math.round(context.sampleRate*.01));let energy=0;
  for(let c=0;c<channels;c++){
    const data=buffer.getChannelData(c),source=decoded.getChannelData(c);
    for(let i=0;i<frames;i++)data[i]=source[i]*(frames===decoded.length||i<frames-fade?1:.5-.5*Math.cos(Math.PI*(frames-1-i)/fade));
    energy+=cabinetBandRms(data,context.sampleRate)**2;
  }
  const rms=Math.sqrt(energy/channels),gain=rms>1e-8?.8/rms:1;
  for(let c=0;c<channels;c++){const data=buffer.getChannelData(c);for(let i=0;i<frames;i++)data[i]*=gain;}
  return buffer;
}
export async function loadCabinetBuffers(context,{fetcher=fetch,timeoutMs=6000,onFailure=()=>{}}={}){
  const requests=Object.entries(CABINETS).filter(([,cab])=>cab.file);
  const entries=await Promise.allSettled(requests.map(async([id,cab])=>{
    const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Cabinet download timed out'));},timeoutMs);});
    try{
      const load=async()=>{
        const response=await fetcher(new URL('./cabinets/'+cab.file,import.meta.url),{signal:controller.signal});
        if(!response.ok)throw new Error('Cabinet download failed: '+id);
        const decoded=await context.decodeAudioData(await response.arrayBuffer());
        return [id,prepareCabinetBuffer(context,decoded,.085)];
      };
      return await Promise.race([load(),timeout]);
    }finally{clearTimeout(timer);}
  }));
  entries.forEach((result,i)=>{if(result.status==='rejected')onFailure(requests[i][0]);});
  return Object.fromEntries(entries.filter(result=>result.status==='fulfilled').map(result=>result.value));
}

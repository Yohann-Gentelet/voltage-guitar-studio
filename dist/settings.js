import { clamp } from './dsp.js';

export const EFFECTS = [
  { id:'gate', name:'Noise Gate', description:'Keep the quiet quiet.', color:'#afbd98', bg:'#2a302b', params:[['threshold','Threshold',-80,-10,1,'dB'],['release','Release',20,400,1,'ms']] },
  { id:'compressor', name:'Compressor', description:'A little more sustain.', color:'#d1bc8b', bg:'#342f26', params:[['amount','Sustain',0,100,1,'%'],['makeup','Level',0,12,0.5,'dB']] },
  { id:'overdrive', name:'Overdrive', description:'Push it into color.', color:'#d89978', bg:'#362c27', params:[['drive','Drive',0,100,1,'%'],['tone','Tone',0,100,1,'%']] },
  { id:'chorus', name:'Chorus', description:'Give it some motion.', color:'#a8b5d2', bg:'#2a2f3a', params:[['rate','Rate',0.1,5,0.1,'Hz'],['depth','Depth',0,100,1,'%'],['mix','Mix',0,75,1,'%']] },
  { id:'phaser', name:'Phaser', description:'Sweep through the spectrum.', color:'#c2a4ce', bg:'#322b37', params:[['rate','Rate',0.1,5,0.1,'Hz'],['depth','Sweep',0,100,1,'%'],['mix','Mix',0,75,1,'%']] },
  { id:'tremolo', name:'Tremolo', description:'A pulse of warm movement.', color:'#cea3a6', bg:'#362a2d', params:[['rate','Rate',0.5,15,0.1,'Hz'],['depth','Depth',0,100,1,'%']] },
  { id:'delay', name:'Delay', description:'Let it echo.', color:'#9fbbb5', bg:'#273431', params:[['time','Time',50,1200,1,'ms'],['feedback','Feedback',0,85,1,'%'],['mix','Mix',0,70,1,'%']] },
  { id:'reverb', name:'Reverb', description:'Make a little space.', color:'#b9afcc', bg:'#302c37', params:[['decay','Decay',0.2,6,0.1,'s'],['tone','Tone',0,100,1,'%'],['mix','Mix',0,75,1,'%']] }
];
export const MODELS = {
  clean: {name:'American Clean',tag:'WIDE & BRIGHT',drive:3,output:0.9,low:1,mid:-2,high:1},
  chime: {name:'British Chime',tag:'SPARKLE & BITE',drive:6,output:0.72,low:-2,mid:1,high:3},
  crunch: {name:'Vintage Crunch',tag:'WARM & RAW',drive:12,output:0.6,low:1,mid:3,high:-1},
  lead: {name:'Modern High Gain',tag:'HEAVY & FOCUSED',drive:30,output:0.5,low:2,mid:-1,high:0}
};
export const DEFAULT_SETTINGS = {
  model:'clean', ampEnabled:true, cabinet:'open', gain:30, bass:50, middle:50, treble:60, presence:50, level:65,
  fxBypassed:false,
  effects:{
    gate:{enabled:true,threshold:-55,release:110},
    compressor:{enabled:true,amount:28,makeup:2},
    overdrive:{enabled:false,drive:32,tone:55},
    chorus:{enabled:false,rate:0.9,depth:45,mix:30},
    phaser:{enabled:false,rate:0.6,depth:55,mix:40},
    tremolo:{enabled:false,rate:4.5,depth:55},
    delay:{enabled:false,time:350,feedback:30,mix:22},
    reverb:{enabled:true,decay:1.5,tone:55,mix:18}
  }
};
export const clone = value => JSON.parse(JSON.stringify(value));
function preset(id,name,subtitle,description,icon,color,patch={}) {
  const settings = clone(DEFAULT_SETTINGS);
  const {effects,...amp}=patch;
  Object.assign(settings,amp);
  for (const [key,value] of Object.entries(effects||{})) Object.assign(settings.effects[key],value);
  return {id,name,subtitle,description,icon,color,settings};
}
export const PRESETS = [
  preset('california','California Clean','CLEAN · SPACIOUS','Open, glassy chords with a little room to breathe.','Ⅰ','#b9c5a5'),
  preset('british','British Invasion','CHIME · EDGE','Bright harmonics, jangling chords, and just enough bite.','Ⅱ','#cdb884',{model:'chime',gain:43,bass:44,middle:58,treble:64,cabinet:'british',effects:{reverb:{mix:14,decay:1.2},compressor:{amount:20}}}),
  preset('blues','Midnight Blues','CRUNCH · WARM','A touch-sensitive breakup for bends that hang in the air.','Ⅲ','#9aafb9',{model:'crunch',gain:38,bass:58,middle:65,treble:44,presence:38,effects:{delay:{enabled:true,time:180,feedback:16,mix:12},reverb:{mix:12},compressor:{enabled:false}}}),
  preset('heavy','Heavy Weather','HIGH GAIN · TIGHT','Focused low end and a wall of harmonically rich distortion.','Ⅳ','#cd9989',{model:'lead',gain:66,bass:59,middle:36,treble:57,presence:62,cabinet:'stack',effects:{gate:{threshold:-44,release:65},compressor:{enabled:false},overdrive:{enabled:true,drive:18,tone:62},reverb:{mix:7,decay:0.7}}}),
  preset('dream','Dream Sequence','AMBIENT · WIDE','Slow movement, soft echoes, and a room without walls.','Ⅴ','#b6a7cc',{gain:24,bass:44,treble:53,effects:{chorus:{enabled:true,rate:0.5,depth:62,mix:40},delay:{enabled:true,time:540,feedback:48,mix:32},reverb:{decay:4.8,tone:40,mix:48}}}),
  preset('haze','Violet Haze','DRIVE · PSYCHEDELIC','Saturated sustain with a slow, swirling sweep.','Ⅵ','#c2a8bc',{model:'crunch',gain:57,middle:65,presence:40,cabinet:'british',effects:{overdrive:{enabled:true,drive:75,tone:38},phaser:{enabled:true,rate:0.35,depth:75,mix:48},reverb:{mix:23,decay:2.4}}})
];

export function sanitizeSettings(value) {
  const settings=clone(DEFAULT_SETTINGS);
  if (!value || typeof value!=='object') return settings;
  if (Object.hasOwn(MODELS,value.model)) settings.model=value.model;
  if (['open','british','stack','off','custom'].includes(value.cabinet)) settings.cabinet=value.cabinet;
  if(typeof value.customIRId==='string'&&/^[a-f0-9]{64}$/.test(value.customIRId))settings.customIRId=value.customIRId;
  for (const key of ['gain','bass','middle','treble','presence','level']) if (Number.isFinite(value[key])) settings[key]=clamp(value[key],0,100);
  for (const key of ['ampEnabled','fxBypassed']) if (typeof value[key]==='boolean') settings[key]=value[key];
  for (const effect of EFFECTS) {
    const source=value.effects?.[effect.id];
    if (!source || typeof source!=='object') continue;
    if (typeof source.enabled==='boolean') settings.effects[effect.id].enabled=source.enabled;
    for (const [key,,min,max] of effect.params) if(Number.isFinite(source[key])) settings.effects[effect.id][key]=clamp(source[key],min,max);
  }
  return settings;
}

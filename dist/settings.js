import { clamp } from './dsp.js';
import { PRESET_FOLDERS, ORIGINAL_FOLDERS, EXTRA_PRESETS } from './preset-pack.js';
import { CABINETS } from './cabinets.js';
export { PRESET_FOLDERS } from './preset-pack.js';

export const EFFECTS = [
  { id:'gate', name:'Noise Gate', description:'Keep the quiet quiet.', color:'#afbd98', bg:'#2a302b', params:[['threshold','Threshold',-80,-10,1,'dB'],['release','Release',20,400,1,'ms']] },
  { id:'compressor', name:'Compressor', description:'A little more sustain.', color:'#d1bc8b', bg:'#342f26', params:[['amount','Sustain',0,100,1,'%'],['makeup','Level',0,12,0.5,'dB']] },
  { id:'octave', name:'Sub Octave', description:'Synth bass for single-note riffs.', color:'#b0c48d', bg:'#2d3327', params:[['tone','Tone',0,100,1,'%'],['mix','Mix',0,75,1,'%']] },
  { id:'wah', name:'Auto Wah', description:'A filter that follows your picking.', color:'#dbc17c', bg:'#373224', params:[['sensitivity','Sensitivity',0,100,1,'%'],['resonance','Resonance',1,8,0.1,'Q'],['mix','Mix',0,100,1,'%']] },
  { id:'overdrive', name:'Overdrive', description:'Push it into color.', color:'#d89978', bg:'#362c27', params:[['drive','Drive',0,100,1,'%'],['tone','Tone',0,100,1,'%']] },
  { id:'bitcrusher', name:'Bitcrusher', description:'Grainy digital crunch and aliasing.', color:'#cca382', bg:'#362d28', params:[['bits','Resolution',4,16,1,'bit'],['rate','Sample rate',1000,48000,500,'Hz'],['mix','Mix',0,100,1,'%']] },
  { id:'noise', name:'Noise & Dust', description:'Hiss and crackle that follow your playing.', color:'#b6ac92', bg:'#302f29', params:[['hiss','Hiss',0,100,1,'%'],['crackle','Crackle',0,100,1,'%'],['tone','Tone',0,100,1,'%']] },
  { id:'chorus', name:'Chorus', description:'Give it some motion.', color:'#a8b5d2', bg:'#2a2f3a', params:[['rate','Rate',0.1,5,0.1,'Hz'],['depth','Depth',0,100,1,'%'],['mix','Mix',0,75,1,'%']] },
  { id:'phaser', name:'Phaser', description:'Sweep through the spectrum.', color:'#c2a4ce', bg:'#322b37', params:[['rate','Rate',0.1,5,0.1,'Hz'],['depth','Sweep',0,100,1,'%'],['mix','Mix',0,75,1,'%']] },
  { id:'tremolo', name:'Tremolo', description:'A pulse of warm movement.', color:'#cea3a6', bg:'#362a2d', params:[['rate','Rate',0.5,15,0.1,'Hz'],['depth','Depth',0,100,1,'%']] },
  { id:'ringmod', name:'Ring Mod', description:'Metallic bells and robot tones.', color:'#94c4ce', bg:'#263439', params:[['frequency','Carrier',20,1200,1,'Hz'],['tone','Tone',0,100,1,'%'],['mix','Mix',0,100,1,'%']] },
  { id:'delay', name:'Delay', description:'Let it echo.', color:'#9fbbb5', bg:'#273431', params:[['time','Time',50,1200,1,'ms'],['feedback','Feedback',0,85,1,'%'],['mix','Mix',0,70,1,'%']] },
  { id:'reverb', name:'Reverb', description:'Make a little space.', color:'#b9afcc', bg:'#302c37', params:[['decay','Decay',0.2,6,0.1,'s'],['tone','Tone',0,100,1,'%'],['mix','Mix',0,75,1,'%']] }
];
export const MODELS = {
  clean: {name:'American Clean',tag:'OPEN & DYNAMIC'},
  chime: {name:'British Chime',tag:'SPARKLE & BITE'},
  edge: {name:'Tube Breakup',tag:'LIGHT DRIVE · SOFT TOUCH'},
  crunch: {name:'Vintage Crunch',tag:'CLASSIC ROCK'},
  lead: {name:'Modern High Gain',tag:'SUSTAIN & BODY'},
  modern: {name:'Tight Metal',tag:'FOCUSED & PERCUSSIVE'}
};
export const DEFAULT_SETTINGS = {
  model:'clean', ampEnabled:true, cabinet:'open', gain:30, bass:50, middle:50, treble:60, presence:50, level:65,
  tightness:45,sag:35,power:35,cabHighCut:8000,
  fxBypassed:false,
  effects:{
    gate:{enabled:true,threshold:-55,release:110},
    compressor:{enabled:true,amount:28,makeup:2},
    octave:{enabled:false,tone:35,mix:35},
    wah:{enabled:false,sensitivity:50,resonance:3,mix:65},
    overdrive:{enabled:false,drive:32,tone:55},
    bitcrusher:{enabled:false,bits:8,rate:6000,mix:55},
    noise:{enabled:false,hiss:25,crackle:18,tone:45},
    chorus:{enabled:false,rate:0.9,depth:45,mix:30},
    phaser:{enabled:false,rate:0.6,depth:55,mix:40},
    tremolo:{enabled:false,rate:4.5,depth:55},
    ringmod:{enabled:false,frequency:80,tone:65,mix:35},
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
// Version 2 factory voicing does not rewrite the user's saved knob settings.
const AMP_REVOICING={
  california:{gain:22,power:18,tightness:25},
  british:{cabinet:'greenback',power:38,cabHighCut:7800},
  blues:{model:'edge',gain:58,level:62,tightness:30,sag:65,power:45,cabinet:'greenback',cabHighCut:7600},
  heavy:{gain:72,level:60,bass:52,middle:45,treble:51,presence:44,tightness:65,sag:12,power:25,cabinet:'v30',cabHighCut:6500,effects:{overdrive:{drive:8,tone:57}}},
  haze:{gain:62,tightness:45,sag:45,power:48,cabinet:'greenback',cabHighCut:6500,effects:{overdrive:{drive:35}}},
  'garage-afterhours':{gain:44,power:28,cabinet:'greenback',cabHighCut:7500},
  'shoegaze-bloom':{gain:48,power:55,sag:55,tightness:30,cabinet:'greenback',cabHighCut:7000},
  'porch-slapback':{model:'edge',gain:18,power:15,sag:30,tightness:30},
  'neck-pickup-jazz':{gain:15,power:10,tightness:20},
  'copper-boost':{model:'edge',gain:65,power:42,sag:55,cabinet:'greenback',cabHighCut:7200,effects:{overdrive:{drive:16}}},
  'desert-pulse':{gain:50,power:45,cabinet:'greenback',cabHighCut:7000},
  'spiral-lead':{model:'lead',gain:52,tightness:48,sag:35,power:40,cabinet:'greenback',cabHighCut:7200,effects:{overdrive:{drive:22}}},
  'iron-rhythm':{model:'modern',gain:78,level:62,bass:53,middle:54,treble:50,presence:43,tightness:70,sag:7,power:22,cabinet:'v30',cabHighCut:6500,effects:{overdrive:{enabled:false}}},
  'low-orbit':{gain:62,power:45,tightness:35,sag:50,cabinet:'v30',cabHighCut:6200,effects:{overdrive:{drive:24}}},
  afterburner:{gain:65,power:36,tightness:55,sag:30,cabinet:'v30',cabHighCut:6800},
  'pixel-riot':{model:'modern',gain:58,power:25,tightness:65,sag:12,cabinet:'v30',cabHighCut:6200},
  'molten-sweep':{gain:73,power:65,tightness:25,sag:65,cabinet:'greenback',cabHighCut:6000,effects:{overdrive:{drive:32}}}
};
export const PRESETS = [
  preset('california','California Clean','CLEAN · SPACIOUS','Open, glassy chords with a little room to breathe.','Ⅰ','#b9c5a5'),
  preset('british','British Invasion','CHIME · EDGE','Bright harmonics, jangling chords, and just enough bite.','Ⅱ','#cdb884',{model:'chime',gain:43,bass:44,middle:58,treble:64,cabinet:'british',effects:{reverb:{mix:14,decay:1.2},compressor:{amount:20}}}),
  preset('blues','Midnight Blues','CRUNCH · WARM','A touch-sensitive breakup for bends that hang in the air.','Ⅲ','#9aafb9',{model:'crunch',gain:38,bass:58,middle:65,treble:44,presence:38,effects:{delay:{enabled:true,time:180,feedback:16,mix:12},reverb:{mix:12},compressor:{enabled:false}}}),
  preset('heavy','Heavy Weather','HIGH GAIN · TIGHT','Focused low end and a wall of harmonically rich distortion.','Ⅳ','#cd9989',{model:'lead',gain:66,bass:59,middle:36,treble:57,presence:62,cabinet:'stack',effects:{gate:{threshold:-44,release:65},compressor:{enabled:false},overdrive:{enabled:true,drive:18,tone:62},reverb:{mix:7,decay:0.7}}}),
  preset('dream','Dream Sequence','AMBIENT · WIDE','Slow movement, soft echoes, and a room without walls.','Ⅴ','#b6a7cc',{gain:24,bass:44,treble:53,effects:{chorus:{enabled:true,rate:0.5,depth:62,mix:40},delay:{enabled:true,time:540,feedback:48,mix:32},reverb:{decay:4.8,tone:40,mix:48}}}),
  preset('haze','Violet Haze','DRIVE · PSYCHEDELIC','Saturated sustain with a slow, swirling sweep.','Ⅵ','#c2a8bc',{model:'crunch',gain:57,middle:65,presence:40,cabinet:'british',effects:{overdrive:{enabled:true,drive:75,tone:38},phaser:{enabled:true,rate:0.35,depth:75,mix:48},reverb:{mix:23,decay:2.4}}}),
  preset('jangle-club','Jangle Club','INDIE · JANGLE','Bright, chiming rhythm with even picking and a hint of chorus. Try your bridge pickup.','Ⅶ','#bfd0a0',{
    model:'chime',gain:20,bass:35,middle:46,treble:60,presence:54,level:68,cabinet:'british',
    effects:{gate:{threshold:-64,release:170},compressor:{amount:42,makeup:2},chorus:{enabled:true,rate:0.8,depth:25,mix:15},reverb:{decay:1.1,tone:62,mix:16}}
  }),
  preset('bedroom-tape','Bedroom Tape','INDIE · LO-FI','Soft highs and a slow chorus wobble for intimate chords. Try your neck pickup.','Ⅷ','#c9b291',{
    model:'clean',gain:28,bass:48,middle:53,treble:36,presence:25,level:68,cabinet:'open',
    effects:{gate:{threshold:-66,release:230},compressor:{amount:36,makeup:2},chorus:{enabled:true,rate:0.6,depth:67,mix:38},reverb:{decay:2.2,tone:28,mix:23}}
  }),
  preset('garage-afterhours','Garage Afterhours','INDIE · GARAGE','Dry, wiry crunch with a short slapback. Dig in for a ragged rhythm sound.','Ⅸ','#d6a183',{
    model:'crunch',gain:40,bass:39,middle:62,treble:57,presence:48,level:61,cabinet:'british',
    effects:{gate:{threshold:-55,release:120},compressor:{enabled:false},delay:{enabled:true,time:105,feedback:8,mix:12},reverb:{decay:0.6,tone:50,mix:8}}
  }),
  preset('dream-pop','Dream Pop','INDIE · DREAM POP','Clean, floating chords with lush chorus and soft echoes. Let the notes overlap.','Ⅹ','#b3b5d8',{
    model:'clean',gain:22,bass:42,middle:49,treble:56,presence:43,level:70,cabinet:'open',
    effects:{gate:{threshold:-68,release:280},compressor:{amount:32,makeup:2},chorus:{enabled:true,rate:1.1,depth:46,mix:32},delay:{enabled:true,time:390,feedback:34,mix:24},reverb:{decay:3.2,tone:48,mix:34}}
  }),
  preset('shoegaze-bloom','Shoegaze Bloom','INDIE · SHOEGAZE','A hazy wall of drive, slow chorus, and long reverb. Strum gently and let it bloom.','Ⅺ','#c3a4c6',{
    model:'crunch',gain:36,bass:41,middle:45,treble:44,presence:33,level:58,cabinet:'british',
    effects:{gate:{threshold:-70,release:320},compressor:{enabled:false},overdrive:{enabled:true,drive:35,tone:37},chorus:{enabled:true,rate:0.3,depth:66,mix:40},delay:{enabled:true,time:580,feedback:53,mix:32},reverb:{decay:5.5,tone:35,mix:52}}
  }),
  preset('neon-arpeggios','Neon Arpeggios','INDIE · ARPEGGIOS','Lightly driven chime with rhythmic repeats. The 375 ms echo fits dotted eighths at 120 BPM.','Ⅻ','#9fc8c1',{
    model:'chime',gain:25,bass:37,middle:52,treble:61,presence:51,level:68,cabinet:'british',
    effects:{gate:{threshold:-65,release:220},compressor:{amount:38,makeup:2},chorus:{enabled:true,rate:0.7,depth:30,mix:20},delay:{enabled:true,time:375,feedback:42,mix:33},reverb:{decay:1.8,tone:56,mix:19}}
  })
].map(p=>({...p,folderId:ORIGINAL_FOLDERS[p.id]})).concat(EXTRA_PRESETS.map(p=>{
  const folder=PRESET_FOLDERS.find(f=>f.id===p.folderId);
  return {...preset(p.id,p.name,p.subtitle,p.description,folder.icon,folder.color,p.patch),folderId:p.folderId};
})).map(p=>{
  const {effects,...amp}=AMP_REVOICING[p.id]||{},settings=clone(p.settings);Object.assign(settings,amp);
  for(const [id,patch] of Object.entries(effects||{}))Object.assign(settings.effects[id],patch);
  return {...p,settings};
});

export function sanitizeSettings(value) {
  const settings=clone(DEFAULT_SETTINGS);
  if (!value || typeof value!=='object') return settings;
  if (Object.hasOwn(MODELS,value.model)) settings.model=value.model;
  if (Object.hasOwn(CABINETS,value.cabinet)||value.cabinet==='custom') settings.cabinet=value.cabinet;
  if(typeof value.customIRId==='string'&&/^[a-f0-9]{64}$/.test(value.customIRId))settings.customIRId=value.customIRId;
  for (const key of ['gain','bass','middle','treble','presence','level','tightness','sag','power']) if (Number.isFinite(value[key])) settings[key]=clamp(value[key],0,100);
  if(Number.isFinite(value.cabHighCut))settings.cabHighCut=clamp(value.cabHighCut,3000,16000);
  for (const key of ['ampEnabled','fxBypassed']) if (typeof value[key]==='boolean') settings[key]=value[key];
  for (const effect of EFFECTS) {
    const source=value.effects?.[effect.id];
    if (!source || typeof source!=='object') continue;
    if (typeof source.enabled==='boolean') settings.effects[effect.id].enabled=source.enabled;
    for (const [key,,min,max] of effect.params) if(Number.isFinite(source[key])) settings.effects[effect.id][key]=clamp(source[key],min,max);
  }
  return settings;
}

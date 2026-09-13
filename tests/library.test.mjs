import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,PRESET_FOLDERS,EFFECTS,DEFAULT_SETTINGS,clone,sanitizeSettings} from '../dist/settings.js';
import {normalizeFolderName,resolveSavedFolder,restoreSavedPresets,moveSavedPreset,getLibraryFolders} from '../dist/library.js';

test('factory collection has 48 distinct valid sounds in eight populated folders',()=>{
  assert.equal(PRESETS.length,48);assert.equal(PRESET_FOLDERS.length,8);
  assert.equal(new Set(PRESETS.map(p=>p.id)).size,PRESETS.length);
  assert.equal(new Set(PRESETS.map(p=>p.name)).size,PRESETS.length);
  const sounds=new Set();
  for(const p of PRESETS){
    assert.ok(PRESET_FOLDERS.some(f=>f.id===p.folderId),p.name);
    assert.deepEqual(sanitizeSettings(p.settings),p.settings,p.name);
    assert.ok(p.description.length>20);assert.equal(p.settings.fxBypassed,false);assert.equal(p.settings.ampEnabled,true);
    const sound=clone(p.settings);sound.effects=Object.fromEntries(Object.entries(sound.effects).filter(([,v])=>v.enabled));sounds.add(JSON.stringify(sound));
  }
  assert.equal(sounds.size,48,'No duplicate sounds disguised with new names');
  const folders=getLibraryFolders('factory',[]);
  assert.deepEqual(folders.flatMap(f=>f.presets.map(p=>p.id)).sort(),PRESETS.map(p=>p.id).sort());
  for(const f of folders)assert.equal(f.presets.length,6,f.name);
});

test('collection uses every effect and gives single-note guidance for octave tones',()=>{
  for(const e of EFFECTS)assert.ok(PRESETS.some(p=>p.settings.effects[e.id].enabled),e.name);
  for(const id of ['octave','wah','noise','bitcrusher','ringmod']){
    const tones=PRESETS.filter(p=>p.settings.effects[id].enabled);assert.ok(tones.length>=3,id);
    if(id==='octave')for(const p of tones)assert.match(p.description,/single.note|monophonic/i,p.name);
  }
  // The envelope filter needs headroom to react to picking; compression before it is disabled.
  for(const p of PRESETS.filter(p=>p.settings.effects.wah.enabled)){
    assert.equal(p.settings.effects.compressor.enabled,false,p.name);
    assert.ok(p.settings.effects.wah.sensitivity<=42,p.name);
  }
});

test('older saved tones enter My tones without losing their amp or effect settings',()=>{
  const old=clone(DEFAULT_SETTINGS);old.model='chime';old.gain=41;old.effects.delay={enabled:true,time:375,feedback:32,mix:27};
  for(const id of ['octave','wah','bitcrusher','noise','ringmod'])delete old.effects[id];
  const input=[{id:'old-tone',name:'My old sound',settings:old}],before=clone(input),loaded=restoreSavedPresets(input);
  assert.deepEqual(input,before,'Loading does not mutate stored records');
  assert.equal(loaded[0].folder,'My tones');assert.equal(loaded[0].id,'old-tone');assert.equal(loaded[0].name,'My old sound');
  assert.deepEqual(loaded[0].settings,sanitizeSettings(old));
  for(const id of ['octave','wah','bitcrusher','noise','ringmod'])assert.equal(loaded[0].settings.effects[id].enabled,false);
  const reloaded=restoreSavedPresets(JSON.parse(JSON.stringify(loaded)));assert.deepEqual(reloaded,loaded);
});

test('saved library rejects corrupt/duplicate records and preserves valid custom IR references',()=>{
  const settings={...clone(DEFAULT_SETTINGS),cabinet:'custom',customIRId:'a'.repeat(64)};
  const loaded=restoreSavedPresets([null,{},'bad',{id:'blank',name:'  '},{id:'california',name:'Factory collision'},
    {id:'valid',name:' A valid tone ',settings,folder:' Live   set '},{id:'valid',name:'Duplicate'},
    {id:'second',name:'Second',folder:'live SET',settings:{gain:Infinity}}]);
  assert.equal(loaded.length,2);assert.equal(loaded[0].name,'A valid tone');assert.equal(loaded[0].settings.customIRId,'a'.repeat(64));
  assert.equal(loaded[1].settings.gain,DEFAULT_SETTINGS.gain);assert.equal(loaded[1].folder,'Live set');
  assert.deepEqual(restoreSavedPresets(null),[]);
  assert.equal(restoreSavedPresets(Array.from({length:110},(_,i)=>({id:'user-'+i,name:'Tone '+i}))).length,100);
});

test('folder names reuse existing capitalization and normalize empty or long input',()=>{
  assert.equal(normalizeFolderName(' \t '),'My tones');assert.equal(normalizeFolderName(null),'My tones');
  assert.equal(normalizeFolderName('  Live \n set  '),'Live set');assert.equal(normalizeFolderName('x'.repeat(80)).length,40);
  assert.equal(resolveSavedFolder(' indie  night ',[{folder:'Indie Night'}]),'Indie Night');
  const stored=restoreSavedPresets([{id:'one',name:'One',folder:'__proto__'},{id:'two',name:'Two',folder:'<Live & loud>'}]);
  assert.equal(getLibraryFolders('saved',stored).length,2,'User names are Map keys, not object properties');
});

test('moving a saved tone changes only its folder and survives a storage round trip',()=>{
  const saved=restoreSavedPresets([{id:'a',name:'First',folder:'A',settings:PRESETS[3].settings},{id:'b',name:'Second',folder:'B',settings:PRESETS[4].settings}]);
  const before=clone(saved),moved=moveSavedPreset(saved,'a',' b ');
  assert.deepEqual(saved,before);assert.equal(moved[0].folder,'B');assert.deepEqual(moved[0].settings,saved[0].settings);assert.deepEqual(moved[1],saved[1]);
  assert.deepEqual(restoreSavedPresets(JSON.parse(JSON.stringify(moved))),moved);
  const folders=getLibraryFolders('saved',moved);assert.equal(folders.length,1);assert.equal(folders[0].name,'B');assert.equal(folders[0].presets.length,2);
  assert.deepEqual(moveSavedPreset(saved,'missing','Elsewhere'),saved);
});

test('search finds folders, names and enabled textures without mixing group membership',()=>{
  const indie=getLibraryFolders('factory',[],' INDIE ').filter(f=>f.presets.length);assert.equal(indie.length,1);assert.equal(indie[0].id,'indie');assert.equal(indie[0].presets.length,6);
  const named=getLibraryFolders('factory',[],'Satellite Bells').flatMap(f=>f.presets);assert.equal(named.length,1);assert.equal(named[0].id,'satellite-bells');
  for(const [term,effect] of [['noise','noise'],['ring mod','ringmod'],['bitcrusher','bitcrusher']]){
    const found=getLibraryFolders('factory',[],term).flatMap(f=>f.presets);assert.ok(found.length>0);
    assert.ok(found.every(p=>p.settings.effects[effect].enabled),term+' should not match bypassed defaults or the utility noise gate');
  }
  assert.equal(getLibraryFolders('factory',[],'no-such-tone').flatMap(f=>f.presets).length,0);
  const saved=restoreSavedPresets([{id:'s',name:'Set opener',folder:'Friday gig',settings:PRESETS.find(p=>p.id==='pocket-wah').settings}]);
  assert.equal(getLibraryFolders('saved',saved,'Friday gig')[0].presets.length,1);
  assert.equal(getLibraryFolders('saved',saved,'auto wah')[0].presets[0].id,'s');
  assert.equal(getLibraryFolders('saved',saved,'Ring Mod')[0].presets.length,0);
});

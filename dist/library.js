import { PRESETS, PRESET_FOLDERS, EFFECTS, sanitizeSettings } from './settings.js';

export const DEFAULT_FOLDER='My tones';
export function normalizeFolderName(value){
  return typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,40).trim()||DEFAULT_FOLDER:DEFAULT_FOLDER;
}
export function resolveSavedFolder(value,saved){
  const name=normalizeFolderName(value);
  return saved.map(p=>normalizeFolderName(p.folder)).find(f=>f.toLowerCase()===name.toLowerCase())||name;
}
export function restoreSavedPresets(value){
  if(!Array.isArray(value))return [];
  const seen=new Set(PRESETS.map(p=>p.id)),saved=[];
  for(const p of value){
    if(!p||typeof p.id!=='string'||!p.id.trim()||typeof p.name!=='string'||!p.name.trim()||seen.has(p.id))continue;
    saved.push({id:p.id,name:p.name.trim().slice(0,40),description:typeof p.description==='string'?p.description.slice(0,400):'Your sound, just the way you like it.',folder:resolveSavedFolder(p.folder,saved),settings:sanitizeSettings(p.settings)});
    seen.add(p.id);if(saved.length===100)break;
  }
  return saved;
}
export function moveSavedPreset(saved,id,folder){
  const name=resolveSavedFolder(folder,saved);
  return saved.map(p=>p.id===id?{...p,folder:name}:p);
}
export function getLibraryFolders(library,saved,query=''){
  let folders;
  if(library==='factory')folders=PRESET_FOLDERS.map(f=>({...f,presets:PRESETS.filter(p=>p.folderId===f.id)}));
  else {
    const grouped=new Map();
    for(const p of saved){const name=normalizeFolderName(p.folder);if(!grouped.has(name))grouped.set(name,{id:name,name,description:'Your saved tones',color:'#b7c5a5',icon:'S',presets:[]});grouped.get(name).presets.push(p);}
    folders=[...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  const term=query.trim().toLowerCase();
  return folders.map(f=>({...f,total:f.presets.length,presets:f.presets.filter(p=>{
    if(!term)return true;
    const effects=EFFECTS.filter(e=>p.settings.effects[e.id].enabled&&!p.settings.fxBypassed).map(e=>e.id==='gate'?'Gate':e.name);
    return [f.name,p.name,p.subtitle,p.description,...effects].join(' ').toLowerCase().includes(term);
  })}));
}

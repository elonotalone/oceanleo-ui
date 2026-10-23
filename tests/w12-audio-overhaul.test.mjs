import assert from 'node:assert/strict';
import test from 'node:test';
import { React, act, compileModule, dataModule, mount, settle } from './collab-media-sim.mjs';
import { AUDIO_THEME_PALETTES } from '../src/shell/media-editors/audio-wave-theme.ts';
import { audioEditorProjectSource } from '../src/shell/media-editors/audio-project-source.ts';

const luminance = (hex) => {
  const channels = hex.match(/[a-f0-9]{2}/ig).map((part) => parseInt(part,16)/255)
    .map((c) => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
  return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
};
test('W12 waveform and playhead remain visible in both host themes', () => {
  for (const colors of Object.values(AUDIO_THEME_PALETTES)) {
    for (const name of ['body','progress','cursor']) {
      const pair = [luminance(colors.background), luminance(colors[name])].sort((a,b)=>b-a);
      assert.ok((pair[0]+.05)/(pair[1]+.05) >= 3, name);
    }
  }
  assert.ok(luminance(AUDIO_THEME_PALETTES.light.background) > .8);
});

test('W12 saved typed audio opens its project manifest rather than waveform cover', () => {
  assert.deepEqual(audioEditorProjectSource({url:'cover.png',meta:{editor_manifest_url:'manifest.json',source_format:'wav'}}),
    {schema:'oceanleo.audio-project.v1',url:'manifest.json'});
  assert.deepEqual(audioEditorProjectSource({url:'cover.png',meta:{source_url:'source.json',source_format:'oceanleo.audio-project.v1'}}),
    {schema:'oceanleo.audio-project.v1',url:'source.json'});
  assert.equal(audioEditorProjectSource({url:'sample.mp3',meta:{source_format:'mp3'}}),null);
});

class Buffer {
  constructor({length,numberOfChannels,sampleRate}) {
    Object.assign(this,{length,numberOfChannels,sampleRate,duration:length/sampleRate});
    this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length).fill(.2));
  }
  getChannelData(channel) { return this.channels[channel]; }
  copyToChannel(data, channel) { this.channels[channel].set(data); }
}
globalThis.AudioBuffer = Buffer;
globalThis.AudioContext = class {
  async decodeAudioData() { return new Buffer({length:8000,numberOfChannels:1,sampleRate:8000}); }
  async close() {}
};
globalThis.__w12OriginalBuffer = () => new Buffer({length:16000,numberOfChannels:1,sampleRate:8000});
globalThis.__w12UseEffect = React.useEffect;
const audio = await import(await compileModule('src/shell/media-editors/AudioWorkbench.tsx', {
  './AudioWorkbenchView':dataModule('export const AudioControls=()=>null;export const AudioStage=()=>null;export const AudioWorkbench=()=>null;'),
  '../../i18n/ui/useUI':dataModule('export const useUI=()=>text=>text;'),
  '../advanced-private-source':dataModule('export const uploadPrivateEditorSource=async()=>({ok:true,data:{file:{url:"https://m/replacement.wav"}}});'),
  './source-integrity.mjs':dataModule('export const assertBlobSource=async()=>"wav";'),
  './use-audio-wave-loader':dataModule(`export function useAudioWaveLoader(o){globalThis.__w12UseEffect(()=>{
    o.bufferRef.current=globalThis.__w12OriginalBuffer();o.sourceUrlRef.current='https://m/original.wav';o.setLoading(false);o.setDuration(2);
  },[]);}`),
  './use-audio-persistence':dataModule(`export function useAudioPersistence(o){return {save:async()=>null,restoreRecovery:async()=>false,
    captureRecovery:()=>({sourceUrl:o.sourceUrlRef.current,operations:[...o.operationsRef.current]})};}`),
  './use-audio-remote-apply':dataModule('export const useAudioRemoteApply=()=>({applyRemoteProject:async()=>false,applyLocalProject:async()=>false});'),
}));

test('W12 replacing audio is one undoable edit; undo/redo restore durable source as well as samples', async () => {
  let editor;
  const item={id:'w12-history',key:'w12-history',title:'Track',kind:'audio',source:'artifact',url:'https://m/original.wav',meta:{}};
  function Probe(){editor=audio.useAudioWorkbench(item,'audio');return null;}
  const mounted=await mount(React.createElement(Probe));
  try {
    await settle();
    assert.equal(editor.captureRecovery().sourceUrl,'https://m/original.wav');
    let imported;
    await act(async()=>{imported=await editor.importSource(new File(['RIFF-test'],'replacement.wav',{type:'audio/wav'}));});
    assert.equal(imported,true);
    assert.equal(editor.canUndo,true);
    assert.equal(editor.editRevision,1);
    assert.equal(editor.captureRecovery().sourceUrl,'https://m/replacement.wav');
    assert.equal(editor.wavBlob().size,44+8000*2);
    await act(async()=>editor.undo());
    assert.equal(editor.captureRecovery().sourceUrl,'https://m/original.wav');
    assert.equal(editor.wavBlob().size,44+16000*2);
    await act(async()=>editor.redo());
    assert.equal(editor.captureRecovery().sourceUrl,'https://m/replacement.wav');
    assert.equal(editor.wavBlob().size,44+8000*2);
  } finally {await mounted.unmount();}
});

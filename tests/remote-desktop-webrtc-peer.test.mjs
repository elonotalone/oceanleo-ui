import assert from 'node:assert/strict';
import test from 'node:test';
import {descriptor,FakePeer,FakeVideo,harness,settle,WALL} from './helpers/remote-desktop-webrtc.mjs';

test('viewer offers recvonly video with reliable input/control, unreliable move and low playout delay',async t=>{
  const h=await harness(t);await h.viewer.start();const pc=h.viewer.pc;
  assert.equal(h.viewer.gen,1);assert.equal(pc.configuration.iceTransportPolicy,'all');
  assert.deepEqual(pc.transceiver.options,{direction:'recvonly'});assert.equal(pc.transceiver.receiver.jitterBufferTarget,0);
  assert.deepEqual(pc.channel('rd-input').options,{ordered:true});assert.deepEqual(pc.channel('rd-fast').options,{ordered:false,maxRetransmits:0});
  assert.deepEqual(pc.channel('rd-ctl').options,{ordered:true});assert.equal(h.signals[0].k,'offer');assert.equal(h.signals[0].sdp,'v=0\r\nfixture-offer');
});
test('candidate buffering and generation checks reject early, stale and future peer signals',async t=>{
  const h=await harness(t);await h.viewer.signal({k:'candidate',gen:1,candidate:'before-start'});await h.viewer.start();const pc=h.viewer.pc;
  for(const gen of [0,2])await h.viewer.signal({k:'candidate',gen,candidate:'wrong'});
  for(let i=0;i<70;i++)await h.viewer.signal({k:'candidate',gen:1,candidate:String(i)});
  assert.equal(pc.candidates.length,0);await h.viewer.signal({k:'answer',gen:1,sdp:'answer'});
  assert.equal(pc.candidates.length,64);assert.equal(pc.candidates[0].candidate,'6');
  await h.viewer.signal({k:'answer',gen:0,sdp:'old'});assert.equal(pc.remoteDescription.sdp,'answer');
  pc.state('failed');await h.advance(200);assert.equal(h.viewer.gen,2);
  await h.viewer.signal({k:'candidate',gen:1,candidate:'retired'});assert.equal(h.viewer.pc.candidates.length,0);
});
test('disconnected retains peer and picture, restarts ICE after 2s with bounded backoff',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;const video=new FakeVideo();h.viewer.attachVideo(video);video.frame({presentationTime:100,expectedDisplayTime:110,captureTime:80});
  pc.ice('disconnected');await h.advance(1900);assert.equal(pc.offers.length,1);assert.equal(pc.closed,0);assert.equal(video.srcObject,null);
  await h.advance(100);assert.equal(pc.offers.length,2);assert.deepEqual(pc.offers.at(-1),{iceRestart:true});assert.equal(h.viewer.gen,1);
  await h.advance(1000);assert.equal(pc.offers.length,3);pc.connect();await h.advance(3000);assert.equal(pc.offers.length,3);assert.equal(h.terminals.length,0);
});
for(const state of ['failed','closed'])test(`unexpected peer ${state} replaces only the peer, increasing generation`,async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const old=h.viewer.pc;old.state(state);await h.advance(200);
  assert.equal(h.viewer.gen,2);assert.notEqual(h.viewer.pc,old);assert.equal(h.viewer.pc.configuration.iceTransportPolicy,'all');assert.equal(h.terminals.length,0);
});
test('signalling loss preserves input and frame callbacks; queued offer/candidates flush on reconnect',async t=>{
  const h=await harness(t);h.signalAvailable(false);await h.viewer.start();h.open();const pc=h.viewer.pc;
  for(let i=0;i<70;i++)pc.onicecandidate({candidate:{candidate:String(i),sdpMid:'0',sdpMLineIndex:0}});
  assert.equal(h.viewer.send({kind:'keypress',key:'A'}),true);h.receipt(h.viewer.lastSequence());
  const video=new FakeVideo();h.viewer.attachVideo(video);video.frame({expectedDisplayTime:110,receiveTime:100});
  assert.equal(h.frames.length,1);assert.equal(pc.closed,0);h.signalAvailable(true);h.viewer.updateDescriptor(descriptor());
  assert.equal(h.signals[0].k,'offer');assert.equal(h.signals.length,65);assert.equal(h.signals[1].candidate,'6');assert.equal(h.terminals.length,0);
});
test('offline queued offer is marked sent only when signalling accepts its flush',async t=>{
  const h=await harness(t);h.signalAvailable(false);await h.viewer.start();await h.advance(10000);
  assert.equal(h.reports[0].report.steps.offer_sent_ms,undefined);
  h.signalAvailable(true);h.viewer.flushSignals();h.viewer.close();
  assert.equal(h.reports.at(-1).report.steps.offer_sent_ms,10100);assert.equal(h.signals[0].k,'offer');
});
test('new track uses plain video; receiver hint falls back when jitterBufferTarget setter rejects',async t=>{
  const h=await harness(t);await h.viewer.start();const video=new FakeVideo();h.viewer.attachVideo(video);const receiver={};
  Object.defineProperty(receiver,'jitterBufferTarget',{set(){throw Error('unsupported');}});
  const stream={id:'screen'};h.viewer.pc.ontrack({track:{kind:'video'},receiver,streams:[stream]});
  assert.equal(receiver.playoutDelayHint,0);assert.equal(video.srcObject,stream);assert.equal(video.muted,true);assert.equal(video.playsInline,true);
  video.frame({presentationTime:105,expectedDisplayTime:112,captureTime:90});assert.deepEqual(h.frames,[[1280,720]]);
  h.viewer.attachVideo(null);assert.equal(video.callbacks.size,0);assert.equal(video.srcObject,null);
});
test('replayed descriptor cannot extend lease, server-clock skew is harmless, renewed lease may extend',async t=>{
  const h=await harness(t,{descriptor:descriptor({server_now:WALL/1000+600,lease_expires_at:new Date(WALL+610000).toISOString()})});
  await h.viewer.start();await h.advance(9000);h.viewer.updateDescriptor(descriptor({server_now:WALL/1000+600,lease_expires_at:new Date(WALL+610000).toISOString()}));
  await h.advance(1000);assert.deepEqual(h.terminals,['lease_expired']);assert.equal(h.reports.filter(x=>x.final).length,1);
});
test('real renewed lease extends deadline; expired initial descriptor ends before creating peer',async t=>{
  const h=await harness(t,{descriptor:descriptor({lease_expires_at:new Date(WALL+1000).toISOString()})});await h.viewer.start();await h.advance(500);
  h.viewer.updateDescriptor(descriptor({server_now:WALL/1000+.5,lease_expires_at:new Date(WALL+5000).toISOString()}));await h.advance(1000);assert.deepEqual(h.terminals,[]);
  h.viewer.close('consent_revoked');h.viewer.close('viewer_left');assert.deepEqual(h.terminals,['consent_revoked']);
});
test('descriptor received earlier consumes lease time before engine construction',async t=>{
  const h=await harness(t,{initialNow:2100,descriptorReceivedAt:0,descriptor:descriptor({lease_expires_at:new Date(WALL+2000).toISOString()})});
  await h.viewer.start();assert.equal(h.peers.length,0);assert.deepEqual(h.terminals,['lease_expired']);
});
test('host capture status leaves lifetime to API; input bye recovers input; terminal bye retains explicit reason',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;
  pc.channel('rd-ctl').message({t:'rd.capture_failed',reason:'capture_failed'});assert.equal(pc.closed,0);
  await h.viewer.signal({k:'bye',reason:'input_failed'});assert.equal(pc.closed,0);assert.equal(h.states.at(-1).state,'input_reconnecting');
  await h.viewer.signal({k:'bye',reason:'capture_recovery_failed'});assert.deepEqual(h.terminals,['capture_recovery_failed']);assert.equal(pc.closed,1);
});
test('late async answer/candidate exceptions and observer throws do not stop direct peer',async t=>{
  const h=await harness(t,{onState(){throw Error('observer');},onFrame(){throw Error('observer');}});await h.viewer.start();h.open();const pc=h.viewer.pc;
  pc.rejectCandidate=true;await h.viewer.signal({k:'answer',gen:1,sdp:'answer'});await h.viewer.signal({k:'candidate',gen:1,candidate:'bad'});await settle();assert.equal(pc.closed,0);
});
test('replacement peer stays picture_reconnecting until its track presents a frame',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const video=new FakeVideo();h.viewer.attachVideo(video);video.frame({expectedDisplayTime:110,captureTime:90});
  h.viewer.pc.state('failed');await h.advance(200);h.open();assert.equal(h.states.at(-1).state,'picture_reconnecting');
  video.frame({expectedDisplayTime:320,captureTime:300});assert.equal(h.states.at(-1).state,'picture_reconnecting');
  h.viewer.pc.ontrack({track:{kind:'video'},receiver:{},streams:[{id:'new-track'}]});video.frame({expectedDisplayTime:350,captureTime:330});assert.equal(h.states.at(-1).state,'playing');
});
const codec=(name,fmtp)=>({mimeType:`video/${name}`,clockRate:90000,...(fmtp?{sdpFmtpLine:fmtp}:{})});
// Representative getCapabilities shapes: mixed profiles, fmtp ordering/case and optional repair codecs.
const codecFixtures={
  Chromium:[codec('VP8'),codec('rtx'),codec('VP9','profile-id=0'),codec('VP9','profile-id=2'),
    codec('H264','level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f'),
    codec('H264','level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f'),
    codec('H264','level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f'),
    codec('H264','level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f'),
    codec('AV1','level-idx=5;profile=0;tier=0'),codec('red'),codec('ulpfec')],
  Safari:[codec('H264','profile-level-id=640c1f;packetization-mode=1;level-asymmetry-allowed=1'),
    codec('H264','profile-level-id=42E01F; packetization-mode=1; level-asymmetry-allowed=1'),
    codec('H264','profile-level-id=42001f;packetization-mode=1'),codec('H265'),codec('vp8'),codec('rtx'),codec('red')],
  Firefox:[codec('VP8'),codec('VP9','profile-id=0'),
    codec('H264','profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1'),
    codec('H264','profile-level-id=42001f;level-asymmetry-allowed=1;packetization-mode=1'),
    codec('H264','profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=0'),codec('rtx'),codec('ulpfec')],
};
for(const [browser,codecs] of Object.entries(codecFixtures)){
  const h264=codecs.find(c=>c.sdpFmtpLine?.toLowerCase().includes('profile-level-id=42e01f')&&c.sdpFmtpLine.includes('packetization-mode=1'));
  const vp8=codecs.find(c=>c.mimeType.toLowerCase()==='video/vp8');
  for(const exactProfile of [true,false])test(`${browser} codec capabilities offer ${exactProfile?'only 42e01f mode1 then VP8':'VP8 only without the exact H264 profile'}`,async t=>{
    const available=exactProfile?codecs:codecs.filter(c=>c!==h264);
    const h=await harness(t,{rtpReceiver:{getCapabilities:kind=>{assert.equal(kind,'video');return {codecs:available};}}});
    await h.viewer.start();const pc=h.viewer.pc;
    const repair=available.filter(c=>c.mimeType.toLowerCase()==='video/rtx');
    assert.deepEqual(pc.codecs,exactProfile?[h264,vp8,...repair]:[vp8,...repair]);
    for(const preferred of pc.codecs)assert.ok(available.includes(preferred),'use original capability objects');
    assert.deepEqual(pc.offers,[undefined]);assert.equal(h.signals[0].sdp,'v=0\r\nfixture-offer');
    assert.deepEqual(h.terminals,[]);
  });
}
for(const [name,rtpReceiver,breakPreferences] of [
  ['no permitted codec',{getCapabilities:()=>({codecs:[codec('H264','profile-level-id=42001f;packetization-mode=1'),codec('VP9')]})}],
  ['empty capabilities',{getCapabilities:()=>({codecs:[]})}],
  ['repair codecs only',{getCapabilities:()=>({codecs:[codec('rtx')]})}],
  ['missing capabilities',{}],['unavailable receiver',null],
  ['capability lookup throws',{getCapabilities(){throw Error('unsupported');}}],
  ['missing setCodecPreferences',undefined,'missing'],['setCodecPreferences throws',undefined,'throws'],
])test(`codec filtering fails closed with ${name}`,async t=>{
  const peers=[];
  const h=await harness(t,{rtpReceiver,createPeer:configuration=>{
    const pc=new FakePeer(configuration);peers.push(pc);const add=pc.addTransceiver.bind(pc);
    pc.addTransceiver=(...args)=>{const transceiver=add(...args);
      if(breakPreferences==='missing')transceiver.setCodecPreferences=undefined;
      else if(breakPreferences==='throws')transceiver.setCodecPreferences=()=>{throw Error('unsupported');};
      return transceiver;};return pc;
  }});
  await h.viewer.start();assert.deepEqual(peers[0].offers,[]);assert.equal(peers[0].closed,1);
  assert.deepEqual(h.signals,[]);assert.deepEqual(h.terminals,['unsupported_h264_profile']);
});
test('ICE region metadata is kept for URL path mapping and stripped from RTC configuration',async t=>{
  const h=await harness(t,{descriptor:descriptor({ice_servers:[{urls:['turn:fixture.invalid:3478'],username:'fixture',credential:'fixture',region:'ap-east'}]})});await h.viewer.start();h.open();
  const pc=h.viewer.pc;assert.equal(pc.configuration.iceServers[0].region,undefined);
  pc.statsEntries=[{id:'p',type:'candidate-pair',selected:true,localCandidateId:'l',remoteCandidateId:'r'},{id:'l',type:'local-candidate',candidateType:'relay',url:'turn:fixture.invalid:3478'},{id:'r',type:'remote-candidate',candidateType:'host'}];
  await h.advance(100);assert.equal(h.states.at(-1).path.relay_region,'ap-east');
});
test('delayed pre-renewal descriptor cannot extend current lease or regress ICE credentials',async t=>{
  const h=await harness(t);await h.viewer.start();await h.advance(60000);
  h.viewer.updateDescriptor(descriptor({server_now:WALL/1000+60,lease_expires_at:new Date(WALL+180000).toISOString(),ice_servers:[{urls:['turn:new.invalid:3478'],username:'new',credential:'new'}]}));
  await h.advance(20000);h.viewer.updateDescriptor(descriptor());assert.equal(h.viewer.pc.configuration.iceServers[0].username,'new');
  await h.advance(100000);assert.deepEqual(h.terminals,['lease_expired']);
});
test('future-generation bye is ignored and input_consent_revoked remains terminal',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();await h.viewer.signal({k:'bye',gen:2,reason:'viewer_left'});assert.equal(h.viewer.pc.closed,0);
  await h.viewer.signal({k:'bye',gen:1,reason:'input_consent_revoked'});assert.deepEqual(h.terminals,['input_consent_revoked']);
});

test('host peer_failed replaces the peer at gen+1 on the same session and ignores duplicate old-gen bye',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const old=h.viewer.pc;
  await h.viewer.signal({k:'bye',gen:1,reason:'peer_failed'});
  await h.advance(100);await h.viewer.signal({k:'bye',gen:1,reason:'peer_failed'});
  await h.advance(100);assert.equal(h.viewer.gen,2);assert.equal(h.peers.length,2);assert.equal(old.closed,1);
  assert.equal(h.states.at(-1).state,'picture_reconnecting');assert.deepEqual(h.terminals,[]);
  assert.deepEqual(h.signals.filter(s=>s.k==='offer').map(s=>s.gen),[1,2]);
  await h.viewer.signal({k:'bye',gen:1,reason:'peer_failed'});await h.advance(300);assert.equal(h.peers.length,2);
  h.open();assert.equal(h.viewer.send({kind:'keypress',key:'A'}),true);
  assert.equal(h.viewer.pc.channel('rd-input').sent.at(-1).sid,'sid');h.receipt(h.viewer.lastSequence());
  assert.equal(h.reports.some(r=>r.final),false);
});
test('host ice_restart_required offers ICE restart on the same peer and gen with retry backoff',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;
  await h.viewer.signal({k:'bye',gen:1,reason:'ice_restart_required'});await h.advance(100);
  assert.equal(h.viewer.pc,pc);assert.equal(pc.closed,0);assert.equal(h.viewer.gen,1);
  assert.deepEqual(pc.offers,[undefined,{iceRestart:true}]);assert.deepEqual(h.terminals,[]);
  assert.equal(h.states.at(-1).state,'picture_reconnecting');
  await h.advance(1000);assert.deepEqual(pc.offers.at(-1),{iceRestart:true});assert.equal(pc.offers.length,3);
  pc.connect();await h.advance(2000);assert.equal(pc.offers.length,3);
  assert.ok(h.signals.filter(s=>s.k==='offer').every(s=>s.gen===1));
  assert.equal(h.reports.some(r=>r.final),false);
});
for(const reason of ['peer_failed','ice_restart_required'])test(`host ${reason} accepts an omitted generation but ignores stale/future generations`,async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;
  for(const gen of [0,2,-1,1.5])await h.viewer.signal({k:'bye',gen,reason});
  await h.advance(300);assert.equal(h.viewer.pc,pc);assert.equal(pc.offers.length,1);
  await h.viewer.signal({k:'bye',reason});await h.advance(200);
  assert.equal(h.viewer.gen,reason==='peer_failed'?2:1);
  assert.equal(h.peers.at(-1).offers.length,reason==='peer_failed'?1:2);assert.deepEqual(h.terminals,[]);
});
for(const reason of ['remote_access_disabled','signed_out','consent_revoked','viewer_left','billing_stopped','lease_expired',
  'reconnect_window_expired','capture_restart_failed','peer_generation_exhausted','unsupported_h264_profile',
  'input_consent_revoked','capture_recovery_failed'])test(`terminal host bye ${reason} closes exactly once with its reason`,async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;
  await h.viewer.signal({k:'bye',gen:1,reason});await h.viewer.signal({k:'bye',gen:1,reason});await h.advance(500);
  assert.equal(pc.closed,1);assert.equal(h.peers.length,1);assert.deepEqual(h.terminals,[reason]);
  const final=h.reports.filter(r=>r.final);assert.equal(final.length,1);assert.equal(final[0].report.end_reason,reason);
});
for(const reason of [undefined,'','unknown_transport_status','capture_failed'])test(`unclassified host bye ${String(reason)} preserves picture and input`,async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;
  await h.viewer.signal({k:'bye',gen:1,reason});await h.advance(500);
  assert.equal(h.viewer.pc,pc);assert.equal(pc.closed,0);assert.equal(pc.offers.length,1);assert.deepEqual(h.terminals,[]);
  assert.equal(h.viewer.send({kind:'keypress',key:'A'}),true);h.receipt(h.viewer.lastSequence());
});
test('packets during a freeze longer than 1s need no application keyframe request or periodic-keyframe wait',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;const video=new FakeVideo();
  h.viewer.attachVideo(video);pc.ontrack({track:{kind:'video'},receiver:pc.transceiver.receiver,streams:[{id:'screen'}]});
  video.frame({expectedDisplayTime:h.now(),captureTime:h.now()-10});
  for(let n=1;n<=4;n++){
    pc.statsEntries=[{id:'video',type:'inbound-rtp',kind:'video',bytesReceived:n*10000,packetsReceived:n*10,packetsLost:n,pliCount:n,framesReceived:n*30,framesDecoded:1}];
    await h.advance(1000);
  }
  assert.equal(h.frames.length,1);assert.equal(h.viewer.pc,pc);assert.equal(pc.offers.length,1);assert.equal(h.viewer.gen,1);
  assert.ok(pc.channel('rd-ctl').sent.every(message=>message.t==='rd.ping'));
  video.frame({expectedDisplayTime:h.now(),captureTime:h.now()-10});assert.equal(h.frames.length,2);
  assert.equal(h.states.at(-1).state,'playing');assert.deepEqual(h.terminals,[]);
  h.viewer.close('viewer_left');assert.ok(h.reports.at(-1).report.video.freeze_ms>1000);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {WebRtcClock,WebRtcTelemetry,webRtcPercentiles} from '../src/api/remote-desktop-webrtc-telemetry.ts';
import {descriptor,FakeVideo,harness,WALL} from './helpers/remote-desktop-webrtc.mjs';

test('NTP clock keeps minimum RTT in rolling 30s and excludes malformed samples',()=>{
  const clock=new WebRtcClock();clock.sample(1000,1510,1512,1022,0);assert.equal(clock.offset(0),500);
  clock.sample(2000,2560,2562,2122,1000);assert.equal(clock.offset(1000),500);
  clock.sample(2000,2300,2200,2100,1000);assert.equal(clock.offset(1000),500);
  assert.equal(clock.offset(30001),500);assert.equal(clock.offset(31001),undefined);
});
test('percentiles use nearest ranks, whole milliseconds and bounded valid inputs',()=>{
  assert.deepEqual(webRtcPercentiles([1,2,3,4,100,NaN,-1]),{n:5,p50:3,p95:100,max:100});assert.equal(webRtcPercentiles([]),undefined);
});
test('input timing uses authenticated host execution wall time with clock offset, fast receipts too',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const ctl=h.viewer.pc.channel('rd-ctl');const ping=ctl.sent.find(x=>x.t==='rd.ping');
  await h.advance(20);ctl.message({t:'rd.pong',t_v:ping.t_v,host_receive_ms:ping.t_v+510,host_send_ms:ping.t_v+510});
  h.viewer.send({kind:'keypress',key:'A'});const seq=h.viewer.lastSequence();h.receipt(seq,'executed',{executed_at_ms:h.wall()+530});h.receipt(seq,'executed',{executed_at_ms:h.wall()+9000});
  h.viewer.send({kind:'move',x:.4,y:.5});h.receipt(h.viewer.lastSequence(),'executed',{executed_at_ms:h.wall()+540});
  h.viewer.close();const report=h.reports.find(x=>x.final).report;assert.deepEqual(report.input.sent_executed,{n:2,p50:30,p95:40,max:40});
  assert.equal(report.transport,'webrtc-v1');assert.equal(report.media,'webrtc');assert.equal(report.input.ws_count,0);
});
test('no clock sample means no invented input timing; stale/wrong-session pongs do not synchronize',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const ctl=h.viewer.pc.channel('rd-ctl');ctl.message({t:'rd.pong',t_v:1,device_wall_ms:WALL});
  h.viewer.send({kind:'keypress',key:'A'});h.receipt(h.viewer.lastSequence());h.viewer.close();assert.equal(h.reports.at(-1).report.input.sent_executed,undefined);
});
test('picture age uses rVFC local timestamps without applying host wall offset; sources remain separate',async t=>{
  const h=await harness(t,{sessionCreatedAt:15,descriptorReceivedAt:40});await h.viewer.start();h.open();const ctl=h.viewer.pc.channel('rd-ctl');const ping=ctl.sent.find(x=>x.t==='rd.ping');
  await h.advance(20);ctl.message({t:'rd.pong',t_v:ping.t_v,device_wall_ms:ping.t_v+10000});
  const video=new FakeVideo();h.viewer.attachVideo(video);video.frame({presentationTime:125,expectedDisplayTime:130,captureTime:100,receiveTime:120});
  video.frame({presentationTime:145,expectedDisplayTime:150,receiveTime:140});video.frame({presentationTime:155,expectedDisplayTime:160});h.viewer.close();
  const report=h.reports.at(-1).report;assert.deepEqual(report.video.picture_age,{n:1,p50:30,p95:30,max:30});assert.equal(report.video.picture_age_source,'captureTime');
  assert.equal(report.video.picture_age_by_source.captureTime.n,1);assert.equal(report.video.picture_age_by_source.receiveTime.n,1);
  assert.equal(report.steps.session_created_ms,15);assert.equal(report.steps.descriptor_received_ms,40);assert.equal(report.steps.first_frame_decoded_ms,125);assert.equal(report.steps.first_frame_presented_ms,130);
});
test('ongoing freeze counts before next frame only while host is sending; paused track does not invent freezes',()=>{
  let now=100;const telemetry=new WebRtcTelemetry({sessionId:'sid',clickedAt:0,now:()=>now,wallNow:()=>WALL+now});
  telemetry.frame(now,{captureTime:90});now=1000;telemetry.tick();assert.equal(telemetry.report(false).video.freeze_count,0);
  telemetry.hostSample(1000,30);now=1300;telemetry.tick();const ongoing=telemetry.report(false);assert.equal(ongoing.video.freeze_count,1);assert.equal(ongoing.video.freeze_ms,300);
  now=2600;telemetry.tick();const total=telemetry.report(true);assert.equal(total.video.freeze_count,1);assert.equal(total.video.freeze_ms,1500);
  now=5000;telemetry.frame(now,{receiveTime:4990});telemetry.tick();assert.equal(telemetry.report(true).video.freeze_count,1);
});
test('long session histogram retains exact counts beyond 20000 observations',()=>{
  let now=0;const telemetry=new WebRtcTelemetry({sessionId:'sid',clickedAt:0,now:()=>now,wallNow:()=>WALL});
  for(let i=0;i<25000;i++){now=i;telemetry.frame(now,{captureTime:now-10});}
  const report=telemetry.report(true);assert.equal(report.video.picture_age.n,25000);assert.equal(report.video.frames_rendered,25000);assert.equal(report.video.picture_age.p95,10);
});
test('ten-second windows reset local counts, final keeps session totals, path never exposes addresses',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;
  pc.statsEntries=[{id:'transport',type:'transport',selectedCandidatePairId:'pair'},{id:'pair',type:'candidate-pair',localCandidateId:'local',remoteCandidateId:'remote',currentRoundTripTime:.023},
    {id:'local',type:'local-candidate',candidateType:'relay',protocol:'udp',address:'192.0.2.1',url:'turn:fixture.invalid:3478'},
    {id:'remote',type:'remote-candidate',candidateType:'srflx',address:'2001:db8::1'}];
  const video=new FakeVideo();h.viewer.attachVideo(video);video.frame({expectedDisplayTime:110,captureTime:80});await h.advance(10000);
  assert.equal(h.reports.length,1);const window=h.reports[0].report;assert.equal(h.reports[0].final,false);assert.equal(window.video.frames_rendered,1);
  assert.deepEqual(window.path,{local_type:'relay',remote_type:'srflx',address_family:'ipv6',protocol:'udp',rtt_ms:23});assert.equal(JSON.stringify(window).includes('2001:'),false);
  await h.advance(10000);assert.equal(h.reports[1].report.video.frames_rendered,0);h.viewer.close();assert.equal(h.reports.at(-1).report.video.frames_rendered,1);assert.ok(window.viewer);
});
test('inbound stats mark decode/sending even when selected candidate stats are absent',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();h.viewer.pc.statsEntries=[{id:'video',type:'inbound-rtp',kind:'video',framesDecoded:10,framesReceived:10,bytesReceived:1000}];
  await h.advance(100);h.viewer.close();assert.equal(h.reports.at(-1).report.steps.first_frame_decoded_ms,200);assert.equal(h.reports.at(-1).report.steps.session_created_ms,undefined);
});
test('authenticated host stats supply URL-less remote relay region and generation replacement clears it',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;
  const entries=[{id:'pair',type:'candidate-pair',selected:true,localCandidateId:'local',remoteCandidateId:'remote'},
    {id:'local',type:'local-candidate',candidateType:'host',protocol:'udp'},{id:'remote',type:'remote-candidate',candidateType:'relay'}];
  pc.statsEntries=entries;const ctl=pc.channel('rd-ctl');
  ctl.message({t:'rd.publisher_stats',metrics:{fps:30},path:{relay_region:'https://private.invalid'}});await h.advance(100);
  assert.equal(h.states.at(-1).path.relay_region,undefined);
  ctl.message({t:'rd.publisher_stats',metrics:{fps:30},path:{relay_region:'ap-southeast-1'},sid:'other'});await h.advance(1000);
  assert.equal(h.states.at(-1).path.relay_region,undefined);
  ctl.message({t:'rd.publisher_stats',metrics:{fps:30},path:{relay_region:'ap-southeast-1'}});await h.advance(1000);
  assert.equal(h.states.at(-1).path.relay_region,'ap-southeast-1');assert.equal(JSON.stringify(h.states.at(-1).path).includes('private.invalid'),false);
  pc.state('failed');await h.advance(200);h.open();h.viewer.pc.statsEntries=entries;await h.advance(1000);
  assert.equal(h.viewer.gen,2);assert.equal(h.states.at(-1).path.relay_region,undefined);
});
test('host relay hint cannot replace known local TURN region or label a direct path',async t=>{
  const h=await harness(t);await h.viewer.start();h.open();const pc=h.viewer.pc;
  h.viewer.updateDescriptor(descriptor({ice_servers:[{urls:['turn:fixture.invalid:3478'],region:'local-region'}]}));
  pc.channel('rd-ctl').message({t:'rd.publisher_stats',metrics:{},path:{relay_region:'host-region'}});
  const local={id:'l',type:'local-candidate',candidateType:'relay',url:'turn:fixture.invalid:3478'};
  const remote={id:'r',type:'remote-candidate',candidateType:'relay'};
  pc.statsEntries=[{id:'p',type:'candidate-pair',selected:true,localCandidateId:'l',remoteCandidateId:'r'},local,remote];await h.advance(100);
  assert.equal(h.states.at(-1).path.relay_region,'local-region');local.candidateType='host';remote.candidateType='host';await h.advance(1000);
  assert.equal(h.states.at(-1).path.relay_region,undefined);
});


test('late exact RTP capture timestamps use presentation time and clock offset, without double counting frames',()=>{
 let now=100,wall=1000100;const t=new WebRtcTelemetry({sessionId:'sid',clickedAt:0,now:()=>now,wallNow:()=>wall});
 t.clock.sample(1000000,1000110,1000110,1000020,100);
 t.frame(100,{receiveTime:80});now=160;wall=1000160;t.captureFrameTime(100,1000150);
 const report=t.report(true);assert.equal(report.video.frames_rendered,1);assert.deepEqual(report.video.picture_age,{n:1,p50:50,p95:50,max:50});
 assert.equal(report.video.picture_age_source,'captureTime');assert.equal(report.video.picture_age_by_source.receiveTime.n,1);
});

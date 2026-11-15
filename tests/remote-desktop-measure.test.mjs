import assert from 'node:assert/strict';
import test from 'node:test';
import { RemoteInputHistory } from '../src/api/remote-desktop-input-history.ts';
import { RemoteDesktopMeasurements, decodeRemotePictureMarker } from '../src/api/remote-desktop-measure.ts';

export function markerPixels(capture,seq) {
  const word=(capture%2**24)*65536+(seq%65536);
  const bits=[1,0,1,0,1,1,0,0,...Array.from({length:40},(_,i)=>Math.floor(word/2**(39-i))%2)];
  for(let col=0;col<8;col++)bits.push(bits[8+col]^bits[16+col]^bits[24+col]^bits[32+col]^bits[40+col]);
  return new Uint8ClampedArray(bits.flatMap(bit=>[bit?235:20,bit?235:20,bit?235:20,255]));
}
function harness(start=1_000_000_000) {
  let now=start; const sent=[]; const listeners=new Set();
  const lane={send(text){sent.push(JSON.parse(text));return true;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  const m=new RemoteDesktopMeasurements('fixture-session',()=>now);
  m.setLane(lane);m.setEnabled(true);
  const sync=(offset=500,rtt=20)=>{
    const ping=sent.filter(v=>v.t==='rd.ping').at(-1);assert.ok(Number.isSafeInteger(ping.t_v));now+=rtt;
    for(const fn of listeners)fn({t:'rd.pong',v:1,sid:'fixture-session',t_v:ping.t_v,device_wall_ms:ping.t_v+rtt/2+offset});
  };
  const calibrate=()=>{for(let i=0;i<3;i++){if(i){now+=1000;m.tick();}sync();}};
  return {m,sent,lane,listeners,sync,calibrate,now:()=>now,advance(ms){now+=ms;},capture(age,seq){m.displayed((Math.round(now+500-age)%(2**24)),seq%65536,now);}};
}
test('C6 marker decodes MSB-first timestamp/input bits and rejects missing sync, parity, grey, truncated data',()=>{
  assert.deepEqual(decodeRemotePictureMarker(markerPixels(0xabcdef,0x3492)),{captureLow24:0xabcdef,appliedLow16:0x3492});
  for(const pixel of [0,8,48]){const data=markerPixels(0x123456,42);data[pixel*4]=data[pixel*4+1]=data[pixel*4+2]=data[pixel*4]>128?0:255;assert.equal(decodeRemotePictureMarker(data),null);}
  const grey=markerPixels(123,1);grey[10*4]=128;assert.equal(decodeRemotePictureMarker(grey),null);
  assert.equal(decodeRemotePictureMarker(new Uint8ClampedArray(0)),null);
});
test('known 500ms device offset gives absolute 150ms displayed age, with lowest-RTT clock synchronization',()=>{
  const h=harness();h.capture(150,0);assert.deepEqual(h.m.snapshot(),{},'no clock sync is unknown');
  h.calibrate();h.capture(150,0);assert.deepEqual(h.m.snapshot(),{picture_age_p50_ms:150,picture_age_p95_ms:150});
  assert.equal(h.m.clockUncertainty(),10);
  h.advance(1000);h.m.tick();h.sync(50_000,3000); // slow outlier must not displace low-RTT median
  h.capture(150,0);assert.equal(h.m.snapshot().picture_age_p95_ms,150);
  h.m.dispose();assert.equal(h.listeners.size,0);assert.equal(h.sent.at(-1).on,false);assert.deepEqual(h.m.snapshot(),{});
});
test('input-to-marker uses successful applied seq in the displayed frame, never an admission ACK; wraps are guarded',()=>{
  const h=harness();h.calibrate();h.m.inputSent(1);h.advance(100);h.capture(30,0);
  assert.equal(h.m.snapshot().input_to_picture_p50_ms,undefined);
  h.capture(30,1);assert.equal(h.m.snapshot().input_to_picture_p50_ms,100);
  h.m.takeWindow();
  for(const seq of [30000,60000,65535,65536,65537,90000,120000,131072]){h.m.inputSent(seq);h.advance(10);h.capture(5,seq);}
  assert.equal(h.m.takeWindow().input_to_picture_p95_ms,10,'continuous proved watermarks unwrap multiple 16-bit cycles');
  const ambiguous=harness();ambiguous.calibrate();for(let seq=1;seq<=65536;seq++)ambiguous.m.inputSent(seq);
  ambiguous.advance(100);ambiguous.capture(30,0);
  assert.equal(ambiguous.m.snapshot().input_to_picture_p50_ms,undefined,'a full cycle without displayed proof must stay unknown');
});
test('frozen/static picture ages, windows reset independently, and timestamp wrap resolves on the device clock',()=>{
  const h=harness(2**24-1000);h.calibrate();h.capture(50,0);h.advance(2000);h.m.sampleCurrentPicture();
  assert.equal(h.m.snapshot().picture_age_p95_ms,2050);
  assert.equal(h.m.takeWindow().picture_age_p95_ms,2050);assert.deepEqual(h.m.takeWindow(),{});
  h.capture(75,0);assert.equal(h.m.takeWindow().picture_age_p50_ms,75);
  h.m.setEnabled(false);assert.deepEqual(h.m.takeWindow(),{});
});
test('one-hour diagnostic traffic and frames have bounded histories; unmatched/session-mismatched pongs are ignored',()=>{
  const h=harness();h.calibrate();
  h.m.receive({t:'rd.pong',v:1,sid:'wrong',t_v:h.now(),device_wall_ms:0});
  for(let second=0;second<3600;second++){
    h.advance(1000);h.m.tick();if(second%2===0)h.sync();
    h.capture(100,0);
    for(let seq=second*40+1;seq<second*40+41;seq++)h.m.inputSent(seq);
  }
  assert.ok(h.m.pings.size<=8);assert.ok(h.m.offsets.length<=32);assert.ok(h.m.history.size<=256);
  for(const key of ['ages','windowAges','inputAges','windowInputAges'])assert.ok(h.m[key].length<=2000,key);
  h.m.dispose();assert.equal(h.listeners.size,0);
});


test('an invalid or unmarked new frame cannot age the previously displayed marked picture',()=>{
  const h=harness();h.calibrate();h.capture(50,0);h.m.takeWindow();
  h.m.invalidateFrame();h.advance(2000);h.m.sampleCurrentPicture();
  assert.deepEqual(h.m.takeWindow(),{});
  h.m.displayed(-1,0);h.advance(2000);h.m.sampleCurrentPicture();assert.deepEqual(h.m.takeWindow(),{});
});


test('same-session stream history replacement keeps a proved watermark beyond 16-bit half-wrap',()=>{
  const h=harness();h.calibrate();
  h.m.inputSent(30000);h.advance(10);h.capture(5,30000);
  h.m.inputSent(60000);h.advance(10);h.capture(5,60000);
  assert.equal(h.m.applied,60000);
  const replacement=new RemoteInputHistory(()=>h.now());
  h.m.setInputHistory(replacement);
  assert.equal(h.m.applied,60000);
  h.m.setLane(null);h.m.setLane(h.lane);h.calibrate();
  assert.equal(h.m.applied,60000,"lane resubscription also keeps the proved watermark");
  replacement.written(60001,'websocket',{kind:'move'});h.m.inputSent(60001);
  h.advance(80);h.capture(10,60001);
  assert.equal(h.m.inputAmbiguous,false);
  assert.equal(h.m.takeWindow().input_to_picture_p95_ms,80);
  assert.equal(replacement.get(60001).picturePending,false);
  h.m.dispose();
});


test('disabled measurement keeps no write records or calibration traffic and resumes above the current sequence',()=>{
  const h=harness();h.calibrate();
  h.m.inputSent(30000);h.advance(10);h.capture(5,30000);
  h.m.setEnabled(false);const messages=h.sent.length;
  for(let seq=30001;seq<=60000;seq++)h.m.inputSent(seq);
  h.m.tick();assert.equal(h.sent.length,messages);assert.equal(h.m.history.size,0);
  assert.equal(h.m.pings.size,0);assert.equal(h.m.offsets.length,0);
  h.m.setEnabled(true);h.calibrate();
  h.m.inputSent(60001);h.advance(40);h.capture(10,60001);
  assert.equal(h.m.snapshot().input_to_picture_p95_ms,40);
  h.m.dispose();assert.equal(h.m.history.size,0);
});

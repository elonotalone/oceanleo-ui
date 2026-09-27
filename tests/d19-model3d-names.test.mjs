import assert from 'node:assert/strict';
import test from 'node:test';
import { AnimationClip, AnimationMixer, VectorKeyframeTrack } from 'three';
import { exportModel3DGlb, parseModel3DGlb, loadModel3DUrl } from '../src/shell/media-editors/model3d-gltf.mjs';
import { parseGltfJsonDocument, parseGlbJsonDocument, roundtripFixtureGltf } from '../src/shell/media-editors/model3d-gltf-roundtrip.mjs';

test('names survive JSON import, GLB export/import and URL loading without losing animation targets', async () => {
  const doc = roundtripFixtureGltf();
  const names = ['Chair Seat 左 [A].part', 'Chair_Seat_左_Apart', 'Chair Seat 左 [A].part'];
  doc.nodes = names.map(name => ({ ...doc.nodes[0], name }));
  doc.scenes[0] = { name: 'Scene With Spaces', nodes: [0, 1, 2] };
  const parsed = await parseGltfJsonDocument(doc);
  assert.deepEqual(parsed.scene.children.map(o => o.name), names);
  assert.equal(parsed.scene.name, 'Scene With Spaces');
  const target = parsed.scene.children[2];
  const clip = new AnimationClip('Move Seat', 1, [new VectorKeyframeTrack(`${target.uuid}.position`, [0, 1], [1, 2, 3, 5, 2, 3])]);
  const glb = await exportModel3DGlb(parsed.scene, [clip]);
  const json = parseGlbJsonDocument(glb);
  assert.deepEqual(json.nodes.filter(n => n.mesh !== undefined).map(n => n.name), names);
  for (const loaded of [await parseModel3DGlb(glb), await loadModel3DUrl(`data:model/gltf-binary;base64,${Buffer.from(glb).toString('base64')}`)]) {
    const meshes = [];
    loaded.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    assert.deepEqual(meshes.map(o => o.name), names);
    const mixer = new AnimationMixer(loaded.scene);
    mixer.clipAction(loaded.animations[0]).play();
    mixer.setTime(0.5);
    assert.equal(meshes[2].position.x, 3, 'animation must still target the third, duplicate-named node');
    assert.equal(meshes[0].position.x, 1);
    meshes[2].name = 'Edited Name With Spaces';
    const next = parseGlbJsonDocument(await exportModel3DGlb(loaded.scene, loaded.animations));
    assert.ok(next.nodes.some(n => n.name === 'Edited Name With Spaces'), 'stale userData.name must not override an edit');
    mixer.stopAllAction();
  }
});

test('unnamed nodes keep authored mesh and camera labels with spaces', async () => {
  const doc = roundtripFixtureGltf();
  doc.nodes = [{ mesh: 0 }, { camera: 0 }];
  doc.meshes[0].name = 'Mesh With Spaces';
  doc.cameras = [{ name: 'Camera With Spaces', type: 'perspective', perspective: { yfov: 0.8, znear: 0.1 } }];
  doc.scenes[0].nodes = [0, 1];
  const parsed = await parseGltfJsonDocument(doc);
  assert.deepEqual(parsed.scene.children.map(o => o.name), ['Mesh With Spaces', 'Camera With Spaces']);
  const reloaded = await parseModel3DGlb(await exportModel3DGlb(parsed.scene));
  const names = [];
  reloaded.scene.traverse(o => { if (o.isMesh || o.isCamera) names.push(o.name); });
  assert.deepEqual(names, ['Mesh With Spaces', 'Camera With Spaces']);
});

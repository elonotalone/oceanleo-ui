/** Restore authored labels after GLTFLoader sanitizes/uniquifies binding names.
 * Bind animations to UUIDs first, so spaces, punctuation and duplicate labels
 * cannot redirect tracks to another object. Never restore from stale extras.
 */
export function restoreModel3DNames(gltf) {
  const parser = gltf.parser;
  if (!parser) return gltf;
  const scenes = gltf.scenes || [gltf.scene];
  const bindings = new Map();
  for (const scene of scenes) {
    scene.traverse(object => {
      if (object.name) bindings.set(object.name, object.uuid);
    });
  }
  for (const clip of gltf.animations || []) {
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const uuid = bindings.get(track.name.slice(0, dot));
      if (dot > 0 && uuid) track.name = uuid + track.name.slice(dot);
    }
  }
  scenes.forEach((scene, index) => {
    scene.traverse(object => {
      const association = parser.associations.get(object);
      if (!association) return;
      const node = parser.json.nodes?.[association.nodes];
      const definition = [node,
        parser.json.meshes?.[association.meshes ?? node?.mesh],
        parser.json.cameras?.[node?.camera],
      ].find(value => typeof value?.name === 'string');
      if (typeof definition?.name === 'string') object.name = definition.name;
    });
    const name = parser.json.scenes?.[index]?.name;
    if (typeof name === 'string') scene.name = name;
  });
  return gltf;
}

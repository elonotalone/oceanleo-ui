import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// native-editors wave (W14): the audio / 3D Pro iframe mount harness that lived here exercised
// the deleted hosted Pro faces (AudioPlaylistStage, Model3DNextStage). Those cases are gone with
// the code they drove; what still exists — one working-document schema per editor, no leave-pro
// lock, game working document — is asserted below.

const repoFile = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const { asGameWorkingDocument, peekGameWorkingDocument, stashGameWorkingDocument, GAME_WORKING_DOCUMENT_SCHEMA } =
  await import(
    await compileModule("src/shell/advanced-routes/GameRoute.tsx", {
      "../AdvancedWorkbenchShell": dataModule(
        "export function AdvancedWorkbenchShell(){return null}",
      ),
      "../AdvancedContentWorkbench": dataModule(
        "export function AdvancedContentWorkbench(){return null}",
      ),
    })
  );

test("owned audio/3D/PDF/game sources share one working schema and have no leave-pro lock", () => {
  const audioRoute = repoFile("../src/shell/advanced-routes/AudioRoute.tsx");
  const modelRoute = repoFile("../src/shell/advanced-routes/Model3DRoute.tsx");
  const pdfRoute = repoFile("../src/shell/advanced-routes/PdfRoute.tsx");
  const gameRoute = repoFile("../src/shell/advanced-routes/GameRoute.tsx");
  const gameCode = repoFile("../src/shell/game-editor/GameCodeStage.tsx");
  assert.match(audioRoute, /draftSchema:\s*"oceanleo\.audio\.edit\.v1"/);
  assert.match(modelRoute, /draftSchema:\s*"oceanleo\.threed\.edit\.v1"/);
  assert.match(gameRoute, /GAME_WORKING_DOCUMENT_SCHEMA/);
  assert.match(gameCode, /GAME_WORKING_DOCUMENT_SCHEMA/);
  assert.doesNotMatch(gameCode, /oceanleo\.game\.code\.v1/);
  assert.doesNotMatch(pdfRoute, /draftSchema:/);
  assert.doesNotMatch(pdfRoute, /W19_PRO_SAVED_AS_NEW_VERSION/);
  for (const body of [audioRoute, modelRoute, pdfRoute]) {
    assert.doesNotMatch(body, /saveBeforeLeavePro/);
    assert.doesNotMatch(body, /专业编辑里的修改还没保存成功/);
    assert.doesNotMatch(body, /handoffItemKey=/);
    assert.doesNotMatch(body, /<iframe|usePluginMode|PluginModeSwitchGate/);
  }
});

test("audio and 3D no longer have hosted Pro leaf stages", () => {
  for (const gone of [
    "../src/shell/media-editors/AudioPlaylistStage.tsx",
    "../src/shell/media-editors/Model3DNextStage.tsx",
  ]) {
    assert.equal(existsSync(new URL(gone, import.meta.url)), false, gone);
  }
});

test("P7 game: both faces read and write one working document", () => {
  assert.equal(GAME_WORKING_DOCUMENT_SCHEMA, "oceanleo.game.edit.v1");
  const item = { artifactId: "game-1", id: "game-1" };
  const fromCode = asGameWorkingDocument({
    envelopeUrl: "https://fixture.invalid/game.json",
    envelopeDigest: "abc",
    origin: "ai",
    source: "<!doctype html><html><body><script></script></body></html>",
    prompt: "jump",
  });
  assert.ok(fromCode);
  stashGameWorkingDocument(item, fromCode);
  const peeked = peekGameWorkingDocument(item);
  assert.equal(peeked?.source, fromCode.source);
  assert.equal(peeked?.envelopeUrl, fromCode.envelopeUrl);
  const fromPlay = asGameWorkingDocument({
    envelopeUrl: "https://fixture.invalid/game-2.json",
    envelopeDigest: "def",
    origin: "remix",
  });
  assert.ok(fromPlay);
  assert.equal(fromPlay.source, undefined);
  assert.equal(asGameWorkingDocument({ origin: "upload", source: "<html>" }), null);
});

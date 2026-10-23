# W13 final new-error localization

Owner: existing `/root/pdf`. Same W13 source/copy ownership; no other feature.

Exact paths:
- src/shell/media-editors/use-model3d-source-loader.ts
- src/i18n/ui/messages/editor-overhaul-copy-w13.ts
- tests/editor-overhaul-w13-source-errors.test.mjs (new focused regression)
- tests/editor-overhaul-w13-copy.test.mjs (only the positive key-count42→45;
  retain locale/registration/non-Chinese assertions unchanged)
- existing W13 report/state/journal, only to record this result

Three new checkpoint errors from the opaque-source fix currently pass to the UI
as untranslated Chinese: 无法恢复 3D 检查点版本 / 3D 检查点来源身份无法确认 /
3D 检查点内容校验失败. Map only these known messages through explicit static tt()
keys at the UI error boundary and add the16 non-Chinese translations. Preserve
Abort suppression, Model3DClosureError code/detail and unrelated error semantics.
Do not change grant/auth/digest/identity/loader behavior or extract source merely
for tests. Test the real boundary with translated outputs plus abort/closure/
unknown error negative controls, and check all16 locale dictionaries.

Source/copy writes are forbidden while W10 final public-fork/library browser is
running. Read/prepare first; parent explicitly announces the write window. Then
one atomic source+copy batch, exact --only commit, focused tests; no Chrome,
dependencies, shared aggregator, global baseline, runtime restart or deployment.
Parent owns final global typecheck/freshness and all other source files.

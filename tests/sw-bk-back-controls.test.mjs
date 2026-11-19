import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';

// Exceptions are actions with different semantics, not alternative back styles.
const ALLOW = [
  ['src/shell/bay/asset/BayAssetDetail.tsx', /aria-label=\{tt\("关闭"\)\}/, 'U23: close detail (renamed from Back to Close)'],
  ['src/shell/bay/asset/BayLicensesView.tsx', /aria-label=\{tt\("关闭"\)\}/, 'U24: close licenses (renamed from Back to Close)'],
  ['src/shell/messages/call/ui/CallStage.tsx', /上一页/, 'Page through call participants, not back navigation'],
  ['src/pages/AuthDialog.tsx', /data-auth-back\b/, 'U01–U03: full-width sign-in form actions; step header has BackButton'],
  ['src/pages/PasswordResetPage.tsx', /data-reset-back\b/, 'U04: full-width sign-in form action; page header has BackButton'],
  ['src/pages/devices/DeviceFolderPicker.tsx', /上一级/, 'U54: move up a folder, not back in navigation'],
  ['src/shell/cloud-computer/ShellTaskView.tsx', /返回首页/, 'U32: home link on a missing-session page'],
  ['src/shell/cloud-computer/server-page/ServerPage.tsx', /返回首页/, 'U34: missing-server home CTA (header uses BackButton)'],
  ['src/shell/SiteCatalogConsole.tsx', /返回我的任务|返回 App 目录/, 'U47/U48: missing-task/app navigation CTAs'],
  ['src/shell/task-attachment-library-link.tsx', /data-task-attachment-prev/, 'Previous attachment in a gallery'],
  ['src/shell/bay/shell/ReadyMaterialCatalog.tsx', /向左滚动/, 'Horizontal category carousel'],
  ['src/shell/realtime-call/RealtimeCallHost.tsx', /setMinimized\(false\)/, 'Restore an ongoing minimized call'],
  ['app/not-found.tsx', /返回主页/, 'O06: home navigation link on 404'],
  ['app/help/layout.tsx', /返回/, 'O05: footer link to the portal'],
];

function scanSource(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = node.openingElement || node;
      const tag = opening.tagName.getText(ast);
      if (/^(button|a|Link|IconButton|FloatingMenuItem)$/.test(tag)) {
        const attrs = opening.attributes.properties;
        const attrText = name => attrs.find(a => a.name?.getText(ast) === name)?.getText(ast) || '';
        const visible = [attrText('aria-label'), attrText('title'), attrText('label'), attrText('icon'),
          ...(node.children || []).map(n => n.getText(ast))].join(' ');
        const click = attrText('onClick') + attrText('onSelect');
        if (/返回|回到主线|回到卡片|\b[Bb]ack\b|[‹←]|ChevronLeft|ImBackIcon|IconBack|name="back"/.test(visible)
          || /\bonBack\b|\bgoBack\b|\bbackTo\w*|\bback\b|\.back\(/.test(click)) {
          const code = node.getText(ast);
          if (!ALLOW.some(([f, pattern]) => f === file && pattern.test(code))) {
            found.push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1} ${tag}: ${code.replace(/\s+/g, ' ').slice(0, 210)}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}
function scan(root, dirs) {
  const files = execFileSync('rg', ['--files', ...dirs, '-g', '*.tsx', '-g', '*.jsx'], {cwd: root, encoding:'utf8'}).trim().split('\n');
  return files.flatMap(file => scanSource(file, fs.readFileSync(path.join(root, file), 'utf8')));
}

test('all UI back controls use the Library primitive; exceptions have explicit reasons', () => {
  const remaining = scan(process.cwd(), ['src']);
  if (process.env.BK_PROVE_SCAN_FAILURE) remaining.push(...scanSource('src/probe.tsx', '<button onClick={onBack}>Back</button>'));
  assert.deepEqual(remaining, [], `Back controls outside the primitive:\n${remaining.join('\n')}`);
});
test('portal back controls use the exported Library primitive', {skip: !process.env.BK_PORTAL_ROOT}, () => {
  const remaining = scan(process.env.BK_PORTAL_ROOT, ['app', 'components']);
  assert.deepEqual(remaining, [], `Portal back controls outside the primitive:\n${remaining.join('\n')}`);
});
test('the scanner catches a new text control and an unlabelled onBack control', () => {
  assert.equal(scanSource('new.tsx', '<><button>← Back to list</button><button onClick={onBack}>x</button></>').length, 2);
  assert.deepEqual(scanSource('new.tsx', '<BackButton label="Back" onClick={onBack} />'), []);
  for (const [, , reason] of ALLOW) assert.ok(reason.length > 20);
});

test('close, folder-up, form and home actions retain their distinct semantics', () => {
  for (const file of ['BayAssetDetail', 'BayLicensesView']) {
    const source=fs.readFileSync(`src/shell/bay/asset/${file}.tsx`,'utf8');
    assert.match(source, /aria-label=\{tt\("关闭"\)\}/);
    assert.doesNotMatch(source, /aria-label=\{tt\("返回"\)\}/);
    assert.match(source, /onClick=\{onClose\}/);
  }
  const auth=fs.readFileSync('src/pages/AuthDialog.tsx','utf8');
  assert.equal((auth.match(/<BackButton data-auth-step-back/g)||[]).length,3);
  assert.equal((auth.match(/\bdata-auth-back\b/g)||[]).length,3, 'full-width form actions remain');
  const reset=fs.readFileSync('src/pages/PasswordResetPage.tsx','utf8');
  assert.match(reset, /<BackButton data-reset-step-back/);
  assert.match(reset, /data-reset-back/);
  const folder=fs.readFileSync('src/pages/devices/DeviceFolderPicker.tsx','utf8');
  assert.match(folder, /aria-label=\{tt\("上一级"\)\}/);
  assert.match(folder, /listing\.parent/);
});

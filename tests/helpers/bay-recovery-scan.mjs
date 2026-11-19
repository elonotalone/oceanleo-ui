import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

// These controls repeat explicit mutations or obtain consent for a new session.
// They are not failed page reads; automatically invoking them could send twice,
// upload twice, install software, transfer funds, or open a charged session.
export const EXPLICIT_ACTION_RETRIES = {
  'src/lib/upload/upload-tile.tsx': 'retry a selected upload',
  'src/shell/LeoComposer.tsx': 'retry a selected attachment upload',
  'src/shell/AttachmentStrip.tsx': 'retry a selected attachment upload',
  'src/shell/MyLibrary.tsx': 'retry failed file uploads only',
  'src/shell/CloudBrowserPanel.tsx': 'explicit browser session connection',
  'src/shell/cloud-computer/native-surface/ProgramAccess.tsx': 'explicit login/install consent',
  'src/shell/cloud-computer/native-surface/NativeTerminalSurface.tsx': 'explicit terminal session connection',
  'src/shell/messages/composer/AttachmentTray.tsx': 'retry a selected attachment upload',
  'src/shell/messages/conversation/MessageItem.tsx': 'resend a failed message',
  'src/shell/acp-task/PendingSendBubble.tsx': 'resend a failed task message',
  'src/shell/website-platform/WebsiteConfiguration.tsx': 'explicitly apply a connector configuration',
  'src/pages/org/OrgWallet.tsx': 'explicitly submit a transfer',
  'src/pages/settings/connectors/ConnectorRow.tsx': 'explicit connector connection',
  'src/shell/website-platform/WebsitePreviewPicker.tsx': 'insert a screenshot reference into the draft',
  'src/shell/RdServiceStatus.tsx': 'Check background status again; automatic polling already runs',
};

const actionMarkers = {
  'src/lib/upload/upload-tile.tsx': 'data-upload-retry',
  'src/shell/LeoComposer.tsx': 'onRetryAttachment(item.id)',
  'src/shell/AttachmentStrip.tsx': 'onRetry(a.id)',
  'src/shell/MyLibrary.tsx': 'onClick={retryFailedUploads}',
  'src/shell/CloudBrowserPanel.tsx': 'openSelectedSession()',
  'src/shell/cloud-computer/native-surface/ProgramAccess.tsx': ['dialog.openLogin(program)', 'dialog.startInstall'],
  'src/shell/cloud-computer/native-surface/NativeTerminalSurface.tsx': 'onClick={() => void open()}',
  'src/shell/messages/composer/AttachmentTray.tsx': 'onRetry(job.id)',
  'src/shell/messages/conversation/MessageItem.tsx': 'handlers.onRetry(pending.clientId)',
  'src/shell/acp-task/PendingSendBubble.tsx': 'data-acp-pending-retry',
  'src/shell/website-platform/WebsiteConfiguration.tsx': 'onSelect(slot.slot, draft)',
  'src/pages/org/OrgWallet.tsx': 'data-org-transfer-submit',
  'src/pages/settings/connectors/ConnectorRow.tsx': 'primaryLabel',
  'src/shell/website-platform/WebsitePreviewPicker.tsx': 'insert(retryReference)',
  'src/shell/RdServiceStatus.tsx': 'tt(COPY.retry)',
};

function localModule(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier.replace(/\.js$/, ''));
  return ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext => base + ext)
    .find(file => /\.tsx?$/.test(file) && existsSync(file) && statSync(file).isFile());
}

/** Includes static imports, re-exports and lazy/dynamic imports; skips type-only edges. */
export function bayRecoverySources(roots = ['src/shell/bay/shell/LeoBayPage.tsx', 'src/shell/ResultCanvas.tsx']) {
  const sources = new Map();
  function visit(file) {
    if (sources.has(file)) return;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    sources.set(file, source);
    function walk(node) {
      let specifier;
      if ((ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly)
        || (ts.isExportDeclaration(node) && !node.isTypeOnly)) specifier = node.moduleSpecifier?.text;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifier = node.arguments[0]?.text;
      if (specifier) {
        const next = localModule(file, specifier);
        if (next) visit(next);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  roots.forEach(file => visit(resolve(file)));
  return new Map([...sources].map(([file, source]) => [relative(process.cwd(), file), source]));
}

export function manualRecoveryControls(source) {
  const hits = [];
  function walk(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (/^(button|Button|a|IconButton|FloatingMenuItem)$/.test(opening.tagName.getText(source))) {
        // Read the label, not onClick callbacks or data-* diagnostics.
        const labels = ts.isJsxElement(node) ? node.children.map(child => child.getText(source)).join(' ') : '';
        const attrs = opening.attributes.properties.filter(attr => ts.isJsxAttribute(attr) && /^(aria-label|title|label)$/.test(attr.name.getText(source))).map(attr => attr.getText(source)).join(' ');
        if (/重试|重新加载|重新载入|再试一次|\bretry\b|\breload\b|try.again|retryLabel|libraryLoadFailureCopy/i.test(labels + attrs)) {
          const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
          hits.push({ file: source.fileName, line: pos.line + 1, control: node.getText(source) });
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  return hits;
}

export function forbiddenRecoveryControls(sources) {
  return [...sources].flatMap(([file, source]) => manualRecoveryControls(source)
    .filter(hit => {
      if (!EXPLICIT_ACTION_RETRIES[file]) return true;
      // A new page-load Retry in any of these files still fails the scan.
      const markers = [actionMarkers[file]].flat().filter(Boolean);
      return !markers.some(marker => hit.control.includes(marker));
    }).map(({ line }) => `${file}:${line}`));
}

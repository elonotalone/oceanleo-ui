import './helpers/w1-jsdom-window.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { sampleBytes } from './helpers/ppt-style-fixture.mjs';
import * as visuals from '../src/shell/doc-editors/DeckPptxVisuals.ts';
import { deckPreviewLogicalSize } from '../src/shell/doc-editors/deck-preview-geometry.ts';
import { officeSourceCacheKey } from '../src/shell/office-editor/office-source-identity.ts';
// Execute the actual preview entry and thumbnail workshop, isolating unrelated
// media viewers. The parser, OOXML adapter, image painter and font loader are real.
const path = new URL('../src/shell/library-viewers.tsx', import.meta.url);
const file = ts.createSourceFile(path.pathname, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['PptViewer', 'startPptxThumbnailPass', 'applyPptxLogicalSize', 'scheduleAfterPaint', 'namespacePptxSurfaceIds', 'clonePptxSlideSurface', 'PptxSlideThumbnail', 'PendingSlideThumbnail', 'readableSlideName'];
const source = names.map(name => file.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === name).getText(file)).join('\n');
const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const makeEntry = new Function('deps', `const {React,useState,useRef,useEffect,useCallback,useMemo,useUI,DeckPreviewLayout,ViewerParsingPoster,ErrorView,fetchValidatedOfficePackage,loadPptxPreview,deckPreviewLogicalSize,officeSourceCacheKey,applyDeckPptxPreviewVisuals,paintDeckPptxPreviewImages,loadDeckPptxPreviewFonts}=deps;${js};return {PptViewer,startPptxThumbnailPass};`);
const lodash = import.meta.resolve('lodash');
const { init } = await import(await compileModule('vendor/pptx-preview/pptx-preview.es.js', {
    lodash: dataModule(`import lib from ${JSON.stringify(lodash)};export const get=lib.get,omit=lib.omit;`),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise(r => setTimeout(r, 10));
async function until(check) { for (let i = 0; i < 100; i++) {
    if (check())
        return;
    await act(tick);
} assert.fail('preview did not settle'); }
function fontEnvironment({ hold = false, fail = false } = {}) {
    let release;
    const gate = hold ? new Promise(r => release = r) : Promise.resolve();
    const requests = [];
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add() { }, async load(spec, text) { requests.push({ spec, text }); return [{}]; }, ready: Promise.resolve() } });
    globalThis.FontFace = class {
        constructor(family) { this.family = family; requests.push({ family }); }
        async load() { await gate; if (fail)
            throw new Error('offline'); return this; }
    };
    return { requests, release };
}
async function bench(options = {}) {
    const bytes = await sampleBytes();
    const renders = [];
    const observers = [];
    const reset = document.createElement('style');
    reset.textContent = 'img{max-width:100%;height:auto}';
    document.head.append(reset);
    const OriginalObserver = window.MutationObserver;
    window.MutationObserver = class extends OriginalObserver {
        observe(...args) { observers.push(this); return super.observe(...args); }
        disconnect() { this.stopped = true; super.disconnect(); }
    };
    const fonts = fontEnvironment(options);
    const { PptViewer, startPptxThumbnailPass } = makeEntry({ React, ...React, useUI: () => s => s,
        DeckPreviewLayout: ({ slides, children, stageOverlay }) => React.createElement('section', null, React.createElement('aside', { 'data-rail': '' }, slides.map(s => React.createElement('div', { key: s.id }, s.thumbnail))), React.createElement('main', null, children, stageOverlay)),
        ViewerParsingPoster: () => null, ErrorView: ({ message }) => React.createElement('div', null, message),
        fetchValidatedOfficePackage: async () => ({ arrayBuffer: bytes }),
        loadPptxPreview: async () => ({ init: (host, opts) => { const preview = init(host, opts); const render = preview.renderSingleSlide.bind(preview); preview.renderSingleSlide = i => { renders.push({ host, index: i }); if (options.renderError)
                throw new Error('render failed'); return render(i); }; return preview; } }),
        deckPreviewLogicalSize, officeSourceCacheKey, ...visuals,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    return { container, root, renders, observers, fonts, bytes, startPptxThumbnailPass,
        async mount() { await act(async () => root.render(React.createElement(PptViewer, { item: { id: 'fixture', title: '样本', kind: 'ppt', url: 'https://sample.test/deck.pptx' } }))); },
        async close() { await act(async () => root.unmount()); container.remove(); reset.remove(); window.MutationObserver = OriginalObserver; delete document.fonts; delete globalThis.FontFace; },
    };
}
function title(root) { return [...root.querySelectorAll('span')].find(n => n.textContent === '赤沙台遗址'); }
function assertImage(root) { const image = root.querySelector('img'); assert.ok(Boolean(image)); assert.equal(image.style.maxWidth, 'none'); assert.equal(image.style.width, `${image.getAttribute('width')}px`); assert.equal(image.style.height, `${image.getAttribute('height')}px`); assert.ok(Number(image.getAttribute('width')) > 549); assert.equal(window.getComputedStyle(image).maxWidth, 'none'); assert.equal(window.getComputedStyle(image).height, `${image.getAttribute('height')}px`); }
test('real main preview entry merges paragraph style before first paint', async () => {
    const b = await bench();
    try {
        await b.mount();
        await until(() => title(b.container));
        const t = title(b.container);
        assert.equal(t.style.fontSize, '37px');
        assert.equal(t.style.color, 'rgb(255, 240, 210)');
        assert.match(t.style.fontFamily, /Noto Serif SC/);
    }
    finally {
        await b.close();
    }
});
test('real main preview entry protects enlarged crop geometry', async () => {
    const b = await bench();
    try {
        await b.mount();
        await until(() => title(b.container));
        assertImage(b.container.querySelector('main'));
    }
    finally {
        await b.close();
    }
});
test('real thumbnail entry paints inherited styles and image size before synchronous clone', async () => {
    const b = await bench();
    try {
        await b.mount();
        await until(() => title(b.container.querySelector('aside')));
        const rail = b.container.querySelector('aside');
        assert.equal(title(rail).style.fontSize, '37px');
        assert.equal(title(rail).style.color, 'rgb(255, 240, 210)');
        assertImage(rail);
    }
    finally {
        await b.close();
    }
});
test('first preview paint waits for actual aliased fonts', async () => {
    const b = await bench({ hold: true });
    try {
        await b.mount();
        // 合并后的字体加载器按文字实际覆盖选分片：纯中文标题只请求 Noto Serif SC。
        await until(() => b.fonts.requests.some(r => r.family === 'Noto Serif SC'));
        assert.equal(b.renders.length, 0);
        b.fonts.release();
        await until(() => title(b.container));
        assert.ok(b.fonts.requests.some(r => r.family === 'Noto Serif SC'));
        assert.ok(b.fonts.requests.some(r => r.text === '赤沙台遗址'));
    }
    finally {
        b.fonts.release();
        await b.close();
    }
});
test('font download failure renders with a generic fallback', async () => {
    const b = await bench({ fail: true });
    try {
        await b.mount();
        await until(() => title(b.container));
        assert.equal(title(b.container).style.fontFamily, 'serif');
        assert.equal(b.container.querySelector('[data-pptx-parse-state]').dataset.pptxParseState, 'ready');
    }
    finally {
        await b.close();
    }
});
test('preview visual observers disconnect on unmount and render errors', async () => {
    for (const renderError of [false, true]) {
        const b = await bench({ renderError });
        try {
            await b.mount();
            await until(() => renderError ? b.container.querySelector('[role=alert]') : title(b.container));
            assert.ok(b.observers.length > 0);
        }
        finally {
            await b.close();
        }
        assert.ok(b.observers.every(o => o.stopped));
    }
});
const { DeckElementContent } = await import(await compileModule('src/shell/doc-editors/DeckElementContent.tsx'));
for (const table of [false, true])
    test(`editor ${table ? 'table cells' : 'text'} waits for fonts and repaints without changing stored face`, async () => {
        const fonts = fontEnvironment({ hold: true });
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        const element = { id: 'text', type: table ? 'table' : 'text', text: '赤沙台遗址', rows: table ? [['赤沙台遗址']] : undefined, fontFamily: 'Noto Serif CJK SC', bold: true, fontSize: 37, x: 0, y: 0, width: 40, height: 10, order: 1 };
        try {
            await act(async () => root.render(React.createElement(DeckElementContent, { element })));
            const node = container.firstElementChild;
            assert.equal(node.style.visibility, 'hidden');
            fonts.release();
            await until(() => node.style.visibility !== 'hidden');
            assert.ok(fonts.requests.some(r => r.family === 'Noto Serif SC'));
            assert.ok(fonts.requests.some(r => r.spec?.startsWith('700 ')));
            assert.equal(element.fontFamily, 'Noto Serif CJK SC');
        }
        finally {
            fonts.release();
            await act(async () => root.unmount());
            container.remove();
            delete document.fonts;
            delete globalThis.FontFace;
        }
    });
test('editor font failure repaints with generic serif and stays editable', async () => {
    const fonts = fontEnvironment({ fail: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(React.createElement(DeckElementContent, { element: { id: 't', type: 'text', text: '赤沙台遗址', fontFamily: 'Noto Serif CJK SC' }, editing: true })));
        await until(() => container.firstElementChild.style.fontFamily === 'serif');
        assert.equal(container.firstElementChild.getAttribute('contenteditable'), 'true');
        assert.notEqual(container.firstElementChild.style.visibility, 'hidden');
    }
    finally {
        await act(async () => root.unmount());
        container.remove();
        delete document.fonts;
        delete globalThis.FontFace;
    }
});
test('real vendored table cells load their display aliases without traversing presentation cycles', async () => {
    const { default: PptxGenJS } = await import('pptxgenjs');
    const deck = new PptxGenJS();
    deck.addSlide().addTable([['表格字体']], { fontFace: 'Noto Serif CJK SC' });
    const bytes = await (await deck.write({ outputType: 'blob' })).arrayBuffer();
    const fonts = fontEnvironment();
    const host = document.createElement('div');
    document.body.append(host);
    const preview = init(host, { mode: 'slide', width: 960, height: 540 });
    let stop;
    try {
        const model = await preview.load(bytes);
        stop = visuals.applyDeckPptxPreviewVisuals(preview.wrapper, model, bytes);
        await visuals.loadDeckPptxPreviewFonts(model);
        assert.ok(fonts.requests.some(r => r.family === 'Noto Serif SC'));
        preview.renderSingleSlide(0);
        const run = [...host.querySelectorAll('span')].find(e => e.textContent === '表格字体');
        assert.ok(Boolean(run));
        assert.match(run.style.fontFamily, /Noto Serif SC/);
    }
    finally {
        stop?.();
        preview.destroy();
        host.remove();
        delete document.fonts;
        delete globalThis.FontFace;
    }
});
test('cancelling during main font loading disconnects visuals and never paints late', async () => {
    const b = await bench({ hold: true });
    let closed = false;
    try {
        await b.mount();
        await until(() => b.fonts.requests.length > 0);
        await b.close();
        closed = true;
        assert.ok(b.observers.length > 0);
        assert.ok(b.observers.every(o => o.stopped));
        b.fonts.release();
        await act(tick);
        assert.equal(b.renders.length, 0);
        assert.equal(document.querySelectorAll('[data-pptx-thumbnail-workshop]').length, 0);
    }
    finally {
        b.fonts.release();
        if (!closed)
            await b.close();
    }
});
test('thumbnail workshop waits for fonts and cancels without cloning or leaking an observer', async () => {
    const b = await bench({ hold: true });
    let stop;
    let painted = 0;
    try {
        stop = b.startPptxThumbnailPass({ init, arrayBuffer: b.bytes, logicalSize: { width: 960, height: 540 }, onSlide() { painted++; }, onSettled() { } });
        await until(() => b.fonts.requests.length > 0);
        assert.equal(painted, 0);
        stop();
        b.fonts.release();
        await act(tick);
        assert.equal(painted, 0);
        assert.equal(document.querySelectorAll('[data-pptx-thumbnail-workshop]').length, 0);
        assert.ok(b.observers.length > 0);
        assert.ok(b.observers.every(o => o.stopped));
    }
    finally {
        stop?.();
        b.fonts.release();
        await b.close();
    }
});
test('editor/presenter fonts load into the rendered element document', async () => {
    const mainFonts = fontEnvironment();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const target = frame.contentDocument;
    const families = [];
    Object.defineProperty(target, 'fonts', { configurable: true, value: { add(face) { families.push(face.family); }, async load() { return [{}]; }, ready: Promise.resolve() } });
    target.defaultView.FontFace = class {
        constructor(family) { this.family = family; }
        async load() { return this; }
    };
    const root = createRoot(target.body);
    try {
        await act(async () => root.render(React.createElement(DeckElementContent, { element: { id: 't', type: 'text', text: '投影文字', fontFamily: 'Noto Serif CJK SC' } })));
        await act(tick);
        assert.ok(families.includes('Noto Serif SC'));
        assert.equal(mainFonts.requests.length, 0);
    }
    finally {
        await act(async () => root.unmount());
        frame.remove();
        delete document.fonts;
        delete globalThis.FontFace;
    }
});

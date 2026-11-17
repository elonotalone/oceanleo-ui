import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCALES } from '../src/i18n/config.ts';
import { LIBRARY_PREVIEW_MESSAGES } from '../src/i18n/ui/messages/library-preview-copy.ts';
import { UI_MESSAGES } from '../src/i18n/ui/messages/index.ts';
test('new preview messages are available in every interface locale',()=>{
 assert.equal(LOCALES.length,17);
 const keys=Object.keys(LIBRARY_PREVIEW_MESSAGES.zh);assert.equal(keys.length,6);
 for(const locale of LOCALES)for(const key of keys){assert.ok(LIBRARY_PREVIEW_MESSAGES[locale][key],`${locale}: ${key}`);assert.equal(UI_MESSAGES[locale][key],LIBRARY_PREVIEW_MESSAGES[locale][key]);}
});

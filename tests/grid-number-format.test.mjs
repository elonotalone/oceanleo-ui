import assert from "node:assert/strict";
import test from "node:test";

import {
  NUMBER_FORMAT_PRESETS,
  compareRawGridValues,
  excelSerialToDate,
  formatWithNumberFormat,
  legacyNumberFormatPattern,
  numberFormatFromXlsxCode,
  numberFormatToXlsxCode,
  parseGridDateValue,
  parseNumberFormat,
} from "../src/shell/doc-editors/grid-format/number-format.ts";

const render = (value, pattern) => formatWithNumberFormat(value, pattern).text;

test("four sections mean 正 / 负 / 零 / 文本 and the negative section gets the absolute value", () => {
  const pattern = '0"正";0"负";"零";"文本:"@';
  const spec = parseNumberFormat(pattern);
  assert.equal(spec.sections.length, 4);

  assert.equal(render(5, pattern), "5正");
  // The sign is the pattern's job in the negative section — this is what lets
  // an accounting format print brackets without a stray minus.
  assert.equal(render(-5, pattern), "5负");
  assert.equal(render(0, pattern), "零");
  assert.equal(render("abc", pattern), "文本:abc");

  // Two sections split at zero; three sections give zero its own slot.
  assert.equal(render(-5, "0.0;(0.0)"), "(5.0)");
  assert.equal(render(0, "0.0;(0.0)"), "0.0");
  assert.equal(render(0, "0.0;(0.0);\\-"), "-");

  // One section applies to every number and keeps the sign itself.
  assert.equal(render(-5, "0.00"), "-5.00");
});

test("accounting negatives print in brackets and carry the section colour", () => {
  const pattern = "#,##0.00_);[Red](#,##0.00)";
  const negative = formatWithNumberFormat(-1234.5, pattern);
  assert.equal(negative.text, "(1,234.50)");
  assert.equal(negative.color, "#ff0000");

  const positive = formatWithNumberFormat(1234.5, pattern);
  // `_)` reserves the width of a bracket so the columns line up.
  assert.equal(positive.text, "1,234.50 ");
  assert.equal(positive.color, undefined);
});

test("mm is minutes next to hours or seconds and months everywhere else", () => {
  const stamp = "2026-08-31T13:05:09";

  assert.equal(render(stamp, "yyyy-mm-dd"), "2026-08-31");
  assert.equal(render(stamp, "yyyy年mm月"), "2026年08月");
  assert.equal(render(stamp, "mm/dd"), "08/31");

  assert.equal(render(stamp, "hh:mm:ss"), "13:05:09");
  assert.equal(render(stamp, "hh:mm"), "13:05");
  // No hour ahead of it, but seconds behind it — still minutes.
  assert.equal(render(stamp, "mm:ss"), "05:09");
  // Both readings in one pattern; each `mm` resolves from its own neighbours.
  assert.equal(render(stamp, "yyyy-mm-dd hh:mm"), "2026-08-31 13:05");

  // Single `m` follows the same rule.
  assert.equal(render(stamp, "yyyy-m-d"), "2026-8-31");
  assert.equal(render(stamp, "h:m"), "13:5");
});

test("aaa and aaaa render the Chinese weekday without a locale library", () => {
  assert.equal(render("2026-08-31", "aaa"), "一");
  assert.equal(render("2026-08-31", "aaaa"), "星期一");
  assert.equal(render("2026-09-06", "aaa"), "日");
  assert.equal(render("2026-09-06", "aaaa"), "星期日");
  assert.equal(render("2026-08-31", "yyyy年m月d日 aaaa"), "2026年8月31日 星期一");
});

test("12-hour clock, elapsed time and fractional seconds", () => {
  assert.equal(render("2026-08-31T13:05:09", "h:mm AM/PM"), "1:05 PM");
  assert.equal(render("2026-08-31T09:05:09", "h:mm AM/PM"), "9:05 AM");
  assert.equal(render("2026-08-31T09:05:09", "h:mm A/P"), "9:05 A");
  // 1.5 days of elapsed time is 36 hours, not "12:00 on day two".
  assert.equal(render(1.5, "[h]:mm"), "36:00");
});

test("digit placeholders: 0 pads, # drops, ? blanks, and commas both group and scale", () => {
  assert.equal(render(7, "0000"), "0007");
  assert.equal(render(7, "####"), "7");
  assert.equal(render(0, "#"), "");
  assert.equal(render(0, "0"), "0");
  assert.equal(render(1234567, "#,##0"), "1,234,567");
  // A trailing comma scales by a thousand instead of grouping.
  assert.equal(render(1234567, "#,##0,"), "1,235");
  assert.equal(render(1234567, "0.0,,"), "1.2");
  assert.equal(render(0.5, "#.##"), ".5");
  assert.equal(render(1.5, "0.00"), "1.50");
  assert.equal(render(1.239, "0.00"), "1.24");
  assert.equal(render(0.1235, "0.00%"), "12.35%");
  assert.equal(render(0.1235, "0%"), "12%");
});

test("General, text placeholders and formula errors pass the raw value through", () => {
  assert.equal(render("hello", "General"), "hello");
  assert.equal(render("hello", ""), "hello");
  assert.equal(render("0031", "@"), "0031");
  assert.equal(render("#DIV/0!", "¥#,##0.00"), "#DIV/0!");
  assert.equal(render("#CYCLE!", "0.00"), "#CYCLE!");
  assert.equal(render("#N/A", "0.00"), "#N/A");
  // A non-numeric value under a numeric pattern is shown, never blanked.
  assert.equal(render("待定", "#,##0.00"), "待定");
});

test("every toolbar preset renders its advertised sample", () => {
  const inputs = {
    general: "1234.5",
    integer: 1234.5,
    decimal2: 1234.5,
    accounting: -1234.5,
    "currency-cny": 1234.5,
    "currency-usd": 1234.5,
    percent: 0.1235,
    thousands: 1234.5,
    "date-iso": "2026-08-31",
    "date-cn": "2026-08-31",
    time: "2026-08-31T13:05:09",
    datetime: "2026-08-31T13:05:09",
    text: "0031",
  };
  for (const preset of NUMBER_FORMAT_PRESETS) {
    assert.equal(
      render(inputs[preset.id], preset.pattern),
      preset.sample,
      `preset ${preset.id} (${preset.pattern})`,
    );
  }
});

test("Excel serials survive the 1900 leap-year bug", () => {
  assert.equal(render(1, "yyyy-mm-dd"), "1900-01-01");
  assert.equal(render(59, "yyyy-mm-dd"), "1900-02-28");
  // Serial 61 is 1900-03-01: the phantom 1900-02-29 sits at 60.
  assert.equal(render(61, "yyyy-mm-dd"), "1900-03-01");
  assert.equal(render(46265, "yyyy-mm-dd"), "2026-08-31");
  assert.equal(excelSerialToDate(46265).getUTCFullYear(), 2026);
  assert.equal(parseGridDateValue("not-a-date"), null);
});

test("formatting is a projection: storage is untouched and sorting reads raw values", () => {
  const rows = [["9"], ["100"], ["12"]];
  const before = JSON.parse(JSON.stringify(rows));

  const displayed = rows.map(([value]) => render(value, "¥#,##0.00"));
  assert.deepEqual(displayed, ["¥9.00", "¥100.00", "¥12.00"]);

  // Nothing was written back. A formatter that stored its own output would
  // fail here first, before it corrupted the sort below.
  assert.deepEqual(rows, before);

  const byRaw = [...rows]
    .sort((left, right) => compareRawGridValues(left[0], right[0]))
    .map(([value]) => value);
  assert.deepEqual(byRaw, ["9", "12", "100"]);

  // The same three cells sorted by what the user sees come out wrong. This is
  // the exact damage that storing the formatted value would do, so the
  // assertion above is the one holding the separation in place.
  const byDisplay = [...displayed].sort((left, right) =>
    left.localeCompare(right, "zh-Hans-CN"),
  );
  assert.deepEqual(byDisplay, ["¥100.00", "¥12.00", "¥9.00"]);
  assert.notDeepEqual(
    byRaw.map((value) => render(value, "¥#,##0.00")),
    byDisplay,
  );
});

test("dates and percents also sort by the stored value, not the rendered one", () => {
  const dates = ["2026-08-31", "2026-01-05", "2026-12-01"];
  const rendered = dates.map((value) => render(value, "aaaa"));
  assert.deepEqual(rendered, ["星期一", "星期一", "星期二"]);
  // Three distinct days collapse to two weekday labels; ordering by the label
  // would lose the calendar entirely.
  assert.deepEqual(
    [...dates].sort((left, right) => compareRawGridValues(left, right)),
    ["2026-01-05", "2026-08-31", "2026-12-01"],
  );

  assert.equal(render("0.5", "0%"), "50%");
  // The stored string stays "0.5"; only the projection multiplies by 100.
  assert.equal(compareRawGridValues("0.5", "0.25"), 1);
});

test("legacy type + decimals map onto the same engine the export already used", () => {
  assert.equal(legacyNumberFormatPattern("currency", 2), "¥#,##0.00");
  assert.equal(legacyNumberFormatPattern("currency", 0), "¥#,##0");
  assert.equal(legacyNumberFormatPattern("percent", 2), "0.00%");
  assert.equal(legacyNumberFormatPattern("date", 2), "yyyy-mm-dd");
  assert.equal(legacyNumberFormatPattern("number", 3), "0.000");
  assert.equal(legacyNumberFormatPattern("text", 2), "@");
  assert.equal(legacyNumberFormatPattern("auto", 2), "General");
  assert.equal(legacyNumberFormatPattern(undefined, undefined), "General");
});

test("format codes survive the xlsx escape round trip", () => {
  for (const pattern of [
    "¥#,##0.00",
    "#,##0.00_);[Red](#,##0.00)",
    'yyyy"年"m"月"',
    "0.00%",
    "@",
  ]) {
    assert.equal(numberFormatFromXlsxCode(numberFormatToXlsxCode(pattern)), pattern);
  }
  assert.equal(numberFormatToXlsxCode("¥#,##0.00"), "&#165;#,##0.00");
  assert.equal(numberFormatToXlsxCode('a"b"'), "a&quot;b&quot;");
});

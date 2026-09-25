import assert from "node:assert/strict";
import test from "node:test";

import {
  cloudBrowserShouldShowViewportSpinner,
} from "../src/shell/cloud-browser-spinner.ts";

test("recovery keeps the last real frame visible without a viewport spinner", () => {
  assert.equal(
    cloudBrowserShouldShowViewportSpinner("reconnecting", true, true),
    false,
  );
  assert.equal(
    cloudBrowserShouldShowViewportSpinner("reconnecting", false, true),
    true,
  );
  assert.equal(
    cloudBrowserShouldShowViewportSpinner("awaiting_first_frame", true, true),
    false,
  );
});

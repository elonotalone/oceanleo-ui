# W09 state
- Facts: WebsiteLocalRoute had no adapter.mode (no Pro page), no puck css import, default <Puck> with header/Publish.
- Plan: new website-local/website-puck-faces.ts (overrides, pure), WebsitePuckStage.tsx (normal composed / pro default, one <Puck>), route wires adapter.mode + no-external.css.
- Step: 1 spike SSR render of Puck in node.
- Focused test: node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/w10-website-local.test.mjs (via agent-io-guard run-light)
- tests green: faces(6)+w10-website-local+source-carrier 25 pass. Next: tsc, delivery.

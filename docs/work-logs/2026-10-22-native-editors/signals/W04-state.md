# W04 state
step: 1 investigate; next: strip RichDocRoute to single mode, delete hosted files, fix tests
repro: node tests via run-light (see _COMMON.md)
done: RichDocRoute single-mode; git rm RichDocHostedRoute, richdoc-pro-source, rich-doc-hosted-embed, RichDocHostedContextToolbar; fixed 4 tests
next: remaining tests (see grep for removed module names in tests/), umo-migration prune, regression test, delivery
run: bash /tmp/w04run.sh <test files>

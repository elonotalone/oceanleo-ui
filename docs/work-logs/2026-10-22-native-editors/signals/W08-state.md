# W08 state
- Done: backend (app/typed_uploads.py hint `image` -> design_canvas/composite_image; tests/test_image_kind_design_hint.py). Commit in oceanleo repo.
- Backend repro: cd /root/projects/oceanleo/backend && .venv/bin/python -m pytest tests/test_image_kind_design_hint.py tests/test_carrier_artifact_type_plane.py -q
- Step: UI. alias module src/shell/material-kind-alias.ts; design->fabric snapshot converter; load in use-fabric-image-editor; ImageRoute single mode; delete DesignCanvasLocalRoute + design-canvas hook/command/fabric files.

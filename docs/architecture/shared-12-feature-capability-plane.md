# Shared capability plane: six editors and one works workbench

Document, slides, sheet, PDF, image (including vector and composite images), and video timeline are the six file editors. Websites and games open the shared works workbench. Audio opens the detail player; 3D opens the detail viewer. Both remain stored Library types with their own browsing categories and generation entry points.

All consumers use the canonical `ADVANCED_CAPABILITY_MATRIX` in `src/shell/artifact-contract.ts`. The editor registry, route resolver, session restoration, and native client adapter catalog derive their capabilities from that matrix. A site key selects material context and does not grant editing capability.

`artifactId + revisionId` identifies the source throughout viewing, editing, insertion, saving and downloading. Dispatch validates source format, integrity, permissions and dependency closure before opening an editor. A preview cannot substitute for the editable source. Audio and 3D never enter a file editor, including through stale session hints.

Design canvas uses the image adapter; website and game feature identities use the non-editor `work` route. Library audio and 3D categories are independent of the editing matrix. Organization and agent automation remain separate from material editing.

The timeline's reusable media classifier lives in `src/shell/video-editor/video-material.ts`. Timeline capabilities are exported through `video-editor/capabilities`; images keep their existing Fabric editing model. The focused removal contract is tested in `tests/leobay-editor-removal.test.mjs`.

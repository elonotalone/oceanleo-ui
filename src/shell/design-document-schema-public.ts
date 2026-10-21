// Small public entrypoint for consumers that must validate the v1 carrier
// without importing the complete shell barrel.
export {
  DESIGN_DOCUMENT_PROJECT_SCHEMA,
  DESIGN_DOCUMENT_JSON_SCHEMA,
  parseDesignDocumentProject,
  validateDesignDocumentProject,
} from "./image-editor/design-document-schema";
export type {
  DesignDocumentProject,
  DesignDocumentElement,
  DesignDocumentValidation,
  DesignDocumentValidationError,
} from "./image-editor/design-document-schema";

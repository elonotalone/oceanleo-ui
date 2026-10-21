import React from "react";

// This ESM composition test targets the Library/AgentChat/editor graph, not
// Markdown syntax. A tiny renderer fixture at react-markdown's external parser
// boundary avoids loading its Node-incompatible style-to-js CJS dependency;
// production Markdown, transcript, editor, and layout components stay real.
export default function OneTaskLibraryMarkdownRenderer({ children }) {
  if (React.isValidElement(children)) return children;
  return React.createElement(React.Fragment, null, String(children ?? ""));
}

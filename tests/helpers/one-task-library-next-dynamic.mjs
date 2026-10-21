import React, { lazy, Suspense } from "react";

// Next's dynamic() is a framework chunk boundary. In the client-only DOM test,
// preserve its real loader and suspense behavior using React.lazy; route/editor
// modules themselves continue to load from their real source files.
export default function dynamic(loader, options = {}) {
  const LazyComponent = lazy(async () => {
    const loaded = await (typeof loader === "function" ? loader() : loader);
    return loaded?.default ? loaded : { default: loaded };
  });
  function DynamicComponent(props) {
    const fallback = options.loading
      ? React.createElement(options.loading)
      : null;
    return React.createElement(
      Suspense,
      { fallback },
      React.createElement(LazyComponent, props),
    );
  }
  DynamicComponent.displayName = "OneTaskLibraryDynamicBoundary";
  return DynamicComponent;
}

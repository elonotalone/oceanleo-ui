export function EditorToolsIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15.8 3.5 4.7 4.7-9.8 9.8-5.7 1 1-5.7 9.8-9.8Z" />
      <path d="m13.8 5.5 4.7 4.7" />
      <path d="M4 22h13" />
    </svg>
  );
}

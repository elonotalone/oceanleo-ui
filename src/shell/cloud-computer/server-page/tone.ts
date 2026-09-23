// 服务器页面配色：白色对齐 oceandino dashboard（white / zinc），黑色沿用原深色；跟随 <html class="dark">。
export const tone = {
  page: "bg-white text-zinc-900 dark:bg-neutral-950 dark:text-neutral-100",
  panel: "bg-zinc-50 dark:bg-neutral-900",
  border: "border-zinc-200 dark:border-neutral-800",
  divide: "divide-zinc-200 dark:divide-neutral-800",
  muted: "text-zinc-500 dark:text-neutral-400",
  faint: "text-zinc-400 dark:text-neutral-500",
  hover: "hover:bg-zinc-100 dark:hover:bg-neutral-800",
  chip: "bg-transparent text-zinc-600 dark:text-neutral-400",
  chipActive: "bg-transparent text-zinc-900 dark:text-neutral-100",
  iconBtn:
    "inline-flex size-8 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
  tab: "inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-1 text-sm text-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:text-neutral-100",
  tabActive:
    "inline-flex h-9 items-center gap-1.5 border-b-2 border-zinc-900 px-1 text-sm text-zinc-900 disabled:cursor-not-allowed dark:border-neutral-100 dark:text-neutral-100",
  rowActive: "bg-zinc-100 dark:bg-neutral-800",
  input: "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500",
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white",
  accent: "text-indigo-600 dark:text-indigo-300",
  warn: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  danger: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900",
} as const;

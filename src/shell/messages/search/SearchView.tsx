"use client";

// 消息搜索。占位，由 W09 实现（work-chat 契约 §8.2）；导出名与 props 不改，只可加可选 props。

export interface SearchViewProps {
  initialQuery?: string;
  conversationId?: string | null;
  onOpenResult: (conversationId: string, seq: number) => void;
}

export function SearchView(_props: SearchViewProps) {
  return null;
}

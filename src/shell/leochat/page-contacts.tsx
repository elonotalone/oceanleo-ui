"use client";

// LeoChat 整页的联系人栏：和小窗同一个 PeopleView，收在一张易读宽度的卡里。
import { type ReactElement } from "react";
import { PeopleView } from "../messages/people/PeopleView";

export function ContactsSection({ onOpenConversation }: { onOpenConversation: (conversationId: string) => void }): ReactElement {
  return (
    <div
      data-leochat-contacts
      className="flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm"
    >
      <PeopleView onOpenConversation={onOpenConversation} />
    </div>
  );
}

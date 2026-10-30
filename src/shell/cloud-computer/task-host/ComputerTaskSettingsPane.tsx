"use client";
import type { ReactNode } from "react";
/** Keep the previous workspace mounted, including its selected tab and draft. */
export function ComputerTaskSettingsPane({open,content,children,onClose}:{open:boolean;content:ReactNode;children:ReactNode;onClose:()=>void}) {
 return <><div className="h-full" hidden={open}>{children}</div>{open&&<div className="h-full overflow-auto"><div className="flex items-center justify-between border-b p-3"><span>设备 / 程序设置</span><button type="button" onClick={onClose}>关闭</button></div>{content}</div>}</>;
}

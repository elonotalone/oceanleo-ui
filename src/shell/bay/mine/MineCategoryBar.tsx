// 「我的」页原来有一条类别胶囊（全部 / 成品文件 / …），现在并进「交易」里的类别下拉（见 ../shell/BayMine.tsx），胶囊条已删。
// 这个文件只剩两个类型，留着是因为别的窗格（seller/MyServicesPane、orders/MyOrdersPane）按这个路径引用它们。
export type { MineCategory } from "./mine-category";
export type { MinePaneProps } from "./mine-bundle";

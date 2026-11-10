import {
  Boxes, ChartColumn, ClipboardList, Coins, Download, Filter, House, Kanban, Landmark, MessageCircle, Package, Settings, Sparkles, StickyNote, Tag, Truck, UserRoundCog, Users, Wallet, type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  home: House, clipboard: ClipboardList, truck: Truck, wallet: Wallet, users: Users, tag: Tag, package: Package, download: Download, boxes: Boxes,
  kanban: Kanban, funnel: Filter, note: StickyNote, team: UserRoundCog, chat: MessageCircle, sparkles: Sparkles, landmark: Landmark, coins: Coins,
  chart: ChartColumn, settings: Settings,
};

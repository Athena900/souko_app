import Link from "next/link";
import {
  ClipboardPenLine,
  FileSpreadsheet,
  Home,
  ReceiptText,
  Settings2,
  Truck,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AppSection = "home" | "shipments" | "import" | "field" | "billing" | "settings" | "help";

interface NavigationItem {
  key: AppSection;
  href: "/" | "/shipments" | "/import" | "/field" | "/billing" | "/settings";
  label: string;
  icon: LucideIcon;
}

const navigationItems: NavigationItem[] = [
  { key: "home", href: "/", label: "ホーム", icon: Home },
  { key: "shipments", href: "/shipments", label: "出荷管理", icon: Truck },
  { key: "import", href: "/import", label: "Excel取込", icon: FileSpreadsheet },
  { key: "field", href: "/field", label: "現場入力", icon: ClipboardPenLine },
  { key: "billing", href: "/billing", label: "請求確認", icon: ReceiptText },
  { key: "settings", href: "/settings", label: "マスタ設定", icon: Settings2 },
];

export function AppSidebar({ active }: { active: AppSection }) {
  return (
    <aside className="app-sidebar" aria-label="業務メニュー">
      <Link className="sidebar-brand" href="/" aria-label="CSロジネット ホームへ">
        <Warehouse className="sidebar-brand-mark" aria-hidden="true" strokeWidth={1.8} />
        <span>CSロジネット</span>
      </Link>
      <nav className="sidebar-nav" aria-label="業務メニュー">
        {navigationItems.map((item) => (
          <Link
            key={item.key}
            className={`sidebar-link ${active === item.key ? "active" : ""}`}
            href={item.href}
            aria-current={active === item.key ? "page" : undefined}
          >
            <item.icon className="sidebar-icon" aria-hidden="true" strokeWidth={1.8} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function AppFrame({ active, children }: { active: AppSection; children: React.ReactNode }) {
  return (
    <div className="app-frame">
      <AppSidebar active={active} />
      <div className="app-content">{children}</div>
    </div>
  );
}

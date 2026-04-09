import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Inbox, Brain, Search, LayoutGrid } from "lucide-react";
import { UserButton } from "@clerk/clerk-react";

interface LayoutProps {
  children?: ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

const navItems = [
  { id: "triage", labelKey: "nav.triage", icon: Inbox },
  { id: "focus", labelKey: "nav.focus", icon: Brain },
  { id: "entities", labelKey: "nav.entities", icon: LayoutGrid },
  { id: "search", labelKey: "nav.search", icon: Search },
];

export function Layout({ children, currentView, onNavigate }: LayoutProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-sidebar flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h1 className="text-xl font-bold">{t("app.title")}</h1>
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="text-xs bg-background border rounded px-2 py-1"
          >
            <option value="en">EN</option>
            <option value="es">ES</option>
          </select>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors w-full text-left ${
                currentView === id ? "bg-accent" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t">
          <UserButton />
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
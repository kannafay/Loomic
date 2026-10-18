"use client";

import {
  FolderIcon,
  HouseIcon,
  LogOutIcon,
  type LucideIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PuzzleIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SwatchBookIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { LoomicLogo } from "@/components/icons/loomic-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN_ITEMS: NavItem[] = [
  { href: "/home", label: "首页", icon: HouseIcon },
  { href: "/projects", label: "项目", icon: FolderIcon },
  { href: "/brand-kit", label: "品牌套件", icon: SwatchBookIcon },
  { href: "/skills", label: "技能", icon: PuzzleIcon },
];

const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "设置",
  icon: Settings2Icon,
};

const ADMIN_ITEM: NavItem = {
  href: "/admin",
  label: "管理后台",
  icon: ShieldCheckIcon,
};

const MENU_BUTTON_CLASS =
  "h-10 gap-3 rounded-lg px-3 text-muted-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10! data-active:text-sidebar-foreground [&_svg]:size-5";

function NavigationItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        isActive={active}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        tooltip={item.label}
        className={MENU_BUTTON_CLASS}
      >
        <item.icon aria-hidden="true" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function MobileBottomBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="移动导航"
      className="fixed inset-x-0 bottom-0 z-40 grid auto-cols-fr grid-flow-col border-t border-sidebar-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring",
              active
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <item.icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="max-w-full truncate text-[10px] font-medium leading-none">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  const router = useRouter();
  const { signOut, role } = useAuth();
  const { open, toggleSidebar } = useSidebar();
  const accountItems = [
    SETTINGS_ITEM,
    ...(role === "admin" ? [ADMIN_ITEM] : []),
  ];
  const toggleLabel = open ? "折叠侧边栏" : "展开侧边栏";
  const ToggleIcon = open ? PanelLeftCloseIcon : PanelLeftOpenIcon;

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <>
      <Sidebar id="workspace-sidebar" collapsible="icon">
        <SidebarHeader className="py-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/home" />}
                aria-label="Loomic 首页"
                tooltip="Loomic 首页"
                className={cn(
                  MENU_BUTTON_CLASS,
                  "text-sidebar-foreground [&_svg]:size-6",
                )}
              >
                <LoomicLogo />
                <span className="text-lg font-semibold tracking-tight">
                  Loomic
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="py-0">
            <nav aria-label="工作区导航">
              <SidebarMenu className="gap-1">
                {MAIN_ITEMS.map((item) => (
                  <NavigationItem key={item.href} item={item} />
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-3 pb-3">
          <nav aria-label="账户导航">
            <SidebarMenu className="gap-1">
              {accountItems.map((item) => (
                <NavigationItem key={item.href} item={item} />
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  onClick={handleSignOut}
                  aria-label="退出登录"
                  tooltip="退出登录"
                  className={MENU_BUTTON_CLASS}
                >
                  <LogOutIcon aria-hidden="true" />
                  <span>退出登录</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
          <SidebarSeparator className="mx-0" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                onClick={toggleSidebar}
                aria-label={toggleLabel}
                aria-expanded={open}
                aria-controls="workspace-sidebar"
                tooltip={toggleLabel}
                className={MENU_BUTTON_CLASS}
              >
                <ToggleIcon aria-hidden="true" />
                <span>{toggleLabel}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <MobileBottomBar items={[...MAIN_ITEMS, ...accountItems]} />
    </>
  );
}

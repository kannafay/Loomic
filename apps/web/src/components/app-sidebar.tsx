"use client";

import {
  FolderIcon,
  HouseIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  type LucideIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PuzzleIcon,
  SwatchBookIcon,
  UserRoundIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";

import { LoomicLogo } from "@/components/icons/loomic-logo";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  label: "个人中心",
  icon: UserRoundIcon,
};

const ADMIN_ITEM: NavItem = {
  href: "/admin",
  label: "管理后台",
  icon: LayoutDashboardIcon,
};

const MENU_BUTTON_CLASS =
  "h-10 gap-3 rounded-lg px-3 text-muted-foreground data-active:text-sidebar-foreground not-data-active:has-[[data-navigation-pending]]:bg-sidebar-accent [&_svg]:size-5";

const ACTIVE_MENU_CLASS =
  "relative before:pointer-events-none before:absolute before:top-1/2 before:left-1 before:h-3.5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary-foreground/50 before:opacity-0 data-active:bg-sidebar-primary data-active:font-semibold data-active:text-sidebar-primary-foreground data-active:before:opacity-100 data-active:hover:bg-sidebar-primary data-active:hover:text-sidebar-primary-foreground";

function SidebarLabel({ children }: { children: ReactNode }) {
  return (
    <span
      data-slot="sidebar-label"
      className="shrink-0 whitespace-nowrap transition-opacity duration-150 group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none"
    >
      {children}
    </span>
  );
}

function NavigationContent({
  item,
  mobile = false,
}: { item: NavItem; mobile?: boolean }) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center"
      >
        <item.icon className="size-5" />
      </span>
      {mobile ? (
        <span className="max-w-full truncate text-[10px] font-medium leading-none">
          {item.label}
        </span>
      ) : (
        <SidebarLabel>{item.label}</SidebarLabel>
      )}
      {pending && (
        <output data-navigation-pending="" className="sr-only">
          正在打开{item.label}
        </output>
      )}
    </>
  );
}

function NavigationItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} prefetch />}
        isActive={active}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        tooltip={item.label}
        className={cn(MENU_BUTTON_CLASS, ACTIVE_MENU_CLASS)}
      >
        <NavigationContent item={item} />
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
            prefetch
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring before:pointer-events-none before:absolute before:top-0 before:left-1/2 before:h-0.5 before:w-5 before:-translate-x-1/2 before:rounded-b-full before:bg-sidebar-primary-foreground/50 before:opacity-0",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground before:opacity-100"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <NavigationContent item={item} mobile />
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  const { error: showError } = useToast();
  const router = useRouter();
  const { signOut, role } = useAuth();
  const { open, toggleSidebar } = useSidebar();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const cancelLogoutRef = useRef<HTMLButtonElement>(null);
  const accountItems = [
    SETTINGS_ITEM,
    ...(role === "admin" ? [ADMIN_ITEM] : []),
  ];
  const toggleLabel = open ? "折叠侧边栏" : "展开侧边栏";
  const ToggleIcon = open ? PanelLeftCloseIcon : PanelLeftOpenIcon;

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      setLogoutOpen(false);
      router.replace("/login");
    } catch {
      showError("退出登录失败，请重试。");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Dialog
      open={logoutOpen}
      onOpenChange={(nextOpen, eventDetails) => {
        if (signingOut) {
          eventDetails.cancel();
          return;
        }
        setLogoutOpen(nextOpen);
      }}
      disablePointerDismissal={signingOut}
    >
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
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center"
                >
                  <LoomicLogo />
                </span>
                <SidebarLabel>
                  <span className="text-lg font-semibold tracking-tight">
                    Loomic
                  </span>
                </SidebarLabel>
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
                <DialogTrigger
                  render={
                    <SidebarMenuButton
                      type="button"
                      aria-label="退出登录"
                      tooltip="退出登录"
                      className={MENU_BUTTON_CLASS}
                    />
                  }
                >
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center"
                  >
                    <LogOutIcon />
                  </span>
                  <SidebarLabel>退出登录</SidebarLabel>
                </DialogTrigger>
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
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center"
                >
                  <ToggleIcon />
                </span>
                <SidebarLabel>{toggleLabel}</SidebarLabel>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <MobileBottomBar items={[...MAIN_ITEMS, ...accountItems]} />
      <DialogContent showCloseButton={false} initialFocus={cancelLogoutRef}>
        <DialogHeader>
          <DialogTitle>确认退出登录</DialogTitle>
          <DialogDescription>
            确定要退出当前账号吗？退出后需要重新登录。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button
                ref={cancelLogoutRef}
                type="button"
                variant="outline"
                disabled={signingOut}
              />
            }
          >
            取消
          </DialogClose>
          <Button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            {signingOut ? "正在退出…" : "退出登录"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

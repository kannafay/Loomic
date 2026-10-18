import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { SlidersHorizontalIcon } from "lucide-react";

const PROVIDER_ICONS: Record<string, string> = {
  google: "/providers/google.svg",
  openai: "/providers/openai.svg",
  anthropic: "/providers/anthropic.svg",
  agnes: "/providers/agnes.ico",
  openrouter: "/providers/openrouter.svg",
  azure: "/providers/azure.svg",
};

export function ProviderAvatar({
  preset,
  name,
  className,
}: {
  preset: string;
  name: string;
  className?: string;
}) {
  const icon = PROVIDER_ICONS[preset];
  return (
    <Avatar
      aria-hidden="true"
      className={cn("rounded-lg bg-background after:rounded-lg", className)}
    >
      {icon && (
        <AvatarImage
          src={icon}
          alt=""
          className="rounded-lg object-contain p-1.5 dark:invert"
        />
      )}
      <AvatarFallback className="rounded-lg bg-background font-medium text-foreground">
        {preset === "custom" ? (
          <SlidersHorizontalIcon className="size-4" />
        ) : (
          Array.from(name)[0]?.toUpperCase()
        )}
      </AvatarFallback>
    </Avatar>
  );
}

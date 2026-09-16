import { Link, type LinkProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import type { ComponentProps } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type NavMenuItem = {
    label: string;
    description: string;
    /** The page does not work without JavaScript: the landing pages say so */
    requiresJs?: boolean;
} & (
    | { to: LinkProps["to"] }
    /** Pages outside the app's router (opened in a new tab) */
    | { href: string }
);

// The header's dropdown menus. Each also has a page listing the same entries
// (/integrations, /admin), which is where the menu trigger links without
// JavaScript
export const INTEGRATIONS_MENU: NavMenuItem[] = [
    {
        label: "iCal Feeds",
        description: "Subscribe to calendars from your calendar app.",
        to: "/feeds",
    },
    {
        label: "Widget API",
        description: "Embed upcoming events on a website.",
        to: "/widget",
    },
    {
        label: "REST API Docs",
        description: "OpenAPI reference for reading and managing events.",
        href: "/api/v1/docs",
        requiresJs: true,
    },
];

export const ADMIN_MENU: NavMenuItem[] = [
    {
        label: "Users",
        description: "Accounts, admin rights and permissions.",
        to: "/admin/users",
        requiresJs: true,
    },
    {
        label: "API Keys",
        description: "Service keys and everyone's personal keys.",
        to: "/admin/api-keys",
        requiresJs: true,
    },
];

/**
 * A menu entry as a link: router link, or a new tab for external pages.
 * Other props go to the anchor (DropdownMenuItem asChild passes its role,
 * handlers and ref through)
 */
export function NavMenuLink({
    item,
    ...props
}: { item: NavMenuItem } & Omit<ComponentProps<"a">, "href">) {
    if ("href" in item) {
        return (
            <a {...props} href={item.href} rel="noreferrer" target="_blank" />
        );
    }
    return <Link {...props} to={item.to} />;
}

/** The landing page body: every entry as a card with its description */
export function NavMenuPage({
    title,
    description,
    items,
}: {
    title: string;
    description: string;
    items: NavMenuItem[];
}) {
    return (
        <>
            <div className="mb-8">
                <h1 className="mb-2 font-bold text-3xl">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                    <li key={item.label}>
                        <NavMenuLink
                            className="block h-full rounded-lg border p-4 transition-colors hover:bg-accent"
                            item={item}
                        >
                            <h2 className="mb-1 font-semibold">{item.label}</h2>
                            <p className="text-muted-foreground text-sm">
                                {item.description}
                            </p>
                            {item.requiresJs && (
                                <span className="noscript-only">
                                    <Alert
                                        className="mt-3"
                                        // Static text, not an announcement
                                        role="note"
                                        variant="destructive"
                                    >
                                        <TriangleAlert />
                                        <AlertTitle>
                                            Requires JavaScript
                                        </AlertTitle>
                                        <AlertDescription>
                                            This page does not work with scripts
                                            disabled.
                                        </AlertDescription>
                                    </Alert>
                                </span>
                            )}
                        </NavMenuLink>
                    </li>
                ))}
            </ul>
        </>
    );
}

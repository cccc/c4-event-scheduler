import { useQueryClient } from "@tanstack/react-query";
import {
    Link,
    type LinkProps,
    useLocation,
    useNavigate,
    useRouter,
} from "@tanstack/react-router";
import { ChevronDown, LogOut, Menu, Settings, User } from "lucide-react";

import {
    ADMIN_MENU,
    INTEGRATIONS_MENU,
    type NavMenuItem,
    NavMenuLink,
} from "@/components/nav-menus";
import { Button, buttonVariants } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { authClient } from "@/server/better-auth/client";

type HeaderProps = {
    user?: {
        id: string;
        name: string;
        email: string;
        image?: string | null;
    } | null;
    isAdmin?: boolean;
};

/**
 * A dropdown of links. Dropdowns need JavaScript, so without it the trigger
 * is a link to `to`, a page listing the same entries.
 */
function HeaderMenu({
    label,
    to,
    items,
}: {
    label: string;
    to: LinkProps["to"];
    items: NavMenuItem[];
}) {
    return (
        <>
            <span className="noscript-only">
                <Button asChild variant="ghost">
                    <Link to={to}>{label}</Link>
                </Button>
            </span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button className="script-only" variant="ghost">
                        {label}
                        <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {items.map((item) => (
                        <DropdownMenuItem asChild key={item.label}>
                            <NavMenuLink className="cursor-pointer" item={item}>
                                {item.label}
                            </NavMenuLink>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}

/**
 * The page links on narrow screens: a details element as a menu, which
 * needs no scripts (no outside-click dismissal, but Escape and the same
 * button close it); with scripts it remounts closed on every navigation.
 * The dropdown menus' entries stay on their landing pages here.
 */
function MobileNav({ isAdmin }: { isAdmin?: boolean }) {
    const { pathname } = useLocation();
    const itemClass =
        "block rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground";
    return (
        <details className="relative md:hidden" key={pathname}>
            <summary
                aria-label="Menu"
                className={cn(
                    buttonVariants({ variant: "ghost", size: "icon" }),
                    "cursor-pointer list-none open:bg-accent [&::-webkit-details-marker]:hidden",
                )}
            >
                <Menu />
            </summary>
            <nav className="absolute end-0 top-full z-50 mt-2 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                <Link className={itemClass} to="/spaces">
                    Spaces
                </Link>
                <Link className={itemClass} to="/event-types">
                    Event Types
                </Link>
                <Link className={itemClass} to="/integrations">
                    Integrations
                </Link>
                {isAdmin && (
                    <Link className={itemClass} to="/admin">
                        Admin
                    </Link>
                )}
            </nav>
        </details>
    );
}

export function Header({ user, isAdmin }: HeaderProps) {
    const router = useRouter();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const handleSignOut = async () => {
        await authClient.signOut();
        // Cached query data (account info, private spaces, internal types)
        // belongs to the session that just ended
        queryClient.clear();
        await navigate({ to: "/" });
        // Re-run the root beforeLoad so context.session clears
        await router.invalidate();
    };

    return (
        <header className="border-b">
            <div className="container mx-auto flex items-center justify-between px-4 py-4">
                <Link className="whitespace-nowrap font-bold text-xl" to="/">
                    C4 Events
                </Link>
                <div className="flex items-center gap-4 max-md:gap-2">
                    {/* The page links, on narrow screens in the menu */}
                    <nav className="flex items-center gap-4 max-md:hidden">
                        <Button asChild variant="ghost">
                            <Link to="/spaces">Spaces</Link>
                        </Button>
                        <Button asChild variant="ghost">
                            <Link to="/event-types">Event Types</Link>
                        </Button>
                        <HeaderMenu
                            items={INTEGRATIONS_MENU}
                            label="Integrations"
                            to="/integrations"
                        />
                        {isAdmin && (
                            <HeaderMenu
                                items={ADMIN_MENU}
                                label="Admin"
                                to="/admin"
                            />
                        )}
                    </nav>
                    {user ? (
                        <DropdownMenu>
                            {/* Without JavaScript: straight to the account
                                page (signing out needs scripts anyway) */}
                            <span className="noscript-only">
                                <Button asChild size="sm" variant="outline">
                                    <Link to="/account">
                                        <User className="mr-2 h-4 w-4" />
                                        {user.name || user.email}
                                    </Link>
                                </Button>
                            </span>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    className="script-only"
                                    size="sm"
                                    variant="outline"
                                >
                                    <User className="mr-2 h-4 w-4" />
                                    {user.name || user.email}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                    <Link
                                        className="cursor-pointer"
                                        to="/account"
                                    >
                                        <Settings className="mr-2 h-4 w-4" />
                                        Account
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleSignOut}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Sign Out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Button asChild>
                            <Link to="/login">Sign In</Link>
                        </Button>
                    )}
                    <MobileNav isAdmin={isAdmin} />
                </div>
            </div>
        </header>
    );
}

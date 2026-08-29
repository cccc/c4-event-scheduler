import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function Header({ user, isAdmin }: HeaderProps) {
    const router = useRouter();
    const navigate = useNavigate();

    const handleSignOut = async () => {
        await authClient.signOut();
        await navigate({ to: "/" });
        // Re-run the root beforeLoad so context.session clears
        await router.invalidate();
    };

    return (
        <header className="border-b">
            <div className="container mx-auto flex items-center justify-between px-4 py-4">
                <Link className="font-bold text-xl" to="/">
                    C4 Events
                </Link>
                <nav className="flex items-center gap-4">
                    <Button asChild variant="ghost">
                        <Link to="/spaces">Spaces</Link>
                    </Button>
                    <Button asChild variant="ghost">
                        <Link to="/event-types">Event Types</Link>
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost">
                                Integrations
                                <ChevronDown className="ml-1 h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <Link className="cursor-pointer" to="/feeds">
                                    iCal Feeds
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link className="cursor-pointer" to="/widget">
                                    Widget API
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <a
                                    className="cursor-pointer"
                                    href="/api/v1/docs"
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    REST API Docs
                                </a>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {isAdmin && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost">
                                    Admin
                                    <ChevronDown className="ml-1 h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                    <Link
                                        className="cursor-pointer"
                                        to="/admin/users"
                                    >
                                        Users
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link
                                        className="cursor-pointer"
                                        to="/admin/api-keys"
                                    >
                                        API Keys
                                    </Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    {user ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline">
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
                        <Link to="/login">
                            <Button>Sign In</Button>
                        </Link>
                    )}
                </nav>
            </div>
        </header>
    );
}

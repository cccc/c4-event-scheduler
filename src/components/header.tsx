"use client";

import { LogOut, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

	const handleSignOut = async () => {
		await authClient.signOut();
		router.push("/");
		router.refresh();
	};

	return (
		<header className="border-b">
			<div className="container mx-auto flex items-center justify-between px-4 py-4">
				<Link className="font-bold text-xl" href="/">
					C4 Events
				</Link>
				<nav className="flex items-center gap-4">
					<Link href="/spaces">
						<Button variant="ghost">Spaces</Button>
					</Link>
					<Link href="/event-types">
						<Button variant="ghost">Event Types</Button>
					</Link>
					<Link href="/feeds">
						<Button variant="ghost">Feeds</Button>
					</Link>
					{isAdmin && (
						<Link href="/admin/roles">
							<Button variant="ghost">Admin</Button>
						</Link>
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
								<DropdownMenuItem onClick={handleSignOut}>
									<LogOut className="mr-2 h-4 w-4" />
									Sign Out
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						<Link href="/login">
							<Button>Sign In</Button>
						</Link>
					)}
				</nav>
			</div>
		</header>
	);
}

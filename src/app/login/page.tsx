"use client";

import { KeyRound, Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { env } from "@/env";
import { authClient } from "@/server/better-auth/client";

export default function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const emailEnabled = env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED;
	const ssoEnabled = env.NEXT_PUBLIC_AUTH_SSO_ENABLED;
	const ssoName = env.NEXT_PUBLIC_AUTH_SSO_NAME;

	const handleEmailLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		try {
			const result = await authClient.signIn.email({
				email,
				password,
			});

			if (result.error) {
				setError(result.error.message ?? "Failed to sign in");
			} else {
				router.push("/");
				router.refresh();
			}
		} catch {
			setError("An unexpected error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	const handleSSOLogin = async () => {
		setIsLoading(true);
		setError(null);

		try {
			await authClient.signIn.oauth2({
				providerId: "oidc",
				callbackURL: "/",
			});
		} catch {
			setError("Failed to initiate SSO login");
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="font-bold text-2xl">Welcome back</CardTitle>
					<CardDescription>Sign in to manage events</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{error && (
						<div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
							{error}
						</div>
					)}

					{ssoEnabled && (
						<Button
							className="w-full"
							disabled={isLoading}
							onClick={handleSSOLogin}
							size="lg"
							type="button"
						>
							{isLoading ? (
								<Loader2 className="mr-2 h-5 w-5 animate-spin" />
							) : (
								<KeyRound className="mr-2 h-5 w-5" />
							)}
							Continue with {ssoName}
						</Button>
					)}

					{ssoEnabled && emailEnabled && (
						<div className="relative">
							<div className="absolute inset-0 flex items-center">
								<Separator className="w-full" />
							</div>
							<div className="relative flex justify-center text-xs uppercase">
								<span className="bg-card px-2 text-muted-foreground">
									or continue with
								</span>
							</div>
						</div>
					)}

					{emailEnabled && (
						<form className="space-y-4" onSubmit={handleEmailLogin}>
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									disabled={isLoading}
									id="email"
									name="email"
									onChange={(e) => setEmail(e.target.value)}
									placeholder="you@example.com"
									required
									type="email"
									value={email}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<Input
									disabled={isLoading}
									id="password"
									name="password"
									onChange={(e) => setPassword(e.target.value)}
									placeholder="Your password"
									required
									type="password"
									value={password}
								/>
							</div>
							<Button className="w-full" disabled={isLoading} type="submit">
								{isLoading ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Mail className="mr-2 h-4 w-4" />
								)}
								Sign in with Email
							</Button>
						</form>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

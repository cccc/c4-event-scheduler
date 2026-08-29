import {
    createFileRoute,
    redirect,
    useNavigate,
    useRouter,
} from "@tanstack/react-router";
import { KeyRound, Loader2, Mail } from "lucide-react";
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
import { authClient } from "@/server/better-auth/client";

export const Route = createFileRoute("/login")({
    beforeLoad: ({ context }) => {
        if (context.session) throw redirect({ to: "/" });
    },
    component: LoginPage,
});

function LoginPage() {
    const { authOptions } = Route.useRouteContext();
    const router = useRouter();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { emailEnabled, signupEnabled, ssoEnabled, ssoName } = authOptions;
    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [name, setName] = useState("");

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
                await navigate({ to: "/" });
                // Re-run the root beforeLoad so context.session is populated
                await router.invalidate();
            }
        } catch {
            setError("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const result = await authClient.signUp.email({
                name,
                email,
                password,
            });

            if (result.error) {
                setError(result.error.message ?? "Failed to create account");
            } else {
                await navigate({ to: "/" });
                await router.invalidate();
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
            const result = await authClient.signIn.social({
                provider: "oidc",
                callbackURL: "/",
            });
            // better-auth returns errors instead of throwing; without this the
            // button would stay disabled after a failed redirect setup.
            if (result.error) {
                setError(
                    result.error.message ?? "Failed to initiate SSO login",
                );
                setIsLoading(false);
            }
        } catch {
            setError("Failed to initiate SSO login");
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="font-bold text-2xl">
                        Welcome back
                    </CardTitle>
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
                        <form
                            className="space-y-4"
                            onSubmit={
                                mode === "signup"
                                    ? handleSignUp
                                    : handleEmailLogin
                            }
                        >
                            {mode === "signup" && (
                                <div className="space-y-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input
                                        disabled={isLoading}
                                        id="name"
                                        name="name"
                                        onChange={(e) =>
                                            setName(e.target.value)
                                        }
                                        placeholder="Your name"
                                        required
                                        value={name}
                                    />
                                </div>
                            )}
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
                                    minLength={
                                        mode === "signup" ? 8 : undefined
                                    }
                                    name="password"
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    placeholder="Your password"
                                    required
                                    type="password"
                                />
                            </div>
                            <Button
                                className="w-full"
                                disabled={isLoading}
                                type="submit"
                            >
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Mail className="mr-2 h-4 w-4" />
                                )}
                                {mode === "signup"
                                    ? "Create account"
                                    : "Sign in with Email"}
                            </Button>
                            {signupEnabled && (
                                <p className="text-center text-muted-foreground text-sm">
                                    {mode === "signup"
                                        ? "Already have an account? "
                                        : "No account yet? "}
                                    <button
                                        className="underline underline-offset-4 hover:text-foreground"
                                        onClick={() => {
                                            setMode(
                                                mode === "signup"
                                                    ? "signin"
                                                    : "signup",
                                            );
                                            setError(null);
                                        }}
                                        type="button"
                                    >
                                        {mode === "signup"
                                            ? "Sign in"
                                            : "Create one"}
                                    </button>
                                </p>
                            )}
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

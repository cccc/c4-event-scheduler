import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

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
import { accountQueries } from "@/lib/queries/account";
import { authClient } from "@/server/better-auth/client";

export const Route = createFileRoute("/_main/account")({
    beforeLoad: ({ context }) => {
        if (!context.session) throw redirect({ to: "/login" });
    },
    component: AccountPage,
});

function AccountPage() {
    const { session, authOptions } = Route.useRouteContext();
    const router = useRouter();
    const { data: info, isLoading: infoLoading } = useQuery(
        accountQueries.info(),
    );

    // Profile form
    const [name, setName] = useState(session?.user.name ?? "");
    const [savingProfile, setSavingProfile] = useState(false);

    // Password form
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [changingPassword, setChangingPassword] = useState(false);

    const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Name cannot be empty");
            return;
        }
        setSavingProfile(true);
        try {
            const result = await authClient.updateUser({ name: trimmed });
            if (result.error) {
                toast.error(result.error.message ?? "Failed to update profile");
                return;
            }
            toast.success("Profile updated");
            // Root beforeLoad re-runs so the header shows the new name
            await router.invalidate();
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (
        e: React.FormEvent<HTMLFormElement>,
    ) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match");
            return;
        }
        setChangingPassword(true);
        try {
            const result = await authClient.changePassword({
                currentPassword,
                newPassword,
                revokeOtherSessions: true,
            });
            if (result.error) {
                toast.error(
                    result.error.message ?? "Failed to change password",
                );
                return;
            }
            toast.success("Password changed");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } finally {
            setChangingPassword(false);
        }
    };

    const canChangePassword =
        (info?.hasPassword ?? false) && authOptions.emailEnabled;

    let passwordNotice: string | null = null;
    if (info && !canChangePassword) {
        if (!info.hasPassword) {
            passwordNotice =
                info.providers.length === 0
                    ? "This account has no password."
                    : `You sign in through ${authOptions.ssoName}; your password is managed by your identity provider.`;
        } else {
            passwordNotice =
                "Password sign-in is currently disabled on this server.";
        }
    }

    return (
        <>
            <div className="mb-8">
                <h1 className="mb-2 font-bold text-3xl">Account</h1>
                <p className="text-muted-foreground">
                    Manage your profile and sign-in settings.
                </p>
            </div>

            <div className="grid max-w-2xl gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Profile</CardTitle>
                        <CardDescription>
                            Your name is shown on events you create and edit.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="space-y-4"
                            onSubmit={handleSaveProfile}
                        >
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <p className="text-sm">{session?.user.email}</p>
                                <p className="text-muted-foreground text-xs">
                                    Email changes are done by an administrator.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="account-name">Name</Label>
                                <Input
                                    autoComplete="name"
                                    id="account-name"
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    value={name}
                                />
                            </div>
                            <Button disabled={savingProfile} type="submit">
                                {savingProfile ? "Saving..." : "Save"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Password</CardTitle>
                        <CardDescription>
                            Changing your password signs out your other
                            sessions.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {infoLoading ? (
                            <p className="text-muted-foreground text-sm">
                                Loading...
                            </p>
                        ) : canChangePassword ? (
                            <form
                                className="space-y-4"
                                onSubmit={handleChangePassword}
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="current-password">
                                        Current password
                                    </Label>
                                    <Input
                                        autoComplete="current-password"
                                        id="current-password"
                                        onChange={(e) =>
                                            setCurrentPassword(e.target.value)
                                        }
                                        required
                                        type="password"
                                        value={currentPassword}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new-password">
                                        New password
                                    </Label>
                                    <Input
                                        autoComplete="new-password"
                                        id="new-password"
                                        minLength={8}
                                        onChange={(e) =>
                                            setNewPassword(e.target.value)
                                        }
                                        required
                                        type="password"
                                        value={newPassword}
                                    />
                                    <p className="text-muted-foreground text-xs">
                                        At least 8 characters.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm-password">
                                        Confirm new password
                                    </Label>
                                    <Input
                                        autoComplete="new-password"
                                        id="confirm-password"
                                        minLength={8}
                                        onChange={(e) =>
                                            setConfirmPassword(e.target.value)
                                        }
                                        required
                                        type="password"
                                        value={confirmPassword}
                                    />
                                </div>
                                <Button
                                    disabled={changingPassword}
                                    type="submit"
                                >
                                    {changingPassword
                                        ? "Changing..."
                                        : "Change Password"}
                                </Button>
                            </form>
                        ) : (
                            <p className="text-muted-foreground text-sm">
                                {passwordNotice}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

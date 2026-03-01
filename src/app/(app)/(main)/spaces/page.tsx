"use client";

import Link from "next/link";
import { useState } from "react";
import { CreateSpaceDialog } from "@/components/spaces/create-space-dialog";
import { Button } from "@/components/ui/button";
import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

export default function SpacesPage() {
    const [open, setOpen] = useState(false);
    const { data: session } = authClient.useSession();

    const { data: spaces, isLoading } = api.spaces.list.useQuery({
        includePrivate: !!session?.user,
    });

    const isLoggedIn = !!session?.user;

    return (
        <>
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="mb-2 font-bold text-3xl">Spaces</h1>
                    <p className="text-muted-foreground">
                        Manage calendar spaces for different venues or
                        communities.
                    </p>
                </div>

                {isLoggedIn && (
                    <>
                        <Button onClick={() => setOpen(true)}>
                            Create Space
                        </Button>
                        <CreateSpaceDialog onOpenChange={setOpen} open={open} />
                    </>
                )}
            </div>

            {isLoading ? (
                <p>Loading...</p>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {spaces?.map((space) => (
                        <Link
                            className="block rounded-lg border p-4 transition-colors hover:bg-accent"
                            href={`/spaces/${space.slug}`}
                            key={space.id}
                        >
                            <h2 className="mb-1 font-semibold">{space.name}</h2>
                            {space.description && (
                                <p className="text-muted-foreground text-sm">
                                    {space.description}
                                </p>
                            )}
                            <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
                                <span>/{space.slug}</span>
                                {!space.isPublic && (
                                    <span className="rounded bg-muted px-1">
                                        Private
                                    </span>
                                )}
                            </div>
                        </Link>
                    ))}

                    {spaces?.length === 0 && (
                        <p className="text-muted-foreground">
                            No spaces yet.{" "}
                            {isLoggedIn && "Create one to get started."}
                        </p>
                    )}
                </div>
            )}
        </>
    );
}

import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MoreVertical } from "lucide-react";
import { useState } from "react";

import { CreateSpaceDialog } from "@/components/spaces/create-space-dialog";
import {
    type DeleteSpace,
    DeleteSpaceDialog,
} from "@/components/spaces/delete-space-dialog";
import {
    type EditSpace,
    EditSpaceDialog,
} from "@/components/spaces/edit-space-dialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { capabilitiesGrant } from "@/lib/permissions-core";
import { accountQueries } from "@/lib/queries/account";
import { spacesQueries } from "@/lib/queries/spaces";

export const Route = createFileRoute("/_main/spaces/")({
    component: SpacesPage,
});

function SpacesPage() {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<EditSpace | null>(null);
    const [deleting, setDeleting] = useState<DeleteSpace | null>(null);
    const { session } = Route.useRouteContext();

    const isLoggedIn = !!session?.user;

    const { data: spaces, isLoading } = useQuery(
        spacesQueries.list({ includePrivate: isLoggedIn }),
    );
    // Own capabilities decide which spaces get management controls; the
    // server checks again on every mutation.
    const { data: account } = useQuery({
        ...accountQueries.info(),
        enabled: isLoggedIn,
    });
    // isLoggedIn guards against account data lingering from a previous session
    const canManage = (slug: string) =>
        isLoggedIn &&
        !!account &&
        capabilitiesGrant(account, { spaceSlug: slug });
    // Creating a space needs admin or a global permission (no scope)
    const canCreate = isLoggedIn && !!account && capabilitiesGrant(account);

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

                {canCreate && (
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
                        <div className="relative" key={space.id}>
                            <Link
                                className="block h-full rounded-lg border p-4 transition-colors hover:bg-accent"
                                params={{ slug: space.slug }}
                                to="/spaces/$slug"
                            >
                                <h2 className="mb-1 pr-8 font-semibold">
                                    {space.name}
                                </h2>
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
                                    {space.isDefault && (
                                        <span className="rounded bg-muted px-1">
                                            Default
                                        </span>
                                    )}
                                </div>
                            </Link>
                            {canManage(space.slug) && (
                                // Outside the link so the menu does not navigate
                                <div className="absolute top-2 right-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                aria-label={`Actions for ${space.name}`}
                                                size="icon"
                                                variant="ghost"
                                            >
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    setEditing({
                                                        id: space.id,
                                                        slug: space.slug,
                                                        name: space.name,
                                                        description:
                                                            space.description,
                                                        isPublic:
                                                            space.isPublic,
                                                        isDefault:
                                                            space.isDefault,
                                                    })
                                                }
                                            >
                                                Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    setDeleting({
                                                        id: space.id,
                                                        slug: space.slug,
                                                        name: space.name,
                                                    })
                                                }
                                                variant="destructive"
                                            >
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            )}
                        </div>
                    ))}

                    {spaces?.length === 0 && (
                        <p className="text-muted-foreground">
                            No spaces yet.{" "}
                            {canCreate && "Create one to get started."}
                        </p>
                    )}
                </div>
            )}

            <DeleteSpaceDialog
                onOpenChange={(open) => {
                    if (!open) setDeleting(null);
                }}
                open={deleting !== null}
                space={deleting}
            />
            <EditSpaceDialog
                allowDefault={canCreate}
                onOpenChange={(open) => {
                    if (!open) setEditing(null);
                }}
                open={editing !== null}
                space={editing}
            />
        </>
    );
}

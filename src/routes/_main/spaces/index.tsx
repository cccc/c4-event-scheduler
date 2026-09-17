import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MoreVertical } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
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
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { capabilitiesGrant } from "@/lib/permissions-core";
import { accountQueries } from "@/lib/queries/account";
import { spacesQueries } from "@/lib/queries/spaces";

export const Route = createFileRoute("/_main/spaces/")({
    // Prefetch so the page renders on the server
    loader: ({ context }) =>
        context.queryClient.ensureQueryData(
            spacesQueries.list({ includePrivate: !!context.session?.user }),
        ),
    component: SpacesPage,
});

function SpacesPage() {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<EditSpace | null>(null);
    const [deleting, setDeleting] = useState<DeleteSpace | null>(null);
    const { session } = Route.useRouteContext();

    const isLoggedIn = !!session?.user;

    const { data: spaces } = useSuspenseQuery(
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
            <PageHeader
                description="Manage calendar spaces for different venues or communities."
                title="Spaces"
            >
                {canCreate && (
                    <Button
                        className="script-only"
                        onClick={() => setOpen(true)}
                    >
                        Create Space
                    </Button>
                )}
            </PageHeader>
            {canCreate && (
                <CreateSpaceDialog onOpenChange={setOpen} open={open} />
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {spaces.map((space) => (
                    <div
                        className="flex flex-col rounded-lg border"
                        key={space.id}
                    >
                        <Link
                            className="block flex-1 rounded-t-lg p-4 transition-colors hover:bg-accent"
                            params={{ slug: space.slug }}
                            to="/spaces/$slug"
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
                                {space.isDefault && (
                                    <span className="rounded bg-muted px-1">
                                        Default
                                    </span>
                                )}
                            </div>
                        </Link>
                        {/* Edit and Delete open dialogs, so the bar needs
                            scripts; the card itself is the link to the space */}
                        {canManage(space.slug) && (
                            <div className="script-only flex items-center gap-2 border-t px-4 py-2">
                                <Button asChild size="sm" variant="outline">
                                    <Link
                                        params={{ slug: space.slug }}
                                        to="/spaces/$slug"
                                    >
                                        View
                                    </Link>
                                </Button>
                                <Button
                                    className="ml-auto"
                                    onClick={() =>
                                        setEditing({
                                            id: space.id,
                                            slug: space.slug,
                                            name: space.name,
                                            description: space.description,
                                            isPublic: space.isPublic,
                                            isDefault: space.isDefault,
                                        })
                                    }
                                    size="sm"
                                    variant="outline"
                                >
                                    Edit
                                </Button>
                                {/* Destructive action kept one step away */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            aria-label={`More actions for ${space.name}`}
                                            size="icon"
                                            variant="ghost"
                                        >
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
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

                {spaces.length === 0 && (
                    <p className="text-muted-foreground">
                        No spaces yet.{" "}
                        {canCreate && "Create one to get started."}
                    </p>
                )}
            </div>

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

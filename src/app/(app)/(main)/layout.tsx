import { eq } from "drizzle-orm";

import { Header } from "@/components/header";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { actor } from "@/server/db/schema";

export default async function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    let isAdmin = false;
    if (session?.user) {
        const actorRecord = await db.query.actor.findFirst({
            where: eq(actor.userId, session.user.id),
        });
        isAdmin = actorRecord?.isAdmin ?? false;
    }

    return (
        <div className="min-h-screen bg-background">
            <Header
                isAdmin={isAdmin}
                user={
                    session?.user
                        ? {
                              id: session.user.id,
                              name: session.user.name,
                              email: session.user.email,
                              image: session.user.image,
                          }
                        : null
                }
            />
            <main className="container mx-auto px-4 py-8">{children}</main>
        </div>
    );
}

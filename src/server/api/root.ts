import { eventTypesRouter } from "@/server/api/routers/event-types";
import { eventsRouter } from "@/server/api/routers/events";
import { rolesRouter } from "@/server/api/routers/roles";
import { spacesRouter } from "@/server/api/routers/spaces";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	spaces: spacesRouter,
	eventTypes: eventTypesRouter,
	events: eventsRouter,
	roles: rolesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.spaces.list();
 *       ^? Space[]
 */
export const createCaller = createCallerFactory(appRouter);

import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    // Keep the port Next.js used so BETTER_AUTH_URL / the mock OIDC redirect
    // URIs in compose.yml keep working without changes.
    server: { port: 3000 },
    resolve: { tsconfigPaths: true },
    // rrule ships CommonJS with named exports Node cannot see when the SSR
    // module runner externalizes it; bundling it through Vite fixes the interop.
    ssr: { noExternal: ["rrule"] },
    plugins: [
        // Source injection adds data-tsd-source props that FullCalendar rejects
        // ("Unknown option"), and console piping loops with Vite 8's own
        // client-log forwarding, so both stay off.
        devtools({
            injectSource: { enabled: false },
            consolePiping: { enabled: false },
        }),
        tailwindcss(),
        tanstackStart(),
        // react's vite plugin must come after start's vite plugin
        viteReact(),
    ],
});

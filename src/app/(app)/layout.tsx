import "@/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
    title: "C4 Events - Event Calendar",
    description: "Event calendar with recurring events, iCal feeds, and RBAC",
    icons: [
        { rel: "icon", url: "/favicon.ico" },
        { rel: "icon", type: "image/svg+xml", url: "/favicon.svg" },
    ],
};

const geist = Geist({
    subsets: ["latin"],
    variable: "--font-geist-sans",
});

export default async function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    const locale = await getLocale();
    const messages = await getMessages();

    return (
        <html
            className={`${geist.variable}`}
            lang={locale}
            suppressHydrationWarning
        >
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    disableTransitionOnChange
                    enableSystem
                >
                    <NextIntlClientProvider messages={messages}>
                        <TRPCReactProvider>{children}</TRPCReactProvider>
                        <Toaster position="bottom-right" richColors />
                    </NextIntlClientProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}

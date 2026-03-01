import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, type Locale, locales } from "./config";

async function getLocale(): Promise<Locale> {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get("NEXT_LOCALE");

    if (localeCookie?.value && locales.includes(localeCookie.value as Locale)) {
        return localeCookie.value as Locale;
    }

    const headersList = await headers();
    const acceptLanguage = headersList.get("accept-language");

    if (acceptLanguage) {
        const preferredLocale = acceptLanguage
            .split(",")
            .map((lang) => lang.split(";")[0]?.trim().split("-")[0])
            .find((lang) => locales.includes(lang as Locale));

        if (preferredLocale) {
            return preferredLocale as Locale;
        }
    }

    return defaultLocale;
}

export default getRequestConfig(async () => {
    const locale = await getLocale();

    return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default,
    };
});

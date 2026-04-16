import { env } from "@/env";

import { LoginForm } from "./login-form";

export default function LoginPage() {
    return (
        <LoginForm
            emailEnabled={env.AUTH_EMAIL_ENABLED}
            ssoEnabled={env.AUTH_SSO_ENABLED}
            ssoName={env.AUTH_SSO_NAME}
        />
    );
}

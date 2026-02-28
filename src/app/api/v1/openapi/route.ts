import { NextResponse } from "next/server";

import { env } from "@/env";
import { generateSpec } from "@/lib/api-v1/spec";

export async function GET() {
	const spec = generateSpec(env.NEXT_PUBLIC_APP_URL);
	return NextResponse.json(spec, {
		headers: {
			"Access-Control-Allow-Origin": "*",
		},
	});
}

import { type NextRequest, NextResponse } from "next/server";

import { generateSpec } from "@/lib/api-v1/spec";

export async function GET(request: NextRequest) {
	const serverUrl = new URL(request.url).origin;
	const spec = generateSpec(serverUrl);
	return NextResponse.json(spec, {
		headers: {
			"Access-Control-Allow-Origin": "*",
		},
	});
}

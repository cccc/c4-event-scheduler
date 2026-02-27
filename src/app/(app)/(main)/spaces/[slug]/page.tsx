import { notFound } from "next/navigation";

import { SpaceCalendar } from "@/components/space-calendar";
import { api } from "@/trpc/server";

export default async function SpaceDetailPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const space = await api.spaces.getBySlug({ slug });

	if (!space) {
		notFound();
	}

	return <SpaceCalendar space={space} />;
}

"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

export default function FeedsPage() {
	const { data: spaces } = api.spaces.list.useQuery({ includePrivate: false });
	const { data: eventTypes } = api.eventTypes.list.useQuery({});
	const appUrl = typeof window !== "undefined" ? window.location.origin : "";

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success("Copied to clipboard");
	};

	return (
		<>
			<div className="mb-8">
				<h1 className="mb-2 font-bold text-3xl">iCal Feeds</h1>
				<p className="text-muted-foreground">
					Subscribe to calendar feeds using any calendar application that
					supports iCal (Google Calendar, Apple Calendar, Outlook, etc.).
				</p>
			</div>

			<div className="space-y-8">
				<section>
					<h2 className="mb-4 font-semibold text-xl">All Events</h2>
					<div className="rounded-lg border p-4">
						<div className="flex items-center justify-between">
							<div>
								<div className="font-medium">All Public Events</div>
								<code className="text-muted-foreground text-sm">
									{appUrl}/api/cal/all.ics
								</code>
							</div>
							<Button
								onClick={() => copyToClipboard(`${appUrl}/api/cal/all.ics`)}
								size="sm"
								variant="outline"
							>
								Copy URL
							</Button>
						</div>
					</div>
				</section>

				<section>
					<h2 className="mb-4 font-semibold text-xl">By Space</h2>
					<div className="space-y-2">
						{spaces?.map((space) => (
							<div className="rounded-lg border p-4" key={space.id}>
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium">{space.name}</div>
										<code className="text-muted-foreground text-sm">
											{appUrl}/api/cal/{space.slug}.ics
										</code>
									</div>
									<Button
										onClick={() =>
											copyToClipboard(`${appUrl}/api/cal/${space.slug}.ics`)
										}
										size="sm"
										variant="outline"
									>
										Copy URL
									</Button>
								</div>
							</div>
						))}
						{spaces?.length === 0 && (
							<p className="text-muted-foreground">No spaces available.</p>
						)}
					</div>
				</section>

				<section>
					<h2 className="mb-4 font-semibold text-xl">
						By Space and Event Type
					</h2>
					<p className="mb-4 text-muted-foreground text-sm">
						You can filter by event type within a space using the URL pattern:{" "}
						<code>
							{appUrl}/api/cal/{"space"}/{"event-type"}.ics
						</code>
					</p>
					<details className="rounded-lg border">
						<summary className="cursor-pointer p-4 font-medium">
							Show all combinations
						</summary>
						<div className="space-y-4 border-t p-4">
							{spaces?.map((space) => (
								<div key={space.id}>
									<h3 className="mb-2 font-medium">{space.name}</h3>
									<div className="space-y-2 pl-4">
										{eventTypes?.map((et) => (
											<div
												className="flex items-center justify-between rounded border p-2"
												key={et.id}
											>
												<div>
													<div className="text-sm">{et.name}</div>
													<code className="text-muted-foreground text-xs">
														{appUrl}/api/cal/{space.slug}/{et.slug}.ics
													</code>
												</div>
												<Button
													onClick={() =>
														copyToClipboard(
															`${appUrl}/api/cal/${space.slug}/${et.slug}.ics`,
														)
													}
													size="sm"
													variant="ghost"
												>
													Copy
												</Button>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					</details>
				</section>
			</div>
		</>
	);
}

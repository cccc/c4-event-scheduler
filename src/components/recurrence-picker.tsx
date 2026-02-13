"use client";

import { useEffect, useState } from "react";
import { RRule } from "rrule";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type Frequency = "daily" | "weekly" | "monthly" | "yearly";
type MonthlyType = "dayOfMonth" | "dayOfWeek";
type EndType = "never" | "date" | "count";
type WeekDay = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
interface RecurrencePickerProps {
	startDate: Date | null;
	onChange: (config: RecurrenceConfig) => void;
	initialConfig?: Partial<RecurrenceConfig>;
}

export interface RecurrenceConfig {
	frequency: Frequency;
	interval: number;
	weekDays: WeekDay[];
	monthlyType: MonthlyType;
	dayOfMonth: number;
	weekOfMonth: number; // 1-4 or -1 for last
	dayOfWeek: WeekDay;
	endType: EndType;
	endDate: Date | null;
	endCount: number;
}

const WEEK_DAYS: { value: WeekDay; label: string; short: string }[] = [
	{ value: "MO", label: "Monday", short: "Mon" },
	{ value: "TU", label: "Tuesday", short: "Tue" },
	{ value: "WE", label: "Wednesday", short: "Wed" },
	{ value: "TH", label: "Thursday", short: "Thu" },
	{ value: "FR", label: "Friday", short: "Fri" },
	{ value: "SA", label: "Saturday", short: "Sat" },
	{ value: "SU", label: "Sunday", short: "Sun" },
];

const WEEK_POSITIONS = [
	{ value: 1, label: "First" },
	{ value: 2, label: "Second" },
	{ value: 3, label: "Third" },
	{ value: 4, label: "Fourth" },
	{ value: -1, label: "Last" },
];

function getDefaultConfig(startDate: Date | null): RecurrenceConfig {
	const dayOfWeekMap: Record<number, WeekDay> = {
		0: "SU",
		1: "MO",
		2: "TU",
		3: "WE",
		4: "TH",
		5: "FR",
		6: "SA",
	};

	const dayOfWeek = startDate ? dayOfWeekMap[startDate.getDay()] : "MO";
	const dayOfMonth = startDate ? startDate.getDate() : 1;
	const weekOfMonth = startDate ? Math.ceil(startDate.getDate() / 7) : 1;

	return {
		frequency: "weekly",
		interval: 1,
		weekDays: dayOfWeek ? [dayOfWeek] : ["MO"],
		monthlyType: "dayOfMonth",
		dayOfMonth,
		weekOfMonth,
		dayOfWeek: dayOfWeek ?? "MO",
		endType: "never",
		endDate: null,
		endCount: 10,
	};
}

export function buildRRuleFromConfig(config: RecurrenceConfig): string {
	const parts: string[] = [];

	// Frequency
	const freqMap: Record<string, string> = {
		daily: "DAILY",
		weekly: "WEEKLY",
		monthly: "MONTHLY",
		yearly: "YEARLY",
	};
	parts.push(`FREQ=${freqMap[config.frequency]}`);

	// Interval
	if (config.interval > 1) {
		parts.push(`INTERVAL=${config.interval}`);
	}

	// Weekly: BYDAY
	if (config.frequency === "weekly" && config.weekDays.length > 0) {
		parts.push(`BYDAY=${config.weekDays.join(",")}`);
	}

	// Monthly options
	if (config.frequency === "monthly") {
		if (config.monthlyType === "dayOfMonth") {
			parts.push(`BYMONTHDAY=${config.dayOfMonth}`);
		} else {
			// e.g., BYDAY=2TU (second Tuesday) or BYDAY=-1FR (last Friday)
			const pos =
				config.weekOfMonth === -1 ? "-1" : config.weekOfMonth.toString();
			parts.push(`BYDAY=${pos}${config.dayOfWeek}`);
		}
	}

	// End conditions
	if (config.endType === "date" && config.endDate) {
		const dateStr = `${config.endDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
		parts.push(`UNTIL=${dateStr}`);
	} else if (config.endType === "count" && config.endCount > 0) {
		parts.push(`COUNT=${config.endCount}`);
	}

	return parts.join(";");
}

/**
 * Parse an RRULE string back into a RecurrenceConfig.
 * Used when editing an existing series to populate the recurrence picker.
 */
export function parseRRuleToConfig(rruleString: string): RecurrenceConfig {
	const rule = RRule.fromString(rruleString);
	const options = rule.options;

	// Map RRule frequency to our frequency type
	const freqMap: Record<number, Frequency> = {
		[RRule.DAILY]: "daily",
		[RRule.WEEKLY]: "weekly",
		[RRule.MONTHLY]: "monthly",
		[RRule.YEARLY]: "yearly",
	};
	const frequency = freqMap[options.freq] ?? "weekly";

	// Interval
	const interval = options.interval ?? 1;

	// Weekly: extract weekdays from byweekday
	const weekDayMap: Record<number, WeekDay> = {
		0: "MO",
		1: "TU",
		2: "WE",
		3: "TH",
		4: "FR",
		5: "SA",
		6: "SU",
	};

	// Helper to extract weekday number from various rrule byweekday types
	const getWeekdayNum = (
		wd: number | { weekday: number; n?: number },
	): number => {
		if (typeof wd === "number") return wd;
		return wd.weekday;
	};

	let weekDays: WeekDay[] = [];
	if (options.byweekday && frequency === "weekly") {
		// byweekday can be various types from rrule
		const byweekdayArr = Array.isArray(options.byweekday)
			? options.byweekday
			: [options.byweekday];
		weekDays = byweekdayArr.map((wd) => weekDayMap[getWeekdayNum(wd)] ?? "MO");
	}
	if (weekDays.length === 0) {
		weekDays = ["MO"]; // Default
	}

	// Monthly: determine if dayOfMonth or dayOfWeek
	let monthlyType: MonthlyType = "dayOfMonth";
	let dayOfMonth = 1;
	let weekOfMonth = 1;
	let dayOfWeek: WeekDay = "MO";

	if (frequency === "monthly") {
		// Check for bynweekday first - this is where rrule stores positioned weekdays
		// like "last Thursday" (BYDAY=-1TH) as [[3, -1]] (weekday 3, position -1)
		if (options.bynweekday && options.bynweekday.length > 0) {
			const first = options.bynweekday[0];
			if (Array.isArray(first) && first.length === 2) {
				const weekdayNum = first[0] as number;
				const position = first[1] as number;
				monthlyType = "dayOfWeek";
				dayOfWeek = weekDayMap[weekdayNum] ?? "MO";
				weekOfMonth = position;
			}
		}
		// Only use bymonthday if we haven't set dayOfWeek pattern and bymonthday has a valid number
		if (
			monthlyType === "dayOfMonth" &&
			options.bymonthday &&
			options.bymonthday.length > 0
		) {
			const firstDay = options.bymonthday[0];
			if (typeof firstDay === "number" && !Number.isNaN(firstDay)) {
				dayOfMonth = firstDay;
			}
		}
	}

	// End conditions
	let endType: EndType = "never";
	let endDate: Date | null = null;
	let endCount = 10;

	if (options.until) {
		endType = "date";
		endDate = options.until;
	} else if (options.count) {
		endType = "count";
		endCount = options.count;
	}

	return {
		frequency,
		interval,
		weekDays,
		monthlyType,
		dayOfMonth,
		weekOfMonth,
		dayOfWeek,
		endType,
		endDate,
		endCount,
	};
}

export function RecurrencePicker({
	startDate,
	onChange,
	initialConfig,
}: RecurrencePickerProps) {
	// Track if we've applied initialConfig to avoid overwriting it
	const hasInitialConfig = !!initialConfig;

	const [config, setConfig] = useState<RecurrenceConfig>(() => ({
		...getDefaultConfig(startDate),
		...initialConfig,
	}));

	// Update defaults when start date changes, but only if we don't have initialConfig
	// (When editing an existing series, we want to preserve the parsed config)
	useEffect(() => {
		if (startDate && !hasInitialConfig) {
			const defaults = getDefaultConfig(startDate);
			setConfig((prev) => ({
				...prev,
				weekDays: defaults.weekDays,
				dayOfMonth: defaults.dayOfMonth,
				weekOfMonth: defaults.weekOfMonth,
				dayOfWeek: defaults.dayOfWeek,
			}));
		}
	}, [startDate, hasInitialConfig]);

	// Notify parent of changes
	useEffect(() => {
		onChange(config);
	}, [config, onChange]);

	const updateConfig = <K extends keyof RecurrenceConfig>(
		key: K,
		value: RecurrenceConfig[K],
	) => {
		setConfig((prev) => ({ ...prev, [key]: value }));
	};

	const toggleWeekDay = (day: WeekDay) => {
		setConfig((prev) => {
			const newDays = prev.weekDays.includes(day)
				? prev.weekDays.filter((d) => d !== day)
				: [...prev.weekDays, day];
			// Ensure at least one day is selected
			return {
				...prev,
				weekDays: newDays.length > 0 ? newDays : prev.weekDays,
			};
		});
	};

	const formatOrdinal = (n: number): string => {
		const s = ["th", "st", "nd", "rd"];
		const v = n % 100;
		return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
	};

	return (
		<div className="space-y-4">
			{/* Frequency */}
			<div>
				<Label>Repeat</Label>
				<Select
					onValueChange={(v) => updateConfig("frequency", v as Frequency)}
					value={config.frequency}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="daily">Daily</SelectItem>
						<SelectItem value="weekly">Weekly</SelectItem>
						<SelectItem value="monthly">Monthly</SelectItem>
						<SelectItem value="yearly">Yearly</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Interval */}
			<div className="flex items-center gap-2">
				<Label className="whitespace-nowrap">Every</Label>
				<Input
					className="w-20"
					max={99}
					min={1}
					onChange={(e) =>
						updateConfig(
							"interval",
							Math.max(1, parseInt(e.target.value, 10) || 1),
						)
					}
					type="number"
					value={config.interval}
				/>
				<span className="text-muted-foreground text-sm">
					{config.frequency === "daily" &&
						(config.interval === 1 ? "day" : "days")}
					{config.frequency === "weekly" &&
						(config.interval === 1 ? "week" : "weeks")}
					{config.frequency === "monthly" &&
						(config.interval === 1 ? "month" : "months")}
					{config.frequency === "yearly" &&
						(config.interval === 1 ? "year" : "years")}
				</span>
			</div>

			{/* Weekly: Day selection */}
			{config.frequency === "weekly" && (
				<div>
					<Label className="mb-2 block">On days</Label>
					<div className="flex flex-wrap gap-2">
						{WEEK_DAYS.map((day) => (
							<button
								className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
									config.weekDays.includes(day.value)
										? "border-primary bg-primary text-primary-foreground"
										: "border-input bg-background hover:bg-accent"
								}`}
								key={day.value}
								onClick={() => toggleWeekDay(day.value)}
								type="button"
							>
								{day.short}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Monthly: Day of month vs Day of week */}
			{config.frequency === "monthly" && (
				<div className="space-y-3">
					<Label>Repeat on</Label>
					<div className="space-y-2">
						<label className="flex items-center gap-2">
							<input
								checked={config.monthlyType === "dayOfMonth"}
								className="h-4 w-4"
								name="monthlyType"
								onChange={() => updateConfig("monthlyType", "dayOfMonth")}
								type="radio"
							/>
							<span>Day</span>
							<Select
								disabled={config.monthlyType !== "dayOfMonth"}
								onValueChange={(v) =>
									updateConfig("dayOfMonth", parseInt(v, 10))
								}
								value={config.dayOfMonth.toString()}
							>
								<SelectTrigger className="w-24">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
										<SelectItem key={day} value={day.toString()}>
											{formatOrdinal(day)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<span className="text-muted-foreground text-sm">
								of the month
							</span>
						</label>

						<label className="flex items-center gap-2">
							<input
								checked={config.monthlyType === "dayOfWeek"}
								className="h-4 w-4"
								name="monthlyType"
								onChange={() => updateConfig("monthlyType", "dayOfWeek")}
								type="radio"
							/>
							<span>The</span>
							<Select
								disabled={config.monthlyType !== "dayOfWeek"}
								onValueChange={(v) =>
									updateConfig("weekOfMonth", parseInt(v, 10))
								}
								value={config.weekOfMonth.toString()}
							>
								<SelectTrigger className="w-28">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{WEEK_POSITIONS.map((pos) => (
										<SelectItem key={pos.value} value={pos.value.toString()}>
											{pos.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								disabled={config.monthlyType !== "dayOfWeek"}
								onValueChange={(v) => updateConfig("dayOfWeek", v as WeekDay)}
								value={config.dayOfWeek}
							>
								<SelectTrigger className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{WEEK_DAYS.map((day) => (
										<SelectItem key={day.value} value={day.value}>
											{day.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</label>
					</div>
				</div>
			)}

			{/* End conditions */}
			<div className="space-y-3">
				<Label>Ends</Label>
				<div className="space-y-2">
					<label className="flex items-center gap-2">
						<input
							checked={config.endType === "never"}
							className="h-4 w-4"
							name="endType"
							onChange={() => updateConfig("endType", "never")}
							type="radio"
						/>
						<span>Never</span>
					</label>

					<label className="flex items-center gap-2">
						<input
							checked={config.endType === "date"}
							className="h-4 w-4"
							name="endType"
							onChange={() => updateConfig("endType", "date")}
							type="radio"
						/>
						<span>On</span>
						<Input
							className="w-40"
							disabled={config.endType !== "date"}
							onChange={(e) =>
								updateConfig(
									"endDate",
									e.target.value ? new Date(e.target.value) : null,
								)
							}
							type="date"
							value={
								config.endDate ? config.endDate.toISOString().split("T")[0] : ""
							}
						/>
					</label>

					<label className="flex items-center gap-2">
						<input
							checked={config.endType === "count"}
							className="h-4 w-4"
							name="endType"
							onChange={() => updateConfig("endType", "count")}
							type="radio"
						/>
						<span>After</span>
						<Input
							className="w-20"
							disabled={config.endType !== "count"}
							max={999}
							min={1}
							onChange={(e) =>
								updateConfig(
									"endCount",
									Math.max(1, parseInt(e.target.value, 10) || 1),
								)
							}
							type="number"
							value={config.endCount}
						/>
						<span className="text-muted-foreground text-sm">occurrences</span>
					</label>
				</div>
			</div>
		</div>
	);
}

export function getRecurrenceSummary(config: RecurrenceConfig): string {
	const parts: string[] = [];

	// Frequency and interval
	if (config.interval === 1) {
		parts.push(
			config.frequency === "daily"
				? "Daily"
				: config.frequency === "weekly"
					? "Weekly"
					: config.frequency === "monthly"
						? "Monthly"
						: "Yearly",
		);
	} else {
		parts.push(
			`Every ${config.interval} ${
				config.frequency === "daily"
					? "days"
					: config.frequency === "weekly"
						? "weeks"
						: config.frequency === "monthly"
							? "months"
							: "years"
			}`,
		);
	}

	// Weekly days
	if (config.frequency === "weekly" && config.weekDays.length > 0) {
		const dayNames = config.weekDays
			.map((d) => WEEK_DAYS.find((wd) => wd.value === d)?.short)
			.filter(Boolean);
		parts.push(`on ${dayNames.join(", ")}`);
	}

	// Monthly
	if (config.frequency === "monthly") {
		if (config.monthlyType === "dayOfMonth") {
			const ordinal = (n: number) => {
				const s = ["th", "st", "nd", "rd"];
				const v = n % 100;
				return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th");
			};
			parts.push(`on the ${ordinal(config.dayOfMonth)}`);
		} else {
			const pos = WEEK_POSITIONS.find(
				(p) => p.value === config.weekOfMonth,
			)?.label.toLowerCase();
			const day = WEEK_DAYS.find((d) => d.value === config.dayOfWeek)?.label;
			parts.push(`on the ${pos} ${day}`);
		}
	}

	// End
	if (config.endType === "date" && config.endDate) {
		parts.push(`until ${config.endDate.toLocaleDateString()}`);
	} else if (config.endType === "count") {
		parts.push(`for ${config.endCount} occurrences`);
	}

	return parts.join(" ");
}

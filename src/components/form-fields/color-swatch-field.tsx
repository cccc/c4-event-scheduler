"use client";

import { useRef } from "react";

import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form";
import { cn } from "@/lib/utils";

const SWATCH_COLORS = [
    "#e74c3c", // red
    "#c0392b", // dark red
    "#e84393", // pink
    "#d63384", // dark pink
    "#e67e22", // orange
    "#d35400", // dark orange
    "#f1c40f", // yellow
    "#f39c12", // amber
    "#2ecc71", // green
    "#27ae60", // dark green
    "#1abc9c", // teal
    "#16a085", // dark teal
    "#3498db", // blue
    "#2980b9", // dark blue
    "#6c5ce7", // indigo
    "#9b59b6", // purple
    "#8e44ad", // dark purple
    "#795548", // brown
    "#607d8b", // blue-grey
    "#34495e", // dark grey
];

type ColorSwatchFieldProps = {
    label: string;
};

export function ColorSwatchField({ label }: ColorSwatchFieldProps) {
    const field = useFieldContext<string>();
    const pickerRef = useRef<HTMLInputElement>(null);
    const isCustom =
        field.state.value && !SWATCH_COLORS.includes(field.state.value);

    return (
        <div>
            <Label>{label}</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
                {SWATCH_COLORS.map((color) => (
                    <button
                        aria-label={color}
                        className={cn(
                            "size-8 rounded-md border-2 transition-transform hover:scale-110 focus-visible:outline-ring/50",
                            field.state.value === color
                                ? "scale-110 border-foreground"
                                : "border-transparent",
                        )}
                        key={color}
                        onClick={() => field.handleChange(color)}
                        style={{ backgroundColor: color }}
                        type="button"
                    />
                ))}
                <button
                    aria-label="Custom color"
                    className={cn(
                        "relative size-8 overflow-hidden rounded-md border-2 transition-transform hover:scale-110 focus-visible:outline-ring/50",
                        isCustom
                            ? "scale-110 border-foreground"
                            : "border-transparent",
                    )}
                    onClick={() => pickerRef.current?.click()}
                    style={{
                        background: isCustom
                            ? field.state.value
                            : "conic-gradient(from 0deg, #e74c3c, #f1c40f, #2ecc71, #3498db, #9b59b6, #e74c3c)",
                    }}
                    type="button"
                >
                    <input
                        className="absolute inset-0 cursor-pointer opacity-0"
                        onChange={(e) => field.handleChange(e.target.value)}
                        ref={pickerRef}
                        tabIndex={-1}
                        type="color"
                        value={field.state.value || "#3498db"}
                    />
                </button>
            </div>
        </div>
    );
}

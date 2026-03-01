import { createFormHook, createFormHookContexts } from "@tanstack/react-form";

import { CheckboxField } from "@/components/form-fields/checkbox-field";
import { ColorSwatchField } from "@/components/form-fields/color-swatch-field";
import { DateField } from "@/components/form-fields/date-field";
import { DateTimeField } from "@/components/form-fields/date-time-field";
import { FieldError } from "@/components/form-fields/field-error";
import { FormForm } from "@/components/form-fields/form-form";
import { FormSubmitButton } from "@/components/form-fields/form-submit-button";
import { RecurrencePickerField } from "@/components/form-fields/recurrence-picker-field";
import { SelectField } from "@/components/form-fields/select-field";
import { TextField } from "@/components/form-fields/text-field";
import { TextareaField } from "@/components/form-fields/textarea-field";
import { TimeField } from "@/components/form-fields/time-field";

const { fieldContext, formContext, useFieldContext, useFormContext } =
    createFormHookContexts();

const { useAppForm } = createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
        TextField,
        TextareaField,
        SelectField,
        CheckboxField,
        ColorSwatchField,
        DateTimeField,
        DateField,
        TimeField,
        RecurrencePickerField,
        FieldError,
    },
    formComponents: {
        Form: FormForm,
        SubmitButton: FormSubmitButton,
    },
});

export { useAppForm, useFieldContext, useFormContext };

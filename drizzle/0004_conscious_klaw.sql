ALTER TABLE "c4_event" ALTER COLUMN "exdates" SET DATA TYPE text[]
    USING CASE
        WHEN exdates IS NULL OR exdates = '' THEN NULL
        ELSE string_to_array(exdates, ',')
    END;
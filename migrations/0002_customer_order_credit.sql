UPDATE records
SET payload = json_set(payload, '$.status', 'À classer'),
    revision = revision + 1,
    op_id = lower(hex(randomblob(16)))
WHERE kind = 'sales' AND deleted = 0 AND json_extract(payload, '$.status') = 'En attente';

---
'@ankhorage/supabase-vault': patch
---

Parse serialized configured-field arrays through PostgreSQL text before converting them to JSONB so Bun SQL does not expose them as JSON scalar strings during secret creation or replacement.

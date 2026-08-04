---
'@ankhorage/supabase-vault': patch
---

Serialize configured secret field names through JSON before reconstructing PostgreSQL text arrays, avoiding Bun malformed-array binding failures during secret creation and replacement.

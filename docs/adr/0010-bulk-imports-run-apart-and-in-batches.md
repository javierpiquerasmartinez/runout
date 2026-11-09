# 0010 · Bulk Imports run apart from the server, in batches

Date: 2026-11-09 · Status: accepted · Amends ADR 0004

A Tracker database can hold millions of Hands, and importing one cannot work like importing a day's session. Measured locally against the real server, confirming 50,000 Hands blocked every Room for about three minutes and then failed, and with a 400 MB heap the process died. Closing the browser would not stop it, but a person cannot be asked to keep a tab open for hours either: 2 million Hands is an estimated 4 to 8 hours at 0.5 CPU.

So an import of up to 2,000 Hands stays what it is today, a preview and a single transaction inside one request. Anything larger, up to 2 million Hands, is a Bulk Import. The browser uploads the files straight to Cloudflare R2 with presigned URLs, and a separate Render service, running the same code from a second entry point, reads them and adds the Hands to the Library in batches. The Importer can leave as soon as the upload ends and is told by email and in the Library's Importaciones view how it went.

A Bulk Import is deliberately not atomic and has no preview. No transaction can reasonably span 2 million Hands, and a preview of them could not be read by anyone. Hands join the Library as each batch commits. An interrupted import resumes by itself, and running a batch again is safe because Hands already there are recognised as duplicates. A cancelled or failed import keeps what it had already added.

We rejected running it in the existing server, even on worker threads, because its memory would still be shared with the Rooms and a crash would still end them. We rejected uploading through the server because a 2.5 GB upload does not fit through a 512 MB instance, and rejected keeping the files in Postgres because they would fill the database they are being imported into. We rejected splitting the files in the browser and sending batches from there because the import would then stop when the tab closes.

## Consequences

- Runout now has a second always-on service: about $14 a month for both instances on Render's smallest paid size, since Render's workspace plans do not pool compute. Both are declared in a Blueprint, with secrets kept in the panel.
- Runout depends on Cloudflare R2. Uploads are deleted when an import ends, except a failed one's, kept for 7 days so that an Administrator can retry it without asking for the files again.
- The new service does not query the database while idle, so that Neon can suspend. The API wakes it with an internal call, which makes it a Render Private Service: a Background Worker cannot receive private-network traffic.
- The table of Bulk Imports is itself the queue. A message broker such as Kafka was rejected: it delivers in order, which would let one large import hold up every other Account, and the progress, cancellation and scheduling state have to live in the database anyway.
- One Bulk Import per Account runs at a time, and batches alternate between Accounts, so that nobody's import holds up everyone else's.
- The Results Graph and Statistics may be incomplete while an import runs, and say so.
- A Library holds at most 10 million Hands. An import that reaches that ends early and counts the Hands that did not fit, because duplicates are only known once it has run.
- Bulk Imports pause when the database reaches a configured size, so that a large import cannot make every write in Runout fail on a plan's storage limit.
- A stopped service cannot report its own failure, so the API looks for imports that have stopped advancing and tells the Administrators.

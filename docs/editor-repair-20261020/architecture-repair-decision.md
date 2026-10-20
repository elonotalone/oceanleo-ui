# Repair direction

The user must open existing content, edit through real core APIs, save a pinned revision and reopen the same content. Existing source, identity and integrity must survive the repair.

Candidate A: retain adopted editor cores and repair the existing typed source/selection/save contracts. Mature components already integrated are TipTap/Umo, Univer, Fabric, EmbedPDF and PPTist. Existing normalized selection commands, hosted protocol and CAS receipts provide tested interoperability. Fits this workstation and dev slots; no new service needed. Known failure modes are invalid source choice, lost focus/selection, and stale receipt identity, all directly observed.

Candidate B: add another global command bus and generic raw JSON bridge. Duplicates the existing typed protocol; no production consumer in first-round W5 bus. Adds lifetime and failure handling state with no proven need. Rejected.

Candidate C: replace editor cores or bypass integrity/revision gates. Discards mature core APIs and changes stored-document compatibility without fixing the observed contract failures. Rejected.

Decision: A. Falsifying assumption: the current adopted core cannot apply the declared normalized command or import a supported source. Each owner must test a real representative import/mutation through the existing API before claiming its chain fixed. If that fails, report the precise unsupported API rather than introducing unchecked retries, fake success, or empty documents.

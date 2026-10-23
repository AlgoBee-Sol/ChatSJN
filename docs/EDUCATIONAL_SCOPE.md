# Educational-only phase

This release focuses on Aqaid, Akhlaq and other Islamic educational questions supported by approved sources. Fiqh rulings and Marja selection are paused in both backend variants and the frontend.

`packages/shared/src/features.ts` exports `FIQH_ENABLED = false` for the frontend, Express backend and Workers backend. A request cannot enable it. The UI omits Marja selection during onboarding, in settings and in chat. Onboarding displays three steps while preserving the persisted step IDs (1, 3, 4); existing accounts at step 2 resume at language selection. Profile saves omit the Marja field. Source Studio defaults to educational imports.

Both answer services defer recognized Fiqh questions before retrieval or model generation. The shared generator independently rejects the Fiqh category and instructs the model to decline legal verdicts, including implicit follow-ups. Replies are available in English, Urdu and Roman Urdu. The keyword classifier is conservative, not a complete semantic detector: it can defer an educational question mentioning ritual vocabulary, and unfamiliar phrasing depends on the generation policy. Scope and citation checks are not scholarly certification.

Educational retrieval remains restricted to approved `EDUCATIONAL / JAWAD_NAQVI` documents. Recognized topics retain their topic filter; general questions (`OTHER`) search across approved educational topics rather than falling back to Fiqh. Insufficient evidence produces an explicit response rather than an invented answer. Personal preferences and historical message/citation snapshots remain intact; no data migration or source deletion is required.

Restoring Fiqh is a deliberate release: update the shared flag and public copy, supply authorized and reviewed Marja-specific sources, and rerun onboarding, authority-isolation, retrieval and generation tests before deployment. The existing schema, review history and low-level authority-isolation tests are retained for this purpose.

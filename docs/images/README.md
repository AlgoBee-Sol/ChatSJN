# Product previews

The PNGs in this directory are intentionally public documentation assets. They are separate from the ignored `.local/screenshots/` test output and must contain only synthetic fixture data.

| Asset                  | What it shows                                                                     |
| ---------------------- | --------------------------------------------------------------------------------- |
| `product-showcase.png` | Desktop landing page and mobile web workspace presented in HTML/CSS device frames |
| `landing-desktop.png`  | Public landing page, full height                                                  |
| `chat-desktop.png`     | Learner workspace using a synthetic account                                       |
| `chat-mobile.png`      | The same responsive workspace on mobile web                                       |
| `admin-desktop.png`    | Source studio with explicitly synthetic source records                            |
| `register-desktop.png` | Better Auth registration and the unconfigured Google sign-in state                |
| `urdu-mobile.png`      | Urdu workspace and right-to-left layout                                           |

## Reproduce

```sh
pnpm test:e2e
pnpm docs:mockups
```

The first command captures the application using `tests/e2e/server.ts` and its disposable database. The second copies six selected captures and renders `docs/mockups/showcase.html` with Playwright/Chrome to produce the cover. No AI-generated app screens, external screenshots, personal accounts, or real religious answers are used.

Review every image before committing it. Regenerate after a UI change that makes a preview inaccurate. The HTML composition uses local assets and makes no external requests. Product screenshots are not proof that live Google sign-in or a production AI provider has been configured.

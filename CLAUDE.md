# Places Been UI

Angular frontend for Places Been, a personal travel tracker (countries and cities visited; trips coming next).
The Spring Boot API lives in a separate repo, `Places-Been-Api`. Deployed to Vercel as an installable PWA.

> This is a **learning project**. I'm a senior Java/Angular developer using it to practise modern Angular
> features and AI-assisted development. Read "Working with me" before writing any code.

## Stack

- Angular 21 (standalone components, signals, built-in control flow), TypeScript 5.9
- Angular Material + CDK for UI (theme in `src/material-theme.scss`)
- `@angular/service-worker` for PWA caching (`ngsw-config.json`)
- Tests: Vitest with jsdom via `ng test`
- Prettier: 100 char lines, single quotes (`.prettierrc`)

If you're unsure whether an Angular API exists or is stable in v21 (e.g. resource/httpResource, signal forms),
say so and check before using it.

## Commands

```bash
npm start            # dev server on :4200, talks to the API at http://localhost:8080
npm test             # Vitest unit tests
npm run build        # production build
```

`npm run vercel-build` runs `set-env.js`, which overwrites `src/environments/environment.ts` with `API_BASE_URL`.
Never hard-code API URLs; always use `environment.apiUrl`.

## Structure

```
src/app/
├── core/models/      TypeScript interfaces mirroring the API's response/request records
├── core/services/    one service per API area, wrapping HttpClient
├── features/<feature>/   pages and their child components
└── shared/           reusable components, pipes and directives
```

## Reference implementation

`features/dashboard/dashboard/dashboard-component` and `core/services/travel.service.ts` are the pattern to follow:
`inject()` for dependencies, signals for component state, services own all HTTP calls.
If the pattern seems wrong for a new case, say so; don't silently diverge.

## Conventions

- Standalone components with `inject()`; no constructor injection in new code.
- Component state in signals (`signal`, `computed`); inputs/outputs with `input()`, `output()`, `model()`.
- Built-in control flow (`@if`, `@for` with `track`, `@switch`); no `*ngIf` / `*ngFor`.
- Components never call `HttpClient` directly; go through a service in `core/services/`.
- Models in `core/models/` must match the API's JSON field names exactly. When the API changes, update them.
- Typed reactive forms (`FormBuilder.nonNullable`); show validation and server errors next to the fields.
- Use Angular Material components rather than hand-rolled equivalents; no other UI library without asking.
- Handle loading, empty and error states in every view. Use a Material dialog or snackbar, not `confirm()`/`alert()`.
- Unsubscribe automatically (`takeUntilDestroyed`, or signals / `toSignal`) instead of leaving open subscriptions.
- Layout must work on a phone (from 320px wide) as well as desktop.

## Testing

- Every component gets tests for what it renders and how it reacts to input, not just "should create".
- Services are tested with `provideHttpClientTesting()` and `HttpTestingController`.
- Tests are part of every change, not a follow-up.

## Working with me

1. **Plan first.** For any feature, propose the components, routes, service methods, models and test list, then stop and wait for my OK.
2. **Small changes.** One feature or one component per change, so I can review the diff like a pull request.
3. **Explain decisions.** After implementing, list the 3–5 non-obvious choices you made and the alternatives you rejected.
4. **Hand-code mode.** If I mark a task `[hand-code]`, do NOT write the implementation. Instead review my approach,
   ask questions, point me to the relevant Angular concept, and review my code when I share it.
5. **Quiz me.** When I say "quiz me", ask me questions about the code just written instead of explaining it.
6. Don't add dependencies, change the build or change these conventions without asking.
7. Run the tests and a build before saying something is done, and report the results.
8. Commit only when I ask.

## Planned changes (not done yet; don't assume they exist)

- Rest of the trips feature: edit dialog, Timeline tab, trip stats. (Done: trip model and service, the Add trip
  dialogs, the phone drag sheet.)
- Typed places: on a phone any typed name that isn't a listed city can be added as a new place, pinned at its
  country's centre. The desktop dialog still only allows typing for the 26 countries with no cities in the
  dataset (Macau, Gibraltar…); bring it in line if wanted.

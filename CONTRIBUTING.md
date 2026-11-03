# Contributing

## Picking up work
1. Open the **Issues** tab and filter by milestone (Phase 0 to Phase 5).
2. Choose an issue whose "Depends on" issues are closed. Issues labelled `ready-to-start` have no dependencies.
3. Assign yourself or comment "I'll take this" so nobody doubles up.
4. Read the issue, the linked section of the [plan](docs/superpowers/plans/2026-11-03-tripapp.md), and the [design](docs/superpowers/specs/2026-11-03-tripapp-design.md).

## Working on it
- Branch name: `issue-<number>-short-name`.
- Write the failing tests first, as the issue's steps say, then the code.
- Keep changes to what the issue covers. If you find a gap, open a new issue.
- Open a pull request with `Closes #<number>` in the description. One issue per pull request.
- Never commit secrets (keys, tokens, `.env` files).
- Install packages only through the registry your organization requires.

## Definition of done
Tests pass, the issue's acceptance steps pass, UI changes include phone and desktop screenshots, and the pull request is reviewed by someone else.

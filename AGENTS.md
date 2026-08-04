# Repository Guidelines

## Project Structure & Module Organization

This repository is a monorepo of independent Projudi TJGO userscripts. Active extensions live in `anotacoes/`, `centraldeguias/`, `customizacoes/`, `intimacoes/`, and `tarefas/`; each folder contains its `.user.js` source and a focused `README.md`. Historical, unsupported scripts are under `arquivo/` and should not be changed for active features. Cross-extension contracts are covered by `tests/suite-contract.test.mjs`.

## Build, Test, and Development Commands

There is no package manager or build step. Use Node.js directly:

- `node --test tests/suite-contract.test.mjs` runs the repository-wide static contract tests.
- `node --check intimacoes/projudi-intimacao-page.user.js` validates one userscript’s JavaScript syntax; repeat for every changed `.user.js` file.
- `git diff --check` detects whitespace errors before committing.

Visual and browser behavior must also be checked manually in a supported userscript manager on Projudi when changing DOM, iframe, or CSS behavior.

## Coding Style & Naming Conventions

Use plain JavaScript userscripts with two-space indentation, semicolons, strict mode, and small named functions. Keep each script self-contained inside its existing IIFE. Prefix new DOM IDs, classes, storage keys, and events with the extension namespace (for example, `pjip-` or `projudi-suite::intimacoes::`). Preserve the metadata block at the top of every userscript. Avoid global APIs, broad selectors, webfont runtimes, and unnecessary dependencies; follow the SVG sprite and UI-isolation contracts tested in `tests/suite-contract.test.mjs`.

## Testing Guidelines

Add or update static contract assertions when a cross-extension invariant changes. For UI changes, test the affected active extension in both the relevant Projudi page and iframe context, including navigation, visibility, keyboard access, and responsive sizing where applicable. Do not add tests for `arquivo/` scripts.

## Commit & Pull Request Guidelines

Use `.gitmessage` as the commit template. Messages must be in Brazilian Portuguese, use a type such as `feat`, `fix`, `ui`, or `docs`, start with an infinitive verb, and keep the first line under 72 characters (for example, `ui: ajustar espaçamento do painel`). Include `Co-authored-by` trailers for AI contributors that actually participated. Pull requests should describe behavior changes, list validation commands, link related issues when available, and include screenshots for visual changes. Never commit tokens, Gist credentials, or private backup contents.

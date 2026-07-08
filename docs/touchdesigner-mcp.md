# TouchDesigner Docs MCP Server (bottobot td-mcp)

This repo is set up so the [bottobot TouchDesigner MCP server](https://github.com/bottobot/touchdesigner-mcp-server)
(npm: `@bottobot/td-mcp`) loads **automatically** in every Claude Code
session opened in this project — cloud or local. It provides
TouchDesigner documentation tools (operators, Python API, tutorials,
GLSL patterns, workflow suggestions) plus `td_*` tools for controlling
a live TouchDesigner instance.

## How the automatic setup works

Three committed files make it zero-setup:

- **`.mcp.json`** — project-scoped MCP config; Claude Code reads it on
  session start and launches the server.
- **`.claude/scripts/td-mcp-launcher.sh`** — launcher that installs
  `td-mcp` from GitHub on first use (fresh containers), then execs it.
  Warm sessions skip the install.
- **`.claude/settings.json`** — auto-approves the project MCP server
  (`enableAllProjectMcpServers`) and raises `MCP_TIMEOUT` so a cold
  first-time install doesn't trip the startup timeout.

Nothing to run manually. Verify with `claude mcp list`:

```
touchdesigner-docs: bash .claude/scripts/td-mcp-launcher.sh - √ Connected
```

## Using it outside this repo (any project, one-time)

To have it in every project on your own machine, install at user scope.

**macOS / Linux:**

```sh
npm install -g github:bottobot/touchdesigner-mcp-server
claude mcp add --scope user touchdesigner-docs -- td-mcp
```

**Windows:** the npm global install may not put a working `td-mcp`
shim on PATH, so point Claude Code at the installed script directly.
Find your global module path with `npm root -g` (typically
`C:\Users\<you>\AppData\Roaming\npm\node_modules`), then:

```bat
npm install -g github:bottobot/touchdesigner-mcp-server
claude mcp add --scope user touchdesigner-docs -- node "C:\Users\<you>\AppData\Roaming\npm\node_modules\@bottobot\td-mcp\index.js"
```

Verify on any platform with `claude mcp list` — you should see
`touchdesigner-docs … √ Connected`.

## Known issue: the npm package is broken

Every published npm version (including `@bottobot/td-mcp@2.8.0`) is
missing `wiki/operator-data-manager.js` from the tarball, so
`npx -y @bottobot/td-mcp` crashes on startup with `ERR_MODULE_NOT_FOUND`.
That's why the launcher installs from the GitHub repo, which ships the
complete source (v3.0.0 as of 2026-07-08). Pinning a commit via
`npx github:...#<sha>` also fails ("GitFetcher requires an Arborist
constructor" npm bug), hence the global-install approach.

## Related project (not this one)

[8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp)
(npm: `touchdesigner-mcp-server`) is a different server that controls a
running TouchDesigner instance over WebSocket and requires a
TouchDesigner component installed in your project.

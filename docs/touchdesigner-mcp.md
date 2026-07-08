# TouchDesigner Docs MCP Server (bottobot td-mcp)

Setup notes for the [bottobot TouchDesigner MCP server](https://github.com/bottobot/touchdesigner-mcp-server)
(npm: `@bottobot/td-mcp`) with Claude Code. It provides TouchDesigner
documentation tools (operators, Python API, tutorials, GLSL patterns,
workflow suggestions) plus `td_*` tools for controlling a live
TouchDesigner instance.

## Known issue: the npm package is broken

Every published npm version (including `@bottobot/td-mcp@2.8.0`) is
missing `wiki/operator-data-manager.js` from the tarball, so
`npx -y @bottobot/td-mcp` crashes on startup with `ERR_MODULE_NOT_FOUND`.

**Workaround:** install from the GitHub repo instead, which ships the
complete source (v3.0.0 as of 2026-07-08):

```sh
npm install -g github:bottobot/touchdesigner-mcp-server
claude mcp add --scope user touchdesigner-docs -- td-mcp
```

Verify with:

```sh
claude mcp list
# touchdesigner-docs: td-mcp - √ Connected
```

Note: `npx -y github:bottobot/touchdesigner-mcp-server` also works, but
pinning a commit (`#<sha>`) trips an npm bug ("GitFetcher requires an
Arborist constructor"), and the unpinned form re-resolves the repo on
cold caches — the global install above is the reliable path.

## Related project (not this one)

[8beeeaaat/touchdesigner-mcp](https://github.com/8beeeaaat/touchdesigner-mcp)
(npm: `touchdesigner-mcp-server`) is a different server that controls a
running TouchDesigner instance over WebSocket and requires a
TouchDesigner component installed in your project.

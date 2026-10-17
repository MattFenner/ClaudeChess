# chess-board

A Claude Code mod that adds a `ShowChessState` tool (listed to Claude as
`mcp__chess-board__ShowChessState`). Claude calls it with a FEN position and
the board is drawn in place of the tool-call row: an SVG board on the desktop
app, a coloured text board in the terminal.

Options: `orientation`, `lastMove`, `highlights`, `arrows`, `title`, and
`saveTo` (a `.svg` path) to write the board to a file instead of drawing it.

## Install

From this folder, in a shell:

```bash
claude plugin marketplace add C:\Dev\ClaudeChess
```

```bash
claude plugin install chess-board@claude-chess --scope user
```

The plugin is read straight from this folder, so after editing it run
`/reload-plugins` in a terminal session (or start a new session).

## Develop

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

`hooks/chess.ts` holds the FEN parsing and SVG drawing, `hooks/register.tsx`
registers the tool and the render hooks, and `tests/` the tests.

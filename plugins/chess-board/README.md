# chess-board

A Claude Code mod that adds a `ShowChessState` tool (listed to Claude as
`mcp__chess-board__ShowChessState`). Claude calls it with a FEN position and
the board is drawn in place of the tool-call row: an SVG board on the desktop
app, a coloured text board in the terminal.

Options: `orientation`, `lastMove`, `highlights`, `arrows`, `labels`, `title`,
and `saveTo` (a `.svg` path) to write the board to a file instead of drawing it.

`labels` puts a 1-2 character badge on squares, e.g. `{"e4": "1", "f3": "2"}`,
which suits numbering an opening's pieces in the order they were played.

Highlights, arrows and labels each take an optional colour by using an object
in place of the plain string: `{"square": "e5", "color": "red"}`,
`{"move": "d8h4", "color": "red"}`, `{"text": "2", "color": "red"}`. Colours are
a name (red, orange, yellow, green, blue, purple, pink, grey, black, white) or
`#rrggbb`. Defaults: yellow highlights, green arrows, blue labels.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install chess-board --marketplace MattFenner/ClaudeChess
```

Or from a shell:

```bash
claude plugin install chess-board --marketplace MattFenner/ClaudeChess
```

In the desktop app: click + next to the prompt box, then Plugins, Add
marketplace with `MattFenner/ClaudeChess`, then Add plugin.

## Develop

To run it from a local clone, add the clone as a marketplace and install from
it; it is then read straight from the folder, so after editing run
`/reload-plugins` in a terminal session (or start a new session):

```bash
claude plugin marketplace add <path to clone>
```

```bash
claude plugin install chess-board@claude-chess --scope user
```

From this folder:

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

`hooks/chess.ts` holds the FEN parsing and SVG drawing, `hooks/register.tsx`
registers the tool and the render hooks, and `tests/` the tests.

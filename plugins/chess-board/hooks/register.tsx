import type { Register } from 'claude-code'
import {
  buildState,
  describe,
  markedSquares,
  parseFen,
  renderSvg,
  resolvePath,
  resultText,
  savedPathFrom,
  blend,
  COLOR_NAMES,
  DARK,
  HIGHLIGHT_OPACITY,
  LIGHT,
  TERMINAL_GLYPH,
  type ChessState,
} from './chess'

export const TOOL = 'mcp__chess-board__ShowChessState'

const DESCRIPTION = `Draws a chess position as a board in the user's transcript.
Use it whenever showing a position would help: explaining a move, an opening, a puzzle or a game state.
The position is given as FEN; only the piece placement and side to move are drawn.
Optionally mark the last move, highlight squares, draw arrows (moves/plans) and put short labels on squares.
Labels suit numbering pieces in the order they were played, e.g. the final position of an opening with each developed piece numbered.
Highlights, arrows and labels each take an optional colour, e.g. to tell White's moves from Black's.
Pass saveTo (a .svg path) to write the board to a file instead of drawing it in the chat.
The result echoes an ASCII version of the board so you can check the position is the one you meant.`

const COLOR = {
  type: 'string',
  description: `A colour name (${Object.keys(COLOR_NAMES).join(', ')}) or "#rrggbb".`,
}

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    fen: {
      type: 'string',
      description: 'Position in FEN, e.g. "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1". "start" or omitted = starting position.',
    },
    orientation: { type: 'string', enum: ['white', 'black'], description: 'Which side is at the bottom. Default white.' },
    lastMove: { type: 'string', description: 'Move to mark, as from+to squares, e.g. "e2e4".' },
    highlights: {
      type: 'array',
      items: {
        anyOf: [
          { type: 'string' },
          { type: 'object', properties: { square: { type: 'string' }, color: COLOR }, required: ['square'], additionalProperties: false },
        ],
      },
      description: 'Squares to highlight, e.g. ["f7", {"square": "e5", "color": "red"}]. Default colour yellow.',
    },
    arrows: {
      type: 'array',
      items: {
        anyOf: [
          { type: 'string' },
          { type: 'object', properties: { move: { type: 'string' }, color: COLOR }, required: ['move'], additionalProperties: false },
        ],
      },
      description: 'Arrows as from+to squares, e.g. ["g1f3", {"move": "d8h4", "color": "red"}]. Default colour green.',
    },
    labels: {
      type: 'object',
      additionalProperties: {
        anyOf: [
          { type: 'string' },
          { type: 'object', properties: { text: { type: 'string' }, color: COLOR }, required: ['text'], additionalProperties: false },
        ],
      },
      description:
        'Badges of 1-2 characters keyed by square, e.g. {"e4": "1", "c5": {"text": "2", "color": "red"}} to number pieces by move order. Default colour blue.',
    },
    title: { type: 'string', description: 'Short caption shown above the board.' },
    saveTo: {
      type: 'string',
      description: 'Only when the user asks to save the board: a .svg file path (relative to the working directory, or absolute). The board is written there instead of drawn in the chat.',
    },
  },
  additionalProperties: false,
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'ShowChessState', description: DESCRIPTION, inputSchema: INPUT_SCHEMA, isDeferred: false })
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    try {
      const state = buildState(e)
      if (state.saveTo) {
        state.saveTo = resolvePath(state.saveTo, await $.session.cwd())
        await $.fs.write(state.saveTo, renderSvg(state))
      }
      return { result: resultText(state) }
    } catch (err) {
      return { deny: `ShowChessState: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  // The whole tool-call row is replaced: the board (or the saved-file line)
  // stands where "ShowChessState(...)" and its result would be.
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    const { tool, input, output, isRunning, isErrored, isInterrupted } = e.props
    if (tool !== TOOL || isErrored || isInterrupted) return next(e)

    let state: ChessState
    try {
      state = buildState(input)
    } catch {
      return next(e)
    }
    const caption = describe(state)

    if (state.saveTo) {
      if (isRunning) return next(e)
      const { Box, Text } = $.ui.resolve(e)
      // The result text holds the resolved (absolute) path.
      const path = savedPathFrom(output) ?? state.saveTo
      return (
        <Box flexDirection="column">
          <Text>{`♞ Saved chess board${state.title ? ` "${state.title}"` : ''} to ${path}`}</Text>
          <Text dimColor>{caption}</Text>
        </Box>
      )
    }

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {state.title ? <Text bold>{state.title}</Text> : null}
          {terminalRows(state).map((row, i) => (
            <Text key={`r${i}`}>
              <Text dimColor>{row.label} </Text>
              {row.cells.map((c, j) => (
                <Text key={`c${j}`} backgroundColor={c.bg} color="#000000">
                  {c.label ? c.glyph : ` ${c.glyph} `}
                  {c.label ? (
                    <Text bold color={c.label.color}>
                      {c.label.text.padEnd(2)}
                    </Text>
                  ) : null}
                </Text>
              ))}
            </Text>
          ))}
          <Text dimColor>{'  ' + terminalFiles(state)}</Text>
          <Text dimColor>{caption}</Text>
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {state.title ? <Text weight="semibold">{state.title}</Text> : null}
        <Svg source={renderSvg(state)} alt={`Chess board: ${caption}\n${state.ascii}`} width={360} height={360} />
        <Text dimColor>{caption}</Text>
      </Box>
    )
  })

  // The row above already shows everything, so the separate result block is
  // left empty. Errors still draw the engine's own result.
  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    if (e.props.tool !== TOOL || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

function terminalRows(state: ChessState) {
  const { board } = parseFen(state.fen)
  const marked = markedSquares(state)
  const ranks = state.orientation === 'white' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const files = state.orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  return ranks.map(rank => ({
    label: String(rank + 1),
    cells: files.map(file => {
      const piece = board[7 - rank]![file]
      const name = String.fromCharCode(97 + file) + (rank + 1)
      const square = (file + rank) % 2 === 1 ? LIGHT : DARK
      const mark = marked.get(name)
      // Terminals have no translucency, so the highlight is pre-mixed with the square colour.
      const bg = mark ? blend(mark, square, HIGHLIGHT_OPACITY) : square
      const glyph = piece ? TERMINAL_GLYPH[piece]! : ' '
      // Each cell is three columns wide: " ♞ ", or "♞12" with a label.
      return { bg, glyph, label: state.labels[name] }
    }),
  }))
}

function terminalFiles(state: ChessState) {
  const files = ' a  b  c  d  e  f  g  h '
  return state.orientation === 'white' ? files : files.split('').reverse().join('')
}

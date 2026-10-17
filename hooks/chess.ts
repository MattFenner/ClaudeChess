// Pure chess-board logic: FEN parsing, input validation and SVG drawing.
// No engine calls here so it can be tested directly.

export type Color = 'white' | 'black'

/** One of `KQRBNPkqrbnp`, as FEN spells it; uppercase is white. */
export type Piece = string

/** board[0] is rank 8, board[7] is rank 1; [r][0] is the a-file. */
export type Board = (Piece | null)[][]

export type Square = { file: number; rank: number } // 0-7 each, rank 0 = rank 1

export type Arrow = { from: string; to: string }

/** What the tool stores as its result and what the renderers draw from. */
export type ChessState = {
  fen: string
  orientation: Color
  sideToMove: Color
  lastMove?: string
  highlights: string[]
  arrows: Arrow[]
  title?: string
  /** When set, the board is written to this .svg file instead of drawn in the chat. */
  saveTo?: string
  ascii: string
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const PIECES = 'KQRBNPkqrbnp'
const SQUARE_RE = /^[a-h][1-8]$/
const MOVE_RE = /^([a-h][1-8])-?([a-h][1-8])[qrbn]?$/

export function parseSquare(sq: string): Square {
  if (!SQUARE_RE.test(sq)) throw new Error(`"${sq}" is not a square (expected e.g. "e4")`)
  return { file: sq.charCodeAt(0) - 97, rank: sq.charCodeAt(1) - 49 }
}

/** "e2e4", "e2-e4" or "e7e8q" → its two squares. */
export function parseMove(move: string): [string, string] {
  const m = MOVE_RE.exec(move.trim().toLowerCase())
  if (!m) throw new Error(`"${move}" is not a move (expected e.g. "e2e4")`)
  return [m[1]!, m[2]!]
}

export function parseFen(fen: string): { board: Board; sideToMove: Color } {
  const [placement, side = 'w'] = fen.trim().split(/\s+/)
  if (!placement) throw new Error('FEN is empty')
  const ranks = placement.split('/')
  if (ranks.length !== 8) throw new Error(`FEN has ${ranks.length} ranks, expected 8`)

  const board: Board = ranks.map((rank, i) => {
    const row: (Piece | null)[] = []
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') row.push(...Array<null>(Number(ch)).fill(null))
      else if (PIECES.includes(ch)) row.push(ch)
      else throw new Error(`FEN rank ${8 - i} has an invalid character "${ch}"`)
    }
    if (row.length !== 8) throw new Error(`FEN rank ${8 - i} has ${row.length} squares, expected 8`)
    return row
  })

  if (side !== 'w' && side !== 'b') throw new Error(`FEN side to move is "${side}", expected "w" or "b"`)
  return { board, sideToMove: side === 'w' ? 'white' : 'black' }
}

export function toAscii(board: Board, orientation: Color): string {
  const rows = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const files = orientation === 'white' ? 'a b c d e f g h' : 'h g f e d c b a'
  const lines = rows.map(r => {
    const cells = board[r]!.map(p => p ?? '.')
    if (orientation === 'black') cells.reverse()
    return `${8 - r} ${cells.join(' ')}`
  })
  return [...lines, `  ${files}`].join('\n')
}

/**
 * Validates the tool's raw input and builds the state to draw.
 * Throws an Error whose message is meant for the model.
 */
export function buildState(input: unknown): ChessState {
  const i = (input ?? {}) as Record<string, unknown>
  const fenRaw = typeof i.fen === 'string' && i.fen.trim() !== '' ? i.fen.trim() : START_FEN
  const fen = fenRaw === 'start' || fenRaw === 'startpos' ? START_FEN : fenRaw
  const { board, sideToMove } = parseFen(fen)

  const orientation: Color = i.orientation === 'black' ? 'black' : 'white'

  let lastMove: string | undefined
  if (typeof i.lastMove === 'string' && i.lastMove.trim() !== '') {
    parseMove(i.lastMove)
    lastMove = i.lastMove.trim().toLowerCase()
  }

  const highlights = asStrings(i.highlights, 'highlights').map(s => s.toLowerCase())
  highlights.forEach(parseSquare)

  const arrows = asStrings(i.arrows, 'arrows').map(a => {
    const [from, to] = parseMove(a)
    return { from, to }
  })

  const title = typeof i.title === 'string' && i.title.trim() !== '' ? i.title.trim() : undefined

  let saveTo: string | undefined
  if (typeof i.saveTo === 'string' && i.saveTo.trim() !== '') {
    saveTo = i.saveTo.trim()
    if (!/\.svg$/i.test(saveTo)) throw new Error(`"saveTo" must be a .svg file path, got "${saveTo}"`)
  }

  return { fen, orientation, sideToMove, lastMove, highlights, arrows, title, saveTo, ascii: toAscii(board, orientation) }
}

/** Absolute paths are kept; relative ones are joined onto `cwd`. */
export function resolvePath(path: string, cwd: string): string {
  if (/^([a-zA-Z]:)?[\\/]/.test(path)) return path
  const sep = cwd.includes('\\') ? '\\' : '/'
  return cwd.replace(/[\\/]+$/, '') + sep + path.replace(/^\.[\\/]/, '')
}

function asStrings(v: unknown, name: string): string[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) throw new Error(`"${name}" must be an array of strings`)
  return v as string[]
}

// ---------------------------------------------------------------- drawing

export const LIGHT = '#f0d9b5'
export const DARK = '#b58863'
export const HIGHLIGHT = 'rgba(255, 220, 0, 0.5)'
const ARROW = 'rgba(21, 120, 27, 0.8)'
const SQ = 60

// The filled glyphs are used for both colours; fill/stroke tells them apart.
// U+FE0E asks for text (not emoji) presentation, which matters for the pawn.
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
/** Outline glyphs for white, filled for black: readable in a single text colour. */
export const TERMINAL_GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎',
}

/** Screen position (column, row from the top) of a square for an orientation. */
export function screenPos(sq: Square, orientation: Color): { x: number; y: number } {
  return orientation === 'white' ? { x: sq.file, y: 7 - sq.rank } : { x: 7 - sq.file, y: sq.rank }
}

export function markedSquares(state: ChessState): Set<string> {
  const marked = new Set(state.highlights)
  if (state.lastMove) parseMove(state.lastMove).forEach(s => marked.add(s))
  return marked
}

export function renderSvg(state: ChessState): string {
  const { board } = parseFen(state.fen)
  const marked = markedSquares(state)
  const parts: string[] = []
  const size = SQ * 8

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `<defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" fill="${ARROW}"/></marker></defs>`,
  )

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const { x, y } = screenPos({ file, rank }, state.orientation)
      const isLight = (file + rank) % 2 === 1
      const name = String.fromCharCode(97 + file) + (rank + 1)
      parts.push(`<rect x="${x * SQ}" y="${y * SQ}" width="${SQ}" height="${SQ}" fill="${isLight ? LIGHT : DARK}"/>`)
      if (marked.has(name)) parts.push(`<rect x="${x * SQ}" y="${y * SQ}" width="${SQ}" height="${SQ}" fill="${HIGHLIGHT}"/>`)

      // Coordinates along the bottom and left edges, in the opposite square colour.
      const labelFill = isLight ? DARK : LIGHT
      if (y === 7) parts.push(label(x * SQ + SQ - 4, y * SQ + SQ - 4, 'end', labelFill, name[0]!))
      if (x === 0) parts.push(label(x * SQ + 3, y * SQ + 12, 'start', labelFill, name[1]!))

      const piece = board[7 - rank]![file]
      if (piece) {
        const isWhite = piece === piece.toUpperCase()
        parts.push(
          `<text x="${x * SQ + SQ / 2}" y="${y * SQ + SQ / 2 + 2}" font-size="${SQ * 0.82}" text-anchor="middle" dominant-baseline="central" ` +
            `font-family="'Segoe UI Symbol','DejaVu Sans','Noto Sans Symbols 2','Arial Unicode MS',serif" ` +
            `fill="${isWhite ? '#ffffff' : '#000000'}" stroke="${isWhite ? '#000000' : '#ffffff'}" stroke-width="${isWhite ? 1.6 : 0.6}" paint-order="stroke">` +
            `${GLYPH[piece.toLowerCase()]}︎</text>`,
        )
      }
    }
  }

  for (const a of state.arrows) {
    const from = center(parseSquare(a.from), state.orientation)
    const to = center(parseSquare(a.to), state.orientation)
    // Stop short of the centre so the head doesn't cover the target piece.
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy) || 1
    const end = { x: to.x - (dx / len) * SQ * 0.25, y: to.y - (dy / len) * SQ * 0.25 }
    parts.push(
      `<line x1="${from.x}" y1="${from.y}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${ARROW}" ` +
        `stroke-width="${SQ * 0.18}" stroke-linecap="round" marker-end="url(#ah)"/>`,
    )
  }

  parts.push('</svg>')
  return parts.join('')
}

function center(sq: Square, orientation: Color) {
  const { x, y } = screenPos(sq, orientation)
  return { x: x * SQ + SQ / 2, y: y * SQ + SQ / 2 }
}

function label(x: number, y: number, anchor: string, fill: string, text: string) {
  return `<text x="${x}" y="${y}" font-size="11" font-weight="bold" font-family="sans-serif" text-anchor="${anchor}" fill="${fill}">${text}</text>`
}

const SAVED_RE = /^Saved chess board to (.+)$/m

/**
 * What the model reads back. Plugin tools must answer text, so the resolved
 * save path travels in it too and the renderer reads it back with `savedPathFrom`.
 */
export function resultText(state: ChessState): string {
  const head = state.saveTo ? `Saved chess board to ${state.saveTo}` : 'Drew the chess board in the chat.'
  return `${head}\n${describe(state)}\n\n${state.ascii}`
}

export function savedPathFrom(output: unknown): string | undefined {
  return typeof output === 'string' ? SAVED_RE.exec(output)?.[1] : undefined
}

/** One-line description: alt text and the caption under the board. */
export function describe(state: ChessState): string {
  const bits = [`${state.sideToMove === 'white' ? 'White' : 'Black'} to move`]
  if (state.lastMove) bits.push(`last move ${state.lastMove}`)
  if (state.arrows.length) bits.push(`arrows ${state.arrows.map(a => `${a.from}→${a.to}`).join(', ')}`)
  if (state.highlights.length) bits.push(`highlighted ${state.highlights.join(', ')}`)
  return bits.join(' · ')
}

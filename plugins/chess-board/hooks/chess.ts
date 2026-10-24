// Pure chess-board logic: FEN parsing, input validation and SVG drawing.
// No engine calls here so it can be tested directly.

export type Color = 'white' | 'black'

/** One of `KQRBNPkqrbnp`, as FEN spells it; uppercase is white. */
export type Piece = string

/** board[0] is rank 8, board[7] is rank 1; [r][0] is the a-file. */
export type Board = (Piece | null)[][]

export type Square = { file: number; rank: number } // 0-7 each, rank 0 = rank 1

/** Colours are stored as "#rrggbb"; translucency is applied when drawing. */
export type Arrow = { from: string; to: string; color: string }
export type Highlight = { square: string; color: string }
export type Label = { text: string; color: string }

/** What the tool stores as its result and what the renderers draw from. */
export type ChessState = {
  fen: string
  orientation: Color
  sideToMove: Color
  lastMove?: string
  highlights: Highlight[]
  arrows: Arrow[]
  /** Short text badges keyed by square, e.g. move-order numbers: { e4: { text: '1', color } }. */
  labels: Record<string, Label>
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

  const highlights = asItems(i.highlights, 'highlights', 'square').map(({ value, color }) => {
    const square = value.trim().toLowerCase()
    parseSquare(square)
    return { square, color: parseColor(color, DEFAULT_HIGHLIGHT) }
  })

  const arrows = asItems(i.arrows, 'arrows', 'move').map(({ value, color }) => {
    const [from, to] = parseMove(value)
    return { from, to, color: parseColor(color, DEFAULT_ARROW) }
  })

  const labels = asLabels(i.labels)

  const title = typeof i.title === 'string' && i.title.trim() !== '' ? i.title.trim() : undefined

  let saveTo: string | undefined
  if (typeof i.saveTo === 'string' && i.saveTo.trim() !== '') {
    saveTo = i.saveTo.trim()
    if (!/\.svg$/i.test(saveTo)) throw new Error(`"saveTo" must be a .svg file path, got "${saveTo}"`)
  }

  return { fen, orientation, sideToMove, lastMove, highlights, arrows, labels, title, saveTo, ascii: toAscii(board, orientation) }
}

/** Absolute paths are kept; relative ones are joined onto `cwd`. */
export function resolvePath(path: string, cwd: string): string {
  if (/^([a-zA-Z]:)?[\\/]/.test(path)) return path
  const sep = cwd.includes('\\') ? '\\' : '/'
  return cwd.replace(/[\\/]+$/, '') + sep + path.replace(/^\.[\\/]/, '')
}

export const MAX_LABEL = 2

function asLabels(v: unknown): Record<string, Label> {
  if (v === undefined || v === null) return {}
  if (!isRecord(v)) throw new Error('"labels" must be an object of square → text, e.g. {"e4": "1"}')
  const labels: Record<string, Label> = {}
  for (const [sq, entry] of Object.entries(v)) {
    const square = sq.trim().toLowerCase()
    parseSquare(square)
    const { text, color } = isRecord(entry) ? entry : { text: entry, color: undefined }
    if (typeof text !== 'string' && typeof text !== 'number') throw new Error(`label for ${square} must be a string or {"text", "color"}`)
    const t = String(text).trim()
    if (t === '' || t.length > MAX_LABEL) throw new Error(`label for ${square} must be 1-${MAX_LABEL} characters, got "${t}"`)
    labels[square] = { text: t, color: parseColor(color, DEFAULT_LABEL) }
  }
  return labels
}

/** Each item is either a plain string or `{ [key]: string, color?: string }`. */
function asItems(v: unknown, name: string, key: string): { value: string; color: unknown }[] {
  if (v === undefined || v === null) return []
  const err = () => new Error(`"${name}" must be an array of strings or {"${key}", "color"} objects`)
  if (!Array.isArray(v)) throw err()
  return v.map(x => {
    if (typeof x === 'string') return { value: x, color: undefined }
    if (isRecord(x) && typeof x[key] === 'string') return { value: x[key] as string, color: x.color }
    throw err()
  })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ---------------------------------------------------------------- colours

export const COLOR_NAMES: Record<string, string> = {
  red: '#d32f2f',
  orange: '#ef6c00',
  yellow: '#ffdc00',
  green: '#15781b',
  blue: '#1565c0',
  purple: '#7b1fa2',
  pink: '#d81b60',
  grey: '#757575',
  gray: '#757575',
  black: '#000000',
  white: '#ffffff',
}
export const DEFAULT_HIGHLIGHT = COLOR_NAMES.yellow!
export const DEFAULT_ARROW = COLOR_NAMES.green!
export const DEFAULT_LABEL = COLOR_NAMES.blue!

/** A name from COLOR_NAMES or "#rgb"/"#rrggbb" → "#rrggbb"; missing → the fallback. */
export function parseColor(v: unknown, fallback: string): string {
  if (v === undefined || v === null || v === '') return fallback
  const c = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (COLOR_NAMES[c]) return COLOR_NAMES[c]!
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c)
  if (short) return `#${short[1]!.repeat(2)}${short[2]!.repeat(2)}${short[3]!.repeat(2)}`
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  throw new Error(`"${String(v)}" is not a colour (use a name like red, blue, green, or "#rrggbb")`)
}

/** `color` laid over `base` at `opacity`, both "#rrggbb": what a translucent overlay looks like. */
export function blend(color: string, base: string, opacity: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(ch(color, i) * opacity + ch(base, i) * (1 - opacity)).toString(16).padStart(2, '0')).join('')
}

/** Black or white, whichever reads better on `bg`. */
export function textOn(bg: string): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16))
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 160 ? '#000000' : '#ffffff'
}

// ---------------------------------------------------------------- drawing

export const LIGHT = '#f0d9b5'
export const DARK = '#b58863'
export const HIGHLIGHT_OPACITY = 0.5
const ARROW_OPACITY = 0.8
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

/** Square → highlight colour. The last move uses the default; explicit highlights win. */
export function markedSquares(state: ChessState): Map<string, string> {
  const marked = new Map<string, string>()
  if (state.lastMove) parseMove(state.lastMove).forEach(s => marked.set(s, DEFAULT_HIGHLIGHT))
  for (const h of state.highlights) marked.set(h.square, h.color)
  return marked
}

export function renderSvg(state: ChessState): string {
  const { board } = parseFen(state.fen)
  const marked = markedSquares(state)
  const parts: string[] = []
  const size = SQ * 8

  // A marker can't reliably take its line's colour, so there is one arrowhead per arrow colour.
  const markers = [...new Set(state.arrows.map(a => a.color))].map(
    c =>
      `<marker id="ah${c.slice(1)}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" fill="${c}" fill-opacity="${ARROW_OPACITY}"/></marker>`,
  )
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `<defs>${markers.join('')}</defs>`,
  )

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const { x, y } = screenPos({ file, rank }, state.orientation)
      const isLight = (file + rank) % 2 === 1
      const name = String.fromCharCode(97 + file) + (rank + 1)
      parts.push(`<rect x="${x * SQ}" y="${y * SQ}" width="${SQ}" height="${SQ}" fill="${isLight ? LIGHT : DARK}"/>`)
      const mark = marked.get(name)
      if (mark) parts.push(`<rect x="${x * SQ}" y="${y * SQ}" width="${SQ}" height="${SQ}" fill="${mark}" fill-opacity="${HIGHLIGHT_OPACITY}"/>`)

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

  // Badges go in the top-right corner of their square, above pieces and arrows.
  const badges: string[] = []
  for (const [sq, { text, color }] of Object.entries(state.labels)) {
    const { x, y } = screenPos(parseSquare(sq), state.orientation)
    const cx = x * SQ + SQ - 12
    const cy = y * SQ + 12
    badges.push(
      `<circle cx="${cx}" cy="${cy}" r="10" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>` +
        `<text x="${cx}" y="${cy + 0.5}" font-size="${text.length > 1 ? 10 : 12}" font-weight="bold" font-family="sans-serif" ` +
        `text-anchor="middle" dominant-baseline="central" fill="${textOn(color)}">${escapeXml(text)}</text>`,
    )
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
      `<line x1="${from.x}" y1="${from.y}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${a.color}" stroke-opacity="${ARROW_OPACITY}" ` +
        `stroke-width="${SQ * 0.18}" stroke-linecap="round" marker-end="url(#ah${a.color.slice(1)})"/>`,
    )
  }

  parts.push(...badges, '</svg>')
  return parts.join('')
}

function center(sq: Square, orientation: Color) {
  const { x, y } = screenPos(sq, orientation)
  return { x: x * SQ + SQ / 2, y: y * SQ + SQ / 2 }
}

function escapeXml(s: string) {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
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
  if (state.arrows.length) bits.push(`arrows ${state.arrows.map(a => `${a.from}→${a.to}${colorNote(a.color, DEFAULT_ARROW)}`).join(', ')}`)
  if (state.highlights.length) bits.push(`highlighted ${state.highlights.map(h => h.square + colorNote(h.color, DEFAULT_HIGHLIGHT)).join(', ')}`)
  const labels = Object.entries(state.labels)
  if (labels.length) bits.push(`labels ${labels.map(([sq, l]) => `${sq}=${l.text}${colorNote(l.color, DEFAULT_LABEL)}`).join(', ')}`)
  return bits.join(' · ')
}

/** " (red)" for a non-default colour, by name where it has one. */
function colorNote(color: string, fallback: string): string {
  if (color === fallback) return ''
  const name = Object.keys(COLOR_NAMES).find(n => COLOR_NAMES[n] === color)
  return ` (${name ?? color})`
}

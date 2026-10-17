import { test, expect, describe as group } from 'claude-code/testing'
import { buildState, parseFen, renderSvg, resolvePath, resultText, START_FEN, toAscii } from '../hooks/chess'

const TOOL = 'mcp__chess-board__ShowChessState'
function row(id: string, input: object, output?: unknown) {
  return { tool_use_id: id, tool: TOOL, input, output, isRunning: output === undefined, isErrored: false, isInterrupted: false }
}

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

group('parseFen', () => {
  test('parseFen_StartPosition_PlacesPiecesWithRank8First', async () => {
    const { board, sideToMove } = parseFen(START_FEN)

    expect(board[0]!.join('')).toBe('rnbqkbnr')
    expect(board[7]!.join('')).toBe('RNBQKBNR')
    expect(board[4]!.every(s => s === null)).toBe(true)
    expect(sideToMove).toBe('white')
  })

  test('parseFen_WrongRankCount_Throws', async () => {
    expect(() => parseFen('8/8/8/8 w - - 0 1')).toThrow('4 ranks')
  })

  test('parseFen_RankTooLong_Throws', async () => {
    expect(() => parseFen('rnbqkbnrr/8/8/8/8/8/8/8 w')).toThrow('rank 8 has 9 squares')
  })

  test('parseFen_InvalidPiece_Throws', async () => {
    expect(() => parseFen('rnbqkbnx/8/8/8/8/8/8/8 w')).toThrow('invalid character "x"')
  })
})

group('toAscii', () => {
  test('toAscii_BlackOrientation_FlipsBoard', async () => {
    const lines = toAscii(parseFen(AFTER_E4).board, 'black').split('\n')

    expect(lines[0]).toBe('1 R N B K Q B N R')
    expect(lines[3]).toBe('4 . . . P . . . .')
    expect(lines[8]).toBe('  h g f e d c b a')
  })
})

group('buildState', () => {
  test('buildState_NoFen_UsesStartPosition', async () => {
    expect(buildState({}).fen).toBe(START_FEN)
    expect(buildState({ fen: 'start' }).fen).toBe(START_FEN)
  })

  test('buildState_FullInput_NormalisesFields', async () => {
    const s = buildState({ fen: AFTER_E4, orientation: 'black', lastMove: 'E2-E4', highlights: ['F7'], arrows: ['g8f6'] })

    expect(s.sideToMove).toBe('black')
    expect(s.orientation).toBe('black')
    expect(s.lastMove).toBe('e2-e4')
    expect(s.highlights).toEqual(['f7'])
    expect(s.arrows).toEqual([{ from: 'g8', to: 'f6' }])
  })

  test('buildState_BadSquare_Throws', async () => {
    expect(() => buildState({ highlights: ['z9'] })).toThrow('"z9" is not a square')
  })

  test('buildState_BadArrow_Throws', async () => {
    expect(() => buildState({ arrows: ['e2'] })).toThrow('"e2" is not a move')
  })
})

group('saveTo', () => {
  test('buildState_SaveToNotSvg_Throws', async () => {
    expect(() => buildState({ saveTo: 'board.png' })).toThrow('must be a .svg file path')
  })

  test('resolvePath_Relative_JoinsOntoCwd', async () => {
    expect(resolvePath('boards/a.svg', 'C:\\work\\')).toBe('C:\\work\\boards/a.svg')
    expect(resolvePath('./a.svg', '/home/me')).toBe('/home/me/a.svg')
  })

  test('resolvePath_Absolute_KeptAsGiven', async () => {
    expect(resolvePath('D:\\out\\a.svg', 'C:\\work')).toBe('D:\\out\\a.svg')
    expect(resolvePath('/tmp/a.svg', '/home/me')).toBe('/tmp/a.svg')
  })

  test('ShowChessState_SaveTo_WritesSvgAndShowsPath', async ($, on) => {
    const writes: { path: string; text: string }[] = []
    on('session.cwd', () => ({ value: '/tmp' }))
    on('fs.write', (_$, e) => {
      writes.push({ path: e.path, text: e.text })
      return { value: undefined }
    })

    const ran = await $.tool.call({ tool: TOOL, fen: AFTER_E4, saveTo: 'board.svg' })

    expect(ran.deny).toBeUndefined()
    expect(writes.length).toBe(1)
    // The engine normalises the path for the OS beneath the plugin.
    expect(writes[0]!.path).toMatch(/[\\/]tmp[\\/]board\.svg$/)
    expect(writes[0]!.text.startsWith('<svg')).toBe(true)

    // Plugin tools must answer text: the live engine refuses an object.
    expect(typeof ran.result).toBe('string')
    const output = ran.result as string
    expect(output).toMatch(/^Saved chess board to .*board\.svg$/m)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'chess-board',
        surface,
        component: 'ToolUse',
        requestId: 'toolu_2',
        props: row('toolu_2', { fen: AFTER_E4, saveTo: 'board.svg' }, output),
      })

      expect(await ui.find({ type: 'Text', text: /Saved chess board to .*board\.svg/ })).toBeDefined()
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      await ui.unmount()
    }
  })
})

group('renderSvg', () => {
  test('renderSvg_StartPosition_Draws64SquaresAnd32Pieces', async () => {
    const svg = renderSvg(buildState({}))

    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.match(/<rect /g)?.length).toBe(64)
    expect(svg.match(/dominant-baseline/g)?.length).toBe(32)
  })

  test('renderSvg_LastMoveAndArrow_AddsOverlays', async () => {
    const svg = renderSvg(buildState({ fen: AFTER_E4, lastMove: 'e2e4', arrows: ['g8f6'] }))

    expect(svg.match(/<rect /g)?.length).toBe(66)
    expect(svg.match(/<line /g)?.length).toBe(1)
  })
})

group('tool', () => {
  test('ShowChessState_ValidFen_ReturnsState', async $ => {
    const ran = await $.tool.call({ tool: TOOL, fen: AFTER_E4, lastMove: 'e2e4' })

    expect(ran.deny).toBeUndefined()
    expect(typeof ran.result).toBe('string')
    expect(ran.result as string).toContain('4 . . . . P . . .')
  })

  test('ShowChessState_InvalidFen_Denies', async $ => {
    const ran = await $.tool.call({ tool: TOOL, fen: 'nonsense' })

    expect(ran.deny).toContain('ShowChessState:')
  })

  test('ToolUse_ChessCall_ReplacesRowWithBoardOnEverySurface', async $ => {
    const input = { fen: AFTER_E4, title: 'After 1. e4' }
    for (const surface of ['terminal', 'desktop'] as const) {
      // Drawn from the input while running, and from the stored result after.
      for (const output of [undefined, resultText(buildState(input))]) {
        const ui = await $.ui.mount({
          plugin: 'chess-board',
          surface,
          component: 'ToolUse',
          requestId: 'toolu_1',
          props: row('toolu_1', input, output),
        })

        expect(await ui.find({ type: 'Text', text: /After 1\. e4/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: /Black to move/ })).toBeDefined()
        if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
        await ui.unmount()
      }
    }
  })

  test('ToolUse_OtherTool_LeftToEngine', async ($, on) => {
    // Stands in for the engine's own row.
    on('ui.render', { component: 'ToolUse' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine row</Text>
    })
    const ui = await $.ui.mount({
      plugin: 'chess-board',
      surface: 'desktop',
      component: 'ToolUse',
      requestId: 'toolu_3',
      props: { ...row('toolu_3', { fen: AFTER_E4 }), tool: 'Bash' },
    })

    expect(await ui.find({ type: 'Text', text: 'engine row' })).toBeDefined()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  })

  test('ToolResult_ChessOutput_DrawsNothing', async $ => {
    const output = resultText(buildState({ fen: AFTER_E4, title: 'After 1. e4' }))
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'chess-board',
        surface,
        component: 'ToolResult',
        requestId: 'toolu_1',
        props: { tool_use_id: 'toolu_1', tool: TOOL, output, isErrored: false },
      })

      expect(await ui.find({ type: 'Text' })).toBeUndefined()
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      await ui.unmount()
    }
  })
})

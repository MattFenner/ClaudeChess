import { test, expect, describe as group } from 'claude-code/testing'
import {
  blend,
  buildState,
  DEFAULT_ARROW,
  DEFAULT_HIGHLIGHT,
  DEFAULT_LABEL,
  parseColor,
  parseFen,
  renderSvg,
  resolvePath,
  resultText,
  START_FEN,
  toAscii,
} from '../hooks/chess'

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
    expect(s.highlights).toEqual([{ square: 'f7', color: DEFAULT_HIGHLIGHT }])
    expect(s.arrows).toEqual([{ from: 'g8', to: 'f6', color: DEFAULT_ARROW }])
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

group('labels', () => {
  test('buildState_Labels_NormalisesSquaresAndText', async () => {
    const s = buildState({ labels: { E4: '1', c5: 2 } })

    expect(s.labels).toEqual({ e4: { text: '1', color: DEFAULT_LABEL }, c5: { text: '2', color: DEFAULT_LABEL } })
  })

  test('buildState_LabelOnBadSquare_Throws', async () => {
    expect(() => buildState({ labels: { z9: '1' } })).toThrow('"z9" is not a square')
  })

  test('buildState_LabelTooLong_Throws', async () => {
    expect(() => buildState({ labels: { e4: '123' } })).toThrow('1-2 characters')
  })

  test('buildState_LabelsNotObject_Throws', async () => {
    expect(() => buildState({ labels: ['e4'] })).toThrow('"labels" must be an object')
  })

  test('renderSvg_Labels_DrawsBadgePerSquare', async () => {
    const svg = renderSvg(buildState({ fen: AFTER_E4, labels: { e4: '1', g1: '<2' } }))

    expect(svg.match(/<circle /g)?.length).toBe(2)
    expect(svg).toContain(`fill="${DEFAULT_LABEL}" stroke`)
    expect(svg).toContain('>1</text>')
    expect(svg).toContain('&#60;2</text>')
  })

  test('ToolUse_Labels_TerminalCellShowsGlyphAndLabel', async $ => {
    const ui = await $.ui.mount({
      plugin: 'chess-board',
      surface: 'terminal',
      component: 'ToolUse',
      requestId: 'toolu_4',
      props: row('toolu_4', { fen: AFTER_E4, labels: { e4: '1', d1: '12' } }),
    })

    expect(await ui.find({ type: 'Text', text: '♙1 ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '♕12' })).toBeDefined()
    expect((await ui.findAll({ type: 'Text', text: '12' })).some(t => t.props.color === DEFAULT_LABEL)).toBe(true)
    expect(await ui.find({ type: 'Text', text: /labels e4=1, d1=12/ })).toBeDefined()
    await ui.unmount()
  })
})

group('colours', () => {
  test('parseColor_NamesAndHex_NormaliseToSixDigitHex', async () => {
    expect(parseColor('Red', DEFAULT_LABEL)).toBe('#d32f2f')
    expect(parseColor('#F0a', DEFAULT_LABEL)).toBe('#ff00aa')
    expect(parseColor('#123456', DEFAULT_LABEL)).toBe('#123456')
    expect(parseColor(undefined, DEFAULT_LABEL)).toBe(DEFAULT_LABEL)
  })

  test('parseColor_Unknown_Throws', async () => {
    expect(() => parseColor('rgb(1,2,3)', DEFAULT_LABEL)).toThrow('is not a colour')
    expect(() => parseColor('"/><script>', DEFAULT_LABEL)).toThrow('is not a colour')
  })

  test('buildState_ObjectItems_TakeTheirColour', async () => {
    const s = buildState({
      highlights: ['e4', { square: 'D5', color: 'red' }],
      arrows: [{ move: 'g1f3', color: 'blue' }],
      labels: { e4: { text: '1', color: '#000' } },
    })

    expect(s.highlights).toEqual([
      { square: 'e4', color: DEFAULT_HIGHLIGHT },
      { square: 'd5', color: '#d32f2f' },
    ])
    expect(s.arrows).toEqual([{ from: 'g1', to: 'f3', color: '#1565c0' }])
    expect(s.labels).toEqual({ e4: { text: '1', color: '#000000' } })
  })

  test('buildState_ItemMissingKey_Throws', async () => {
    expect(() => buildState({ arrows: [{ square: 'e4' }] })).toThrow('"arrows" must be an array of strings or {"move", "color"} objects')
  })

  test('renderSvg_ColouredArrows_OneMarkerPerColour', async () => {
    const svg = renderSvg(buildState({ arrows: ['e2e4', 'd2d4', { move: 'g8f6', color: 'red' }] }))

    expect(svg.match(/<marker /g)?.length).toBe(2)
    expect(svg).toContain('stroke="#d32f2f"')
    expect(svg).toContain('marker-end="url(#ahd32f2f)"')
  })

  test('renderSvg_ColouredHighlight_UsesItsColour', async () => {
    const svg = renderSvg(buildState({ lastMove: 'e2e4', highlights: [{ square: 'e4', color: 'red' }] }))

    // The explicit highlight wins over the last-move one on e4.
    expect(svg).toContain(`fill="#d32f2f" fill-opacity`)
    expect(svg.match(new RegExp(`fill="${DEFAULT_HIGHLIGHT}"`, 'g'))?.length).toBe(1)
  })

  test('renderSvg_DarkAndLightBadges_PickReadableText', async () => {
    const svg = renderSvg(buildState({ labels: { e4: { text: '1', color: 'yellow' }, d4: { text: '2', color: 'black' } } }))

    expect(svg).toContain('fill="#000000">1</text>')
    expect(svg).toContain('fill="#ffffff">2</text>')
  })

  test('blend_HalfOpacity_AveragesChannels', async () => {
    expect(blend('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(blend('#d32f2f', '#d32f2f', 0.5)).toBe('#d32f2f')
  })

  test('describe_NonDefaultColours_NamedInCaption', async () => {
    const out = resultText(buildState({ arrows: ['e2e4', { move: 'e7e5', color: 'red' }], labels: { e4: { text: '1', color: '#123456' } } }))

    expect(out).toContain('arrows e2→e4, e7→e5 (red)')
    expect(out).toContain('labels e4=1 (#123456)')
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

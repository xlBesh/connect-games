/*
  ============================================================
  CONNECT 5 ENGINE · v1.5
  ============================================================

  Board: 9 × 7
  Goal: Connect 5

  Features:
  - BigInt bitboards
  - Gravity
  - Fast Connect-5 detection
  - Immediate win detection
  - Forced-block detection
  - Suicidal-move pruning
  - Double-threat awareness
  - Future-threat heuristic
  - Support-depth evaluation
  - Tactical move ordering
  - Negamax
  - Alpha-Beta pruning
  - Bound-aware transposition table
  - Iterative deepening
  - Exact score solver
  - Incremental W / D / L analysis
  - Symmetry reuse
  - Undo / Redo
  - AI vs Human
  - AI vs AI

  Exact W / D / L is only shown when
  mathematically proven.

  Public API:
  window.Connect5Engine
*/

(() => {
  "use strict";


  // ============================================================
  // CONSTANTS
  // ============================================================

  const ROWS = 7;
  const COLS = 9;
  const CONNECT = 5;

  const STRIDE =
    ROWS + 1;

  const MAX_MOVES =
    ROWS * COLS;


  const CENTER_ORDER = [
    4, 3, 5, 2, 6, 1, 7, 0, 8
  ];


  const EXACT_WIN =
    "WIN";

  const EXACT_DRAW =
    "DRAW";

  const EXACT_LOSS =
    "LOSS";

  const EXACT_UNKNOWN =
    "UNKNOWN";


  const AI_WIN_SCORE =
    1000000;

  const AI_INF =
    2000000000;


  const TT_EXACT = 0;
  const TT_LOWER = 1;
  const TT_UPPER = 2;


  // ============================================================
  // BITBOARD MASKS
  // ============================================================

  const BOTTOM_MASKS = [];
  const COLUMN_MASKS = [];
  const TOP_MASKS = [];


  const CELL_BITS =
    Array.from(
      {
        length:
          ROWS
      },

      () =>
        Array(
          COLS
        ).fill(
          0n
        )
    );


  let BOARD_MASK =
    0n;


  let BOTTOM_MASK_ALL =
    0n;


  for (
    let col = 0;
    col < COLS;
    col++
  ) {
    const shift =
      BigInt(
        col *
        STRIDE
      );


    BOTTOM_MASKS[col] =
      1n <<
      shift;


    COLUMN_MASKS[col] =
      (
        (
          1n <<
          BigInt(
            ROWS
          )
        ) -
        1n
      ) <<
      shift;


    TOP_MASKS[col] =
      1n <<
      BigInt(
        col *
        STRIDE +
        ROWS -
        1
      );


    BOARD_MASK |=
      COLUMN_MASKS[col];


    BOTTOM_MASK_ALL |=
      BOTTOM_MASKS[col];


    for (
      let row = 0;
      row < ROWS;
      row++
    ) {
      const level =
        ROWS -
        1 -
        row;


      CELL_BITS[
        row
      ][
        col
      ] =
        1n <<
        BigInt(
          col *
          STRIDE +
          level
        );
    }
  }


  // ============================================================
  // CONNECT-5 WINDOWS
  // ============================================================

  const WINDOWS = [];


  const CELL_WINDOWS =
    Array.from(
      {
        length:
          ROWS *
          COLS
      },

      () => []
    );


  function cellIndex(
    row,
    col
  ) {
    return (
      row *
      COLS +
      col
    );
  }


  function pushWindow(
    cells
  ) {
    let mask =
      0n;


    const normalized =
      [];


    for (
      const [
        row,
        col
      ]
      of cells
    ) {
      const bit =
        CELL_BITS[
          row
        ][
          col
        ];


      const level =
        ROWS -
        1 -
        row;


      mask |= bit;


      normalized.push({
        row,
        col,
        level,
        bit
      });
    }


    const index =
      WINDOWS.length;


    WINDOWS.push({
      mask,
      cells:
        normalized
    });


    for (
      const cell
      of normalized
    ) {
      CELL_WINDOWS[
        cellIndex(
          cell.row,
          cell.col
        )
      ].push(
        index
      );
    }
  }


  function buildWindows() {

    // Horizontal

    for (
      let r = 0;
      r < ROWS;
      r++
    ) {
      for (
        let c = 0;
        c <=
        COLS -
        CONNECT;
        c++
      ) {
        const cells =
          [];


        for (
          let i = 0;
          i < CONNECT;
          i++
        ) {
          cells.push([
            r,
            c + i
          ]);
        }


        pushWindow(
          cells
        );
      }
    }


    // Vertical

    for (
      let r = 0;
      r <=
      ROWS -
      CONNECT;
      r++
    ) {
      for (
        let c = 0;
        c < COLS;
        c++
      ) {
        const cells =
          [];


        for (
          let i = 0;
          i < CONNECT;
          i++
        ) {
          cells.push([
            r + i,
            c
          ]);
        }


        pushWindow(
          cells
        );
      }
    }


    // Diagonal \

    for (
      let r = 0;
      r <=
      ROWS -
      CONNECT;
      r++
    ) {
      for (
        let c = 0;
        c <=
        COLS -
        CONNECT;
        c++
      ) {
        const cells =
          [];


        for (
          let i = 0;
          i < CONNECT;
          i++
        ) {
          cells.push([
            r + i,
            c + i
          ]);
        }


        pushWindow(
          cells
        );
      }
    }


    // Diagonal /

    for (
      let r = 0;
      r <=
      ROWS -
      CONNECT;
      r++
    ) {
      for (
        let c =
          CONNECT -
          1;
        c < COLS;
        c++
      ) {
        const cells =
          [];


        for (
          let i = 0;
          i < CONNECT;
          i++
        ) {
          cells.push([
            r + i,
            c - i
          ]);
        }


        pushWindow(
          cells
        );
      }
    }
  }


  buildWindows();


  // ============================================================
  // BIT HELPERS
  // ============================================================

  function popcount(
    value
  ) {
    let count =
      0;


    while (
      value !==
      0n
    ) {
      value &=
        value -
        1n;


      count++;
    }


    return count;
  }


  function countMaskBits(
    mask
  ) {
    let value =
      mask;


    let count =
      0;


    while (
      value !==
      0
    ) {
      value &=
        value -
        1;


      count++;
    }


    return count;
  }


  function firstCenterColumn(
    mask
  ) {
    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        mask &
        (
          1 <<
          col
        )
      ) {
        return col;
      }
    }


    return null;
  }


  // ============================================================
  // CONNECT-5 DETECTION
  // ============================================================

  function hasFive(
    bits
  ) {
    const shifts = [
      1,
      STRIDE,
      STRIDE - 1,
      STRIDE + 1
    ];


    for (
      const shift
      of shifts
    ) {
      const s =
        BigInt(
          shift
        );


      if (
        (
          bits &

          (
            bits >>
            s
          ) &

          (
            bits >>
            (
              2n *
              s
            )
          ) &

          (
            bits >>
            (
              3n *
              s
            )
          ) &

          (
            bits >>
            (
              4n *
              s
            )
          )
        ) !==
        0n
      ) {
        return true;
      }
    }


    return false;
  }


  // ============================================================
  // RAW MOVE HELPERS
  // ============================================================

  function canPlayRaw(
    mask,
    col
  ) {
    return (
      (
        mask &
        TOP_MASKS[col]
      ) ===
      0n
    );
  }


  function moveBitRaw(
    mask,
    col
  ) {
    return (
      (
        mask +
        BOTTOM_MASKS[col]
      ) &
      COLUMN_MASKS[col]
    );
  }


  function legalMoveMask(
    mask
  ) {
    let result =
      0;


    for (
      let col = 0;
      col < COLS;
      col++
    ) {
      if (
        canPlayRaw(
          mask,
          col
        )
      ) {
        result |=
          1 <<
          col;
      }
    }


    return result;
  }


  // ============================================================
  // IMMEDIATE WIN MASK
  // ============================================================

  function winningMoveMask(
    bits,
    mask
  ) {
    let result =
      0;


    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        !canPlayRaw(
          mask,
          col
        )
      ) {
        continue;
      }


      const move =
        moveBitRaw(
          mask,
          col
        );


      if (
        hasFive(
          bits |
          move
        )
      ) {
        result |=
          1 <<
          col;
      }
    }


    return result;
  }


  function canWinNextRaw(
    current,
    mask
  ) {
    return (
      winningMoveMask(
        current,
        mask
      ) !==
      0
    );
  }


  // ============================================================
  // NON-LOSING MOVES
  // ============================================================

  /*
    A move is considered safe if
    the opponent does NOT obtain an
    immediate win on the next ply.

    If the opponent already has two
    immediate winning columns, one
    move cannot block both.
  */

  function nonLosingMoveMask(
    current,
    mask
  ) {
    const opponent =
      mask ^
      current;


    const opponentWins =
      winningMoveMask(
        opponent,
        mask
      );


    if (
      countMaskBits(
        opponentWins
      ) >=
      2
    ) {
      return 0;
    }


    let candidates =
      opponentWins !==
      0
        ? opponentWins
        : legalMoveMask(
            mask
          );


    let safe =
      0;


    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        (
          candidates &
          (
            1 <<
            col
          )
        ) ===
        0
      ) {
        continue;
      }


      const move =
        moveBitRaw(
          mask,
          col
        );


      const nextMask =
        mask |
        move;


      const opponentNextWins =
        winningMoveMask(
          opponent,
          nextMask
        );


      if (
        opponentNextWins ===
        0
      ) {
        safe |=
          1 <<
          col;
      }
    }


    return safe;
  }


  // ============================================================
  // POSITION
  // ============================================================

  class Position {

    constructor(
      current = 0n,
      mask = 0n,
      moves = 0
    ) {
      this.current =
        current;


      this.mask =
        mask;


      this.moves =
        moves;
    }


    clone() {
      return new Position(
        this.current,
        this.mask,
        this.moves
      );
    }


    canPlay(
      col
    ) {
      return canPlayRaw(
        this.mask,
        col
      );
    }


    moveBit(
      col
    ) {
      return moveBitRaw(
        this.mask,
        col
      );
    }


    isWinningMove(
      col
    ) {
      if (
        !this.canPlay(
          col
        )
      ) {
        return false;
      }


      return hasFive(
        this.current |
        this.moveBit(
          col
        )
      );
    }


    play(
      col
    ) {
      const move =
        this.moveBit(
          col
        );


      /*
        After playing, switch
        point of view so current
        belongs to the next player.
      */

      this.current ^=
        this.mask;


      this.mask |=
        move;


      this.moves++;
    }


    key() {
      return (
        this.current +
        this.mask
      );
    }


    opponent() {
      return (
        this.mask ^
        this.current
      );
    }
  }


  // ============================================================
  // GAME STATE
  // ============================================================

  let position =
    new Position();


  let grid =
    Array.from(
      {
        length:
          ROWS
      },

      () =>
        Array(
          COLS
        ).fill(
          null
        )
    );


  let heights =
    Array(
      COLS
    ).fill(
      ROWS -
      1
    );


  let currentPlayer =
    "A";


  let history = [];
  let redoStack = [];


  let gameOver =
    false;


  let winner =
    null;


  // ============================================================
  // SEARCH CLOCK
  // ============================================================

  let deadline = 0;
  let nodes = 0;
  let timedOut = false;


  function resetSearchClock(
    ms
  ) {
    deadline =
      performance.now() +
      Math.max(
        1,
        ms
      );


    nodes =
      0;


    timedOut =
      false;
  }


  function timeExpiredFast() {
    nodes++;


    if (
      (
        nodes &
        511
      ) !==
      0
    ) {
      return false;
    }


    if (
      performance.now() >=
      deadline
    ) {
      timedOut =
        true;


      return true;
    }


    return false;
  }


  // ============================================================
  // COLUMN FILLS
  // ============================================================

  function columnFillCounts(
    mask
  ) {
    const fills =
      new Int8Array(
        COLS
      );


    for (
      let col = 0;
      col < COLS;
      col++
    ) {
      fills[col] =
        popcount(
          mask &
          COLUMN_MASKS[col]
        );
    }


    return fills;
  }


  // ============================================================
  // SUPPORT DEPTH
  // ============================================================

  function supportWeight(
    depth
  ) {
    if (
      depth === 0
    ) {
      return 1.0;
    }


    if (
      depth === 1
    ) {
      return 0.58;
    }


    if (
      depth === 2
    ) {
      return 0.29;
    }


    if (
      depth === 3
    ) {
      return 0.14;
    }


    if (
      depth === 4
    ) {
      return 0.07;
    }


    if (
      depth === 5
    ) {
      return 0.03;
    }


    return 0.015;
  }


  // ============================================================
  // FUTURE THREAT SCORE
  // ============================================================

  function futureThreatScoreBits(
    mine,
    enemy,
    mask,
    fills
  ) {
    let total =
      0;


    for (
      const window
      of WINDOWS
    ) {
      const mineCount =
        popcount(
          mine &
          window.mask
        );


      if (
        mineCount ===
        0
      ) {
        continue;
      }


      const enemyCount =
        popcount(
          enemy &
          window.mask
        );


      if (
        enemyCount >
        0
      ) {
        continue;
      }


      let accessibility =
        0;


      let nearest =
        Infinity;


      let furthest =
        0;


      for (
        const cell
        of window.cells
      ) {
        if (
          (
            mask &
            cell.bit
          ) !==
          0n
        ) {
          continue;
        }


        const depth =
          cell.level -
          fills[
            cell.col
          ];


        if (
          depth <
          0
        ) {
          continue;
        }


        accessibility +=
          supportWeight(
            depth
          );


        nearest =
          Math.min(
            nearest,
            depth
          );


        furthest =
          Math.max(
            furthest,
            depth
          );
      }


      if (
        mineCount ===
        4
      ) {
        total +=
          9000 +
          accessibility *
          25000;


        if (
          nearest ===
          0
        ) {
          total +=
            36000;
        }


        else if (
          nearest ===
          1
        ) {
          total +=
            11500;
        }


        else if (
          nearest ===
          2
        ) {
          total +=
            4200;
        }
      }


      else if (
        mineCount ===
        3
      ) {
        total +=
          1100 +
          accessibility *
          3000;


        if (
          furthest <=
          1
        ) {
          total +=
            2200;
        }
      }


      else if (
        mineCount ===
        2
      ) {
        total +=
          130 +
          accessibility *
          430;
      }


      else if (
        mineCount ===
        1
      ) {
        total +=
          accessibility *
          24;
      }
    }


    return total;
  }


  // ============================================================
  // POSITION EVALUATION
  // ============================================================

  function evaluatePosition(
    pos
  ) {
    const mine =
      pos.current;


    const enemy =
      pos.mask ^
      pos.current;


    const fills =
      columnFillCounts(
        pos.mask
      );


    let score =
      0;


    for (
      const window
      of WINDOWS
    ) {
      const mineCount =
        popcount(
          mine &
          window.mask
        );


      const enemyCount =
        popcount(
          enemy &
          window.mask
        );


      if (
        mineCount >
        0 &&
        enemyCount >
        0
      ) {
        continue;
      }


      let accessibility =
        0;


      let playable =
        0;


      for (
        const cell
        of window.cells
      ) {
        if (
          (
            pos.mask &
            cell.bit
          ) !==
          0n
        ) {
          continue;
        }


        const depth =
          cell.level -
          fills[
            cell.col
          ];


        if (
          depth <
          0
        ) {
          continue;
        }


        if (
          depth ===
          0
        ) {
          playable++;
        }


        accessibility +=
          supportWeight(
            depth
          );
      }


      if (
        enemyCount ===
        0
      ) {
        if (
          mineCount ===
          4
        ) {
          score +=
            6500 +
            accessibility *
            23000;


          if (
            playable >
            0
          ) {
            score +=
              30000;
          }
        }


        else if (
          mineCount ===
          3
        ) {
          score +=
            1200 +
            accessibility *
            2900;
        }


        else if (
          mineCount ===
          2
        ) {
          score +=
            170 +
            accessibility *
            420;
        }


        else if (
          mineCount ===
          1
        ) {
          score +=
            12 +
            accessibility *
            22;
        }
      }


      if (
        mineCount ===
        0
      ) {
        if (
          enemyCount ===
          4
        ) {
          score -=
            7600 +
            accessibility *
            27000;


          if (
            playable >
            0
          ) {
            score -=
              35000;
          }
        }


        else if (
          enemyCount ===
          3
        ) {
          score -=
            1500 +
            accessibility *
            3500;
        }


        else if (
          enemyCount ===
          2
        ) {
          score -=
            210 +
            accessibility *
            480;
        }


        else if (
          enemyCount ===
          1
        ) {
          score -=
            accessibility *
            18;
        }
      }
    }


    /*
      Future threats.

      Defense is intentionally
      weighted slightly more.
    */

    const ownFuture =
      futureThreatScoreBits(
        mine,
        enemy,
        pos.mask,
        fills
      );


    const enemyFuture =
      futureThreatScoreBits(
        enemy,
        mine,
        pos.mask,
        fills
      );


    score +=
      ownFuture *
      0.36;


    score -=
      enemyFuture *
      0.48;


    /*
      Center and near-center
      positional preference.
    */

    const columnWeights = [
      2, 4, 7, 11, 15, 11, 7, 4, 2
    ];


    for (
      let col = 0;
      col < COLS;
      col++
    ) {
      const weight =
        columnWeights[
          col
        ];


      score +=
        popcount(
          mine &
          COLUMN_MASKS[col]
        ) *
        weight;


      score -=
        popcount(
          enemy &
          COLUMN_MASKS[col]
        ) *
        weight;
    }


    return Math.max(
      -AI_WIN_SCORE /
      4,

      Math.min(
        AI_WIN_SCORE /
        4,

        score
      )
    );
  }


  // ============================================================
  // LOCAL MOVE POTENTIAL
  // ============================================================

  function localMovePotential(
    current,
    mask,
    col
  ) {
    const move =
      moveBitRaw(
        mask,
        col
      );


    const level =
      popcount(
        mask &
        COLUMN_MASKS[col]
      );


    const row =
      ROWS -
      1 -
      level;


    const mineAfter =
      current |
      move;


    const enemy =
      mask ^
      current;


    const nextMask =
      mask |
      move;


    let score =
      (
        5 -
        Math.abs(
          4 -
          col
        )
      ) *
      120;


    const windowIndices =
      CELL_WINDOWS[
        cellIndex(
          row,
          col
        )
      ];


    for (
      const index
      of windowIndices
    ) {
      const window =
        WINDOWS[
          index
        ];


      if (
        (
          enemy &
          window.mask
        ) !==
        0n
      ) {
        continue;
      }


      const count =
        popcount(
          mineAfter &
          window.mask
        );


      if (
        count ===
        4
      ) {
        score +=
          6000;
      }


      else if (
        count ===
        3
      ) {
        score +=
          950;
      }


      else if (
        count ===
        2
      ) {
        score +=
          130;
      }
    }


    const nextWins =
      winningMoveMask(
        mineAfter,
        nextMask
      );


    const forkCount =
      countMaskBits(
        nextWins
      );


    if (
      forkCount >=
      2
    ) {
      score +=
        70000;
    }


    else if (
      forkCount ===
      1
    ) {
      score +=
        9000;
    }


    return score;
  }


  // ============================================================
  // MOVE ORDERING BUFFERS
  // ============================================================

  const MOVE_COLS =
    Array.from(
      {
        length:
          MAX_MOVES +
          1
      },

      () =>
        new Int8Array(
          COLS
        )
    );


  const MOVE_SCORES =
    Array.from(
      {
        length:
          MAX_MOVES +
          1
      },

      () =>
        new Int32Array(
          COLS
        )
    );


  function buildOrderedMoves(
    pos,
    moveMask,
    preferred = -1,
    fullRootOrdering = false
  ) {
    const cols =
      MOVE_COLS[
        pos.moves
      ];


    const scores =
      MOVE_SCORES[
        pos.moves
      ];


    let size =
      0;


    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        (
          moveMask &
          (
            1 <<
            col
          )
        ) ===
        0
      ) {
        continue;
      }


      let score =
        localMovePotential(
          pos.current,
          pos.mask,
          col
        );


      if (
        col ===
        preferred
      ) {
        score +=
          100000000;
      }


      /*
        Root ordering can afford
        a fuller heuristic check.
      */

      if (
        fullRootOrdering
      ) {
        const child =
          pos.clone();


        child.play(
          col
        );


        score +=
          Math.trunc(
            -evaluatePosition(
              child
            ) *
            0.04
          );
      }


      let index =
        size;


      while (
        index >
        0 &&
        scores[
          index -
          1
        ] <
        score
      ) {
        scores[index] =
          scores[
            index -
            1
          ];


        cols[index] =
          cols[
            index -
            1
          ];


        index--;
      }


      scores[index] =
        score;


      cols[index] =
        col;


      size++;
    }


    return size;
  }


  // ============================================================
  // AI TRANSPOSITION TABLE
  // ============================================================

  const aiTable =
    new Map();


  const AI_TT_LIMIT =
    180000;


  function aiTableGet(
    key,
    depth
  ) {
    const entry =
      aiTable.get(
        key
      );


    if (
      !entry ||
      entry.depth <
      depth
    ) {
      return null;
    }


    return entry;
  }


  function aiTablePut(
    key,
    depth,
    value,
    flag,
    bestMove
  ) {
    if (
      aiTable.size >=
      AI_TT_LIMIT
    ) {
      aiTable.clear();
    }


    aiTable.set(
      key,
      {
        depth,
        value,
        flag,
        bestMove
      }
    );
  }


  // ============================================================
  // AI NEGAMAX + ALPHA BETA
  // ============================================================

  function aiNegamax(
    pos,
    depth,
    alpha,
    beta,
    ply
  ) {
    if (
      timeExpiredFast()
    ) {
      return null;
    }


    if (
      pos.moves >=
      MAX_MOVES
    ) {
      return 0;
    }


    /*
      Immediate win.
    */

    if (
      canWinNextRaw(
        pos.current,
        pos.mask
      )
    ) {
      return (
        AI_WIN_SCORE -
        ply
      );
    }


    /*
      Remove moves that lose
      immediately on next ply.
    */

    const safeMask =
      nonLosingMoveMask(
        pos.current,
        pos.mask
      );


    if (
      safeMask ===
      0
    ) {
      return (
        -AI_WIN_SCORE +
        ply
      );
    }


    if (
      depth <=
      0
    ) {
      return evaluatePosition(
        pos
      );
    }


    const key =
      pos.key();


    const originalAlpha =
      alpha;


    const originalBeta =
      beta;


    let preferred =
      -1;


    const cached =
      aiTableGet(
        key,
        depth
      );


    if (
      cached
    ) {
      preferred =
        cached.bestMove;


      if (
        cached.flag ===
        TT_EXACT
      ) {
        return cached.value;
      }


      if (
        cached.flag ===
        TT_LOWER
      ) {
        alpha =
          Math.max(
            alpha,
            cached.value
          );
      }


      else if (
        cached.flag ===
        TT_UPPER
      ) {
        beta =
          Math.min(
            beta,
            cached.value
          );
      }


      if (
        alpha >=
        beta
      ) {
        return cached.value;
      }
    }


    const moveCount =
      buildOrderedMoves(
        pos,
        safeMask,
        preferred,
        false
      );


    const cols =
      MOVE_COLS[
        pos.moves
      ];


    let best =
      -AI_INF;


    let bestMove =
      cols[0];


    for (
      let i = 0;
      i < moveCount;
      i++
    ) {
      if (
        timeExpiredFast()
      ) {
        return null;
      }


      const col =
        cols[i];


      const child =
        pos.clone();


      child.play(
        col
      );


      const childScore =
        aiNegamax(
          child,
          depth - 1,
          -beta,
          -alpha,
          ply + 1
        );


      if (
        childScore ===
        null
      ) {
        return null;
      }


      const score =
        -childScore;


      if (
        score >
        best
      ) {
        best =
          score;


        bestMove =
          col;
      }


      if (
        score >
        alpha
      ) {
        alpha =
          score;
      }


      if (
        alpha >=
        beta
      ) {
        break;
      }
    }


    let flag =
      TT_EXACT;


    if (
      best <=
      originalAlpha
    ) {
      flag =
        TT_UPPER;
    }


    else if (
      best >=
      originalBeta
    ) {
      flag =
        TT_LOWER;
    }


    aiTablePut(
      key,
      depth,
      best,
      flag,
      bestMove
    );


    return best;
  }


  // ============================================================
  // AI SEARCH
  // ============================================================

  function searchBestMove(
    timeLimit = 700
  ) {
    if (
      gameOver
    ) {
      return {
        move: null,
        score: 0,
        depth: 0,
        nodes: 0,
        proven: false
      };
    }


    resetSearchClock(
      timeLimit
    );


    aiTable.clear();


    /*
      Immediate win.
    */

    const immediateWins =
      winningMoveMask(
        position.current,
        position.mask
      );


    if (
      immediateWins !==
      0
    ) {
      return {
        move:
          firstCenterColumn(
            immediateWins
          ),

        score:
          AI_WIN_SCORE,

        depth:
          1,

        nodes,

        proven:
          true
      };
    }


    /*
      Safe moves.
    */

    const safeMask =
      nonLosingMoveMask(
        position.current,
        position.mask
      );


    if (
      safeMask ===
      0
    ) {
      const legal =
        legalMoveMask(
          position.mask
        );


      return {
        move:
          firstCenterColumn(
            legal
          ),

        score:
          -AI_WIN_SCORE,

        depth:
          0,

        nodes,

        proven:
          true
      };
    }


    let preferred =
      firstCenterColumn(
        safeMask
      );


    let bestMove =
      preferred;


    let bestScore =
      -AI_INF;


    let completedDepth =
      0;


    const remaining =
      MAX_MOVES -
      position.moves;


    /*
      Iterative deepening.
    */

    for (
      let depth = 1;
      depth <=
      remaining;
      depth++
    ) {
      if (
        performance.now() >=
        deadline
      ) {
        break;
      }


      timedOut =
        false;


      const moveCount =
        buildOrderedMoves(
          position,
          safeMask,
          preferred,
          true
        );


      const cols =
        MOVE_COLS[
          position.moves
        ];


      let localBest =
        bestMove;


      let localScore =
        -AI_INF;


      let alpha =
        -AI_INF;


      let finished =
        true;


      for (
        let i = 0;
        i < moveCount;
        i++
      ) {
        if (
          performance.now() >=
          deadline
        ) {
          finished =
            false;


          break;
        }


        const col =
          cols[i];


        const child =
          position.clone();


        child.play(
          col
        );


        const childScore =
          aiNegamax(
            child,
            depth - 1,
            -AI_INF,
            -alpha,
            1
          );


        if (
          childScore ===
          null
        ) {
          finished =
            false;


          break;
        }


        const score =
          -childScore;


        if (
          score >
          localScore
        ) {
          localScore =
            score;


          localBest =
            col;
        }


        if (
          score >
          alpha
        ) {
          alpha =
            score;
        }
      }


      if (
        !finished
      ) {
        break;
      }


      bestMove =
        localBest;


      bestScore =
        localScore;


      completedDepth =
        depth;


      preferred =
        localBest;


      if (
        Math.abs(
          bestScore
        ) >=
        AI_WIN_SCORE -
        MAX_MOVES
      ) {
        break;
      }
    }


    return {
      move:
        bestMove,

      score:
        bestScore ===
        -AI_INF
          ? 0
          : bestScore,

      depth:
        completedDepth,

      nodes,

      proven:
        (
          Math.abs(
            bestScore
          ) >=
          AI_WIN_SCORE -
          MAX_MOVES
        ) ||
        (
          completedDepth >=
          remaining
        )
    };
  }


  // ============================================================
  // EXACT TRANSPOSITION TABLE
  // ============================================================

  /*
    Connect 5 uses 72-bit board keys.

    So unlike Connect 4, the full
    position does not fit into one
    64-bit integer.

    We keep:
    - low 64 bits
    - remaining high bits
  */

  const EXACT_TT_BITS =
    20;


  const EXACT_TT_SIZE =
    1 <<
    EXACT_TT_BITS;


  const EXACT_TT_MASK =
    BigInt(
      EXACT_TT_SIZE -
      1
    );


  const exactKeyLow =
    new BigUint64Array(
      EXACT_TT_SIZE
    );


  const exactKeyHigh =
    new Uint16Array(
      EXACT_TT_SIZE
    );


  const exactLower =
    new Int8Array(
      EXACT_TT_SIZE
    );


  const exactUpper =
    new Int8Array(
      EXACT_TT_SIZE
    );


  const exactFlags =
    new Uint8Array(
      EXACT_TT_SIZE
    );


  const LOW64_MASK =
    (
      1n <<
      64n
    ) -
    1n;


  function splitExactKey(
    key
  ) {
    return {
      low:
        key &
        LOW64_MASK,

      high:
        Number(
          key >>
          64n
        )
    };
  }


  function exactIndex(
    low,
    high
  ) {
    const folded =
      low ^

      (
        low >>
        23n
      ) ^

      (
        low >>
        41n
      ) ^

      BigInt(
        high *
        2654435761
      );


    return Number(
      folded &
      EXACT_TT_MASK
    );
  }


  function exactLookup(
    key
  ) {
    const parts =
      splitExactKey(
        key
      );


    const index =
      exactIndex(
        parts.low,
        parts.high
      );


    const flags =
      exactFlags[
        index
      ];


    if (
      flags ===
      0 ||

      exactKeyLow[
        index
      ] !==
        parts.low ||

      exactKeyHigh[
        index
      ] !==
        parts.high
    ) {
      return null;
    }


    return {
      index,
      flags,

      lower:
        exactLower[
          index
        ],

      upper:
        exactUpper[
          index
        ]
    };
  }


  function exactStore(
    key,
    lower,
    upper,
    flags
  ) {
    const parts =
      splitExactKey(
        key
      );


    const index =
      exactIndex(
        parts.low,
        parts.high
      );


    exactKeyLow[
      index
    ] =
      parts.low;


    exactKeyHigh[
      index
    ] =
      parts.high;


    exactLower[
      index
    ] =
      lower;


    exactUpper[
      index
    ] =
      upper;


    exactFlags[
      index
    ] =
      flags;
  }


  // ============================================================
  // EXACT SCORE HELPERS
  // ============================================================

  function immediateWinScore(
    pos
  ) {
    return Math.trunc(
      (
        MAX_MOVES +
        1 -
        pos.moves
      ) /
      2
    );
  }


  function forcedLossScore(
    pos
  ) {
    return -Math.trunc(
      (
        MAX_MOVES -
        pos.moves
      ) /
      2
    );
  }


  // ============================================================
  // EXACT NEGAMAX
  // ============================================================

  function exactNegamax(
    pos,
    alpha,
    beta
  ) {
    if (
      timeExpiredFast()
    ) {
      return null;
    }


    /*
      Immediate win.
    */

    if (
      canWinNextRaw(
        pos.current,
        pos.mask
      )
    ) {
      return immediateWinScore(
        pos
      );
    }


    /*
      Remove moves that lose
      immediately next turn.
    */

    const safeMask =
      nonLosingMoveMask(
        pos.current,
        pos.mask
      );


    if (
      safeMask ===
      0
    ) {
      return forcedLossScore(
        pos
      );
    }


    /*
      Only two cells left and
      neither side has an immediate
      forced win.
    */

    if (
      pos.moves >=
      MAX_MOVES -
      2
    ) {
      return 0;
    }


    /*
      Theoretical lower bound.
    */

    let minPossible =
      -Math.trunc(
        (
          MAX_MOVES -
          2 -
          pos.moves
        ) /
        2
      );


    if (
      alpha <
      minPossible
    ) {
      alpha =
        minPossible;


      if (
        alpha >=
        beta
      ) {
        return alpha;
      }
    }


    /*
      Theoretical upper bound.
    */

    let maxPossible =
      Math.trunc(
        (
          MAX_MOVES -
          1 -
          pos.moves
        ) /
        2
      );


    if (
      beta >
      maxPossible
    ) {
      beta =
        maxPossible;


      if (
        alpha >=
        beta
      ) {
        return beta;
      }
    }


    const originalAlpha =
      alpha;


    const originalBeta =
      beta;


    const key =
      pos.key();


    /*
      Transposition lookup.
    */

    const cached =
      exactLookup(
        key
      );


    if (
      cached
    ) {
      if (
        cached.flags &
        1
      ) {
        alpha =
          Math.max(
            alpha,
            cached.lower
          );
      }


      if (
        cached.flags &
        2
      ) {
        beta =
          Math.min(
            beta,
            cached.upper
          );
      }


      if (
        alpha >=
        beta
      ) {
        if (
          (
            cached.flags &
            1
          ) &&
          cached.lower >=
          beta
        ) {
          return cached.lower;
        }


        return cached.upper;
      }
    }


    const moveCount =
      buildOrderedMoves(
        pos,
        safeMask,
        -1,
        false
      );


    const cols =
      MOVE_COLS[
        pos.moves
      ];


    let best =
      -100;


    for (
      let i = 0;
      i < moveCount;
      i++
    ) {
      const col =
        cols[i];


      const child =
        pos.clone();


      child.play(
        col
      );


      const childScore =
        exactNegamax(
          child,
          -beta,
          -alpha
        );


      if (
        childScore ===
        null
      ) {
        return null;
      }


      const score =
        -childScore;


      if (
        score >
        best
      ) {
        best =
          score;
      }


      if (
        score >
        alpha
      ) {
        alpha =
          score;
      }


      if (
        alpha >=
        beta
      ) {
        /*
          Lower bound.
        */

        exactStore(
          key,
          score,
          0,
          1
        );


        return score;
      }
    }


    if (
      best <=
      originalAlpha
    ) {
      /*
        Upper bound.
      */

      exactStore(
        key,
        0,
        best,
        2
      );
    }


    else if (
      best >=
      originalBeta
    ) {
      /*
        Lower bound.
      */

      exactStore(
        key,
        best,
        0,
        1
      );
    }


    else {
      /*
        Exact value.
      */

      exactStore(
        key,
        best,
        best,
        3
      );
    }


    return best;
  }


  // ============================================================
  // EXACT JOBS
  // ============================================================

  function chooseMedian(
    min,
    max
  ) {
    let med =
      min +
      Math.trunc(
        (
          max -
          min
        ) /
        2
      );


    /*
      Search around zero first.
      This proves W / D / L before
      spending time on distance.
    */

    if (
      med <=
      0 &&
      Math.trunc(
        min /
        2
      ) <
      med
    ) {
      med =
        Math.trunc(
          min /
          2
        );
    }


    else if (
      med >=
      0 &&
      Math.trunc(
        max /
        2
      ) >
      med
    ) {
      med =
        Math.trunc(
          max /
          2
        );
    }


    return med;
  }


  function createExactJob(
    pos
  ) {
    if (
      canWinNextRaw(
        pos.current,
        pos.mask
      )
    ) {
      return {
        pos,

        phase:
          "done",

        min: 0,
        max: 0,

        done:
          true,

        score:
          immediateWinScore(
            pos
          )
      };
    }


    /*
      Weak solve first:
      only determine W / D / L.

      Once outcome is known,
      strong solve gets distance.
    */

    return {
      pos,

      phase:
        "weak",

      min:
        -1,

      max:
        1,

      done:
        false,

      score:
        null
    };
  }


  function advanceExactJob(
    job,
    sliceDeadline
  ) {
    if (
      job.done
    ) {
      return true;
    }


    deadline =
      sliceDeadline;


    timedOut =
      false;


    while (
      performance.now() <
      sliceDeadline
    ) {
      if (
        job.min >=
        job.max
      ) {
        const value =
          job.min;


        if (
          job.phase ===
          "weak"
        ) {
          if (
            value ===
            0
          ) {
            job.phase =
              "done";


            job.done =
              true;


            job.score =
              0;


            return true;
          }


          job.phase =
            "strong";


          if (
            value >
            0
          ) {
            job.min =
              1;


            job.max =
              Math.trunc(
                (
                  MAX_MOVES +
                  1 -
                  job.pos.moves
                ) /
                2
              );
          }


          else {
            job.min =
              -Math.trunc(
                (
                  MAX_MOVES -
                  job.pos.moves
                ) /
                2
              );


            job.max =
              -1;
          }


          continue;
        }


        job.phase =
          "done";


        job.done =
          true;


        job.score =
          value;


        return true;
      }


      const med =
        chooseMedian(
          job.min,
          job.max
        );


      const result =
        exactNegamax(
          job.pos,
          med,
          med +
          1
        );


      if (
        result ===
        null
      ) {
        return false;
      }


      if (
        result <=
        med
      ) {
        job.max =
          result;
      }


      else {
        job.min =
          result;
      }
    }


    return false;
  }


  function solveExactPosition(
    pos,
    timeLimit
  ) {
    resetSearchClock(
      timeLimit
    );


    const job =
      createExactJob(
        pos
      );


    const end =
      deadline;


    while (
      !job.done &&
      performance.now() <
      end
    ) {
      advanceExactJob(
        job,
        end
      );
    }


    return job.done
      ? job.score
      : null;
  }


  // ============================================================
  // SCORE -> DISTANCE
  // ============================================================

  function distanceFromScore(
    moveCount,
    score
  ) {
    if (
      score ===
      0
    ) {
      return 0;
    }


    /*
      Current player wins.
    */

    if (
      score >
      0
    ) {
      const maxWin =
        Math.trunc(
          (
            MAX_MOVES +
            1 -
            moveCount
          ) /
          2
        );


      return (
        2 *
        (
          maxWin -
          score
        ) +
        1
      );
    }


    /*
      Current player loses.
    */

    const maxLoss =
      Math.trunc(
        (
          MAX_MOVES -
          moveCount
        ) /
        2
      );


    return (
      2 *
      (
        maxLoss +
        score +
        1
      )
    );
  }


  function resultFromCurrentScore(
    moveCount,
    score
  ) {
    if (
      score ===
      null
    ) {
      return {
        type:
          EXACT_UNKNOWN,

        distance:
          null
      };
    }


    if (
      score ===
      0
    ) {
      return {
        type:
          EXACT_DRAW,

        distance:
          0
      };
    }


    return {
      type:
        score >
        0
          ? EXACT_WIN
          : EXACT_LOSS,

      distance:
        distanceFromScore(
          moveCount,
          score
        )
    };
  }


  /*
    For column analysis, distance
    begins AFTER the candidate move.
  */

  function resultFromChildScore(
    childMoveCount,
    childScore
  ) {
    if (
      childScore ===
      null
    ) {
      return {
        type:
          EXACT_UNKNOWN,

        distance:
          null
      };
    }


    if (
      childScore ===
      0
    ) {
      return {
        type:
          EXACT_DRAW,

        distance:
          0
      };
    }


    return {
      type:
        childScore <
        0
          ? EXACT_WIN
          : EXACT_LOSS,

      distance:
        distanceFromScore(
          childMoveCount,
          childScore
        )
    };
  }


  // ============================================================
  // SYMMETRY
  // ============================================================

  function mirrorBits(
    bits
  ) {
    let mirrored =
      0n;


    const chunkMask =
      (
        1n <<
        BigInt(
          STRIDE
        )
      ) -
      1n;


    for (
      let col = 0;
      col < COLS;
      col++
    ) {
      const chunk =
        (
          bits >>
          BigInt(
            col *
            STRIDE
          )
        ) &
        chunkMask;


      mirrored |=
        chunk <<
        BigInt(
          (
            COLS -
            1 -
            col
          ) *
          STRIDE
        );
    }


    return mirrored;
  }


  function isSymmetric(
    pos
  ) {
    return (
      mirrorBits(
        pos.current
      ) ===
        pos.current &&

      mirrorBits(
        pos.mask
      ) ===
        pos.mask
    );
  }


  // ============================================================
  // INCREMENTAL COLUMN ANALYSIS
  // ============================================================

  let analysisProgressKey =
    null;


  let analysisProgress =
    null;


  function clearAnalysisProgress() {
    analysisProgressKey =
      null;


    analysisProgress =
      null;
  }


  function createAnalysisProgress() {
    const symmetric =
      isSymmetric(
        position
      );


    const results =
      Array(
        COLS
      ).fill(
        null
      );


    let columns =
      CENTER_ORDER.filter(
        col =>
          position.canPlay(
            col
          )
      );


    /*
      Symmetric board:
      only solve one side.
    */

    if (
      symmetric
    ) {
      columns =
        columns.filter(
          col =>
            col <=
            4
        );
    }


    const jobs =
      [];


    for (
      const col
      of columns
    ) {
      /*
        Immediate win.
      */

      if (
        position.isWinningMove(
          col
        )
      ) {
        const result = {
          type:
            EXACT_WIN,

          distance:
            1
        };


        results[col] =
          result;


        if (
          symmetric
        ) {
          const mirror =
            COLS -
            1 -
            col;


          if (
            mirror !==
            col &&
            position.canPlay(
              mirror
            )
          ) {
            results[
              mirror
            ] = {
              ...result
            };
          }
        }


        continue;
      }


      const child =
        position.clone();


      child.play(
        col
      );


      const job =
        createExactJob(
          child
        );


      const mirror =
        symmetric
          ? COLS -
            1 -
            col
          : null;


      if (
        job.done
      ) {
        const result =
          resultFromChildScore(
            child.moves,
            job.score
          );


        results[col] =
          result;


        if (
          mirror !==
            null &&
          mirror !==
            col &&
          position.canPlay(
            mirror
          )
        ) {
          results[
            mirror
          ] = {
            ...result
          };
        }
      }


      else {
        jobs.push({
          col,
          mirror,
          job
        });
      }
    }


    return {
      key:
        position
          .key()
          .toString(),

      results,

      jobs,

      cursor:
        0,

      sliceMs:
        30
    };
  }


  function finalizeAnalysisJob(
    item,
    progress
  ) {
    const result =
      resultFromChildScore(
        item.job.pos.moves,
        item.job.score
      );


    progress.results[
      item.col
    ] =
      result;


    if (
      item.mirror !==
        null &&
      item.mirror !==
        item.col &&
      position.canPlay(
        item.mirror
      )
    ) {
      progress.results[
        item.mirror
      ] = {
        ...result
      };
    }
  }


  function analyze(
    timeLimit = 700
  ) {
    const empty =
      Array(
        COLS
      ).fill(
        null
      );


    if (
      gameOver
    ) {
      return empty;
    }


    const key =
      position
        .key()
        .toString();


    if (
      analysisProgressKey !==
        key ||
      !analysisProgress
    ) {
      analysisProgressKey =
        key;


      analysisProgress =
        createAnalysisProgress();
    }


    const progress =
      analysisProgress;


    const totalDeadline =
      performance.now() +
      Math.max(
        1,
        timeLimit
      );


    nodes =
      0;


    timedOut =
      false;


    while (
      performance.now() <
      totalDeadline
    ) {
      let unresolved =
        0;


      for (
        const item
        of progress.jobs
      ) {
        if (
          !item.job.done
        ) {
          unresolved++;
        }
      }


      if (
        unresolved ===
        0
      ) {
        break;
      }


      let touched =
        0;


      const startCursor =
        progress.jobs.length ===
        0
          ? 0
          : progress.cursor %
            progress.jobs.length;


      for (
        let offset = 0;
        offset <
        progress.jobs.length;
        offset++
      ) {
        const index =
          (
            startCursor +
            offset
          ) %
          progress.jobs.length;


        const item =
          progress.jobs[
            index
          ];


        if (
          item.job.done
        ) {
          continue;
        }


        const now =
          performance.now();


        if (
          now >=
          totalDeadline
        ) {
          break;
        }


        const remaining =
          totalDeadline -
          now;


        const slice =
          Math.min(
            progress.sliceMs,
            remaining
          );


        const finished =
          advanceExactJob(
            item.job,
            now +
            slice
          );


        if (
          finished
        ) {
          finalizeAnalysisJob(
            item,
            progress
          );
        }


        progress.cursor =
          (
            index +
            1
          ) %
          progress.jobs.length;


        touched++;
      }


      if (
        touched ===
        0
      ) {
        break;
      }


      progress.sliceMs =
        Math.min(
          progress.sliceMs *
          2,
          650
        );
    }


    const results =
      progress.results.map(
        value =>
          value
            ? {
                ...value
              }
            : null
      );


    /*
      Legal unresolved columns
      remain explicitly UNKNOWN.
    */

    for (
      let col = 0;
      col < COLS;
      col++
    ) {
      if (
        position.canPlay(
          col
        ) &&
        results[col] ===
          null
      ) {
        results[col] = {
          type:
            EXACT_UNKNOWN,

          distance:
            null
        };
      }
    }


    return results;
  }


  // ============================================================
  // PUBLIC EXACT POSITION RESULT
  // ============================================================

  function solvePosition(
    timeLimit = 3000
  ) {
    if (
      gameOver
    ) {
      if (
        winner ===
        null
      ) {
        return {
          type:
            EXACT_DRAW,

          distance:
            0
        };
      }


      return {
        type:
          EXACT_UNKNOWN,

        distance:
          null
      };
    }


    const score =
      solveExactPosition(
        position.clone(),
        timeLimit
      );


    return resultFromCurrentScore(
      position.moves,
      score
    );
  }


  // ============================================================
  // REBUILD POSITION
  // ============================================================

  function rebuildPosition() {
    position =
      new Position();


    for (
      const move
      of history
    ) {
      position.play(
        move.col
      );
    }
  }


  // ============================================================
  // PLAY
  // ============================================================

  function play(
    col
  ) {
    if (
      gameOver ||
      col <
        0 ||
      col >=
        COLS ||
      !position.canPlay(
        col
      )
    ) {
      return null;
    }


    const row =
      heights[
        col
      ];


    const player =
      currentPlayer;


    const winningMove =
      position.isWinningMove(
        col
      );


    position.play(
      col
    );


    grid[
      row
    ][
      col
    ] =
      player;


    heights[
      col
    ]--;


    const move = {
      row,
      col,
      player
    };


    history.push(
      move
    );


    redoStack =
      [];


    clearAnalysisProgress();


    if (
      winningMove
    ) {
      gameOver =
        true;


      winner =
        player;
    }


    else if (
      position.moves >=
      MAX_MOVES
    ) {
      gameOver =
        true;


      winner =
        null;
    }


    else {
      currentPlayer =
        player ===
        "A"
          ? "B"
          : "A";
    }


    return {
      ...move,
      gameOver,
      winner
    };
  }


  // ============================================================
  // UNDO
  // ============================================================

  function undo() {
    if (
      history.length ===
      0
    ) {
      return null;
    }


    const move =
      history.pop();


    redoStack.push(
      move
    );


    grid[
      move.row
    ][
      move.col
    ] =
      null;


    heights[
      move.col
    ]++;


    currentPlayer =
      move.player;


    gameOver =
      false;


    winner =
      null;


    rebuildPosition();


    clearAnalysisProgress();


    return move;
  }


  // ============================================================
  // REDO
  // ============================================================

  function redo() {
    if (
      redoStack.length ===
      0
    ) {
      return null;
    }


    const move =
      redoStack.pop();


    const row =
      heights[
        move.col
      ];


    if (
      row <
      0
    ) {
      return null;
    }


    const player =
      currentPlayer;


    const winningMove =
      position.isWinningMove(
        move.col
      );


    position.play(
      move.col
    );


    grid[
      row
    ][
      move.col
    ] =
      player;


    heights[
      move.col
    ]--;


    const restored = {
      row,

      col:
        move.col,

      player
    };


    history.push(
      restored
    );


    clearAnalysisProgress();


    if (
      winningMove
    ) {
      gameOver =
        true;


      winner =
        player;
    }


    else if (
      position.moves >=
      MAX_MOVES
    ) {
      gameOver =
        true;


      winner =
        null;
    }


    else {
      gameOver =
        false;


      winner =
        null;


      currentPlayer =
        player ===
        "A"
          ? "B"
          : "A";
    }


    return {
      ...restored,
      gameOver,
      winner
    };
  }


  // ============================================================
  // RESET
  // ============================================================

  function reset() {
    position =
      new Position();


    grid =
      Array.from(
        {
          length:
            ROWS
        },

        () =>
          Array(
            COLS
          ).fill(
            null
          )
      );


    heights =
      Array(
        COLS
      ).fill(
        ROWS -
        1
      );


    currentPlayer =
      "A";


    history = [];
    redoStack = [];


    gameOver =
      false;


    winner =
      null;


    aiTable.clear();


    clearAnalysisProgress();
  }


  // ============================================================
  // LEGAL MOVES
  // ============================================================

  function legalMoves() {
    return CENTER_ORDER.filter(
      col =>
        position.canPlay(
          col
        )
    );
  }


  // ============================================================
  // STATE
  // ============================================================

  function getState() {
    return {
      width:
        COLS,

      height:
        ROWS,

      connect:
        CONNECT,

      grid:
        grid.map(
          row => [
            ...row
          ]
        ),

      heights:
        [
          ...heights
        ],

      currentPlayer,

      history:
        history.map(
          move => ({
            ...move
          })
        ),

      redoCount:
        redoStack.length,

      gameOver,
      winner,

      moveCount:
        position.moves
    };
  }


  // ============================================================
  // VALIDATION
  // ============================================================

  function validate() {
    let occupied =
      0;


    for (
      let r = 0;
      r < ROWS;
      r++
    ) {
      for (
        let c = 0;
        c < COLS;
        c++
      ) {
        if (
          grid[
            r
          ][
            c
          ] !==
          null
        ) {
          occupied++;
        }
      }
    }


    return (
      occupied ===
        position.moves &&
      occupied ===
        history.length
    );
  }


  // ============================================================
  // START
  // ============================================================

  reset();


  // ============================================================
  // PUBLIC API
  // ============================================================

  window.Connect5Engine = {
    reset,
    play,
    undo,
    redo,

    getState,
    legalMoves,

    searchBestMove,
    analyze,
    solvePosition,

    validate,

    constants: {
      WIDTH:
        COLS,

      HEIGHT:
        ROWS,

      CONNECT,

      WIN:
        EXACT_WIN,

      DRAW:
        EXACT_DRAW,

      LOSS:
        EXACT_LOSS,

      UNKNOWN:
        EXACT_UNKNOWN
    }
  };

})();

/*
  ============================================================
  CONNECT 4 ENGINE
  ============================================================

  Board: 7 × 6
  Goal: Connect 4

  Features:
  - BigInt bitboards
  - Gravity
  - Win detection
  - Immediate win / loss detection
  - Non-losing move pruning
  - Center-first move ordering
  - Threat-based move ordering
  - Negamax
  - Alpha-Beta pruning
  - Transposition table
  - Iterative deepening
  - Time-limited AI search
  - Exact W / D / L proof search
  - Undo / Redo support through snapshots

  Public API:
  window.Connect4Engine
*/

(() => {
  "use strict";

  // ============================================================
  // CONSTANTS
  // ============================================================

  const WIDTH = 7;
  const HEIGHT = 6;
  const STRIDE = HEIGHT + 1;
  const MAX_MOVES = WIDTH * HEIGHT;

  const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];

  const WIN_SCORE = 1000000;
  const INF = 2000000000;

  const EXACT_WIN = "WIN";
  const EXACT_DRAW = "DRAW";
  const EXACT_LOSS = "LOSS";
  const EXACT_UNKNOWN = "UNKNOWN";


  // ============================================================
  // BITBOARD MASKS
  // ============================================================

  const BOTTOM_MASKS = [];
  const COLUMN_MASKS = [];
  const TOP_MASKS = [];

  let BOARD_MASK = 0n;

  for (let col = 0; col < WIDTH; col++) {
    const shift = BigInt(col * STRIDE);

    BOTTOM_MASKS[col] =
      1n << shift;

    COLUMN_MASKS[col] =
      ((1n << BigInt(HEIGHT)) - 1n) << shift;

    TOP_MASKS[col] =
      1n << BigInt(
        col * STRIDE + HEIGHT - 1
      );

    BOARD_MASK |= COLUMN_MASKS[col];
  }


  // ============================================================
  // BIT HELPERS
  // ============================================================

  function popcount(value) {
    let count = 0;

    while (value !== 0n) {
      value &= value - 1n;
      count++;
    }

    return count;
  }


  function hasAlignment(position) {
    let m;

    // Vertical
    m =
      position &
      (position >> 1n);

    if (
      (m & (m >> 2n)) !== 0n
    ) {
      return true;
    }

    // Horizontal
    m =
      position &
      (position >> BigInt(STRIDE));

    if (
      (
        m &
        (
          m >>
          BigInt(2 * STRIDE)
        )
      ) !== 0n
    ) {
      return true;
    }

    // Diagonal /
    m =
      position &
      (
        position >>
        BigInt(HEIGHT)
      );

    if (
      (
        m &
        (
          m >>
          BigInt(2 * HEIGHT)
        )
      ) !== 0n
    ) {
      return true;
    }

    // Diagonal \
    m =
      position &
      (
        position >>
        BigInt(HEIGHT + 2)
      );

    if (
      (
        m &
        (
          m >>
          BigInt(
            2 * (HEIGHT + 2)
          )
        )
      ) !== 0n
    ) {
      return true;
    }

    return false;
  }


  function winningPosition(
    position,
    mask
  ) {
    let result = 0n;
    let p;

    // Vertical
    result |=
      (
        position << 1n
      ) &
      (
        position << 2n
      ) &
      (
        position << 3n
      );

    // Horizontal
    p =
      (
        position <<
        BigInt(STRIDE)
      ) &
      (
        position <<
        BigInt(2 * STRIDE)
      );

    result |=
      p &
      (
        position <<
        BigInt(3 * STRIDE)
      );

    result |=
      p &
      (
        position >>
        BigInt(STRIDE)
      );

    p =
      (
        position >>
        BigInt(STRIDE)
      ) &
      (
        position >>
        BigInt(2 * STRIDE)
      );

    result |=
      p &
      (
        position <<
        BigInt(STRIDE)
      );

    result |=
      p &
      (
        position >>
        BigInt(3 * STRIDE)
      );


    // Diagonal /
    p =
      (
        position <<
        BigInt(HEIGHT)
      ) &
      (
        position <<
        BigInt(2 * HEIGHT)
      );

    result |=
      p &
      (
        position <<
        BigInt(3 * HEIGHT)
      );

    result |=
      p &
      (
        position >>
        BigInt(HEIGHT)
      );

    p =
      (
        position >>
        BigInt(HEIGHT)
      ) &
      (
        position >>
        BigInt(2 * HEIGHT)
      );

    result |=
      p &
      (
        position <<
        BigInt(HEIGHT)
      );

    result |=
      p &
      (
        position >>
        BigInt(3 * HEIGHT)
      );


    // Diagonal \
    const diagonalShift =
      HEIGHT + 2;

    p =
      (
        position <<
        BigInt(diagonalShift)
      ) &
      (
        position <<
        BigInt(
          2 * diagonalShift
        )
      );

    result |=
      p &
      (
        position <<
        BigInt(
          3 * diagonalShift
        )
      );

    result |=
      p &
      (
        position >>
        BigInt(diagonalShift)
      );

    p =
      (
        position >>
        BigInt(diagonalShift)
      ) &
      (
        position >>
        BigInt(
          2 * diagonalShift
        )
      );

    result |=
      p &
      (
        position <<
        BigInt(diagonalShift)
      );

    result |=
      p &
      (
        position >>
        BigInt(
          3 * diagonalShift
        )
      );

    return (
      result &
      (BOARD_MASK ^ mask)
    );
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
      /*
        current:
        stones belonging to the
        player whose turn it is.

        mask:
        every occupied square.
      */

      this.current = current;
      this.mask = mask;
      this.moves = moves;
    }


    clone() {
      return new Position(
        this.current,
        this.mask,
        this.moves
      );
    }


    canPlay(col) {
      return (
        (
          this.mask &
          TOP_MASKS[col]
        ) === 0n
      );
    }


    possible() {
      return (
        (
          this.mask +
          this.bottomMaskAll()
        ) &
        BOARD_MASK
      );
    }


    bottomMaskAll() {
      let result = 0n;

      for (
        let col = 0;
        col < WIDTH;
        col++
      ) {
        result |=
          BOTTOM_MASKS[col];
      }

      return result;
    }


    moveBit(col) {
      return (
        (
          this.mask +
          BOTTOM_MASKS[col]
        ) &
        COLUMN_MASKS[col]
      );
    }


    isWinningMove(col) {
      if (!this.canPlay(col)) {
        return false;
      }

      const move =
        this.moveBit(col);

      return hasAlignment(
        this.current | move
      );
    }


    play(col) {
      const move =
        this.moveBit(col);

      /*
        Swap point of view first.
        After the move, current
        represents the next player.
      */

      this.current ^=
        this.mask;

      this.mask |= move;

      this.moves++;
    }


    key() {
      /*
        Same idea used by compact
        Connect Four solvers:
        current + mask uniquely
        represents the position.
      */

      return (
        this.current +
        this.mask
      );
    }


    opponentPosition() {
      return (
        this.mask ^
        this.current
      );
    }


    possibleNonLosingMoves() {
      let possible =
        this.possible();

      const opponentWin =
        winningPosition(
          this.opponentPosition(),
          this.mask
        );

      const forcedMoves =
        possible &
        opponentWin;

      if (
        forcedMoves !== 0n
      ) {
        /*
          Two immediate opponent
          wins means there is no
          defensive move.
        */

        if (
          (
            forcedMoves &
            (forcedMoves - 1n)
          ) !== 0n
        ) {
          return 0n;
        }

        possible =
          forcedMoves;
      }

      /*
        Never play directly under
        a square that becomes an
        immediate opponent win.
      */

      return (
        possible &
        ~(
          opponentWin >> 1n
        )
      );
    }


    moveScore(move) {
      return popcount(
        winningPosition(
          this.current | move,
          this.mask
        )
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
      { length: HEIGHT },
      () =>
        Array(WIDTH).fill(null)
    );

  let heights =
    Array(WIDTH).fill(
      HEIGHT - 1
    );

  let currentPlayer = "A";

  let history = [];
  let redoStack = [];

  let gameOver = false;
  let winner = null;


  // ============================================================
  // SEARCH STATE
  // ============================================================

  let deadline = 0;
  let nodes = 0;
  let timedOut = false;

  const transposition =
    new Map();

  const exactTable =
    new Map();

  const MAX_TT_SIZE = 300000;


  // ============================================================
  // TIME
  // ============================================================

  function resetSearchClock(ms) {
    deadline =
      performance.now() + ms;

    nodes = 0;
    timedOut = false;
  }


  function outOfTime() {
    nodes++;

    /*
      Checking the clock on every
      single node is surprisingly
      expensive on phones.
    */

    if (
      (nodes & 511) !== 0
    ) {
      return false;
    }

    if (
      performance.now() >=
      deadline
    ) {
      timedOut = true;
      return true;
    }

    return false;
  }


  // ============================================================
  // MOVE ORDERING
  // ============================================================

  function orderedMoves(pos) {
    const possible =
      pos.possibleNonLosingMoves();

    if (possible === 0n) {
      return [];
    }

    const moves = [];

    for (
      const col
      of CENTER_ORDER
    ) {
      if (!pos.canPlay(col)) {
        continue;
      }

      const move =
        pos.moveBit(col);

      if (
        (possible & move) === 0n
      ) {
        continue;
      }

      let score =
        pos.moveScore(move) *
        1000;

      /*
        Small center preference
        after tactical ordering.
      */

      score +=
        20 -
        Math.abs(3 - col);

      moves.push({
        col,
        move,
        score
      });
    }

    moves.sort(
      (a, b) =>
        b.score - a.score
    );

    return moves;
  }


  // ============================================================
  // POSITION EVALUATION
  // ============================================================

  function heuristic(pos) {
    const mine =
      pos.current;

    const opponent =
      pos.opponentPosition();

    let score = 0;

    const myWins =
      winningPosition(
        mine,
        pos.mask
      );

    const enemyWins =
      winningPosition(
        opponent,
        pos.mask
      );

    score +=
      popcount(myWins) *
      500;

    score -=
      popcount(enemyWins) *
      650;

    /*
      Center column.
    */

    const center =
      COLUMN_MASKS[3];

    score +=
      popcount(
        mine & center
      ) * 8;

    score -=
      popcount(
        opponent & center
      ) * 8;

    return score;
  }


  // ============================================================
  // TRANSPOSITION TABLE
  // ============================================================

  function ttKey(
    pos,
    depth
  ) {
    return (
      pos.key().toString() +
      ":" +
      depth
    );
  }


  function storeTT(
    key,
    value
  ) {
    if (
      transposition.size >
      MAX_TT_SIZE
    ) {
      transposition.clear();
    }

    transposition.set(
      key,
      value
    );
  }


  // ============================================================
  // NEGAMAX + ALPHA BETA
  // ============================================================

  function negamax(
    pos,
    depth,
    alpha,
    beta,
    ply
  ) {
    if (outOfTime()) {
      return 0;
    }

    if (
      pos.moves >=
      MAX_MOVES
    ) {
      return 0;
    }

    /*
      If current player can win
      immediately, no reason to
      search further.
    */

    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        pos.canPlay(col) &&
        pos.isWinningMove(col)
      ) {
        return (
          WIN_SCORE - ply
        );
      }
    }

    const possible =
      pos.possibleNonLosingMoves();

    if (possible === 0n) {
      return (
        -WIN_SCORE + ply
      );
    }

    if (depth <= 0) {
      return heuristic(pos);
    }

    const key =
      ttKey(
        pos,
        depth
      );

    const cached =
      transposition.get(key);

    if (
      cached !== undefined
    ) {
      return cached;
    }

    const moves =
      orderedMoves(pos);

    let best =
      -INF;

    for (
      const item
      of moves
    ) {
      if (outOfTime()) {
        return 0;
      }

      const child =
        pos.clone();

      child.play(
        item.col
      );

      const score =
        -negamax(
          child,
          depth - 1,
          -beta,
          -alpha,
          ply + 1
        );

      if (timedOut) {
        return 0;
      }

      if (
        score > best
      ) {
        best = score;
      }

      if (
        score > alpha
      ) {
        alpha = score;
      }

      if (
        alpha >= beta
      ) {
        break;
      }
    }

    if (!timedOut) {
      storeTT(
        key,
        best
      );
    }

    return best;
  }


  // ============================================================
  // AI SEARCH
  // ============================================================

  function searchBestMove(
    timeLimit = 700
  ) {
    if (gameOver) {
      return {
        move: null,
        depth: 0,
        score: 0,
        nodes: 0,
        proven: false
      };
    }

    resetSearchClock(
      timeLimit
    );

    transposition.clear();

    /*
      Immediate win.
    */

    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        position.canPlay(col) &&
        position.isWinningMove(col)
      ) {
        return {
          move: col,
          depth: 1,
          score: WIN_SCORE,
          nodes,
          proven: true
        };
      }
    }

    const safeMoves =
      orderedMoves(position);

    if (
      safeMoves.length === 0
    ) {
      /*
        Forced loss.
        Still return a legal move
        so the game can continue.
      */

      const legal =
        CENTER_ORDER.find(
          col =>
            position.canPlay(col)
        );

      return {
        move:
          legal === undefined
            ? null
            : legal,

        depth: 0,
        score: -WIN_SCORE,
        nodes,
        proven: true
      };
    }

    let bestMove =
      safeMoves[0].col;

    let bestScore =
      -INF;

    let completedDepth = 0;

    let proven = false;

    const remaining =
      MAX_MOVES -
      position.moves;

    for (
      let depth = 1;
      depth <= remaining;
      depth++
    ) {
      if (
        performance.now() >=
        deadline
      ) {
        break;
      }

      timedOut = false;

      let localMove =
        bestMove;

      let localScore =
        -INF;

      let alpha =
        -INF;

      const moves =
        orderedMoves(position);

      for (
        const item
        of moves
      ) {
        if (
          performance.now() >=
          deadline
        ) {
          timedOut = true;
          break;
        }

        const child =
          position.clone();

        child.play(
          item.col
        );

        const score =
          -negamax(
            child,
            depth - 1,
            -INF,
            -alpha,
            1
          );

        if (timedOut) {
          break;
        }

        if (
          score >
          localScore
        ) {
          localScore =
            score;

          localMove =
            item.col;
        }

        if (
          score > alpha
        ) {
          alpha = score;
        }
      }

      if (timedOut) {
        break;
      }

      bestMove =
        localMove;

      bestScore =
        localScore;

      completedDepth =
        depth;

      /*
        A terminal score was proven
        inside the searched tree.
      */

      if (
        Math.abs(bestScore) >=
        WIN_SCORE -
        MAX_MOVES
      ) {
        proven = true;
        break;
      }

      /*
        Full remaining tree searched.
      */

      if (
        depth >= remaining
      ) {
        proven = true;
        break;
      }
    }

    return {
      move: bestMove,
      depth:
        completedDepth,
      score:
        bestScore,
      nodes,
      proven
    };
  }


  // ============================================================
  // EXACT SOLVER
  // ============================================================

  function exactKey(pos) {
    return pos.key();
  }


  function exactSolve(pos) {
    if (
      performance.now() >=
      deadline
    ) {
      return {
        type:
          EXACT_UNKNOWN,
        distance: null
      };
    }

    nodes++;

    if (
      pos.moves >=
      MAX_MOVES
    ) {
      return {
        type:
          EXACT_DRAW,
        distance: 0
      };
    }

    /*
      Immediate win.
    */

    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        pos.canPlay(col) &&
        pos.isWinningMove(col)
      ) {
        return {
          type:
            EXACT_WIN,
          distance: 1
        };
      }
    }

    const key =
      exactKey(pos);

    const cached =
      exactTable.get(key);

    if (
      cached !== undefined
    ) {
      return cached;
    }

    const moves =
      orderedMoves(pos);

    /*
      No non-losing move means the
      opponent has an unavoidable
      immediate tactical win.
    */

    if (
      moves.length === 0
    ) {
      return {
        type:
          EXACT_LOSS,
        distance: 2
      };
    }

    let shortestWin =
      Infinity;

    let longestLoss =
      -1;

    let hasDraw = false;
    let hasUnknown = false;

    for (
      const item
      of moves
    ) {
      if (
        performance.now() >=
        deadline
      ) {
        hasUnknown = true;
        break;
      }

      const child =
        pos.clone();

      child.play(
        item.col
      );

      const result =
        exactSolve(child);

      if (
        result.type ===
        EXACT_UNKNOWN
      ) {
        hasUnknown = true;
        continue;
      }

      /*
        Child is from opponent's
        point of view.
      */

      if (
        result.type ===
        EXACT_LOSS
      ) {
        shortestWin =
          Math.min(
            shortestWin,
            result.distance + 1
          );
      }

      else if (
        result.type ===
        EXACT_DRAW
      ) {
        hasDraw = true;
      }

      else if (
        result.type ===
        EXACT_WIN
      ) {
        longestLoss =
          Math.max(
            longestLoss,
            result.distance + 1
          );
      }
    }

    let result;

    /*
      One proven winning child is
      enough to prove WIN even if
      other branches timed out.
    */

    if (
      shortestWin !==
      Infinity
    ) {
      result = {
        type:
          EXACT_WIN,
        distance:
          shortestWin
      };
    }

    /*
      UNKNOWN must come before DRAW
      or LOSS because unexplored
      branches could contain a win.
    */

    else if (
      hasUnknown
    ) {
      result = {
        type:
          EXACT_UNKNOWN,
        distance: null
      };
    }

    else if (
      hasDraw
    ) {
      result = {
        type:
          EXACT_DRAW,
        distance: 0
      };
    }

    else {
      result = {
        type:
          EXACT_LOSS,
        distance:
          longestLoss < 0
            ? 0
            : longestLoss
      };
    }

    if (
      result.type !==
      EXACT_UNKNOWN
    ) {
      if (
        exactTable.size >
        MAX_TT_SIZE
      ) {
        exactTable.clear();
      }

      exactTable.set(
        key,
        result
      );
    }

    return result;
  }


  // ============================================================
  // COLUMN ANALYSIS
  // ============================================================

  function analyze(
    timeLimit = 700
  ) {
    const results =
      Array(WIDTH).fill(null);

    if (gameOver) {
      return results;
    }

    resetSearchClock(
      timeLimit
    );

    exactTable.clear();

    const legalColumns =
      CENTER_ORDER.filter(
        col =>
          position.canPlay(col)
      );

    /*
      Give each column a fair
      portion of the available
      analysis time instead of
      letting the first hard
      column eat everything.
    */

    const totalDeadline =
      deadline;

    for (
      let index = 0;
      index <
      legalColumns.length;
      index++
    ) {
      const col =
        legalColumns[index];

      if (
        performance.now() >=
        totalDeadline
      ) {
        break;
      }

      /*
        Winning immediately is
        already mathematically
        proven.
      */

      if (
        position.isWinningMove(col)
      ) {
        results[col] = {
          type:
            EXACT_WIN,
          distance: 1
        };

        continue;
      }

      const child =
        position.clone();

      child.play(col);

      /*
        Divide remaining time
        between remaining columns.
      */

      const now =
        performance.now();

      const remainingTime =
        totalDeadline - now;

      const remainingColumns =
        legalColumns.length -
        index;

      deadline =
        now +
        Math.max(
          20,
          remainingTime /
          remainingColumns
        );

      const childResult =
        exactSolve(child);

      if (
        childResult.type ===
        EXACT_WIN
      ) {
        results[col] = {
          type:
            EXACT_LOSS,
          distance:
            childResult.distance +
            1
        };
      }

      else if (
        childResult.type ===
        EXACT_LOSS
      ) {
        results[col] = {
          type:
            EXACT_WIN,
          distance:
            childResult.distance +
            1
        };
      }

      else if (
        childResult.type ===
        EXACT_DRAW
      ) {
        results[col] = {
          type:
            EXACT_DRAW,
          distance: 0
        };
      }

      else {
        results[col] = {
          type:
            EXACT_UNKNOWN,
          distance: null
        };
      }

      deadline =
        totalDeadline;
    }

    /*
      Anything legal but not solved
      remains explicitly UNKNOWN.
    */

    for (
      let col = 0;
      col < WIDTH;
      col++
    ) {
      if (
        position.canPlay(col) &&
        results[col] === null
      ) {
        results[col] = {
          type:
            EXACT_UNKNOWN,
          distance: null
        };
      }
    }

    return results;
  }


  // ============================================================
  // GRID HELPERS
  // ============================================================

  function checkGridWin(
    row,
    col,
    player
  ) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1]
    ];

    for (
      const [dr, dc]
      of directions
    ) {
      let count = 1;

      count +=
        countGridDirection(
          row,
          col,
          dr,
          dc,
          player
        );

      count +=
        countGridDirection(
          row,
          col,
          -dr,
          -dc,
          player
        );

      if (count >= 4) {
        return true;
      }
    }

    return false;
  }


  function countGridDirection(
    row,
    col,
    dr,
    dc,
    player
  ) {
    let count = 0;

    let r = row + dr;
    let c = col + dc;

    while (
      r >= 0 &&
      r < HEIGHT &&
      c >= 0 &&
      c < WIDTH &&
      grid[r][c] === player
    ) {
      count++;

      r += dr;
      c += dc;
    }

    return count;
  }


  // ============================================================
  // REBUILD BITBOARD
  // ============================================================

  function rebuildPosition() {
    position =
      new Position();

    /*
      History is chronological, so
      replaying it recreates exactly
      the same bitboard state.
    */

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

  function play(col) {
    if (
      gameOver ||
      col < 0 ||
      col >= WIDTH ||
      !position.canPlay(col)
    ) {
      return null;
    }

    const row =
      heights[col];

    const player =
      currentPlayer;

    /*
      Check with bitboard before
      switching the side to move.
    */

    const winningMove =
      position.isWinningMove(col);

    position.play(col);

    grid[row][col] =
      player;

    heights[col]--;

    const move = {
      row,
      col,
      player
    };

    history.push(move);

    redoStack = [];

    if (winningMove) {
      gameOver = true;
      winner = player;
    }

    else if (
      position.moves >=
      MAX_MOVES
    ) {
      gameOver = true;
      winner = null;
    }

    else {
      currentPlayer =
        player === "A"
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
      history.length === 0
    ) {
      return null;
    }

    const move =
      history.pop();

    redoStack.push(move);

    grid[
      move.row
    ][
      move.col
    ] = null;

    heights[
      move.col
    ]++;

    currentPlayer =
      move.player;

    gameOver = false;
    winner = null;

    rebuildPosition();

    return move;
  }


  // ============================================================
  // REDO
  // ============================================================

  function redo() {
    if (
      redoStack.length === 0
    ) {
      return null;
    }

    const move =
      redoStack.pop();

    /*
      A redo should not erase the
      remaining redo stack, so we
      perform it manually rather
      than calling play().
    */

    const row =
      heights[
        move.col
      ];

    if (row < 0) {
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

    grid[row][move.col] =
      player;

    heights[move.col]--;

    const restored = {
      row,
      col:
        move.col,
      player
    };

    history.push(
      restored
    );

    if (winningMove) {
      gameOver = true;
      winner = player;
    }

    else if (
      position.moves >=
      MAX_MOVES
    ) {
      gameOver = true;
      winner = null;
    }

    else {
      gameOver = false;
      winner = null;

      currentPlayer =
        player === "A"
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
        { length: HEIGHT },
        () =>
          Array(WIDTH).fill(null)
      );

    heights =
      Array(WIDTH).fill(
        HEIGHT - 1
      );

    currentPlayer = "A";

    history = [];
    redoStack = [];

    gameOver = false;
    winner = null;

    transposition.clear();
    exactTable.clear();
  }


  // ============================================================
  // STATE
  // ============================================================

  function getState() {
    return {
      width: WIDTH,
      height: HEIGHT,
      connect: 4,

      grid:
        grid.map(
          row => [...row]
        ),

      heights:
        [...heights],

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
  // LEGAL MOVES
  // ============================================================

  function legalMoves() {
    return CENTER_ORDER.filter(
      col =>
        position.canPlay(col)
    );
  }


  // ============================================================
  // PUBLIC EXACT RESULT
  // ============================================================

  function solvePosition(
    timeLimit = 3000
  ) {
    if (gameOver) {
      if (winner === null) {
        return {
          type:
            EXACT_DRAW,
          distance: 0
        };
      }

      /*
        Game is already over.
        There is no next-player
        decision to solve.
      */

      return {
        type:
          EXACT_UNKNOWN,
        distance: null
      };
    }

    resetSearchClock(
      timeLimit
    );

    exactTable.clear();

    return exactSolve(
      position.clone()
    );
  }


  // ============================================================
  // DEBUG CONSISTENCY CHECK
  // ============================================================

  function validate() {
    let occupied = 0;

    for (
      let r = 0;
      r < HEIGHT;
      r++
    ) {
      for (
        let c = 0;
        c < WIDTH;
        c++
      ) {
        if (
          grid[r][c] !== null
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
  // PUBLIC API
  // ============================================================

  window.Connect4Engine = {
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
      WIDTH,
      HEIGHT,
      CONNECT: 4,

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

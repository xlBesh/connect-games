/*
  ============================================================
  CONNECT 4 ENGINE
  ============================================================

  Board: 7 × 6
  Goal: Connect 4

  v1.2 Solver Upgrade

  Features:
  - BigInt bitboards
  - Gravity
  - Fast win detection
  - Immediate win detection
  - Non-losing move pruning
  - Center-first move ordering
  - Threat-based move ordering
  - Alpha-Beta Negamax
  - Transposition table with bounds
  - Exact Connect Four score search
  - Exact W / D / L + distance
  - Time-limited analysis
  - Undo / Redo

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

  const EXACT_WIN = "WIN";
  const EXACT_DRAW = "DRAW";
  const EXACT_LOSS = "LOSS";
  const EXACT_UNKNOWN = "UNKNOWN";

  const INF = 1000;

  // ============================================================
  // BITBOARD MASKS
  // ============================================================

  const BOTTOM_MASKS = [];
  const COLUMN_MASKS = [];
  const TOP_MASKS = [];

  let BOARD_MASK = 0n;
  let BOTTOM_MASK_ALL = 0n;

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
    BOTTOM_MASK_ALL |= BOTTOM_MASKS[col];
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
      (
        position >>
        BigInt(STRIDE)
      );

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
          BOTTOM_MASK_ALL
        ) &
        BOARD_MASK
      );
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

      return hasAlignment(
        this.current |
        this.moveBit(col)
      );
    }

    play(col) {
      const move =
        this.moveBit(col);

      this.current ^=
        this.mask;

      this.mask |= move;

      this.moves++;
    }

    key() {
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

  /*
    Exact transposition table.

    Each entry can contain:

    lower:
      proven lower score bound

    upper:
      proven upper score bound
  */

  const exactTable =
    new Map();

  const MAX_TT_SIZE =
    500000;

  // ============================================================
  // TIME
  // ============================================================

  function resetSearchClock(ms) {
    deadline =
      performance.now() + ms;

    nodes = 0;
    timedOut = false;
  }

  function checkTime() {
    nodes++;

    /*
      Checking performance.now()
      constantly is expensive,
      especially on mobile.
    */

    if (
      (nodes & 1023) !== 0
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

  function orderedMovesFromMask(
    pos,
    possible
  ) {
    const result = [];

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

      score +=
        20 -
        Math.abs(3 - col);

      result.push({
        col,
        move,
        score
      });
    }

    result.sort(
      (a, b) =>
        b.score - a.score
    );

    return result;
  }

  function orderedMoves(pos) {
    return orderedMovesFromMask(
      pos,
      pos.possibleNonLosingMoves()
    );
  }

  // ============================================================
  // EXACT SCORE
  // ============================================================

  /*
    Score convention:

    Positive:
      current player can force win.

    Zero:
      draw.

    Negative:
      current player will lose
      against perfect play.

    Magnitude also encodes how
    early the terminal result occurs.

    This is the classic compact
    Connect Four score convention.
  */

  function immediateWinScore(pos) {
    return Math.floor(
      (
        MAX_MOVES +
        1 -
        pos.moves
      ) / 2
    );
  }

  function forcedLossScore(pos) {
    return -Math.floor(
      (
        MAX_MOVES -
        pos.moves
      ) / 2
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
    if (checkTime()) {
      return null;
    }

    /*
      Draw because board is full.
    */

    if (
      pos.moves >=
      MAX_MOVES
    ) {
      return 0;
    }

    /*
      Immediate winning move.
    */

    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        pos.canPlay(col) &&
        pos.isWinningMove(col)
      ) {
        return immediateWinScore(
          pos
        );
      }
    }

    const possible =
      pos.possibleNonLosingMoves();

    /*
      No move can stop the
      opponent's immediate win.
    */

    if (possible === 0n) {
      return forcedLossScore(
        pos
      );
    }

    /*
      Maximum score still possible
      without an immediate win.
    */

    const maxPossible =
      Math.floor(
        (
          MAX_MOVES -
          1 -
          pos.moves
        ) / 2
      );

    if (beta > maxPossible) {
      beta = maxPossible;

      if (alpha >= beta) {
        return beta;
      }
    }

    /*
      Minimum score still possible.
    */

    const minPossible =
      -Math.floor(
        (
          MAX_MOVES -
          2 -
          pos.moves
        ) / 2
      );

    if (alpha < minPossible) {
      alpha = minPossible;

      if (alpha >= beta) {
        return alpha;
      }
    }

    const key =
      pos.key();

    const cached =
      exactTable.get(key);

    if (cached !== undefined) {
      if (
        cached.lower !== undefined
      ) {
        alpha =
          Math.max(
            alpha,
            cached.lower
          );
      }

      if (
        cached.upper !== undefined
      ) {
        beta =
          Math.min(
            beta,
            cached.upper
          );
      }

      if (alpha >= beta) {
        return alpha;
      }
    }

    const originalAlpha =
      alpha;

    const originalBeta =
      beta;

    const moves =
      orderedMovesFromMask(
        pos,
        possible
      );

    let best =
      -INF;

    for (
      const item
      of moves
    ) {
      if (checkTime()) {
        return null;
      }

      const child =
        pos.clone();

      child.play(
        item.col
      );

      const childScore =
        exactNegamax(
          child,
          -beta,
          -alpha
        );

      if (
        childScore === null
      ) {
        return null;
      }

      const score =
        -childScore;

      if (score > best) {
        best = score;
      }

      if (score > alpha) {
        alpha = score;
      }

      if (alpha >= beta) {
        break;
      }
    }

    if (!timedOut) {
      if (
        exactTable.size >
        MAX_TT_SIZE
      ) {
        exactTable.clear();
      }

      const old =
        exactTable.get(key) || {};

      /*
        Store a bound rather than
        pretending every cutoff
        produced an exact score.
      */

      if (best <= originalAlpha) {
        old.upper = best;
      }

      else if (
        best >= originalBeta
      ) {
        old.lower = best;
      }

      else {
        old.lower = best;
        old.upper = best;
      }

      exactTable.set(
        key,
        old
      );
    }

    return best;
  }

  // ============================================================
  // SCORE -> RESULT
  // ============================================================

  function scoreToResult(
    score,
    movesBeforeChoice
  ) {
    if (score === null) {
      return {
        type:
          EXACT_UNKNOWN,
        distance: null
      };
    }

    if (score === 0) {
      return {
        type:
          EXACT_DRAW,
        distance: 0
      };
    }

    /*
      Convert the compact score
      back to number of plies until
      the game ends.

      For a winning position:
        score = floor(
          (43 - movesAtPosition) / 2
        )
        adjusted by terminal depth.

      We recover the terminal move
      count from the score.
    */

    if (score > 0) {
      const terminalMove =
        MAX_MOVES +
        1 -
        2 * score;

      return {
        type:
          EXACT_WIN,

        distance:
          Math.max(
            1,
            terminalMove -
            movesBeforeChoice
          )
      };
    }

    const terminalMove =
      MAX_MOVES +
      2 * score;

    return {
      type:
        EXACT_LOSS,

      distance:
        Math.max(
          1,
          terminalMove -
          movesBeforeChoice
        )
    };
  }

  // ============================================================
  // SOLVE ONE POSITION
  // ============================================================

  function solveExactScore(pos) {
    /*
      Null-window / binary score
      search.

      Instead of asking for the
      exact score in one enormous
      alpha-beta window, repeatedly
      prove whether the value lies
      above or below a bound.
    */

    let min =
      -Math.floor(
        (
          MAX_MOVES -
          pos.moves
        ) / 2
      );

    let max =
      Math.floor(
        (
          MAX_MOVES +
          1 -
          pos.moves
        ) / 2
      );

    while (min < max) {
      if (
        performance.now() >=
        deadline
      ) {
        timedOut = true;
        return null;
      }

      let med =
        min +
        Math.floor(
          (max - min) / 2
        );

      /*
        Search values around zero
        first. Draws are common and
        this tends to reduce work.
      */

      if (
        med <= 0 &&
        Math.floor(min / 2) <
          med
      ) {
        med =
          Math.floor(min / 2);
      }

      else if (
        med >= 0 &&
        Math.floor(max / 2) >
          med
      ) {
        med =
          Math.floor(max / 2);
      }

      const result =
        exactNegamax(
          pos,
          med,
          med + 1
        );

      if (result === null) {
        return null;
      }

      if (result <= med) {
        max = result;
      } else {
        min = result;
      }
    }

    return min;
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

    /*
      Keep the table shared between
      columns. Many subtrees overlap.
    */

    exactTable.clear();

    const legal =
      CENTER_ORDER.filter(
        col =>
          position.canPlay(col)
      );

    const totalDeadline =
      deadline;

    for (
      let index = 0;
      index < legal.length;
      index++
    ) {
      const col =
        legal[index];

      if (
        performance.now() >=
        totalDeadline
      ) {
        break;
      }

      /*
        Immediate win is already
        mathematically proven.
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
        Give the current column a
        fair share of the remaining
        time.
      */

      const now =
        performance.now();

      const remainingTime =
        totalDeadline - now;

      const remainingColumns =
        legal.length - index;

      deadline =
        now +
        Math.max(
          25,
          remainingTime /
          remainingColumns
        );

      timedOut = false;

      const childScore =
        solveExactScore(
          child
        );

      if (
        childScore === null
      ) {
        results[col] = {
          type:
            EXACT_UNKNOWN,
          distance: null
        };
      } else {
        /*
          childScore is from the
          opponent's perspective.
        */

        const ourScore =
          -childScore;

        results[col] =
          scoreToResult(
            ourScore,
            position.moves
          );
      }

      deadline =
        totalDeadline;

      timedOut = false;
    }

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
  // BEST MOVE SEARCH
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

    exactTable.clear();

    /*
      Never waste time searching
      past an immediate win.
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
          score: 1,
          nodes,
          proven: true
        };
      }
    }

    const legal =
      orderedMoves(position);

    if (legal.length === 0) {
      const fallback =
        CENTER_ORDER.find(
          col =>
            position.canPlay(col)
        );

      return {
        move:
          fallback === undefined
            ? null
            : fallback,
        depth: 0,
        score: -1,
        nodes,
        proven: true
      };
    }

    let bestMove =
      legal[0].col;

    let bestScore =
      -INF;

    let proven = false;

    /*
      Try exact solving each move
      while time remains.

      If exact solving is not
      completed, ordering still
      gives a sensible fallback.
    */

    for (
      const item
      of legal
    ) {
      if (
        performance.now() >=
        deadline
      ) {
        break;
      }

      const child =
        position.clone();

      child.play(
        item.col
      );

      const score =
        solveExactScore(
          child
        );

      if (score === null) {
        break;
      }

      const ourScore =
        -score;

      if (
        ourScore > bestScore
      ) {
        bestScore =
          ourScore;

        bestMove =
          item.col;
      }

      proven = true;
    }

    return {
      move:
        bestMove,

      depth:
        proven
          ? MAX_MOVES -
            position.moves
          : 0,

      score:
        bestScore === -INF
          ? 0
          : bestScore,

      nodes,

      proven
    };
  }

  // ============================================================
  // PUBLIC POSITION SOLVER
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

    const score =
      solveExactScore(
        position.clone()
      );

    return scoreToResult(
      score,
      position.moves
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
  // VALIDATE
  // ============================================================

  function validate() {
    let occupied = 0;

    for (
      let row = 0;
      row < HEIGHT;
      row++
    ) {
      for (
        let col = 0;
        col < WIDTH;
        col++
      ) {
        if (
          grid[row][col] !== null
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

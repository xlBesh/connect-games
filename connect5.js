/*
  ============================================================
  CONNECT 5 ENGINE · v1.2
  ============================================================

  Board: 9 × 7
  Goal: Connect 5

  Features:
  - Original v1.2 future-threat heuristic
  - support-depth analysis
  - long-term threat evaluation
  - immediate win / block detection
  - move ordering
  - Negamax
  - Alpha-Beta pruning
  - Transposition table
  - Iterative deepening
  - Exact late-game W / D / L solver
  - Undo / Redo
  - AI vs Human
  - AI vs AI

  This file contains NO interface code.

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

  const CENTER_ORDER = [
    4, 3, 5, 2, 6, 1, 7, 0, 8
  ];

  const WIN_SCORE = 1000000;

  const EXACT_WIN = "WIN";
  const EXACT_DRAW = "DRAW";
  const EXACT_LOSS = "LOSS";
  const EXACT_UNKNOWN = "UNKNOWN";


  // ============================================================
  // PRECOMPUTED CONNECT-5 WINDOWS
  // ============================================================

  const WINDOWS = [];


  function buildWindows() {
    WINDOWS.length = 0;


    // Horizontal
    for (
      let r = 0;
      r < ROWS;
      r++
    ) {
      for (
        let c = 0;
        c <= COLS - CONNECT;
        c++
      ) {
        const line = [];

        for (
          let i = 0;
          i < CONNECT;
          i++
        ) {
          line.push([
            r,
            c + i
          ]);
        }

        WINDOWS.push(line);
      }
    }


    // Vertical
    for (
      let r = 0;
      r <= ROWS - CONNECT;
      r++
    ) {
      for (
        let c = 0;
        c < COLS;
        c++
      ) {
        const line = [];

        for (
          let i = 0;
          i < CONNECT;
          i++
        ) {
          line.push([
            r + i,
            c
          ]);
        }

        WINDOWS.push(line);
      }
    }


    // Diagonal \
    for (
      let r = 0;
      r <= ROWS - CONNECT;
      r++
    ) {
      for (
        let c = 0;
        c <= COLS - CONNECT;
        c++
      ) {
        const line = [];

        for (
          let i = 0;
          i < CONNECT;
          i++
        ) {
          line.push([
            r + i,
            c + i
          ]);
        }

        WINDOWS.push(line);
      }
    }


    // Diagonal /
    for (
      let r = 0;
      r <= ROWS - CONNECT;
      r++
    ) {
      for (
        let c = CONNECT - 1;
        c < COLS;
        c++
      ) {
        const line = [];

        for (
          let i = 0;
          i < CONNECT;
          i++
        ) {
          line.push([
            r + i,
            c - i
          ]);
        }

        WINDOWS.push(line);
      }
    }
  }


  buildWindows();


  // ============================================================
  // GAME STATE
  // ============================================================

  let game;
  let heights;

  let currentPlayer;

  let history = [];
  let redoStack = [];

  let gameOver = false;
  let winner = null;


  // ============================================================
  // SEARCH STATE
  // ============================================================

  let deadline = 0;
  let timedOut = false;
  let nodes = 0;

  let table = new Map();


  // ============================================================
  // BASIC GAME HELPERS
  // ============================================================

  function emptyGame() {
    return Array.from(
      { length: ROWS },
      () =>
        Array(COLS).fill(null)
    );
  }


  function otherPlayer(player) {
    return (
      player === "A"
        ? "B"
        : "A"
    );
  }


  function reset() {
    game = emptyGame();

    heights =
      Array(COLS).fill(
        ROWS - 1
      );

    currentPlayer = "A";

    history = [];
    redoStack = [];

    gameOver = false;
    winner = null;

    table.clear();
  }


  // ============================================================
  // LEGAL MOVES
  // ============================================================

  function legalMoves() {
    const result = [];

    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        heights[col] >= 0
      ) {
        result.push(col);
      }
    }

    return result;
  }


  // ============================================================
  // INTERNAL MOVE
  // ============================================================

  function makeMove(
    col,
    player
  ) {
    const row =
      heights[col];

    if (row < 0) {
      return -1;
    }

    game[row][col] =
      player;

    heights[col]--;

    return row;
  }


  function unmakeMove(
    col,
    row
  ) {
    game[row][col] = null;

    heights[col]++;
  }


  // ============================================================
  // CONNECT 5 CHECK
  // ============================================================

  function checkFive(
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
      let total = 1;

      total +=
        countDirection(
          row,
          col,
          dr,
          dc,
          player
        );

      total +=
        countDirection(
          row,
          col,
          -dr,
          -dc,
          player
        );

      if (
        total >= CONNECT
      ) {
        return true;
      }
    }

    return false;
  }


  function countDirection(
    row,
    col,
    dr,
    dc,
    player
  ) {
    let total = 0;

    let r = row + dr;
    let c = col + dc;

    while (
      r >= 0 &&
      r < ROWS &&
      c >= 0 &&
      c < COLS &&
      game[r][c] === player
    ) {
      total++;

      r += dr;
      c += dc;
    }

    return total;
  }


  // ============================================================
  // WINNING MOVES
  // ============================================================

  function wouldWin(
    col,
    player
  ) {
    if (
      heights[col] < 0
    ) {
      return false;
    }

    const row =
      makeMove(
        col,
        player
      );

    const result =
      checkFive(
        row,
        col,
        player
      );

    unmakeMove(
      col,
      row
    );

    return result;
  }


  function winningMoves(player) {
    const result = [];

    for (
      const col
      of legalMoves()
    ) {
      if (
        wouldWin(
          col,
          player
        )
      ) {
        result.push(col);
      }
    }

    return result;
  }


  // ============================================================
  // FUTURE THREAT HELPERS
  // ============================================================

  /*
    0 = playable now
    1 = needs one supporting piece
    2 = needs two supporting pieces
    etc.
  */

  function supportDepth(
    row,
    col
  ) {
    if (
      game[row][col] !== null
    ) {
      return -1;
    }

    const playableRow =
      heights[col];

    if (
      playableRow < row
    ) {
      return Infinity;
    }

    return (
      playableRow - row
    );
  }


  function supportWeight(depth) {
    if (depth === 0) {
      return 1.0;
    }

    if (depth === 1) {
      return 0.55;
    }

    if (depth === 2) {
      return 0.25;
    }

    if (depth === 3) {
      return 0.11;
    }

    if (depth === 4) {
      return 0.05;
    }

    return 0.02;
  }


  // ============================================================
  // FUTURE THREAT SCORE
  // ============================================================

  function futureThreatScore(player) {
    const opponent =
      otherPlayer(player);

    let total = 0;

    for (
      const line
      of WINDOWS
    ) {
      let mine = 0;
      let enemy = 0;

      const emptyCells = [];

      for (
        const [r, c]
        of line
      ) {
        const value =
          game[r][c];

        if (
          value === player
        ) {
          mine++;
        }

        else if (
          value === opponent
        ) {
          enemy++;
        }

        else {
          emptyCells.push([
            r,
            c
          ]);
        }
      }


      /*
        Mixed line.
        Neither player can complete
        this particular five-window.
      */

      if (
        enemy > 0
      ) {
        continue;
      }

      if (
        mine === 0
      ) {
        continue;
      }


      let accessibility = 0;

      let nearest =
        Infinity;

      let furthest = 0;


      for (
        const [r, c]
        of emptyCells
      ) {
        const depth =
          supportDepth(
            r,
            c
          );

        if (
          depth === Infinity
        ) {
          continue;
        }

        accessibility +=
          supportWeight(depth);

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
        mine === 4
      ) {
        total +=
          8000 +
          accessibility * 22000;

        if (
          nearest === 0
        ) {
          total += 30000;
        }

        else if (
          nearest === 1
        ) {
          total += 9000;
        }

        else if (
          nearest === 2
        ) {
          total += 3500;
        }
      }


      else if (
        mine === 3
      ) {
        total +=
          900 +
          accessibility * 2600;

        if (
          furthest <= 1
        ) {
          total += 1800;
        }
      }


      else if (
        mine === 2
      ) {
        total +=
          100 +
          accessibility * 350;
      }


      else if (
        mine === 1
      ) {
        total +=
          accessibility * 20;
      }
    }

    return total;
  }


  // ============================================================
  // TIME CONTROL
  // ============================================================

  function resetSearchClock(
    timeLimit
  ) {
    deadline =
      performance.now() +
      timeLimit;

    nodes = 0;
    timedOut = false;
  }


  function outOfTime() {
    nodes++;

    if (
      (nodes & 255) !== 0
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
  // CACHE KEYS
  // ============================================================

  function boardKey(
    player,
    depth
  ) {
    let key =
      player +
      ":" +
      depth +
      ":";

    for (
      let c = 0;
      c < COLS;
      c++
    ) {
      for (
        let r = ROWS - 1;
        r >= 0;
        r--
      ) {
        const value =
          game[r][c];

        if (
          value === null
        ) {
          key += "0";
        }

        else if (
          value === "A"
        ) {
          key += "1";
        }

        else {
          key += "2";
        }
      }
    }

    return key;
  }


  function exactKey(player) {
    let key =
      player + ":";

    for (
      let c = 0;
      c < COLS;
      c++
    ) {
      for (
        let r = ROWS - 1;
        r >= 0;
        r--
      ) {
        const value =
          game[r][c];

        if (
          value === null
        ) {
          key += "0";
        }

        else if (
          value === "A"
        ) {
          key += "1";
        }

        else {
          key += "2";
        }
      }
    }

    return key;
  }


  // ============================================================
  // EVALUATION
  // ============================================================

  function evaluate(player) {
    const opponent =
      otherPlayer(player);

    let score = 0;


    for (
      const line
      of WINDOWS
    ) {
      let mine = 0;
      let enemy = 0;

      let playable = 0;

      let myAccess = 0;
      let enemyAccess = 0;


      for (
        const [r, c]
        of line
      ) {
        const value =
          game[r][c];

        if (
          value === player
        ) {
          mine++;
        }

        else if (
          value === opponent
        ) {
          enemy++;
        }

        else {
          const depth =
            supportDepth(
              r,
              c
            );

          if (
            depth === 0
          ) {
            playable++;
          }

          const weight =
            supportWeight(depth);

          myAccess += weight;
          enemyAccess += weight;
        }
      }


      if (
        mine > 0 &&
        enemy > 0
      ) {
        continue;
      }


      if (
        enemy === 0
      ) {
        if (
          mine === 4
        ) {
          score +=
            6000 +
            myAccess * 22000;

          if (
            playable > 0
          ) {
            score += 28000;
          }
        }

        else if (
          mine === 3
        ) {
          score +=
            1100 +
            myAccess * 2600;
        }

        else if (
          mine === 2
        ) {
          score +=
            150 +
            myAccess * 380;
        }

        else if (
          mine === 1
        ) {
          score +=
            10 +
            myAccess * 20;
        }
      }


      if (
        mine === 0
      ) {
        if (
          enemy === 4
        ) {
          score -=
            7000 +
            enemyAccess * 25000;

          if (
            playable > 0
          ) {
            score -= 32000;
          }
        }

        else if (
          enemy === 3
        ) {
          score -=
            1350 +
            enemyAccess * 3200;
        }

        else if (
          enemy === 2
        ) {
          score -=
            180 +
            enemyAccess * 430;
        }

        else if (
          enemy === 1
        ) {
          score -=
            enemyAccess * 15;
        }
      }
    }


    /*
      v1.2 future-threat layer.

      Defense is deliberately
      weighted slightly more than
      offense so the AI notices
      supported future traps.
    */

    const ownFuture =
      futureThreatScore(
        player
      );

    const enemyFuture =
      futureThreatScore(
        opponent
      );

    score +=
      ownFuture * 0.35;

    score -=
      enemyFuture * 0.45;


    /*
      Center preference.
    */

    for (
      let r = 0;
      r < ROWS;
      r++
    ) {
      if (
        game[r][4] ===
        player
      ) {
        score += 20;
      }

      if (
        game[r][4] ===
        opponent
      ) {
        score -= 20;
      }
    }

    return score;
  }


  // ============================================================
  // MOVE ORDERING
  // ============================================================

  function orderedMoves(player) {
    const opponent =
      otherPlayer(player);

    const moves =
      legalMoves();

    const beforeOwnFuture =
      futureThreatScore(
        player
      );

    const beforeEnemyFuture =
      futureThreatScore(
        opponent
      );


    const scored =
      moves.map(col => {
        let score =
          (
            5 -
            Math.abs(
              4 - col
            )
          ) * 100;


        if (
          wouldWin(
            col,
            player
          )
        ) {
          score += 1000000;
        }


        if (
          wouldWin(
            col,
            opponent
          )
        ) {
          score += 500000;
        }


        const row =
          makeMove(
            col,
            player
          );


        const ownWins =
          winningMoves(
            player
          ).length;


        const enemyWins =
          winningMoves(
            opponent
          ).length;


        score +=
          ownWins * 22000;

        score -=
          enemyWins * 50000;


        const afterOwnFuture =
          futureThreatScore(
            player
          );


        const afterEnemyFuture =
          futureThreatScore(
            opponent
          );


        const ownImprovement =
          afterOwnFuture -
          beforeOwnFuture;


        const enemyImprovement =
          afterEnemyFuture -
          beforeEnemyFuture;


        score +=
          ownImprovement * 0.22;


        score -=
          enemyImprovement * 0.38;


        if (
          enemyWins >= 2
        ) {
          score -= 400000;
        }


        unmakeMove(
          col,
          row
        );


        return {
          col,
          score
        };
      });


    scored.sort(
      (a, b) =>
        b.score - a.score
    );


    return scored.map(
      item => item.col
    );
  }


  // ============================================================
  // NEGAMAX + ALPHA BETA
  // ============================================================

  function negamax(
    player,
    depth,
    alpha,
    beta,
    ply
  ) {
    if (
      outOfTime()
    ) {
      return 0;
    }


    const moves =
      legalMoves();


    if (
      moves.length === 0
    ) {
      return 0;
    }


    for (
      const col
      of moves
    ) {
      if (
        wouldWin(
          col,
          player
        )
      ) {
        return (
          WIN_SCORE -
          ply
        );
      }
    }


    const opponent =
      otherPlayer(
        player
      );


    const enemyWins =
      winningMoves(
        opponent
      );


    if (
      enemyWins.length >= 2
    ) {
      return (
        -WIN_SCORE +
        ply
      );
    }


    if (
      depth <= 0
    ) {
      return evaluate(
        player
      );
    }


    let candidates;


    if (
      enemyWins.length === 1
    ) {
      candidates = [
        enemyWins[0]
      ];
    }

    else {
      candidates =
        orderedMoves(
          player
        );
    }


    const key =
      boardKey(
        player,
        depth
      );


    const cached =
      table.get(key);


    if (
      cached !== undefined
    ) {
      return cached;
    }


    let best =
      -Infinity;


    for (
      const col
      of candidates
    ) {
      if (
        outOfTime()
      ) {
        return 0;
      }


      const row =
        makeMove(
          col,
          player
        );


      let score;


      if (
        checkFive(
          row,
          col,
          player
        )
      ) {
        score =
          WIN_SCORE -
          ply;
      }

      else {
        score =
          -negamax(
            opponent,
            depth - 1,
            -beta,
            -alpha,
            ply + 1
          );
      }


      unmakeMove(
        col,
        row
      );


      if (
        timedOut
      ) {
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


    if (
      !timedOut
    ) {
      table.set(
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
    if (
      gameOver
    ) {
      return {
        move: null,
        score: 0,
        depth: 0,
        nodes: 0
      };
    }


    const player =
      currentPlayer;


    resetSearchClock(
      timeLimit
    );


    table.clear();


    let moves =
      orderedMoves(
        player
      );


    if (
      moves.length === 0
    ) {
      return {
        move: null,
        score: 0,
        depth: 0,
        nodes
      };
    }


    let bestMove =
      moves[0];


    let bestScore =
      -Infinity;


    let completedDepth = 0;


    /*
      Immediate win.
    */

    for (
      const col
      of moves
    ) {
      if (
        wouldWin(
          col,
          player
        )
      ) {
        return {
          move: col,
          score:
            WIN_SCORE,
          depth: 1,
          nodes
        };
      }
    }


    /*
      Immediate defense.
    */

    const opponent =
      otherPlayer(
        player
      );


    const enemyWins =
      winningMoves(
        opponent
      );


    if (
      enemyWins.length === 1
    ) {
      bestMove =
        enemyWins[0];
    }


    /*
      Iterative deepening.
    */

    for (
      let depth = 1;
      depth <= 20;
      depth++
    ) {
      if (
        performance.now() >=
        deadline
      ) {
        break;
      }


      timedOut = false;


      let localBest =
        bestMove;


      let localScore =
        -Infinity;


      let alpha =
        -Infinity;


      const beta =
        Infinity;


      const rootMoves =
        orderedMoves(
          player
        );


      for (
        const col
        of rootMoves
      ) {
        if (
          performance.now() >=
          deadline
        ) {
          timedOut = true;
          break;
        }


        const row =
          makeMove(
            col,
            player
          );


        let score;


        if (
          checkFive(
            row,
            col,
            player
          )
        ) {
          score =
            WIN_SCORE;
        }

        else {
          score =
            -negamax(
              opponent,
              depth - 1,
              -beta,
              -alpha,
              1
            );
        }


        unmakeMove(
          col,
          row
        );


        if (
          timedOut
        ) {
          break;
        }


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
          score > alpha
        ) {
          alpha = score;
        }
      }


      if (
        timedOut
      ) {
        break;
      }


      bestMove =
        localBest;


      bestScore =
        localScore;


      completedDepth =
        depth;


      if (
        Math.abs(
          bestScore
        ) >=
        WIN_SCORE - 100
      ) {
        break;
      }
    }


    return {
      move:
        bestMove,

      score:
        bestScore,

      depth:
        completedDepth,

      nodes
    };
  }


  // ============================================================
  // EXACT SOLVER
  // ============================================================

  function exactSolve(
    player,
    memo
  ) {
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


    const moves =
      legalMoves();


    if (
      moves.length === 0
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
      of moves
    ) {
      if (
        wouldWin(
          col,
          player
        )
      ) {
        return {
          type:
            EXACT_WIN,
          distance: 1
        };
      }
    }


    const key =
      exactKey(
        player
      );


    const cached =
      memo.get(key);


    if (
      cached !== undefined
    ) {
      return cached;
    }


    const opponent =
      otherPlayer(
        player
      );


    let shortestWin =
      Infinity;


    let longestLoss =
      -1;


    let hasDraw =
      false;


    let hasUnknown =
      false;


    const ordered =
      orderedMoves(
        player
      );


    for (
      const col
      of ordered
    ) {
      if (
        performance.now() >=
        deadline
      ) {
        hasUnknown = true;
        break;
      }


      const row =
        makeMove(
          col,
          player
        );


      let child;


      if (
        checkFive(
          row,
          col,
          player
        )
      ) {
        child = {
          type:
            EXACT_LOSS,
          distance: 0
        };
      }

      else {
        child =
          exactSolve(
            opponent,
            memo
          );
      }


      unmakeMove(
        col,
        row
      );


      if (
        child.type ===
        EXACT_UNKNOWN
      ) {
        hasUnknown = true;
        continue;
      }


      if (
        child.type ===
        EXACT_LOSS
      ) {
        shortestWin =
          Math.min(
            shortestWin,
            child.distance + 1
          );
      }


      else if (
        child.type ===
        EXACT_DRAW
      ) {
        hasDraw = true;
      }


      else if (
        child.type ===
        EXACT_WIN
      ) {
        longestLoss =
          Math.max(
            longestLoss,
            child.distance + 1
          );
      }
    }


    let result;


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
      memo.set(
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
      Array(COLS).fill(null);


    if (
      gameOver
    ) {
      return results;
    }


    const player =
      currentPlayer;


    const empties =
      heights.reduce(
        (total, h) =>
          total + h + 1,
        0
      );


    /*
      Preserve the behavior of v1.2:
      spend more time proving late
      positions.
    */

    let analysisTime;


    if (
      empties <= 14
    ) {
      analysisTime =
        Math.max(
          timeLimit,
          3000
        );
    }


    else if (
      empties <= 20
    ) {
      analysisTime =
        Math.max(
          timeLimit,
          1800
        );
    }


    else {
      analysisTime =
        Math.min(
          timeLimit,
          500
        );
    }


    resetSearchClock(
      analysisTime
    );


    const memo =
      new Map();


    const moves =
      legalMoves();


    for (
      const col
      of moves
    ) {
      if (
        performance.now() >=
        deadline
      ) {
        break;
      }


      const row =
        makeMove(
          col,
          player
        );


      let result;


      if (
        checkFive(
          row,
          col,
          player
        )
      ) {
        result = {
          type:
            EXACT_WIN,
          distance: 1
        };
      }


      else {
        const child =
          exactSolve(
            otherPlayer(
              player
            ),
            memo
          );


        if (
          child.type ===
          EXACT_WIN
        ) {
          result = {
            type:
              EXACT_LOSS,

            distance:
              child.distance + 1
          };
        }


        else if (
          child.type ===
          EXACT_LOSS
        ) {
          result = {
            type:
              EXACT_WIN,

            distance:
              child.distance + 1
          };
        }


        else if (
          child.type ===
          EXACT_DRAW
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
              EXACT_UNKNOWN,

            distance: null
          };
        }
      }


      unmakeMove(
        col,
        row
      );


      results[col] =
        result;
    }


    /*
      Legal columns that could not
      be proven remain UNKNOWN.
    */

    for (
      let col = 0;
      col < COLS;
      col++
    ) {
      if (
        heights[col] >= 0 &&
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
  // PUBLIC PLAY
  // ============================================================

  function play(col) {
    if (
      gameOver ||
      col < 0 ||
      col >= COLS ||
      heights[col] < 0
    ) {
      return null;
    }


    const player =
      currentPlayer;


    const row =
      makeMove(
        col,
        player
      );


    const move = {
      row,
      col,
      player
    };


    history.push(move);


    redoStack = [];


    if (
      checkFive(
        row,
        col,
        player
      )
    ) {
      gameOver = true;

      winner =
        player;
    }


    else if (
      legalMoves().length === 0
    ) {
      gameOver = true;

      winner = null;
    }


    else {
      currentPlayer =
        otherPlayer(
          player
        );
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


    game[
      move.row
    ][
      move.col
    ] = null;


    heights[
      move.col
    ]++;


    redoStack.push(
      move
    );


    currentPlayer =
      move.player;


    gameOver = false;
    winner = null;


    return {
      ...move
    };
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


    const oldMove =
      redoStack.pop();


    if (
      heights[
        oldMove.col
      ] < 0
    ) {
      return null;
    }


    const player =
      currentPlayer;


    const row =
      makeMove(
        oldMove.col,
        player
      );


    const move = {
      row,
      col:
        oldMove.col,
      player
    };


    history.push(
      move
    );


    if (
      checkFive(
        row,
        move.col,
        player
      )
    ) {
      gameOver = true;

      winner =
        player;
    }


    else if (
      legalMoves().length === 0
    ) {
      gameOver = true;

      winner = null;
    }


    else {
      gameOver = false;

      winner = null;

      currentPlayer =
        otherPlayer(
          player
        );
    }


    return {
      ...move,
      gameOver,
      winner
    };
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
        game.map(
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
        history.length
    };
  }


  // ============================================================
  // EXACT POSITION RESULT
  // ============================================================

  function solvePosition(
    timeLimit = 3000
  ) {
    if (
      gameOver
    ) {
      if (
        winner === null
      ) {
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


    const memo =
      new Map();


    return exactSolve(
      currentPlayer,
      memo
    );
  }


  // ============================================================
  // DEBUG VALIDATION
  // ============================================================

  function validate() {
    let occupied = 0;


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
          game[r][c] !== null
        ) {
          occupied++;
        }
      }
    }


    return (
      occupied ===
      history.length
    );
  }


  // ============================================================
  // START ENGINE
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

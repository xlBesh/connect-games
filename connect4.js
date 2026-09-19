(() => {
  "use strict";

  const WIDTH = 7;
  const HEIGHT = 6;
  const STRIDE = HEIGHT + 1;
  const MAX_MOVES = WIDTH * HEIGHT;

  const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];

  const EXACT_WIN = "WIN";
  const EXACT_DRAW = "DRAW";
  const EXACT_LOSS = "LOSS";
  const EXACT_UNKNOWN = "UNKNOWN";

  const AI_WIN_SCORE = 1000000;
  const AI_INF = 2000000000;

  const MIN_SCORE = -18;
  const MAX_SCORE = 18;
  const LOWER_BOUND_MARK =
    MAX_SCORE - MIN_SCORE + 1;


  // ============================================================
  // BITBOARD MASKS
  // ============================================================

  const BOTTOM_MASKS = [];
  const COLUMN_MASKS = [];
  const TOP_MASKS = [];

  let BOARD_MASK = 0n;
  let BOTTOM_MASK_ALL = 0n;

  for (
    let col = 0;
    col < WIDTH;
    col++
  ) {
    const shift =
      BigInt(
        col * STRIDE
      );

    BOTTOM_MASKS[col] =
      1n << shift;

    COLUMN_MASKS[col] =
      (
        (
          1n <<
          BigInt(HEIGHT)
        ) -
        1n
      ) <<
      shift;

    TOP_MASKS[col] =
      1n <<
      BigInt(
        col * STRIDE +
        HEIGHT -
        1
      );

    BOARD_MASK |=
      COLUMN_MASKS[col];

    BOTTOM_MASK_ALL |=
      BOTTOM_MASKS[col];
  }


  // ============================================================
  // BIT HELPERS
  // ============================================================

  function popcount(value) {
    let count = 0;

    while (
      value !== 0n
    ) {
      value &=
        value - 1n;

      count++;
    }

    return count;
  }


  function hasAlignment(bits) {
    let m;


    // Vertical

    m =
      bits &
      (
        bits >>
        1n
      );

    if (
      (
        m >>
        2n
      ) &
      m
    ) {
      return true;
    }


    // Horizontal

    m =
      bits &
      (
        bits >>
        BigInt(
          STRIDE
        )
      );

    if (
      (
        m &
        (
          m >>
          BigInt(
            2 * STRIDE
          )
        )
      ) !== 0n
    ) {
      return true;
    }


    // Diagonal /

    m =
      bits &
      (
        bits >>
        BigInt(
          HEIGHT
        )
      );

    if (
      (
        m &
        (
          m >>
          BigInt(
            2 * HEIGHT
          )
        )
      ) !== 0n
    ) {
      return true;
    }


    // Diagonal \

    m =
      bits &
      (
        bits >>
        BigInt(
          HEIGHT + 2
        )
      );

    return (
      (
        m &
        (
          m >>
          BigInt(
            2 *
            (
              HEIGHT +
              2
            )
          )
        )
      ) !== 0n
    );
  }


  function winningPosition(
    current,
    mask
  ) {
    let result = 0n;
    let p;


    // Vertical

    result |=
      (
        current <<
        1n
      ) &
      (
        current <<
        2n
      ) &
      (
        current <<
        3n
      );


    // Horizontal

    p =
      (
        current <<
        BigInt(
          STRIDE
        )
      ) &
      (
        current <<
        BigInt(
          2 *
          STRIDE
        )
      );

    result |=
      p &
      (
        current <<
        BigInt(
          3 *
          STRIDE
        )
      );

    result |=
      p &
      (
        current >>
        BigInt(
          STRIDE
        )
      );

    p =
      (
        current >>
        BigInt(
          STRIDE
        )
      ) &
      (
        current >>
        BigInt(
          2 *
          STRIDE
        )
      );

    result |=
      p &
      (
        current <<
        BigInt(
          STRIDE
        )
      );

    result |=
      p &
      (
        current >>
        BigInt(
          3 *
          STRIDE
        )
      );


    // Diagonal /

    p =
      (
        current <<
        BigInt(
          HEIGHT
        )
      ) &
      (
        current <<
        BigInt(
          2 *
          HEIGHT
        )
      );

    result |=
      p &
      (
        current <<
        BigInt(
          3 *
          HEIGHT
        )
      );

    result |=
      p &
      (
        current >>
        BigInt(
          HEIGHT
        )
      );

    p =
      (
        current >>
        BigInt(
          HEIGHT
        )
      ) &
      (
        current >>
        BigInt(
          2 *
          HEIGHT
        )
      );

    result |=
      p &
      (
        current <<
        BigInt(
          HEIGHT
        )
      );

    result |=
      p &
      (
        current >>
        BigInt(
          3 *
          HEIGHT
        )
      );


    // Diagonal \

    const diagonal =
      HEIGHT + 2;

    p =
      (
        current <<
        BigInt(
          diagonal
        )
      ) &
      (
        current <<
        BigInt(
          2 *
          diagonal
        )
      );

    result |=
      p &
      (
        current <<
        BigInt(
          3 *
          diagonal
        )
      );

    result |=
      p &
      (
        current >>
        BigInt(
          diagonal
        )
      );

    p =
      (
        current >>
        BigInt(
          diagonal
        )
      ) &
      (
        current >>
        BigInt(
          2 *
          diagonal
        )
      );

    result |=
      p &
      (
        current <<
        BigInt(
          diagonal
        )
      );

    result |=
      p &
      (
        current >>
        BigInt(
          3 *
          diagonal
        )
      );


    return (
      result &
      (
        BOARD_MASK ^
        mask
      )
    );
  }


  function possibleRaw(mask) {
    return (
      (
        mask +
        BOTTOM_MASK_ALL
      ) &
      BOARD_MASK
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


  function canPlayRaw(
    mask,
    col
  ) {
    return (
      (
        mask &
        TOP_MASKS[col]
      ) === 0n
    );
  }


  function canWinNextRaw(
    current,
    mask
  ) {
    return (
      (
        winningPosition(
          current,
          mask
        ) &
        possibleRaw(mask)
      ) !== 0n
    );
  }


  function nonLosingMovesRaw(
    current,
    mask
  ) {
    let possible =
      possibleRaw(mask);

    const opponentWin =
      winningPosition(
        mask ^
        current,
        mask
      );

    const forced =
      possible &
      opponentWin;


    if (
      forced !== 0n
    ) {
      if (
        (
          forced &
          (
            forced -
            1n
          )
        ) !== 0n
      ) {
        return 0n;
      }

      possible =
        forced;
    }


    return (
      possible &
      ~(
        opponentWin >>
        1n
      )
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


    canPlay(col) {
      return canPlayRaw(
        this.mask,
        col
      );
    }


    moveBit(col) {
      return moveBitRaw(
        this.mask,
        col
      );
    }


    isWinningMove(col) {
      if (
        !this.canPlay(col)
      ) {
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
  }


  // ============================================================
  // VERIFIED OPENING BOOK
  // ============================================================

  /*
    These entries contain only
    positions we independently
    verified against the reference
    solver.

    The exact search below is used
    for every other position.
  */

  const openingBook =
    new Map();


  function addOpeningEntry(
    sequence,
    values
  ) {
    const p =
      new Position();

    for (
      const oneBasedColumn
      of sequence
    ) {
      p.play(
        oneBasedColumn -
        1
      );
    }


    openingBook.set(
      p.key().toString(),
      values.map(
        value =>
          value
            ? {
                type:
                  value.type,

                distance:
                  value.distance
              }
            : null
      )
    );
  }


  /*
    Empty board
  */

  addOpeningEntry(
    [],
    [
      {
        type:
          EXACT_LOSS,
        distance: 39
      },

      {
        type:
          EXACT_LOSS,
        distance: 41
      },

      {
        type:
          EXACT_DRAW,
        distance: 0
      },

      {
        type:
          EXACT_WIN,
        distance: 40
      },

      {
        type:
          EXACT_DRAW,
        distance: 0
      },

      {
        type:
          EXACT_LOSS,
        distance: 41
      },

      {
        type:
          EXACT_LOSS,
        distance: 39
      }
    ]
  );


  /*
    A plays column 4
  */

  addOpeningEntry(
    [4],
    [
      {
        type:
          EXACT_LOSS,
        distance: 33
      },

      {
        type:
          EXACT_LOSS,
        distance: 37
      },

      {
        type:
          EXACT_LOSS,
        distance: 37
      },

      {
        type:
          EXACT_LOSS,
        distance: 39
      },

      {
        type:
          EXACT_LOSS,
        distance: 37
      },

      {
        type:
          EXACT_LOSS,
        distance: 37
      },

      {
        type:
          EXACT_LOSS,
        distance: 33
      }
    ]
  );


  /*
    A4 B4
  */

  addOpeningEntry(
    [4, 4],
    [
      {
        type:
          EXACT_LOSS,
        distance: 35
      },

      {
        type:
          EXACT_LOSS,
        distance: 35
      },

      {
        type:
          EXACT_LOSS,
        distance: 37
      },

      {
        type:
          EXACT_WIN,
        distance: 38
      },

      {
        type:
          EXACT_LOSS,
        distance: 37
      },

      {
        type:
          EXACT_LOSS,
        distance: 35
      },

      {
        type:
          EXACT_LOSS,
        distance: 35
      }
    ]
  );


  function getOpeningAnalysis(
    pos
  ) {
    const found =
      openingBook.get(
        pos.key().toString()
      );


    if (!found) {
      return null;
    }


    return found.map(
      value =>
        value
          ? {
              type:
                value.type,

              distance:
                value.distance
            }
          : null
    );
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
          HEIGHT
      },

      () =>
        Array(
          WIDTH
        ).fill(
          null
        )
    );


  let heights =
    Array(
      WIDTH
    ).fill(
      HEIGHT -
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

    nodes = 0;
    timedOut = false;
  }


  function timeExpiredFast() {
    nodes++;


    if (
      (
        nodes &
        4095
      ) !== 0
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
  // EXACT TRANSPOSITION TABLE
  // ============================================================

  /*
    Fixed-size table is much
    cheaper than allocating Map
    objects for millions of nodes.
  */

  const TT_BITS =
    20;

  const TT_SIZE =
    1 <<
    TT_BITS;

  const TT_MASK =
    BigInt(
      TT_SIZE -
      1
    );


  const ttKeys =
    new BigUint64Array(
      TT_SIZE
    );


  const ttValues =
    new Uint8Array(
      TT_SIZE
    );


  function ttIndex(key) {
    const folded =
      key ^
      (
        key >>
        21n
      ) ^
      (
        key >>
        42n
      );


    return Number(
      folded &
      TT_MASK
    );
  }


  function ttGet(key) {
    const index =
      ttIndex(key);

    const value =
      ttValues[index];


    if (
      value === 0
    ) {
      return 0;
    }


    if (
      ttKeys[index] !==
      key
    ) {
      return 0;
    }


    return value;
  }


  function ttPut(
    key,
    value
  ) {
    const index =
      ttIndex(key);

    ttKeys[index] =
      key;

    ttValues[index] =
      value;
  }


  // ============================================================
  // MOVE SORTING BUFFERS
  // ============================================================

  /*
    Reused arrays prevent creating
    thousands of temporary arrays
    inside recursion.
  */

  const MOVE_COLS =
    Array.from(
      {
        length:
          MAX_MOVES +
          1
      },

      () =>
        new Int8Array(
          WIDTH
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
        new Int8Array(
          WIDTH
        )
    );


  function buildOrderedMoves(
    current,
    mask,
    moveCount,
    possible
  ) {
    const cols =
      MOVE_COLS[
        moveCount
      ];

    const scores =
      MOVE_SCORES[
        moveCount
      ];

    let size = 0;


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
        (
          possible &
          move
        ) === 0n
      ) {
        continue;
      }


      const score =
        popcount(
          winningPosition(
            current |
            move,
            mask
          )
        );


      let index =
        size;


      while (
        index > 0 &&
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
  // EXACT NEGAMAX
  // ============================================================

  function exactNegamaxRaw(
    current,
    mask,
    moveCount,
    alpha,
    beta
  ) {
    if (
      timeExpiredFast()
    ) {
      return null;
    }


    const possible =
      nonLosingMovesRaw(
        current,
        mask
      );


    /*
      Every legal move allows
      opponent to win immediately.
    */

    if (
      possible === 0n
    ) {
      return -Math.trunc(
        (
          MAX_MOVES -
          moveCount
        ) /
        2
      );
    }


    /*
      No player can still create
      four before board fills.
    */

    if (
      moveCount >=
      MAX_MOVES -
      2
    ) {
      return 0;
    }


    let min =
      -Math.trunc(
        (
          MAX_MOVES -
          2 -
          moveCount
        ) /
        2
      );


    if (
      alpha <
      min
    ) {
      alpha =
        min;

      if (
        alpha >=
        beta
      ) {
        return alpha;
      }
    }


    let max =
      Math.trunc(
        (
          MAX_MOVES -
          1 -
          moveCount
        ) /
        2
      );


    if (
      beta >
      max
    ) {
      beta =
        max;

      if (
        alpha >=
        beta
      ) {
        return beta;
      }
    }


    const key =
      current +
      mask;


    const cached =
      ttGet(
        key
      );


    if (
      cached !== 0
    ) {
      /*
        Lower bound
      */

      if (
        cached >
        LOWER_BOUND_MARK
      ) {
        min =
          cached +
          2 *
          MIN_SCORE -
          MAX_SCORE -
          2;


        if (
          alpha <
          min
        ) {
          alpha =
            min;

          if (
            alpha >=
            beta
          ) {
            return alpha;
          }
        }
      }


      /*
        Upper bound
      */

      else {
        max =
          cached +
          MIN_SCORE -
          1;


        if (
          beta >
          max
        ) {
          beta =
            max;

          if (
            alpha >=
            beta
          ) {
            return beta;
          }
        }
      }
    }


    const moveTotal =
      buildOrderedMoves(
        current,
        mask,
        moveCount,
        possible
      );


    const cols =
      MOVE_COLS[
        moveCount
      ];


    const nextCurrent =
      current ^
      mask;


    for (
      let index = 0;
      index <
      moveTotal;
      index++
    ) {
      const col =
        cols[index];


      const move =
        moveBitRaw(
          mask,
          col
        );


      const childScore =
        exactNegamaxRaw(
          nextCurrent,

          mask |
          move,

          moveCount +
          1,

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
        score >=
        beta
      ) {
        ttPut(
          key,

          score +
          MAX_SCORE -
          2 *
          MIN_SCORE +
          2
        );


        return score;
      }


      if (
        score >
        alpha
      ) {
        alpha =
          score;
      }
    }


    ttPut(
      key,

      alpha -
      MIN_SCORE +
      1
    );


    return alpha;
  }


  // ============================================================
  // EXACT SCORE SEARCH
  // ============================================================

  function solveExactRaw(
    current,
    mask,
    moveCount
  ) {
    /*
      Immediate win.
    */

    if (
      canWinNextRaw(
        current,
        mask
      )
    ) {
      return Math.trunc(
        (
          MAX_MOVES +
          1 -
          moveCount
        ) /
        2
      );
    }


    let min =
      -Math.trunc(
        (
          MAX_MOVES -
          moveCount
        ) /
        2
      );


    let max =
      Math.trunc(
        (
          MAX_MOVES +
          1 -
          moveCount
        ) /
        2
      );


    /*
      Null-window search.
    */

    while (
      min <
      max
    ) {
      if (
        performance.now() >=
        deadline
      ) {
        timedOut =
          true;

        return null;
      }


      let med =
        min +
        Math.trunc(
          (
            max -
            min
          ) /
          2
        );


      if (
        med <= 0 &&
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
        med >= 0 &&
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


      const result =
        exactNegamaxRaw(
          current,
          mask,
          moveCount,
          med,
          med + 1
        );


      if (
        result ===
        null
      ) {
        return null;
      }


      if (
        result <=
        med
      ) {
        max =
          result;
      }

      else {
        min =
          result;
      }
    }


    return min;
  }


  // ============================================================
  // EXACT SCORE -> DISTANCE
  // ============================================================

  function distanceFromScore(
    moveCount,
    score
  ) {
    if (
      score === 0
    ) {
      return 0;
    }


    /*
      Current player wins.
    */

    if (
      score > 0
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
      score === null
    ) {
      return {
        type:
          EXACT_UNKNOWN,

        distance:
          null
      };
    }


    if (
      score === 0
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
        score > 0
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
    This function converts the score
    AFTER a candidate move.

    Therefore distance does NOT count
    the candidate move itself.

    Example:
    empty board, column 4 = W in 40.
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
        childScore < 0
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

  function mirrorBits(bits) {
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
      col < WIDTH;
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
            WIDTH -
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
  // COLUMN ANALYSIS
  // ============================================================

  function analyze(
    timeLimit = 700
  ) {
    const results =
      Array(
        WIDTH
      ).fill(
        null
      );


    if (
      gameOver
    ) {
      return results;
    }


    /*
      Check verified opening data
      before running expensive search.
    */

    const opening =
      getOpeningAnalysis(
        position
      );


    if (
      opening
    ) {
      return opening;
    }


    resetSearchClock(
      timeLimit
    );


    const totalDeadline =
      deadline;


    const symmetric =
      isSymmetric(
        position
      );


    let columns =
      CENTER_ORDER.filter(
        col =>
          position.canPlay(
            col
          )
      );


    /*
      A symmetric position only needs
      one side of each mirrored pair.
    */

    if (
      symmetric
    ) {
      columns =
        columns.filter(
          col =>
            col <= 3
        );
    }


    for (
      let index = 0;
      index <
      columns.length;
      index++
    ) {
      const col =
        columns[index];


      if (
        performance.now() >=
        totalDeadline
      ) {
        break;
      }


      let result;


      /*
        Immediate win.
      */

      if (
        position.isWinningMove(
          col
        )
      ) {
        result = {
          type:
            EXACT_WIN,

          distance:
            1
        };
      }


      else {
        const move =
          moveBitRaw(
            position.mask,
            col
          );


        const childCurrent =
          position.current ^
          position.mask;


        const childMask =
          position.mask |
          move;


        const childMoveCount =
          position.moves +
          1;


        /*
          Fairly divide remaining time
          between unsolved columns.
        */

        const now =
          performance.now();


        const remaining =
          columns.length -
          index;


        deadline =
          now +
          Math.max(
            30,

            (
              totalDeadline -
              now
            ) /
            remaining
          );


        timedOut =
          false;


        const childScore =
          solveExactRaw(
            childCurrent,
            childMask,
            childMoveCount
          );


        result =
          resultFromChildScore(
            childMoveCount,
            childScore
          );
      }


      results[col] =
        result;


      if (
        symmetric
      ) {
        const mirror =
          WIDTH -
          1 -
          col;


        if (
          mirror !==
            col &&
          position.canPlay(
            mirror
          )
        ) {
          results[mirror] = {
            ...result
          };
        }
      }


      deadline =
        totalDeadline;


      timedOut =
        false;
    }


    /*
      Legal columns that were not
      mathematically proven remain ?.
    */

    for (
      let col = 0;
      col < WIDTH;
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
  // SOLVE WHOLE POSITION
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


    resetSearchClock(
      timeLimit
    );


    const score =
      solveExactRaw(
        position.current,
        position.mask,
        position.moves
      );


    return (
      resultFromCurrentScore(
        position.moves,
        score
      )
    );
  }


  // ============================================================
  // HEURISTIC AI
  // ============================================================

  const heuristicTT =
    new Map();


  const HEURISTIC_TT_LIMIT =
    120000;


  function heuristic(
    current,
    mask
  ) {
    const opponent =
      mask ^
      current;


    let score =
      0;


    score +=
      popcount(
        winningPosition(
          current,
          mask
        )
      ) *
      500;


    score -=
      popcount(
        winningPosition(
          opponent,
          mask
        )
      ) *
      650;


    const center =
      COLUMN_MASKS[3];


    score +=
      popcount(
        current &
        center
      ) *
      8;


    score -=
      popcount(
        opponent &
        center
      ) *
      8;


    return score;
  }


  function aiOrderedColumns(
    current,
    mask
  ) {
    const possible =
      nonLosingMovesRaw(
        current,
        mask
      );


    if (
      possible === 0n
    ) {
      return [];
    }


    const items = [];


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
        (
          possible &
          move
        ) === 0n
      ) {
        continue;
      }


      items.push({
        col,

        score:
          popcount(
            winningPosition(
              current |
              move,
              mask
            )
          ) *
          1000 +

          20 -

          Math.abs(
            3 -
            col
          )
      });
    }


    items.sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    );


    return items.map(
      item =>
        item.col
    );
  }


  function aiNegamax(
    current,
    mask,
    moveCount,
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
      moveCount >=
      MAX_MOVES
    ) {
      return 0;
    }


    if (
      canWinNextRaw(
        current,
        mask
      )
    ) {
      return (
        AI_WIN_SCORE -
        ply
      );
    }


    const possible =
      nonLosingMovesRaw(
        current,
        mask
      );


    if (
      possible === 0n
    ) {
      return (
        -AI_WIN_SCORE +
        ply
      );
    }


    if (
      depth <= 0
    ) {
      return heuristic(
        current,
        mask
      );
    }


    const key =
      (
        current +
        mask
      ).toString() +
      ":" +
      depth;


    const cached =
      heuristicTT.get(
        key
      );


    if (
      cached !==
      undefined
    ) {
      return cached;
    }


    const cols =
      aiOrderedColumns(
        current,
        mask
      );


    const nextCurrent =
      current ^
      mask;


    let best =
      -AI_INF;


    for (
      const col
      of cols
    ) {
      const move =
        moveBitRaw(
          mask,
          col
        );


      const child =
        aiNegamax(
          nextCurrent,

          mask |
          move,

          moveCount +
          1,

          depth -
          1,

          -beta,

          -alpha,

          ply +
          1
        );


      if (
        child ===
        null
      ) {
        return null;
      }


      const score =
        -child;


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
        break;
      }
    }


    if (
      heuristicTT.size >=
      HEURISTIC_TT_LIMIT
    ) {
      heuristicTT.clear();
    }


    heuristicTT.set(
      key,
      best
    );


    return best;
  }


  // ============================================================
  // OPENING BOOK AI POLICY
  // ============================================================

  function chooseBookMove(
    values
  ) {
    const wins = [];
    const draws = [];
    const losses = [];


    for (
      let col = 0;
      col < WIDTH;
      col++
    ) {
      const value =
        values[col];


      if (
        !value ||
        !position.canPlay(
          col
        )
      ) {
        continue;
      }


      if (
        value.type ===
        EXACT_WIN
      ) {
        wins.push({
          col,
          distance:
            value.distance
        });
      }


      else if (
        value.type ===
        EXACT_DRAW
      ) {
        draws.push({
          col
        });
      }


      else if (
        value.type ===
        EXACT_LOSS
      ) {
        losses.push({
          col,
          distance:
            value.distance
        });
      }
    }


    /*
      Fastest win.
    */

    if (
      wins.length
    ) {
      wins.sort(
        (
          a,
          b
        ) =>
          a.distance -
          b.distance
      );


      return {
        col:
          wins[0].col,

        score:
          1
      };
    }


    /*
      Draw if winning is impossible.
    */

    if (
      draws.length
    ) {
      draws.sort(
        (
          a,
          b
        ) =>
          Math.abs(
            3 -
            a.col
          ) -
          Math.abs(
            3 -
            b.col
          )
      );


      return {
        col:
          draws[0].col,

        score:
          0
      };
    }


    /*
      If loss is forced, delay it.
    */

    if (
      losses.length
    ) {
      losses.sort(
        (
          a,
          b
        ) =>
          b.distance -
          a.distance
      );


      return {
        col:
          losses[0].col,

        score:
          -1
      };
    }


    return null;
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
        move:
          null,

        depth:
          0,

        score:
          0,

        nodes:
          0,

        proven:
          false
      };
    }


    /*
      Use verified perfect opening
      data when available.
    */

    const opening =
      getOpeningAnalysis(
        position
      );


    if (
      opening
    ) {
      const choice =
        chooseBookMove(
          opening
        );


      if (
        choice
      ) {
        return {
          move:
            choice.col,

          depth:
            MAX_MOVES -
            position.moves,

          score:
            choice.score,

          nodes:
            0,

          proven:
            true
        };
      }
    }


    resetSearchClock(
      timeLimit
    );


    heuristicTT.clear();


    /*
      Immediate win.
    */

    for (
      const col
      of CENTER_ORDER
    ) {
      if (
        position.canPlay(
          col
        ) &&
        position.isWinningMove(
          col
        )
      ) {
        return {
          move:
            col,

          depth:
            1,

          score:
            AI_WIN_SCORE,

          nodes,

          proven:
            true
        };
      }
    }


    const safe =
      aiOrderedColumns(
        position.current,
        position.mask
      );


    if (
      safe.length ===
      0
    ) {
      const fallback =
        CENTER_ORDER.find(
          col =>
            position.canPlay(
              col
            )
        );


      return {
        move:
          fallback ===
          undefined
            ? null
            : fallback,

        depth:
          0,

        score:
          -AI_WIN_SCORE,

        nodes,

        proven:
          true
      };
    }


    let bestMove =
      safe[0];


    let bestScore =
      -AI_INF;


    let completedDepth =
      0;


    const remaining =
      MAX_MOVES -
      position.moves;


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


      let localBest =
        bestMove;


      let localScore =
        -AI_INF;


      let alpha =
        -AI_INF;


      let finished =
        true;


      const cols =
        aiOrderedColumns(
          position.current,
          position.mask
        );


      const nextCurrent =
        position.current ^
        position.mask;


      for (
        const col
        of cols
      ) {
        if (
          performance.now() >=
          deadline
        ) {
          finished =
            false;

          break;
        }


        const move =
          moveBitRaw(
            position.mask,
            col
          );


        const child =
          aiNegamax(
            nextCurrent,

            position.mask |
            move,

            position.moves +
            1,

            depth -
            1,

            -AI_INF,

            -alpha,

            1
          );


        if (
          child ===
          null
        ) {
          finished =
            false;

          break;
        }


        const score =
          -child;


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

      depth:
        completedDepth,

      score:
        bestScore ===
        -AI_INF
          ? 0
          : bestScore,

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
      !position.canPlay(
        col
      )
    ) {
      return null;
    }


    const row =
      heights[col];


    const player =
      currentPlayer;


    const winningMove =
      position.isWinningMove(
        col
      );


    position.play(
      col
    );


    grid[row][col] =
      player;


    heights[col]--;


    const move = {
      row,
      col,
      player
    };


    history.push(
      move
    );


    redoStack = [];


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
      row < 0
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
            HEIGHT
        },

        () =>
          Array(
            WIDTH
          ).fill(
            null
          )
      );


    heights =
      Array(
        WIDTH
      ).fill(
        HEIGHT -
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


    heuristicTT.clear();


    /*
      Exact TT intentionally stays.
      Proven bounds remain valid and
      can help if a position appears
      again later.
    */
  }


  // ============================================================
  // STATE
  // ============================================================

  function getState() {
    return {
      width:
        WIDTH,

      height:
        HEIGHT,

      connect:
        4,

      grid:
        grid.map(
          row =>
            [...row]
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
    return (
      CENTER_ORDER.filter(
        col =>
          position.canPlay(
            col
          )
      )
    );
  }


  // ============================================================
  // VALIDATE
  // ============================================================

  function validate() {
    let occupied =
      0;


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
          grid[
            row
          ][
            col
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

      CONNECT:
        4,

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

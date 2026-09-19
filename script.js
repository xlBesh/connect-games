/*
  ============================================================
  CONNECT GAMES · UI CONTROLLER
  ============================================================

  Connect 4 + Connect 5

  This file controls:
  - Game switching
  - Board rendering
  - Human moves
  - AI turns
  - W / D / L analysis
  - Undo
  - Redo
  - Restart
  - Thinking time
  - Last-move highlight

  Game engines:
  - window.Connect4Engine
  - window.Connect5Engine
*/

(() => {
  "use strict";


  // ============================================================
  // ELEMENTS
  // ============================================================

  const board =
    document.getElementById("board");

  const turnText =
    document.getElementById("turn");

  const aiA =
    document.getElementById("aiA");

  const aiB =
    document.getElementById("aiB");

  const undoButton =
    document.getElementById("undo");

  const redoButton =
    document.getElementById("redo");

  const restartButton =
    document.getElementById("restart");

  const thinkTime =
    document.getElementById("thinkTime");

  const solverStatus =
    document.getElementById("solverStatus");

  const analysis =
    document.getElementById("analysis");

  const columnNumbers =
    document.getElementById("columnNumbers");

  const gameArea =
    document.getElementById("gameArea");

  const connect4Btn =
    document.getElementById("connect4Btn");

  const connect5Btn =
    document.getElementById("connect5Btn");


  // ============================================================
  // ENGINES
  // ============================================================

  const engines = {
    connect4:
      window.Connect4Engine,

    connect5:
      window.Connect5Engine
  };


  // ============================================================
  // STATE
  // ============================================================

  let activeGame =
    "connect4";

  let engine =
    engines.connect4;

  let AI_TIME_LIMIT =
    Number(
      thinkTime?.value || 700
    );

  let aiTimer = null;
  let analysisTimer = null;

  let sessionId = 0;


  // ============================================================
  // BASIC HELPERS
  // ============================================================

  function getState() {
    return engine.getState();
  }


  function isAI() {
    const state =
      getState();

    if (
      state.currentPlayer === "A"
    ) {
      return aiA.checked;
    }

    return aiB.checked;
  }


  function clearTimers() {
    clearTimeout(aiTimer);
    clearTimeout(analysisTimer);

    aiTimer = null;
    analysisTimer = null;
  }


  function updateSolverStatus(text) {
    if (solverStatus) {
      solverStatus.textContent =
        text;
    }
  }


  // ============================================================
  // GAME NAME
  // ============================================================

  function gameName() {
    return (
      activeGame === "connect4"
        ? "Connect 4"
        : "Connect 5"
    );
  }


  // ============================================================
  // SWITCH BUTTONS
  // ============================================================

  function updateGameButtons() {
    connect4Btn?.classList.toggle(
      "active",
      activeGame === "connect4"
    );

    connect5Btn?.classList.toggle(
      "active",
      activeGame === "connect5"
    );
  }


  // ============================================================
  // GAME AREA CLASS
  // ============================================================

  function updateGameAreaClass() {
    if (!gameArea) {
      return;
    }

    gameArea.classList.remove(
      "game-connect4",
      "game-connect5"
    );

    gameArea.classList.add(
      activeGame === "connect4"
        ? "game-connect4"
        : "game-connect5"
    );
  }


  // ============================================================
  // TURN TEXT
  // ============================================================

  function updateTurn() {
    const state =
      getState();


    if (state.gameOver) {
      if (state.winner) {
        turnText.textContent =
          `Player ${state.winner} wins! 🎉`;
      }

      else {
        turnText.textContent =
          "Draw!";
      }

      return;
    }


    if (
      state.currentPlayer === "A"
    ) {
      turnText.textContent =
        "Turn: Player A 🔴";
    }

    else {
      turnText.textContent =
        "Turn: Player B 🟡";
    }
  }


  // ============================================================
  // CREATE ANALYSIS CELLS
  // ============================================================

  function buildAnalysis() {
    if (!analysis) {
      return;
    }

    const state =
      getState();

    analysis.innerHTML = "";


    for (
      let col = 0;
      col < state.width;
      col++
    ) {
      const cell =
        document.createElement("div");

      cell.className =
        "analysis-cell unknown";

      cell.dataset.col =
        col;

      cell.textContent =
        state.heights[col] < 0
          ? "×"
          : "?";


      if (
        state.heights[col] < 0
      ) {
        cell.className =
          "analysis-cell closed";
      }


      analysis.appendChild(
        cell
      );
    }
  }


  // ============================================================
  // COLUMN NUMBERS
  // ============================================================

  function buildColumnNumbers() {
    if (!columnNumbers) {
      return;
    }

    const state =
      getState();

    columnNumbers.innerHTML = "";


    for (
      let col = 0;
      col < state.width;
      col++
    ) {
      const number =
        document.createElement("div");

      number.className =
        "column-number";

      number.textContent =
        col + 1;

      columnNumbers.appendChild(
        number
      );
    }
  }


  // ============================================================
  // BUILD BOARD
  // ============================================================

  function buildBoard() {
    const state =
      getState();

    board.innerHTML = "";


    for (
      let row = 0;
      row < state.height;
      row++
    ) {
      for (
        let col = 0;
        col < state.width;
        col++
      ) {
        const cell =
          document.createElement("div");

        cell.className =
          "cell";

        cell.dataset.row =
          row;

        cell.dataset.col =
          col;


        cell.addEventListener(
          "click",
          () => {
            humanMove(col);
          }
        );


        board.appendChild(
          cell
        );
      }
    }
  }


  // ============================================================
  // LAST MOVE
  // ============================================================

  function getLastMove() {
    const state =
      getState();

    if (
      state.history.length === 0
    ) {
      return null;
    }

    return state.history[
      state.history.length - 1
    ];
  }


  // ============================================================
  // RENDER BOARD
  // ============================================================

  function renderBoard() {
    const state =
      getState();

    const lastMove =
      getLastMove();


    for (
      let row = 0;
      row < state.height;
      row++
    ) {
      for (
        let col = 0;
        col < state.width;
        col++
      ) {
        const cell =
          board.querySelector(
            `[data-row="${row}"][data-col="${col}"]`
          );

        if (!cell) {
          continue;
        }


        const value =
          state.grid[row][col];


        cell.className =
          "cell";


        if (
          value === "A"
        ) {
          cell.classList.add(
            "player-a"
          );
        }


        else if (
          value === "B"
        ) {
          cell.classList.add(
            "player-b"
          );
        }


        if (
          lastMove &&
          lastMove.row === row &&
          lastMove.col === col
        ) {
          cell.classList.add(
            "last-move"
          );
        }
      }
    }
  }


  // ============================================================
  // CLEAR ANALYSIS
  // ============================================================

  function clearAnalysis() {
    const state =
      getState();

    const cells = [
      ...document.querySelectorAll(
        ".analysis-cell"
      )
    ];


    cells.forEach(
      (cell, col) => {
        if (
          state.heights[col] < 0
        ) {
          cell.textContent =
            "×";

          cell.className =
            "analysis-cell closed";
        }

        else {
          cell.textContent =
            "?";

          cell.className =
            "analysis-cell unknown";
        }
      }
    );
  }


  // ============================================================
  // SHOW ANALYSIS RESULT
  // ============================================================

  function showResult(
    col,
    result
  ) {
    const cell =
      analysis?.querySelector(
        `[data-col="${col}"]`
      );


    if (!cell) {
      return;
    }


    cell.className =
      "analysis-cell";


    if (
      !result ||
      result.type ===
        engine.constants.UNKNOWN
    ) {
      cell.textContent =
        "?";

      cell.classList.add(
        "unknown"
      );

      return;
    }


    if (
      result.type ===
      engine.constants.WIN
    ) {
      cell.textContent =
        result.distance !== null &&
        result.distance !== undefined
          ? `W ${result.distance}`
          : "W";

      cell.classList.add(
        "win"
      );

      return;
    }


    if (
      result.type ===
      engine.constants.DRAW
    ) {
      cell.textContent =
        "D";

      cell.classList.add(
        "draw"
      );

      return;
    }


    if (
      result.type ===
      engine.constants.LOSS
    ) {
      cell.textContent =
        result.distance !== null &&
        result.distance !== undefined
          ? `L ${result.distance}`
          : "L";

      cell.classList.add(
        "loss"
      );

      return;
    }


    cell.textContent =
      "?";

    cell.classList.add(
      "unknown"
    );
  }


  // ============================================================
  // RENDER
  // ============================================================

  function render() {
    renderBoard();
    updateTurn();

    const state =
      getState();


    if (
      undoButton
    ) {
      undoButton.disabled =
        state.history.length === 0;
    }


    if (
      redoButton
    ) {
      redoButton.disabled =
        state.redoCount === 0;
    }
  }


  // ============================================================
  // HUMAN MOVE
  // ============================================================

  function humanMove(col) {
    const state =
      getState();


    if (
      state.gameOver ||
      isAI()
    ) {
      return;
    }


    const move =
      engine.play(col);


    if (!move) {
      return;
    }


    clearTimers();

    render();

    clearAnalysis();


    const newState =
      getState();


    if (
      newState.gameOver
    ) {
      updateSolverStatus(
        newState.winner
          ? `Player ${newState.winner} won`
          : "Draw"
      );

      return;
    }


    continueTurn();
  }


  // ============================================================
  // CONTINUE TURN
  // ============================================================

  function continueTurn() {
    const state =
      getState();


    if (
      state.gameOver
    ) {
      return;
    }


    if (isAI()) {
      scheduleAI();
    }

    else {
      scheduleAnalysis();
    }
  }


  // ============================================================
  // AI
  // ============================================================

  function scheduleAI() {
    clearTimeout(aiTimer);
    clearTimeout(analysisTimer);

    const state =
      getState();

    const player =
      state.currentPlayer;

    const thisSession =
      sessionId;


    turnText.textContent =
      `Player ${player} is thinking... 🧠`;


    updateSolverStatus(
      "Searching..."
    );


    aiTimer =
      setTimeout(
        () => {
          if (
            thisSession !==
            sessionId
          ) {
            return;
          }

          aiMove(
            thisSession
          );
        },
        60
      );
  }


  function aiMove(thisSession) {
    const state =
      getState();


    if (
      thisSession !==
        sessionId ||
      state.gameOver ||
      !isAI()
    ) {
      return;
    }


    const result =
      engine.searchBestMove(
        AI_TIME_LIMIT
      );


    if (
      thisSession !==
      sessionId
    ) {
      return;
    }


    if (
      result.move === null ||
      result.move === undefined
    ) {
      updateTurn();
      return;
    }


    engine.play(
      result.move
    );


    const searchedNodes =
      result.nodes ??
      0;


    updateSolverStatus(
      `Depth ${result.depth} · ${Number(
        searchedNodes
      ).toLocaleString()} nodes`
    );


    render();

    clearAnalysis();


    const newState =
      getState();


    if (
      newState.gameOver
    ) {
      updateSolverStatus(
        newState.winner
          ? `Player ${newState.winner} won`
          : "Draw"
      );

      return;
    }


    continueTurn();
  }


  // ============================================================
  // ANALYSIS
  // ============================================================

  function scheduleAnalysis() {
    clearTimeout(
      analysisTimer
    );


    const thisSession =
      sessionId;


    analysisTimer =
      setTimeout(
        () => {
          if (
            thisSession !==
            sessionId
          ) {
            return;
          }

          analyzePosition(
            thisSession
          );
        },
        30
      );
  }


  function analyzePosition(
    thisSession
  ) {
    const state =
      getState();


    if (
      thisSession !==
        sessionId ||
      state.gameOver ||
      isAI()
    ) {
      return;
    }


    clearAnalysis();


    updateSolverStatus(
      "Analyzing position..."
    );


    const results =
      engine.analyze(
        AI_TIME_LIMIT
      );


    if (
      thisSession !==
      sessionId
    ) {
      return;
    }


    for (
      let col = 0;
      col < state.width;
      col++
    ) {
      if (
        state.heights[col] < 0
      ) {
        const cell =
          analysis?.querySelector(
            `[data-col="${col}"]`
          );

        if (cell) {
          cell.textContent =
            "×";

          cell.className =
            "analysis-cell closed";
        }

        continue;
      }


      showResult(
        col,
        results[col]
      );
    }


    const latestState =
      getState();


    const emptyCells =
      latestState.heights.reduce(
        (total, h) =>
          total + h + 1,
        0
      );


    updateSolverStatus(
      `Position analysis · ${emptyCells} empty cells`
    );
  }


  // ============================================================
  // UNDO
  // ============================================================

  function undo() {
    clearTimers();

    sessionId++;

    /*
      Stop AI when manually changing
      history. This matches the old
      Connect 5 behavior.
    */

    aiA.checked = false;
    aiB.checked = false;


    const move =
      engine.undo();


    if (!move) {
      render();
      return;
    }


    render();
    clearAnalysis();

    updateSolverStatus(
      "Move undone"
    );

    scheduleAnalysis();
  }


  // ============================================================
  // REDO
  // ============================================================

  function redo() {
    clearTimers();

    sessionId++;

    aiA.checked = false;
    aiB.checked = false;


    const move =
      engine.redo();


    if (!move) {
      render();
      return;
    }


    render();
    clearAnalysis();


    const state =
      getState();


    if (
      state.gameOver
    ) {
      updateSolverStatus(
        state.winner
          ? `Player ${state.winner} won`
          : "Draw"
      );

      return;
    }


    updateSolverStatus(
      "Move restored"
    );

    scheduleAnalysis();
  }


  // ============================================================
  // RESTART
  // ============================================================

  function restart() {
    clearTimers();

    sessionId++;


    aiA.checked = false;
    aiB.checked = false;


    engine.reset();


    buildBoard();
    buildAnalysis();
    buildColumnNumbers();

    render();

    updateSolverStatus(
      "Ready"
    );

    scheduleAnalysis();
  }


  // ============================================================
  // SWITCH GAME
  // ============================================================

  function switchGame(
    gameType
  ) {
    if (
      gameType !== "connect4" &&
      gameType !== "connect5"
    ) {
      return;
    }


    clearTimers();

    sessionId++;


    activeGame =
      gameType;


    engine =
      engines[
        activeGame
      ];


    aiA.checked = false;
    aiB.checked = false;


    engine.reset();


    updateGameButtons();
    updateGameAreaClass();

    buildBoard();
    buildAnalysis();
    buildColumnNumbers();

    render();


    updateSolverStatus(
      `${gameName()} ready`
    );


    scheduleAnalysis();
  }


  // ============================================================
  // THINKING TIME
  // ============================================================

  if (thinkTime) {
    thinkTime.addEventListener(
      "change",
      () => {
        AI_TIME_LIMIT =
          Number(
            thinkTime.value
          );


        clearTimers();

        sessionId++;


        updateSolverStatus(
          `Thinking time: ${AI_TIME_LIMIT} ms`
        );


        const state =
          getState();


        if (
          state.gameOver
        ) {
          return;
        }


        if (isAI()) {
          scheduleAI();
        }

        else {
          scheduleAnalysis();
        }
      }
    );
  }


  // ============================================================
  // AI CHECKBOXES
  // ============================================================

  aiA.addEventListener(
    "change",
    () => {
      clearTimers();

      sessionId++;


      const state =
        getState();


      if (
        !state.gameOver &&
        state.currentPlayer === "A"
      ) {
        if (
          aiA.checked
        ) {
          scheduleAI();
        }

        else {
          updateTurn();
          scheduleAnalysis();
        }
      }
    }
  );


  aiB.addEventListener(
    "change",
    () => {
      clearTimers();

      sessionId++;


      const state =
        getState();


      if (
        !state.gameOver &&
        state.currentPlayer === "B"
      ) {
        if (
          aiB.checked
        ) {
          scheduleAI();
        }

        else {
          updateTurn();
          scheduleAnalysis();
        }
      }
    }
  );


  // ============================================================
  // BUTTON EVENTS
  // ============================================================

  undoButton?.addEventListener(
    "click",
    undo
  );


  redoButton?.addEventListener(
    "click",
    redo
  );


  restartButton?.addEventListener(
    "click",
    restart
  );


  connect4Btn?.addEventListener(
    "click",
    () => {
      switchGame(
        "connect4"
      );
    }
  );


  connect5Btn?.addEventListener(
    "click",
    () => {
      switchGame(
        "connect5"
      );
    }
  );


  // ============================================================
  // SAFETY CHECK
  // ============================================================

  function enginesReady() {
    if (
      !engines.connect4
    ) {
      updateSolverStatus(
        "Connect 4 engine missing"
      );

      return false;
    }


    if (
      !engines.connect5
    ) {
      updateSolverStatus(
        "Connect 5 engine missing"
      );

      return false;
    }


    return true;
  }


  // ============================================================
  // START
  // ============================================================

  if (
    enginesReady()
  ) {
    switchGame(
      "connect4"
    );
  }

})();

(function () {
  // Heure de la dernière photo : le dernier commit du robot dans le dossier data.
  var shot = document.getElementById("last-shot");
  var state = document.getElementById("live-state");
  var pill = document.getElementById("live-pill");
  var url = "https://api.github.com/repos/S-oumar/velo-v-lyon/commits?path=data&per_page=1";
  var ctrl = "AbortController" in window ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
  fetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: "application/vnd.github+json" } })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (commits) {
      clearTimeout(timer);
      var date = new Date(commits[0].commit.committer.date);
      var minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
      var text = minutes < 1 ? "il y a moins d'une minute"
        : minutes < 60 ? "il y a " + minutes + " min"
        : "il y a " + Math.round(minutes / 60) + " h";
      shot.textContent = text;
      var live = minutes <= 15;
      state.textContent = live ? "En direct" : "En pause";
      pill.dataset.state = live ? "live" : "idle";
    })
    .catch(function () { clearTimeout(timer); /* on garde le lien vers les données */ });

  // Thème clair ou sombre, retenu pour la prochaine visite.
  var root = document.documentElement;
  var themeBtn = document.getElementById("theme");
  function currentTheme() {
    if (root.dataset.theme) return root.dataset.theme;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function labelTheme() { themeBtn.textContent = currentTheme() === "dark" ? "Thème clair" : "Thème sombre"; }
  try { var saved = localStorage.getItem("theme"); if (saved === "dark" || saved === "light") root.dataset.theme = saved; } catch (e) {}
  labelTheme();
  themeBtn.addEventListener("click", function () {
    var next = currentTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
    labelTheme();
  });

  // Le menu souligne la section en cours de lecture.
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) {
          a.setAttribute("aria-current", a.getAttribute("href") === "#" + entry.target.id ? "true" : "false");
        });
      });
    }, { rootMargin: "-35% 0px -60% 0px" });
    document.querySelectorAll("main section[id]").forEach(function (s) { observer.observe(s); });
  }

  // 4. Trois jeux contre mes IA, réécrites en JavaScript :
  //    Morpion (minimax complet), Puissance 4 (minimax limité + évaluation par score), Nim (stratégie du XOR).
  var arcade = document.getElementById("arcade");
  var statusEl = document.getElementById("game-status");
  var ruleEl = document.getElementById("game-rule");
  var scoreEl = document.getElementById("game-score");
  var resetBtn = document.getElementById("game-reset");
  var whyBtn = document.getElementById("game-why");
  var whyBox = document.getElementById("game-why-box");
  var whyText = document.getElementById("why-text");
  var xorWrap = document.getElementById("nim-xor");
  var xorBody = document.getElementById("xor-body");
  var tabs = Array.prototype.slice.call(arcade.querySelectorAll('[role="tab"]'));
  var levelBtns = Array.prototype.slice.call(arcade.querySelectorAll("[data-level]"));
  var level = "hard";
  var current = "ttt";
  var THINK = 450; // petite pause pour qu'on voie l'IA « réfléchir »

  function rand(list) { return list[Math.floor(Math.random() * list.length)]; }
  function fmt(n) { return n.toLocaleString("fr-FR"); }

  // Ce que tous les jeux partagent : le message, le score, le tour de l'IA.
  function setStatus(game, text) {
    game.status = text;
    if (games[current] === game) statusEl.textContent = text;
  }
  function aiTurn(game, think) {
    game.busy = true;
    game.timer = setTimeout(function () {
      game.timer = null;
      game.busy = false;
      think();
      game.render();
      refresh();
    }, THINK);
  }
  function stop(game) {
    if (game.timer) clearTimeout(game.timer); // sinon l'IA jouerait sur la nouvelle partie
    game.timer = null;
    game.busy = false;
  }
  function endGame(game, who, text) {
    game.over = true;
    game.score[who]++;
    setStatus(game, text);
    game.render();
    refresh();
  }

  // --- Morpion : minimax complet --------------------------------------------
  var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  var SVG_X = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 11 29 29M29 11 11 29"/></svg>';
  var SVG_O = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="10"/></svg>';
  var ttt = { el: document.getElementById("ttt"), rule: "Alignez trois croix avant l'IA. Vous commencez.", score: { you: 0, ai: 0, draw: 0 } };

  function tttLine(b) {
    for (var i = 0; i < LINES.length; i++) {
      var l = LINES[i];
      if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return l;
    }
    return null;
  }
  function tttFree(b) { var f = []; for (var i = 0; i < 9; i++) if (!b[i]) f.push(i); return f; }
  // L'IA (O) cherche le score le plus haut, le joueur (X) le plus bas. Gagner tôt vaut plus que gagner tard.
  function minimax(b, player, depth) {
    ttt.nodes++;
    var line = tttLine(b);
    if (line) return b[line[0]] === "O" ? 10 - depth : depth - 10;
    var free = tttFree(b);
    if (!free.length) return 0;
    var best = player === "O" ? -Infinity : Infinity;
    for (var k = 0; k < free.length; k++) {
      b[free[k]] = player;
      var v = minimax(b, player === "O" ? "X" : "O", depth + 1);
      b[free[k]] = null;
      best = player === "O" ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }
  function tttWinningMove(b, p) {
    var free = tttFree(b);
    for (var k = 0; k < free.length; k++) {
      b[free[k]] = p;
      var won = tttLine(b);
      b[free[k]] = null;
      if (won) return free[k];
    }
    return -1;
  }
  ttt.start = function () {
    stop(ttt);
    ttt.board = [null, null, null, null, null, null, null, null, null];
    ttt.over = false; ttt.win = null; ttt.lastNodes = 0;
    ttt.status = "Vous jouez les croix. Cliquez sur une case.";
  };
  ttt.pristine = function () { return !ttt.busy && tttFree(ttt.board).length === 9; };
  function tttEnd() {
    var b = ttt.board, line = tttLine(b);
    if (line) {
      ttt.win = line;
      if (b[line[0]] === "X") endGame(ttt, "you", level === "hard" ? "Vous avez gagné." : "Vous avez gagné. Essayez le niveau difficile.");
      else endGame(ttt, "ai", "L'IA aligne trois ronds et gagne. Nouvelle partie ?");
      return true;
    }
    if (!tttFree(b).length) {
      endGame(ttt, "draw", level === "hard"
        ? "Match nul. Contre une IA qui calcule toutes les suites, c'est le meilleur résultat possible."
        : "Match nul.");
      return true;
    }
    return false;
  }
  ttt.play = function (i) {
    if (ttt.busy || ttt.over || ttt.board[i]) return;
    ttt.board[i] = "X";
    if (tttEnd()) return;
    setStatus(ttt, "L'IA réfléchit…");
    ttt.render(); refresh();
    aiTurn(ttt, function () {
      var b = ttt.board, move;
      ttt.nodes = 0;
      if (level === "easy") {
        move = tttWinningMove(b, "O");
        if (move < 0) move = rand(tttFree(b));
      } else {
        var best = -Infinity, bests = [];
        tttFree(b).forEach(function (i) {
          b[i] = "O";
          var v = minimax(b, "X", 1);
          b[i] = null;
          if (v > best) { best = v; bests = [i]; } else if (v === best) bests.push(i);
        });
        move = rand(bests); // parmi les meilleurs coups, au hasard, pour varier les parties
      }
      ttt.lastNodes = ttt.nodes;
      b[move] = "O";
      if (!tttEnd()) setStatus(ttt, "L'IA a joué. À vous.");
    });
  };
  ttt.render = function () {
    ttt.el.innerHTML = "";
    ttt.board.forEach(function (v, i) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell" + (v === "X" ? " you" : v === "O" ? " ai" : "") + (ttt.win && ttt.win.indexOf(i) >= 0 ? " win" : "");
      cell.disabled = !!v || ttt.busy || ttt.over;
      cell.setAttribute("aria-label", "Ligne " + (Math.floor(i / 3) + 1) + ", colonne " + (i % 3 + 1) + (v === "X" ? " : croix" : v === "O" ? " : rond" : " : vide"));
      if (v) cell.innerHTML = v === "X" ? SVG_X : SVG_O;
      cell.addEventListener("click", function () { ttt.play(i); });
      ttt.el.appendChild(cell);
    });
  };
  ttt.why = function () {
    if (level === "easy") return "Niveau facile : l'IA gagne si elle peut le faire en un coup. Sinon, elle joue au hasard.";
    return "Minimax : avant chaque coup, l'IA joue en pensée toutes les suites possibles jusqu'à la fin de la partie, en supposant que vous jouez au mieux, puis elle choisit le coup qui lui garantit le meilleur résultat. On ne peut pas la battre, seulement faire match nul."
      + (ttt.lastNodes ? " Pour son dernier coup, elle a examiné " + fmt(ttt.lastNodes) + " positions." : "");
  };

  // --- Puissance 4 : minimax limité à 7 coups + évaluation par score ---------
  var COLS = 7, ROWS = 6, DEPTH = 7, ORDER = [3, 2, 4, 1, 5, 0, 6]; // le centre d'abord
  var c4 = { el: document.getElementById("c4"), rule: "Alignez quatre pions, en ligne, en colonne ou en diagonale. Vous commencez.", score: { you: 0, ai: 0, draw: 0 } };

  function c4Height(g, c) { for (var r = 0; r < ROWS; r++) if (!g[c][r]) return r; return ROWS; } // r = 0 en bas
  function c4Line(g, c, r, p) {
    var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < dirs.length; d++) {
      var cells = [[c, r]];
      for (var sign = -1; sign <= 1; sign += 2) {
        for (var s = 1; s < 4; s++) {
          var x = c + sign * s * dirs[d][0], y = r + sign * s * dirs[d][1];
          if (x < 0 || x >= COLS || y < 0 || y >= ROWS || g[x][y] !== p) break;
          cells.push([x, y]);
        }
      }
      if (cells.length >= 4) return cells;
    }
    return null;
  }
  // Une fenêtre = 4 cases alignées. 3 pions à moi + 1 case vide : 5 points ; 2 + 2 vides : 2 points ;
  // 3 pions adverses + 1 case vide : -4 points (une menace à surveiller).
  function windowScore(g, c, r, dc, dr, p, o) {
    var mine = 0, theirs = 0;
    for (var k = 0; k < 4; k++) {
      var v = g[c + k * dc][r + k * dr];
      if (v === p) mine++; else if (v === o) theirs++;
    }
    var empty = 4 - mine - theirs;
    if (mine === 3 && empty === 1) return 5;
    if (mine === 2 && empty === 2) return 2;
    if (theirs === 3 && empty === 1) return -4;
    return 0;
  }
  function c4Score(g, p) {
    var o = p === 2 ? 1 : 2, score = 0, c, r;
    for (r = 0; r < ROWS; r++) { if (g[3][r] === p) score += 3; else if (g[3][r] === o) score -= 3; } // bonus du centre
    for (c = 0; c < COLS; c++) {
      for (r = 0; r < ROWS; r++) {
        if (c <= COLS - 4) score += windowScore(g, c, r, 1, 0, p, o);
        if (r <= ROWS - 4) score += windowScore(g, c, r, 0, 1, p, o);
        if (c <= COLS - 4 && r <= ROWS - 4) score += windowScore(g, c, r, 1, 1, p, o);
        if (c <= COLS - 4 && r >= 3) score += windowScore(g, c, r, 1, -1, p, o);
      }
    }
    return score;
  }
  // Negamax avec élagage alpha-bêta : le score d'une position pour p est l'opposé du score pour l'adversaire.
  function negamax(g, depth, alpha, beta, p, filled) {
    c4.nodes++;
    if (filled === COLS * ROWS) return 0;
    if (depth === 0) return c4Score(g, p);
    var o = p === 2 ? 1 : 2, best = -Infinity;
    for (var k = 0; k < COLS; k++) {
      var c = ORDER[k], r = c4Height(g, c);
      if (r === ROWS) continue;
      g[c][r] = p;
      var v = c4Line(g, c, r, p) ? 100000 + depth : -negamax(g, depth - 1, -beta, -alpha, o, filled + 1);
      g[c][r] = 0;
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  function c4Legal(g) { var l = []; for (var c = 0; c < COLS; c++) if (c4Height(g, c) < ROWS) l.push(c); return l; }
  function c4WinningCol(g, p) {
    var legal = c4Legal(g);
    for (var k = 0; k < legal.length; k++) {
      var c = legal[k], r = c4Height(g, c);
      g[c][r] = p;
      var won = c4Line(g, c, r, p);
      g[c][r] = 0;
      if (won) return c;
    }
    return -1;
  }
  function c4Best(g, filled) {
    var best = -Infinity, choice = -1;
    for (var k = 0; k < COLS; k++) {
      var c = ORDER[k], r = c4Height(g, c);
      if (r === ROWS) continue;
      g[c][r] = 2;
      var v = c4Line(g, c, r, 2) ? 100000 + DEPTH : -negamax(g, DEPTH - 1, -Infinity, Infinity, 1, filled + 1);
      g[c][r] = 0;
      if (v > best) { best = v; choice = c; }
    }
    return choice;
  }
  c4.start = function () {
    stop(c4);
    c4.grid = [];
    for (var c = 0; c < COLS; c++) c4.grid.push([0, 0, 0, 0, 0, 0]);
    c4.filled = 0; c4.over = false; c4.win = null; c4.last = null; c4.lastNodes = 0;
    c4.status = "Vous jouez en bleu. Cliquez sur une colonne pour y faire tomber un pion.";
  };
  c4.pristine = function () { return !c4.busy && c4.filled === 0; };
  function c4End(c, r, p) {
    var line = c4Line(c4.grid, c, r, p);
    if (line) {
      c4.win = line;
      if (p === 1) endGame(c4, "you", level === "hard" ? "Vous avez gagné. Peu de visiteurs battent ce niveau." : "Vous avez gagné. Essayez le niveau difficile.");
      else endGame(c4, "ai", "L'IA aligne quatre pions et gagne. Nouvelle partie ?");
      return true;
    }
    if (c4.filled === COLS * ROWS) { endGame(c4, "draw", "Grille pleine : match nul."); return true; }
    return false;
  }
  c4.play = function (c) {
    if (c4.busy || c4.over) return;
    var g = c4.grid, r = c4Height(g, c);
    if (r === ROWS) return;
    g[c][r] = 1; c4.filled++; c4.last = [c, r];
    if (c4End(c, r, 1)) return;
    setStatus(c4, "L'IA réfléchit…");
    c4.render(); refresh();
    aiTurn(c4, function () {
      var col;
      c4.nodes = 0;
      if (level === "easy") {
        col = c4WinningCol(g, 2);
        if (col < 0) col = rand(c4Legal(g));
      } else {
        col = c4Best(g, c4.filled);
      }
      c4.lastNodes = c4.nodes;
      var rr = c4Height(g, col);
      g[col][rr] = 2; c4.filled++; c4.last = [col, rr];
      if (!c4End(col, rr, 2)) setStatus(c4, "L'IA a joué dans la colonne " + (col + 1) + ". À vous.");
    });
  };
  function inLine(line, c, r) {
    if (!line) return false;
    for (var k = 0; k < line.length; k++) if (line[k][0] === c && line[k][1] === r) return true;
    return false;
  }
  c4.render = function () {
    c4.el.innerHTML = "";
    for (var c = 0; c < COLS; c++) {
      (function (c) {
        var col = document.createElement("button");
        col.type = "button";
        col.className = "col";
        var full = c4Height(c4.grid, c) === ROWS;
        col.disabled = full || c4.busy || c4.over;
        col.setAttribute("aria-label", "Colonne " + (c + 1) + (full ? " : pleine" : ""));
        for (var r = ROWS - 1; r >= 0; r--) {
          var v = c4.grid[c][r], slot = document.createElement("span");
          slot.className = "slot" + (v === 1 ? " you" : v === 2 ? " ai" : "")
            + (inLine(c4.win, c, r) ? " win" : "")
            + (c4.last && c4.last[0] === c && c4.last[1] === r && !c4.win ? " last" : "");
          col.appendChild(slot);
        }
        col.addEventListener("click", function () { c4.play(c); });
        c4.el.appendChild(col);
      })(c);
    }
  };
  c4.why = function () {
    if (level === "easy") return "Niveau facile : l'IA gagne si elle peut le faire en un coup. Sinon, elle joue une colonne au hasard.";
    return "Minimax limité avec évaluation par score : la partie est trop longue pour tout calculer, alors l'IA regarde " + DEPTH + " coups à l'avance, puis note les positions. Chaque groupe de 4 cases alignées rapporte 5 points s'il contient 3 de ses pions et une case vide, 2 points pour 2 pions ; une menace de 3 pions adverses coûte 4 points, et la colonne du centre donne un bonus. L'élagage alpha-bêta lui évite d'explorer les suites déjà moins bonnes."
      + (c4.lastNodes ? " Pour son dernier coup, elle a examiné " + fmt(c4.lastNodes) + " positions." : "");
  };

  // --- Nim : la stratégie gagnante du XOR ------------------------------------
  var START = [1, 3, 5];
  var nim = { el: document.getElementById("piles"), rule: "Celui qui prend la dernière allumette gagne. Vous commencez.", score: { you: 0, ai: 0 } };
  function nimSum(p) { return p.reduce(function (a, b) { return a ^ b; }, 0); }
  function total(p) { return p.reduce(function (a, b) { return a + b; }, 0); }
  function bin(n) { return ("000" + n.toString(2)).slice(-3); }
  function sticks(n) { return n + (n > 1 ? " allumettes" : " allumette"); }
  nim.start = function () {
    stop(nim);
    nim.piles = START.slice();
    nim.over = false;
    nim.status = "Cliquez sur une allumette : elle et toutes celles à sa droite sont retirées du tas.";
  };
  nim.pristine = function () { return !nim.busy && total(nim.piles) === total(START); };
  nim.play = function (i, keep) {
    if (nim.busy || nim.over) return;
    var taken = nim.piles[i] - keep;
    nim.piles[i] = keep;
    if (total(nim.piles) === 0) { endGame(nim, "you", "Vous avez pris la dernière allumette : vous avez gagné."); return; }
    setStatus(nim, "Vous avez retiré " + sticks(taken) + " du tas " + (i + 1) + ". L'IA réfléchit…");
    nim.render(); refresh();
    aiTurn(nim, function () {
      var p = nim.piles, s = nimSum(p), k, keepAi;
      if (level === "hard" && s !== 0) {
        for (k = 0; k < p.length; k++) if ((p[k] ^ s) < p[k]) break; // ramène le XOR à 0
        keepAi = p[k] ^ s;
      } else {
        var choices = [];
        p.forEach(function (n, j) { if (n > 0) choices.push(j); });
        k = rand(choices);
        keepAi = level === "hard" ? p[k] - 1 : Math.floor(Math.random() * p[k]);
      }
      var takenAi = p[k] - keepAi;
      p[k] = keepAi;
      if (total(p) === 0) endGame(nim, "ai", "L'IA prend la dernière allumette et gagne. Ouvrez « Comment l'IA réfléchit » pour comprendre.");
      else setStatus(nim, "L'IA a retiré " + sticks(takenAi) + " du tas " + (k + 1) + ". À vous.");
    });
  };
  function lift(box, from, on) {
    var ms = box.querySelectorAll(".match");
    for (var k = 0; k < ms.length; k++) ms[k].classList.toggle("lift", on && k >= from);
  }
  nim.render = function () {
    nim.el.innerHTML = "";
    nim.piles.forEach(function (count, i) {
      var row = document.createElement("div"), label = document.createElement("span"), box = document.createElement("div");
      row.className = "pile"; label.className = "pile-label"; box.className = "matches";
      label.textContent = "Tas " + (i + 1);
      if (count === 0) { var e = document.createElement("span"); e.className = "empty"; e.textContent = "vide"; box.appendChild(e); }
      for (var j = 0; j < count; j++) {
        (function (j) {
          var b = document.createElement("button");
          b.type = "button"; b.className = "match";
          b.disabled = nim.busy || nim.over;
          b.setAttribute("aria-label", "Tas " + (i + 1) + " : retirer " + sticks(count - j));
          b.addEventListener("mouseenter", function () { lift(box, j, true); });
          b.addEventListener("mouseleave", function () { lift(box, j, false); });
          b.addEventListener("click", function () { nim.play(i, j); });
          box.appendChild(b);
        })(j);
      }
      row.appendChild(label); row.appendChild(box);
      nim.el.appendChild(row);
    });
    xorBody.innerHTML = nim.piles.map(function (n, i) { return "<tr><td>Tas " + (i + 1) + "</td><td>" + n + "</td><td>" + bin(n) + "</td></tr>"; }).join("")
      + '<tr class="sum"><td>XOR</td><td>' + nimSum(nim.piles) + "</td><td>" + bin(nimSum(nim.piles)) + "</td></tr>";
  };
  nim.why = function () {
    if (level === "easy") return "Niveau facile : l'IA retire un nombre d'allumettes au hasard.";
    return nimSum(nim.piles) === 0
      ? "Stratégie du XOR : on écrit chaque tas en binaire et on fait le XOR des tas. Il vaut 0 ici : celui qui doit jouer est en position perdante si l'adversaire joue parfaitement."
      : "Stratégie du XOR : on écrit chaque tas en binaire et on fait le XOR des tas. Il ne vaut pas 0 ici : celui qui joue peut gagner, en ramenant ce XOR à 0 à chaque coup. C'est ce que fait mon IA.";
  };

  // --- L'interface commune -----------------------------------------------------
  var games = { ttt: ttt, c4: c4, nim: nim };
  function refresh() {
    var g = games[current];
    ruleEl.textContent = g.rule;
    statusEl.textContent = g.status;
    resetBtn.disabled = g.pristine();
    scoreEl.textContent = "Vous " + g.score.you + " · IA " + g.score.ai + ("draw" in g.score ? " · Nuls " + g.score.draw : "");
    whyText.textContent = g.why();
    xorWrap.hidden = current !== "nim" || level === "easy";
  }
  function show(name, focus) {
    current = name;
    tabs.forEach(function (t) {
      var on = t.dataset.game === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    refresh();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { show(t.dataset.game); });
    t.addEventListener("keydown", function (e) {
      var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (step) { e.preventDefault(); show(tabs[(i + step + tabs.length) % tabs.length].dataset.game, true); }
    });
  });
  levelBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.level === level) return;
      level = b.dataset.level;
      levelBtns.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      var g = games[current];
      g.start(); g.render();
      setStatus(g, (level === "hard" ? "Niveau difficile. " : "Niveau facile. ") + g.status);
      refresh();
    });
  });
  resetBtn.addEventListener("click", function () {
    var g = games[current];
    g.start(); g.render(); refresh();
  });
  whyBtn.addEventListener("click", function () {
    var open = whyBox.hidden;
    whyBox.hidden = !open;
    whyBtn.setAttribute("aria-expanded", String(open));
    whyBtn.textContent = open ? "Masquer l'explication" : "Comment l'IA réfléchit";
  });
  [ttt, c4, nim].forEach(function (g) { g.start(); g.render(); });
  show("ttt");

  // Copier l'adresse e-mail.
  var button = document.getElementById("copy-mail");
  var mail = document.getElementById("mail");
  button.addEventListener("click", function () {
    var done = function (label) {
      button.textContent = label;
      setTimeout(function () { button.textContent = "Copier l'adresse"; }, 2000);
    };
    var select = function () {
      var range = document.createRange();
      range.selectNodeContents(mail);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      done("Adresse sélectionnée");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(mail.textContent).then(function () { done("Adresse copiée"); }, select);
    } else {
      select();
    }
  });
})();

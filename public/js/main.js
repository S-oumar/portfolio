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

  // 4. Le jeu de Nim contre la version JavaScript de mon IA difficile.
  var START = [1, 3, 5];
  var piles, busy, over;
  var pilesEl = document.getElementById("piles");
  var statusEl = document.getElementById("nim-status");
  var xorBody = document.getElementById("xor-body");
  var xorText = document.getElementById("xor-text");
  var whyBtn = document.getElementById("nim-why");
  var xorBox = document.getElementById("nim-xor");

  function nimSum(p) { return p.reduce(function (a, b) { return a ^ b; }, 0); }
  function total(p) { return p.reduce(function (a, b) { return a + b; }, 0); }
  function bin(n) { return ("000" + n.toString(2)).slice(-3); }
  function plural(n) { return n + (n > 1 ? " allumettes" : " allumette"); }

  function renderXor() {
    var rows = piles.map(function (n, i) { return "<tr><td>Tas " + (i + 1) + "</td><td>" + n + "</td><td>" + bin(n) + "</td></tr>"; }).join("");
    var s = nimSum(piles);
    xorBody.innerHTML = rows + '<tr class="sum"><td>XOR</td><td>' + s + "</td><td>" + bin(s) + "</td></tr>";
    xorText.textContent = s === 0
      ? "Le XOR des tas vaut 0 : celui qui doit jouer est en position perdante si l'adversaire joue parfaitement."
      : "Le XOR des tas ne vaut pas 0 : celui qui joue peut gagner, en ramenant ce XOR à 0 à chaque coup. C'est ce que fait mon IA.";
  }

  function render() {
    pilesEl.innerHTML = "";
    piles.forEach(function (count, i) {
      var row = document.createElement("div");
      row.className = "pile";
      var label = document.createElement("span");
      label.className = "pile-label";
      label.textContent = "Tas " + (i + 1);
      var box = document.createElement("div");
      box.className = "matches";
      if (count === 0) {
        var e = document.createElement("span");
        e.className = "empty";
        e.textContent = "vide";
        box.appendChild(e);
      }
      for (var j = 0; j < count; j++) {
        (function (j) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "match";
          b.disabled = busy || over;
          var taken = count - j;
          b.setAttribute("aria-label", "Tas " + (i + 1) + " : retirer " + plural(taken));
          b.addEventListener("mouseenter", function () { highlight(box, j, true); });
          b.addEventListener("mouseleave", function () { highlight(box, j, false); });
          b.addEventListener("click", function () { play(i, j); });
          box.appendChild(b);
        })(j);
      }
      row.appendChild(label);
      row.appendChild(box);
      pilesEl.appendChild(row);
    });
    renderXor();
  }

  function highlight(box, from, on) {
    var ms = box.querySelectorAll(".match");
    for (var k = 0; k < ms.length; k++) ms[k].classList.toggle("lift", on && k >= from);
  }

  function play(i, keep) {
    if (busy || over) return;
    var taken = piles[i] - keep;
    piles[i] = keep;
    if (total(piles) === 0) {
      over = true;
      statusEl.textContent = "Vous avez pris la dernière allumette : vous avez gagné. Peu de visiteurs y arrivent.";
      render();
      return;
    }
    busy = true;
    statusEl.textContent = "Vous avez retiré " + plural(taken) + " du tas " + (i + 1) + ". L'IA réfléchit…";
    render();
    setTimeout(aiMove, 700);
  }

  function aiMove() {
    var s = nimSum(piles), i, keep;
    if (s !== 0) {
      for (i = 0; i < piles.length; i++) if ((piles[i] ^ s) < piles[i]) break;
      keep = piles[i] ^ s;
    } else {
      var choices = [];
      piles.forEach(function (n, k) { if (n > 0) choices.push(k); });
      i = choices[Math.floor(Math.random() * choices.length)];
      keep = piles[i] - 1;
    }
    var taken = piles[i] - keep;
    piles[i] = keep;
    busy = false;
    if (total(piles) === 0) {
      over = true;
      statusEl.textContent = "L'IA a pris la dernière allumette du tas " + (i + 1) + " et gagne. Cliquez sur « Voir le calcul de l'IA » pour comprendre comment.";
    } else {
      statusEl.textContent = "L'IA a retiré " + plural(taken) + " du tas " + (i + 1) + ". À vous.";
    }
    render();
  }

  function reset() {
    piles = START.slice();
    busy = false;
    over = false;
    statusEl.textContent = "À vous de commencer. Cliquez sur une allumette : elle et toutes celles à sa droite sont retirées du tas.";
    render();
  }

  whyBtn.addEventListener("click", function () {
    var open = xorBox.hidden;
    xorBox.hidden = !open;
    whyBtn.setAttribute("aria-expanded", String(open));
    whyBtn.textContent = open ? "Masquer le calcul" : "Voir le calcul de l'IA";
  });
  document.getElementById("nim-reset").addEventListener("click", reset);
  reset();

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

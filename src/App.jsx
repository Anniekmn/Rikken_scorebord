import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus, Trash2, Trophy, RotateCcw, AlertTriangle, Check, Users,
  History, Wand2, Armchair, Sparkles, Shuffle, Link2,
} from "lucide-react";
import { supabase } from "./supabaseClient";

// Elk spel heeft een eigen code (in de link als ?spel=CODE), zodat meerdere
// groepen tegelijk en los van elkaar kunnen spelen. Geen code in de link?
// Dan gebruiken we "default" — zo blijft een eerder gestart spel gewoon
// bereikbaar zonder dat er iets breekt.
function getGameIdFromUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get("spel");
    return code ? code.toUpperCase() : "default";
  } catch (e) {
    return "default";
  }
}
function setGameIdInUrl(code) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("spel", code);
    window.history.pushState({}, "", url);
  } catch (e) {
    // negeren — de app werkt ook zonder dat de link wordt bijgewerkt
  }
}
function genGameCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // zonder 0/O en 1/I/L
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function localKeyFor(gameId) {
  return `rikken-local-cache-${gameId}`;
}

// ---- Puntentabel (eigen versie van de gebruiker) --------------------------
// Index van elke array = aantal gehaalde slagen (0 t/m 13).
const POINTS = {
  Rik: [-90, -80, -70, -60, -50, -40, -30, -20, 10, 20, 30, 40, 50, 120],
  Troeba: [-100, -90, -80, -70, -60, -50, -40, -30, 20, 30, 40, 50, 60, 120],
  "8 Alleen": [-285, -255, -225, -195, -165, -135, -105, -75, 45, 75, 105, 135, 165, 195],
  "9 Alleen": [-360, -330, -300, -270, -240, -210, -180, -150, -120, 90, 120, 150, 180, 210],
  "10 Alleen": [-480, -450, -420, -390, -360, -330, -300, -270, -240, -210, 180, 210, 240, 270],
  "11 Alleen": [-690, -660, -630, -600, -570, -540, -510, -480, -450, -420, -390, 360, 390, 420],
  "12 Alleen": [-1080, -1050, -1020, -990, -960, -930, -900, -870, -840, -810, -780, -750, 720, 750],
  "13 Alleen": [-1830, -1800, -1770, -1740, -1710, -1680, -1650, -1620, -1590, -1560, -1530, -1500, -1470, 1440],
  Piek: [-105, 75, -105, -135, -165, -195, -225, -255, -285, -315, -345, -375, -405, -435],
  Misère: [150, -180, -210, -240, -270, -300, -330, -360, -390, -420, -450, -480, -510, -540],
  "Open Misère": [300, -330, -360, -390, -420, -450, -480, -510, -540, -570, -600, -630, -660, -690],
  "Open Misère met een Praatje": [450, -480, -510, -540, -570, -600, -630, -660, -690, -720, -750, -780, -810, -840],
};

// type: "maat" = altijd medespeler verplicht · "solo" = alleen spelen verplicht
// "multi" = 1 of 2 spelers kunnen dit tegelijk bieden (base = puntenwaarde bij 2 bieders)
const SPELSOORTEN = [
  { label: "Rik", tableKey: "Rik", type: "maat" },
  { label: "Troeba", tableKey: "Troeba", type: "maat" },
  { label: "8 Alleen", tableKey: "8 Alleen", type: "solo" },
  { label: "9 Alleen", tableKey: "9 Alleen", type: "solo" },
  { label: "10 Alleen", tableKey: "10 Alleen", type: "solo" },
  { label: "11 Alleen", tableKey: "11 Alleen", type: "solo" },
  { label: "12 Alleen", tableKey: "12 Alleen", type: "solo" },
  { label: "13 Alleen", tableKey: "13 Alleen", type: "solo" },
  { label: "Piek", tableKey: "Piek", type: "multi", base: 75 },
  { label: "Misère", tableKey: "Misère", type: "multi", base: 150 },
  { label: "Open Misère", tableKey: "Open Misère", type: "solo" },
  { label: "Open Misère met een Praatje", tableKey: "Open Misère met een Praatje", type: "solo" },
];

const PIEKEN_TABEL = { 1: { s: 75, f: -25 }, 2: { s: 35, f: -35 }, 3: { s: 25, f: -75 } };
const VIJF_FAIL = { 1: -75, 2: -35, 3: -25 };


function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function loadFont() {
  if (document.getElementById("rikken-fonts")) return;
  const link = document.createElement("link");
  link.id = "rikken-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(link);
}

export default function RikkenScoreboard() {
  const [gameId, setGameId] = useState(() => getGameIdFromUrl());
  const [showGameSwitcher, setShowGameSwitcher] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [switching, setSwitching] = useState(false);

  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState([
    { id: uid(), name: "Speler 1" },
    { id: uid(), name: "Speler 2" },
    { id: uid(), name: "Speler 3" },
    { id: uid(), name: "Speler 4" },
  ]);
  const [rounds, setRounds] = useState([]);
  const [tab, setTab] = useState("spelers");
  const [saveState, setSaveState] = useState("idle");
  const [dealerId, setDealerId] = useState("");
  const didLoad = useRef(false);

  // -- nieuwe ronde state --
  const [mode, setMode] = useState("bod"); // bod | pas | handmatig
  const [manualActief, setManualActief] = useState(null); // null = automatisch volgens deler
  const [spelsoortIdx, setSpelsoortIdx] = useState(0);
  const [rikker, setRikker] = useState("");
  const [maat, setMaat] = useState("");
  const [slagen, setSlagen] = useState(8);
  const [multiBidders, setMultiBidders] = useState([]); // ids, max 2, voor Piek/Misère
  const [multiSucces, setMultiSucces] = useState({}); // id -> bool

  // "Iedereen past"
  const [piekSucces, setPiekSucces] = useState(null); // ids die pieken geslaagd zijn; null = nog niet gebruikt, [] = niemand
  const [schoppenVrouw, setSchoppenVrouw] = useState("");
  const [schoppenLaatste, setSchoppenLaatste] = useState("");
  const [vijfGeslaagd, setVijfGeslaagd] = useState(null); // ids die wél 2 of 5 slagen haalden; null = nog niet gebruikt, [] = niemand

  const [manualDeltas, setManualDeltas] = useState({});
  const [manualLabel, setManualLabel] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmNewGame, setConfirmNewGame] = useState(false);

  useEffect(() => {
    loadFont();
    setLoading(true);
    didLoad.current = false;
    (async () => {
      let loadedFromServer = false;
      try {
        const { data, error } = await supabase
          .from("rikken_state")
          .select("data")
          .eq("id", gameId)
          .maybeSingle();
        if (!error && data && data.data) {
          applyLoadedState(data.data);
          localStorage.setItem(localKeyFor(gameId), JSON.stringify(data.data));
          loadedFromServer = true;
        }
      } catch (e) {
        // geen internet of Supabase niet bereikbaar — hieronder valt terug op lokale kopie
      }
      if (!loadedFromServer) {
        try {
          const cached = localStorage.getItem(localKeyFor(gameId));
          if (cached) applyLoadedState(JSON.parse(cached));
        } catch (e) {
          // ook geen lokale kopie — begin gewoon met een leeg spel
        }
      }
      setLoading(false);
      didLoad.current = true;
    })();
  }, [gameId]);

  function applyLoadedState(saved) {
    setPlayers(
      saved.players?.length
        ? saved.players
        : [
            { id: uid(), name: "Speler 1" },
            { id: uid(), name: "Speler 2" },
            { id: uid(), name: "Speler 3" },
            { id: uid(), name: "Speler 4" },
          ]
    );
    setRounds(saved.rounds || []);
    setDealerId(saved.dealerId || "");
    setTab(saved.rounds?.length ? "geschiedenis" : saved.players?.length ? "ronde" : "spelers");
  }

  async function syncToSupabase(id, snapshot) {
    try {
      const { error } = await supabase.from("rikken_state").upsert({
        id,
        data: snapshot,
        updated_at: new Date().toISOString(),
      });
      setSaveState(error ? "offline" : "saved");
    } catch (e) {
      setSaveState("offline");
    }
  }

  useEffect(() => {
    if (!didLoad.current) return;
    const snapshot = { players, rounds, dealerId };
    // altijd meteen lokaal bewaren, ook zonder internet
    try {
      localStorage.setItem(localKeyFor(gameId), JSON.stringify(snapshot));
    } catch (e) {
      // opslag vol of niet beschikbaar — negeren, Supabase-sync is de hoofdweg
    }
    setSaveState("saving");
    const t = setTimeout(() => syncToSupabase(gameId, snapshot), 400);
    return () => clearTimeout(t);
  }, [players, rounds, dealerId, gameId]);

  // zodra het apparaat weer online komt, meteen proberen de laatste stand te syncen
  useEffect(() => {
    function handleOnline() {
      if (!didLoad.current) return;
      syncToSupabase(gameId, { players, rounds, dealerId });
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [players, rounds, dealerId, gameId]);

  async function startNewSharedGame() {
    setSwitching(true);
    const code = genGameCode();
    const defaultPlayers = [
      { id: uid(), name: "Speler 1" },
      { id: uid(), name: "Speler 2" },
      { id: uid(), name: "Speler 3" },
      { id: uid(), name: "Speler 4" },
    ];
    try {
      await supabase.from("rikken_state").upsert({
        id: code,
        data: { players: defaultPlayers, rounds: [], dealerId: defaultPlayers[0].id },
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      // ook zonder internet gewoon lokaal verder kunnen — sync volgt later vanzelf
    }
    setGameIdInUrl(code);
    setGameId(code);
    setShowGameSwitcher(false);
    setSwitching(false);
  }

  async function joinSharedGame() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    setJoinError("");
    setSwitching(true);
    try {
      const { data, error } = await supabase.from("rikken_state").select("id").eq("id", code).maybeSingle();
      if (!error && !data) {
        setJoinError("Deze spelcode bestaat niet. Controleer 'm of start een nieuw spel.");
        setSwitching(false);
        return;
      }
    } catch (e) {
      // geen internet — toch proberen te openen, kan lokaal al gecached staan
    }
    setGameIdInUrl(code);
    setGameId(code);
    setShowGameSwitcher(false);
    setJoinCodeInput("");
    setSwitching(false);
  }

  // deler geldig houden: standaard de eerste speler, tenzij handmatig gekozen
  useEffect(() => {
    if (players.length === 0) return;
    if (!players.some((p) => p.id === dealerId)) {
      setDealerId(players[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  function advanceDealer() {
    if (players.length === 0) return;
    const idx = players.findIndex((p) => p.id === dealerId);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % players.length;
    setDealerId(players[nextIdx].id);
  }

  const totals = useMemo(() => {
    const t = {};
    players.forEach((p) => (t[p.id] = 0));
    rounds.forEach((r) => {
      players.forEach((p) => {
        t[p.id] = (t[p.id] || 0) + (r.deltas[p.id] || 0);
      });
    });
    return t;
  }, [players, rounds]);

  const ranking = useMemo(
    () => [...players].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0)),
    [players, totals]
  );

  function addPlayer() {
    if (players.length >= 6) return;
    setPlayers([...players, { id: uid(), name: `Speler ${players.length + 1}` }]);
  }
  function removePlayer(id) {
    if (players.length <= 2) return;
    if (rounds.length > 0 && confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    setPlayers(players.filter((p) => p.id !== id));
    setManualActief((a) => (a === null ? a : a.filter((x) => x !== id)));
    setRikker((r) => (r === id ? "" : r));
    setMaat((m) => (m === id ? "" : m));
    setMultiBidders((a) => a.filter((x) => x !== id));
    setPiekSucces((a) => (a === null ? a : a.filter((x) => x !== id)));
    setVijfGeslaagd((a) => (a === null ? a : a.filter((x) => x !== id)));
    setSchoppenVrouw((v) => (v === id ? "" : v));
    setSchoppenLaatste((v) => (v === id ? "" : v));
  }
  function renamePlayer(id, name) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, name } : p)));
  }
  function nameOf(id) {
    return players.find((p) => p.id === id)?.name || "?";
  }
  function mergeDeltas(...maps) {
    const d = {};
    players.forEach((p) => (d[p.id] = 0));
    maps.forEach((m) => players.forEach((p) => (d[p.id] += m[p.id] || 0)));
    return d;
  }

  // Wie speelt deze ronde? Bij >4 spelers slaat de deler over, de 4 spelers
  // daarna (in spelvolgorde, rond gaand) spelen, de rest zit ook over.
  // Doet de gebruiker niets, dan geldt dit automatisch; handmatig aan/uitvinken
  // overschrijft dit voor de huidige ronde (manualActief = null betekent automatisch).
  const autoActiefIds = useMemo(() => {
    const n = players.length;
    if (n === 0) return [];
    if (n <= 4) return players.map((p) => p.id);
    const dealerIdx = players.findIndex((p) => p.id === dealerId);
    const start = dealerIdx === -1 ? 0 : dealerIdx;
    const ids = [];
    for (let i = 1; i <= 4; i++) {
      ids.push(players[(start + i) % n].id);
    }
    return ids;
  }, [players, dealerId]);
  const isHandmatigeSelectie = manualActief !== null;
  const actiefIds = isHandmatigeSelectie ? manualActief : autoActiefIds;
  const actiefPlayers = players.filter((p) => actiefIds.includes(p.id));
  const zitters = players.filter((p) => !actiefIds.includes(p.id));
  const genoegActief = actiefPlayers.length === 4;

  function toggleActief(id) {
    setManualActief((current) => {
      const base = current === null ? autoActiefIds : current;
      if (base.includes(id)) return base.filter((x) => x !== id);
      if (base.length >= 4) return base;
      return [...base, id];
    });
  }

  // -- Bod-ronde: automatische berekening --------------------------------
  const spel = SPELSOORTEN[spelsoortIdx];
  const slagenWaarde = POINTS[spel.tableKey] ? POINTS[spel.tableKey][slagen] : 0;
  const isVerlies = slagenWaarde < 0;

  function toggleMultiBidder(id) {
    setMultiBidders((a) => {
      if (a.includes(id)) return a.filter((x) => x !== id);
      if (a.length >= 2) return a;
      return [...a, id];
    });
  }

  function computeBodDeltas() {
    const d = {};
    players.forEach((p) => (d[p.id] = 0));
    if (spel.type === "maat") {
      if (!rikker || !maat) return d;
      // rikker en maat betalen/ontvangen allebei het volle tabelbedrag
      const opp = actiefPlayers.filter((p) => p.id !== rikker && p.id !== maat);
      opp.forEach((p) => (d[p.id] = -slagenWaarde));
      d[rikker] = slagenWaarde;
      d[maat] = slagenWaarde;
    } else if (spel.type === "solo") {
      if (!rikker) return d;
      // tabelwaarde is het totaal voor de winnaar, verdeeld over de 3 tegenstanders
      const opp = actiefPlayers.filter((p) => p.id !== rikker);
      opp.forEach((p) => (d[p.id] = -slagenWaarde / 3));
      d[rikker] = slagenWaarde;
    } else if (spel.type === "multi") {
      if (multiBidders.length === 1) {
        const bidder = multiBidders[0];
        const opp = actiefPlayers.filter((p) => p.id !== bidder);
        opp.forEach((p) => (d[p.id] = -slagenWaarde / 3));
        d[bidder] = slagenWaarde;
      } else if (multiBidders.length === 2) {
        const [b1, b2] = multiBidders;
        const opp = actiefPlayers.filter((p) => !multiBidders.includes(p.id));
        const s1 = !!multiSucces[b1];
        const s2 = !!multiSucces[b2];
        const k = (s1 ? 1 : 0) + (s2 ? 1 : 0);
        const base = spel.base;
        if (k === 0) {
          d[b1] = -base;
          d[b2] = -base;
          opp.forEach((p) => (d[p.id] = base));
        } else if (k === 2) {
          d[b1] = base;
          d[b2] = base;
          opp.forEach((p) => (d[p.id] = -base));
        } else {
          d[b1] = s1 ? base : -base;
          d[b2] = s2 ? base : -base;
          opp.forEach((p) => (d[p.id] = 0));
        }
      }
    }
    return d;
  }
  const bodDeltas = computeBodDeltas();
  const bodKlaar =
    spel.type === "maat"
      ? !!(rikker && maat)
      : spel.type === "solo"
      ? !!rikker
      : multiBidders.length === 1 || multiBidders.length === 2;

  // -- Iedereen past: verplicht pieken / schoppen mie / 2 of 5 slagen ----
  const piekActief = piekSucces !== null;
  function verplichtPiekenDeltas() {
    const d = {};
    players.forEach((p) => (d[p.id] = 0));
    if (!piekActief) return d;
    const k = piekSucces.length;
    if (k === 0) return d; // niemand: 0 punten voor iedereen
    const t = PIEKEN_TABEL[k];
    if (!t) return d;
    actiefPlayers.forEach((p) => (d[p.id] = piekSucces.includes(p.id) ? t.s : t.f));
    return d;
  }
  function schoppenMieDeltas() {
    const d = {};
    players.forEach((p) => (d[p.id] = 0));
    if (!schoppenVrouw || !schoppenLaatste) return d;
    if (schoppenVrouw === schoppenLaatste) {
      actiefPlayers.forEach((p) => (d[p.id] = p.id === schoppenVrouw ? -75 : 25));
    } else {
      actiefPlayers.forEach((p) => {
        if (p.id === schoppenVrouw || p.id === schoppenLaatste) d[p.id] = -35;
        else d[p.id] = 35;
      });
    }
    return d;
  }
  const vijfActief = vijfGeslaagd !== null;
  const vijfFailerIds = vijfActief ? actiefPlayers.filter((p) => !vijfGeslaagd.includes(p.id)).map((p) => p.id) : [];
  function vijfSlagenDeltas() {
    const d = {};
    players.forEach((p) => (d[p.id] = 0));
    if (!vijfActief) return d;
    const f = vijfFailerIds.length;
    if (f === 0 || f === 4) return d; // iedereen geslaagd, of niemand: 0 punten voor iedereen
    const failVal = VIJF_FAIL[f];
    if (failVal === undefined) return d;
    const winVal = (f * Math.abs(failVal)) / (4 - f);
    actiefPlayers.forEach((p) => (d[p.id] = vijfFailerIds.includes(p.id) ? failVal : winVal));
    return d;
  }

  // Slechts 1 van de 3 "iedereen past"-biedingen per ronde; zodra je er één
  // invult blokkeren de andere twee totdat je 'm wist.
  const piekTouched = piekActief;
  const schoppenTouched = !!schoppenVrouw || !!schoppenLaatste;
  const vijfTouched = vijfActief;
  const actievePasSoort = piekTouched ? "piek" : schoppenTouched ? "schoppen" : vijfTouched ? "vijf" : null;

  const passDeltas =
    actievePasSoort === "piek"
      ? verplichtPiekenDeltas()
      : actievePasSoort === "schoppen"
      ? schoppenMieDeltas()
      : actievePasSoort === "vijf"
      ? vijfSlagenDeltas()
      : mergeDeltas();
  const passActief =
    actievePasSoort === "piek"
      ? piekActief
      : actievePasSoort === "schoppen"
      ? !!(schoppenVrouw && schoppenLaatste)
      : actievePasSoort === "vijf"
      ? vijfActief
      : false;

  function resetRondeForm() {
    setManualActief(null);
    setRikker("");
    setMaat("");
    setSlagen(8);
    setMultiBidders([]);
    setMultiSucces({});
    setPiekSucces(null);
    setSchoppenVrouw("");
    setSchoppenLaatste("");
    setVijfGeslaagd(null);
    setManualDeltas({});
    setManualLabel("");
  }

  function saveRound(spelsoortLabel, deltas) {
    const clean = {};
    players.forEach((p) => (clean[p.id] = Number(deltas[p.id]) || 0));
    setRounds([...rounds, { id: uid(), spelsoort: spelsoortLabel, deltas: clean, ts: Date.now() }]);
    advanceDealer();
    resetRondeForm();
    setTab("geschiedenis");
  }

  function deleteRound(id) {
    setRounds(rounds.filter((r) => r.id !== id));
  }

  function nieuwSpel() {
    if (!confirmNewGame) {
      setConfirmNewGame(true);
      return;
    }
    setConfirmNewGame(false);
    setRounds([]);
    if (players.length > 0) setDealerId(players[0].id);
    resetRondeForm();
    setTab("spelers");
  }

  const manualSum = players.reduce((s, p) => s + (Number(manualDeltas[p.id]) || 0), 0);

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingCard}>Bord wordt gedekt…</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{`
        * { box-sizing: border-box; }
        .rk-input:focus, .rk-select:focus, .rk-num:focus {
          outline: 2px solid #C7A542; outline-offset: 1px;
        }
        .rk-btn:focus-visible, .rk-tab:focus-visible, .rk-chip:focus-visible {
          outline: 2px solid #C7A542; outline-offset: 2px;
        }
        @media (max-width: 640px) {
          .rk-hide-mobile { display: none !important; }
        }
      `}</style>

      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.suitRow}>♠ ♥ ♦ ♣</div>
          <h1 style={styles.title}>Rikken Scorebord</h1>
          <div style={styles.sub}>
            {saveState === "saving"
              ? "opslaan…"
              : saveState === "offline"
              ? "offline — lokaal bewaard"
              : "bijgewerkt"}
          </div>
          <button
            className="rk-btn"
            style={styles.gameCodeBtn}
            onClick={() => setShowGameSwitcher((s) => !s)}
          >
            <Link2 size={12} style={{ marginRight: 5 }} />
            Spel: {gameId} · wisselen
          </button>
          {showGameSwitcher && (
            <div style={styles.switcherBox}>
              <p style={styles.switcherHint}>
                Deel deze code (of de link) zodat anderen aan dezelfde stand
                meewerken.
              </p>
              <button style={styles.switcherPrimaryBtn} onClick={startNewSharedGame} disabled={switching}>
                Nieuw spel voor andere groep starten
              </button>
              <div style={styles.switcherRow}>
                <input
                  className="rk-input"
                  style={styles.switcherInput}
                  placeholder="Spelcode invoeren…"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  maxLength={8}
                />
                <button style={styles.switcherJoinBtn} onClick={joinSharedGame} disabled={switching}>
                  Openen
                </button>
              </div>
              {joinError && (
                <p style={styles.switcherError}>
                  <AlertTriangle size={13} style={{ marginRight: 5, flexShrink: 0 }} />
                  {joinError}
                </p>
              )}
            </div>
          )}
        </header>

        <nav style={styles.tabs}>
          {[
            { id: "spelers", label: "Spelers", icon: Users },
            { id: "ronde", label: "Nieuwe ronde", icon: Wand2 },
            { id: "geschiedenis", label: "Stand", icon: History },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                className="rk-tab"
                onClick={() => setTab(t.id)}
                style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
              >
                <Icon size={16} style={{ marginRight: 6 }} />
                {t.label}
              </button>
            );
          })}
        </nav>

        <main style={styles.card}>
          {tab === "spelers" && (
            <section>
              <h2 style={styles.h2}>Wie speelt er mee?</h2>
              <p style={styles.hint}>
                Rikken speel je met 4 personen; er kunnen tot maximaal 6
                spelers meedoen. Zijn jullie met meer dan 4? Dan slaat er
                per ronde steeds iemand een keer over — wie dat is, schuift
                automatisch door aan de hand van de deler.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {players.map((p, i) => (
                  <div key={p.id}>
                    <div style={styles.playerRow}>
                      <span style={styles.playerIndex}>{i + 1}</span>
                      <input
                        className="rk-input"
                        style={styles.input}
                        value={p.name}
                        onChange={(e) => renamePlayer(p.id, e.target.value)}
                        maxLength={20}
                      />
                      <button
                        className="rk-btn"
                        onClick={() => removePlayer(p.id)}
                        disabled={players.length <= 2}
                        style={{ ...styles.iconBtn, opacity: players.length <= 2 ? 0.3 : 1 }}
                        title="Verwijder speler"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {confirmDeleteId === p.id && (
                      <div style={styles.confirmBox}>
                        <span>
                          {p.name} verwijderen? Eerdere rondes blijven in de
                          geschiedenis staan.
                        </span>
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button style={styles.confirmYes} onClick={() => removePlayer(p.id)}>
                            Ja, verwijder
                          </button>
                          <button style={styles.confirmNo} onClick={() => setConfirmDeleteId(null)}>
                            Annuleer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="rk-btn"
                onClick={addPlayer}
                disabled={players.length >= 6}
                style={{ ...styles.addBtn, opacity: players.length >= 6 ? 0.4 : 1 }}
              >
                <Plus size={16} style={{ marginRight: 6 }} />
                Speler toevoegen
              </button>
              <button style={styles.primaryBtn} onClick={() => setTab("ronde")}>
                Begin met spelen →
              </button>
              {rounds.length > 0 && (
                <>
                  <button style={styles.resetBtn} onClick={nieuwSpel}>
                    <RotateCcw size={15} style={{ marginRight: 6 }} />
                    Nieuw spel starten
                  </button>
                  {confirmNewGame && (
                    <div style={styles.confirmBox}>
                      <span>Weet je het zeker? De huidige stand en alle rondes worden gewist.</span>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button style={styles.confirmYes} onClick={nieuwSpel}>
                          Ja, wis alles
                        </button>
                        <button style={styles.confirmNo} onClick={() => setConfirmNewGame(false)}>
                          Annuleer
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {tab === "ronde" && (
            <section>
              <h2 style={styles.h2}>Nieuwe ronde</h2>

              <div style={styles.dealerBox}>
                <Shuffle size={14} style={{ marginRight: 6, flexShrink: 0 }} />
                <span>
                  Deler: <strong>{nameOf(dealerId)}</strong>
                </span>
                <select
                  className="rk-select"
                  style={styles.dealerSelect}
                  value={dealerId}
                  onChange={(e) => setDealerId(e.target.value)}
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {players.length > 4 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={styles.label}>
                    <Armchair size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                    Wie speelt deze ronde? ({actiefPlayers.length}/4)
                  </div>
                  <div style={styles.chipRow}>
                    {players.map((p) => (
                      <button
                        key={p.id}
                        className="rk-chip"
                        onClick={() => toggleActief(p.id)}
                        style={{ ...styles.chip, ...(actiefIds.includes(p.id) ? styles.chipActive : {}) }}
                      >
                        {p.id === dealerId && <Shuffle size={12} style={{ marginRight: 4, verticalAlign: -1 }} />}
                        {p.name}
                      </button>
                    ))}
                  </div>
                  {zitters.length > 0 && (
                    <p style={{ ...styles.hint, marginTop: 6, marginBottom: 0 }}>
                      Zit over: {zitters.map((p) => (p.id === dealerId ? `${p.name} (deler)` : p.name)).join(", ")}
                    </p>
                  )}
                  {!genoegActief && (
                    <p style={{ ...styles.warnText, marginTop: 6 }}>
                      <AlertTriangle size={13} style={{ marginRight: 5 }} />
                      Kies precies 4 spelers voor deze ronde.
                    </p>
                  )}
                </div>
              )}

              {players.length < 4 ? (
                <p style={styles.warnText}>
                  <AlertTriangle size={13} style={{ marginRight: 5 }} />
                  Automatische puntentelling werkt vanaf 4 spelers. Voeg spelers toe
                  op het tabblad "Spelers".
                </p>
              ) : (
                <>
                  <div style={styles.segmented}>
                    {[
                      { id: "bod", label: "Bieding" },
                      { id: "pas", label: "Iedereen past" },
                      { id: "handmatig", label: "Handmatig" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        className="rk-chip"
                        onClick={() => setMode(m.id)}
                        style={{ ...styles.segBtn, ...(mode === m.id ? styles.segBtnActive : {}) }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {mode === "bod" && genoegActief && (
                    <div>
                      <label style={styles.label}>Spelsoort</label>
                      <select
                        className="rk-select"
                        style={styles.select}
                        value={spelsoortIdx}
                        onChange={(e) => {
                          setSpelsoortIdx(Number(e.target.value));
                          setRikker("");
                          setMaat("");
                          setMultiBidders([]);
                          setMultiSucces({});
                        }}
                      >
                        {SPELSOORTEN.map((s, i) => (
                          <option key={s.label + i} value={i}>
                            {s.label}
                          </option>
                        ))}
                      </select>

                      {(spel.type === "maat" || spel.type === "solo") && (
                        <>
                          <label style={styles.label}>
                            {spel.type === "maat" ? "Rikker (wie ging het spel aan?)" : "Wie biedt?"}
                          </label>
                          <select
                            className="rk-select"
                            style={styles.select}
                            value={rikker}
                            onChange={(e) => setRikker(e.target.value)}
                          >
                            <option value="">Kies speler…</option>
                            {actiefPlayers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </>
                      )}

                      {spel.type === "maat" && (
                        <div style={{ marginBottom: 14 }}>
                          <label style={styles.label}>Maat (wie is er meegevraagd?)</label>
                          <select
                            className="rk-select"
                            style={{ ...styles.select, marginBottom: maat ? 16 : 6 }}
                            value={maat}
                            onChange={(e) => setMaat(e.target.value)}
                          >
                            <option value="">Kies maat…</option>
                            {actiefPlayers
                              .filter((p) => p.id !== rikker)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                          {!maat && (
                            <p style={{ ...styles.warnText, marginBottom: 16 }}>
                              <AlertTriangle size={13} style={{ marginRight: 5 }} />
                              Kies wie de maat is om verder te gaan.
                            </p>
                          )}
                        </div>
                      )}

                      {spel.type === "multi" && (
                        <div style={{ marginBottom: 14 }}>
                          <label style={styles.label}>Wie biedt? (1 of 2 spelers)</label>
                          <div style={styles.chipRow}>
                            {actiefPlayers.map((p) => (
                              <button
                                key={p.id}
                                className="rk-chip"
                                onClick={() => toggleMultiBidder(p.id)}
                                style={{ ...styles.chip, ...(multiBidders.includes(p.id) ? styles.chipActive : {}) }}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                          {multiBidders.length === 0 && (
                            <p style={{ ...styles.warnText, marginTop: 8 }}>
                              <AlertTriangle size={13} style={{ marginRight: 5 }} />
                              Kies 1 of 2 bieders.
                            </p>
                          )}
                          {multiBidders.length === 2 && (
                            <div style={{ ...styles.helperBox, marginTop: 10 }}>
                              <div style={styles.helperTitle}>Wie heeft het gehaald?</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                                {multiBidders.map((id) => (
                                  <label key={id} style={styles.checkRow}>
                                    <input
                                      type="checkbox"
                                      checked={!!multiSucces[id]}
                                      onChange={(e) =>
                                        setMultiSucces((s) => ({ ...s, [id]: e.target.checked }))
                                      }
                                    />
                                    {nameOf(id)} heeft het gehaald
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {(spel.type === "maat" ||
                        spel.type === "solo" ||
                        (spel.type === "multi" && multiBidders.length === 1)) && (
                        <>
                          <label style={styles.label}>Aantal gehaalde slagen</label>
                          <select
                            className="rk-select"
                            style={styles.select}
                            value={slagen}
                            onChange={(e) => setSlagen(Number(e.target.value))}
                          >
                            {POINTS[spel.tableKey].map((_, i) => (
                              <option key={i} value={i}>
                                {i} slagen
                              </option>
                            ))}
                          </select>
                        </>
                      )}

                      {bodKlaar && (
                        <div style={styles.previewBox}>
                          <div style={styles.helperTitle}>
                            <Sparkles size={14} style={{ marginRight: 6 }} />
                            {spel.type === "multi" && multiBidders.length === 2
                              ? `${spel.label} met 2 bieders — ±${spel.base} per persoon`
                              : spel.type === "maat"
                              ? `${isVerlies ? "Verlies" : "Gehaald"} — rikker en maat elk ${slagenWaarde > 0 ? "+" : ""}${slagenWaarde}`
                              : `${isVerlies ? "Verlies" : "Gehaald"} — totaal ${slagenWaarde > 0 ? "+" : ""}${slagenWaarde} voor de winnaar, verdeeld over de tegenstanders`}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                            {actiefPlayers.map((p) => (
                              <div key={p.id} style={styles.previewRow}>
                                <span>{p.name}</span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: bodDeltas[p.id] < 0 ? "#A63D2F" : "#23281f",
                                  }}
                                >
                                  {bodDeltas[p.id] > 0 ? "+" : ""}
                                  {bodDeltas[p.id]}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        style={{ ...styles.primaryBtn, opacity: bodKlaar ? 1 : 0.5 }}
                        disabled={!bodKlaar}
                        onClick={() => saveRound(spel.label, bodDeltas)}
                      >
                        Ronde opslaan
                      </button>
                    </div>
                  )}

                  {mode === "pas" && genoegActief && (
                    <div>
                      <p style={styles.hint}>
                        Kies één van de drie biedingen hieronder — de andere twee
                        blokkeren zodra je begint met invullen. Wis je keuze om een
                        andere te kiezen.
                      </p>

                      <div
                        style={{
                          ...styles.helperBox,
                          opacity: actievePasSoort && actievePasSoort !== "piek" ? 0.4 : 1,
                          pointerEvents: actievePasSoort && actievePasSoort !== "piek" ? "none" : "auto",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={styles.helperTitle}>Verplicht pieken</div>
                          {actievePasSoort === "piek" && (
                            <button style={styles.linkBtn} onClick={() => setPiekSucces(null)}>
                              Wissen
                            </button>
                          )}
                        </div>
                        <p style={{ ...styles.hint, marginBottom: 8 }}>
                          Wie heeft het gehaald? (0 t/m 3 spelers)
                        </p>
                        <div style={styles.chipRow}>
                          {actiefPlayers.map((p) => (
                            <button
                              key={p.id}
                              className="rk-chip"
                              onClick={() =>
                                setPiekSucces((a) => {
                                  const base = a === null ? [] : a;
                                  if (base.includes(p.id)) return base.filter((x) => x !== p.id);
                                  if (base.length >= 3) return base;
                                  return [...base, p.id];
                                })
                              }
                              style={{
                                ...styles.chip,
                                ...(piekActief && piekSucces.includes(p.id) ? styles.chipActive : {}),
                              }}
                            >
                              {p.name}
                            </button>
                          ))}
                          <button
                            className="rk-chip"
                            onClick={() => setPiekSucces([])}
                            style={{
                              ...styles.chip,
                              ...(piekActief && piekSucces.length === 0 ? styles.chipActive : {}),
                            }}
                          >
                            Niemand
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          ...styles.helperBox,
                          marginTop: 10,
                          opacity: actievePasSoort && actievePasSoort !== "schoppen" ? 0.4 : 1,
                          pointerEvents: actievePasSoort && actievePasSoort !== "schoppen" ? "none" : "auto",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={styles.helperTitle}>Schoppen Mie</div>
                          {actievePasSoort === "schoppen" && (
                            <button
                              style={styles.linkBtn}
                              onClick={() => {
                                setSchoppenVrouw("");
                                setSchoppenLaatste("");
                              }}
                            >
                              Wissen
                            </button>
                          )}
                        </div>
                        <p style={{ ...styles.hint, marginBottom: 8 }}>
                          Wie had schoppen vrouw, en wie de laatste slag?
                        </p>
                        <label style={styles.label}>Schoppen vrouw</label>
                        <select
                          className="rk-select"
                          style={{ ...styles.select, marginBottom: 10 }}
                          value={schoppenVrouw}
                          onChange={(e) => setSchoppenVrouw(e.target.value)}
                        >
                          <option value="">Kies speler…</option>
                          {actiefPlayers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <label style={styles.label}>Laatste slag</label>
                        <select
                          className="rk-select"
                          style={{ ...styles.select, marginBottom: 0 }}
                          value={schoppenLaatste}
                          onChange={(e) => setSchoppenLaatste(e.target.value)}
                        >
                          <option value="">Kies speler…</option>
                          {actiefPlayers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div
                        style={{
                          ...styles.helperBox,
                          marginTop: 10,
                          opacity: actievePasSoort && actievePasSoort !== "vijf" ? 0.4 : 1,
                          pointerEvents: actievePasSoort && actievePasSoort !== "vijf" ? "none" : "auto",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={styles.helperTitle}>2 of 5 slagen</div>
                          {actievePasSoort === "vijf" && (
                            <button style={styles.linkBtn} onClick={() => setVijfGeslaagd(null)}>
                              Wissen
                            </button>
                          )}
                        </div>
                        <p style={{ ...styles.hint, marginBottom: 8 }}>
                          Wie haalde precies 2 of 5 slagen?
                        </p>
                        <div style={styles.chipRow}>
                          {actiefPlayers.map((p) => (
                            <button
                              key={p.id}
                              className="rk-chip"
                              onClick={() =>
                                setVijfGeslaagd((a) => {
                                  const base = a === null ? [] : a;
                                  return base.includes(p.id) ? base.filter((x) => x !== p.id) : [...base, p.id];
                                })
                              }
                              style={{
                                ...styles.chip,
                                ...(vijfActief && vijfGeslaagd.includes(p.id) ? styles.chipActive : {}),
                              }}
                            >
                              {p.name}
                            </button>
                          ))}
                          <button
                            className="rk-chip"
                            onClick={() => setVijfGeslaagd([])}
                            style={{
                              ...styles.chip,
                              ...(vijfActief && vijfGeslaagd.length === 0 ? styles.chipActive : {}),
                            }}
                          >
                            Niemand
                          </button>
                        </div>
                      </div>

                      {passActief && (
                        <div style={styles.previewBox}>
                          <div style={styles.helperTitle}>
                            <Sparkles size={14} style={{ marginRight: 6 }} />
                            Punten deze ronde
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                            {actiefPlayers.map((p) => (
                              <div key={p.id} style={styles.previewRow}>
                                <span>{p.name}</span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: passDeltas[p.id] < 0 ? "#A63D2F" : "#23281f",
                                  }}
                                >
                                  {passDeltas[p.id] > 0 ? "+" : ""}
                                  {passDeltas[p.id]}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        style={{ ...styles.primaryBtn, opacity: passActief ? 1 : 0.5 }}
                        disabled={!passActief}
                        onClick={() => {
                          const label =
                            actievePasSoort === "piek"
                              ? "Verplicht pieken"
                              : actievePasSoort === "schoppen"
                              ? "Schoppen Mie"
                              : actievePasSoort === "vijf"
                              ? "2 of 5 slagen"
                              : "Iedereen past";
                          saveRound(label, passDeltas);
                        }}
                      >
                        Ronde opslaan
                      </button>
                    </div>
                  )}

                  {mode === "handmatig" && genoegActief && (
                    <div>
                      <label style={styles.label}>Omschrijving (optioneel)</label>
                      <input
                        className="rk-input"
                        style={{ ...styles.input, width: "100%", marginBottom: 14 }}
                        value={manualLabel}
                        onChange={(e) => setManualLabel(e.target.value)}
                        placeholder="bv. correctie, huisregel…"
                      />
                      <div style={styles.label}>Punten per speler deze ronde</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {actiefPlayers.map((p) => (
                          <div key={p.id} style={styles.scoreRow}>
                            <span style={styles.scoreName}>{p.name}</span>
                            <input
                              className="rk-num"
                              type="number"
                              value={manualDeltas[p.id] ?? ""}
                              onChange={(e) => setManualDeltas({ ...manualDeltas, [p.id]: e.target.value })}
                              style={styles.numInputSmall}
                              placeholder="0"
                            />
                          </div>
                        ))}
                      </div>
                      <div style={{ ...styles.sumRow, color: manualSum === 0 ? "#3f6b4a" : "#A63D2F" }}>
                        {manualSum === 0 ? (
                          <>
                            <Check size={15} style={{ marginRight: 6 }} />
                            Punten sluiten (som = 0)
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={15} style={{ marginRight: 6 }} />
                            Som is {manualSum > 0 ? `+${manualSum}` : manualSum} — check de punten
                          </>
                        )}
                      </div>
                      <button
                        style={styles.primaryBtn}
                        onClick={() => saveRound(manualLabel || "Handmatig", manualDeltas)}
                      >
                        Ronde opslaan
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {tab === "geschiedenis" && (
            <section>
              <h2 style={styles.h2}>
                <Trophy size={18} style={{ marginRight: 8, verticalAlign: -3 }} />
                Stand
              </h2>
              <div style={styles.leaderboard}>
                {ranking.map((p, i) => (
                  <div key={p.id} style={styles.leaderRow}>
                    <span style={styles.leaderRank}>{i + 1}</span>
                    <span style={styles.leaderName}>{p.name}</span>
                    <span style={{ ...styles.leaderScore, color: totals[p.id] < 0 ? "#A63D2F" : "#23281f" }}>
                      {totals[p.id] > 0 ? "+" : ""}
                      {totals[p.id]}
                    </span>
                  </div>
                ))}
              </div>

              <h2 style={{ ...styles.h2, marginTop: 26 }}>Rondes</h2>
              {rounds.length === 0 && <p style={styles.hint}>Nog geen rondes gespeeld.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[...rounds].reverse().map((r, idx) => (
                  <div key={r.id} style={styles.roundCard}>
                    <div style={styles.roundHeader}>
                      <span style={styles.roundNum}>Ronde {rounds.length - idx}</span>
                      <span style={styles.roundType}>{r.spelsoort}</span>
                      <button
                        className="rk-btn"
                        onClick={() => deleteRound(r.id)}
                        style={styles.iconBtnSmall}
                        title="Verwijder ronde"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={styles.roundGrid}>
                      {players.map((p) =>
                        r.deltas[p.id] || Object.prototype.hasOwnProperty.call(r.deltas, p.id) ? (
                          <div key={p.id} style={styles.roundCell}>
                            <span className="rk-hide-mobile" style={styles.roundCellName}>
                              {p.name}
                            </span>
                            <span
                              style={{
                                ...styles.roundCellVal,
                                color: (r.deltas[p.id] || 0) < 0 ? "#A63D2F" : "#23281f",
                              }}
                            >
                              {(r.deltas[p.id] || 0) > 0 ? "+" : ""}
                              {r.deltas[p.id] || 0}
                            </span>
                          </div>
                        ) : null
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button style={styles.ghostBtn} onClick={() => setTab("ronde")}>
                <Plus size={16} style={{ marginRight: 6 }} />
                Nog een ronde
              </button>
              <button style={styles.resetBtn} onClick={nieuwSpel}>
                <RotateCcw size={15} style={{ marginRight: 6 }} />
                Nieuw spel
              </button>
              {confirmNewGame && (
                <div style={styles.confirmBox}>
                  <span>Weet je het zeker? De huidige stand en alle rondes worden gewist.</span>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={styles.confirmYes} onClick={nieuwSpel}>
                      Ja, wis alles
                    </button>
                    <button style={styles.confirmNo} onClick={() => setConfirmNewGame(false)}>
                      Annuleer
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100%",
    width: "100%",
    background: "radial-gradient(ellipse at top, #1c4a33 0%, #123524 55%, #0d2a1a 100%)",
    fontFamily: "'Inter', sans-serif",
    padding: "28px 14px 48px",
    display: "flex",
    justifyContent: "center",
  },
  loadingWrap: {
    minHeight: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#123524",
    padding: 40,
  },
  loadingCard: { color: "#F5EFDD", fontFamily: "'Fraunces', serif", fontSize: 18 },
  shell: { width: "100%", maxWidth: 640 },
  header: { textAlign: "center", marginBottom: 18 },
  suitRow: { color: "#C7A542", letterSpacing: 6, fontSize: 14, marginBottom: 6 },
  title: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: 34,
    color: "#F5EFDD",
    margin: 0,
    letterSpacing: 0.3,
  },
  sub: { color: "#9db8a6", fontSize: 12, marginTop: 4, letterSpacing: 0.5, textTransform: "uppercase" },
  gameCodeBtn: {
    marginTop: 10,
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid rgba(199,165,66,0.5)",
    background: "rgba(0,0,0,0.18)",
    color: "#F5EFDD",
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: 0.3,
    cursor: "pointer",
  },
  switcherBox: {
    marginTop: 10,
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(199,165,66,0.35)",
    borderRadius: 12,
    padding: 14,
    textAlign: "left",
  },
  switcherHint: { color: "#cddbd0", fontSize: 12.5, lineHeight: 1.5, margin: "0 0 10px" },
  switcherPrimaryBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    border: "none",
    background: "#C7A542",
    color: "#123524",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  switcherRow: { display: "flex", gap: 8, marginTop: 10 },
  switcherInput: {
    flex: 1,
    padding: "9px 10px",
    borderRadius: 8,
    border: "1px solid #E0D7BE",
    background: "#fff",
    fontSize: 13.5,
    color: "#23281f",
  },
  switcherJoinBtn: {
    padding: "9px 14px",
    borderRadius: 8,
    border: "none",
    background: "#F5EFDD",
    color: "#123524",
    fontWeight: 700,
    fontSize: 12.5,
    cursor: "pointer",
  },
  switcherError: { display: "flex", alignItems: "center", color: "#ffb4a8", fontSize: 12, marginTop: 8 },
  tabs: { display: "flex", gap: 6, marginBottom: 14, background: "rgba(0,0,0,0.18)", padding: 5, borderRadius: 12 },
  tab: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "9px 6px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "#c9d8ce",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  tabActive: { background: "#F5EFDD", color: "#123524" },
  card: {
    background: "#F5EFDD",
    borderRadius: 18,
    padding: "26px 22px 30px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
    border: "1px solid #E8DFC5",
  },
  h2: { fontFamily: "'Fraunces', serif", fontSize: 21, color: "#23281f", margin: "0 0 10px", fontWeight: 600 },
  hint: { color: "#5b6357", fontSize: 13, lineHeight: 1.5, margin: "0 0 14px" },
  warnText: {
    display: "flex",
    alignItems: "center",
    color: "#A63D2F",
    fontSize: 13,
    fontWeight: 600,
    background: "#F7E6E1",
    border: "1px solid #E7C7BE",
    borderRadius: 9,
    padding: "9px 12px",
  },
  dealerBox: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 13.5,
    color: "#23281f",
    background: "#EFE7D0",
    border: "1px solid #E0D7BE",
    borderRadius: 9,
    padding: "9px 12px",
    marginBottom: 16,
  },
  dealerSelect: {
    marginLeft: "auto",
    padding: "5px 8px",
    borderRadius: 7,
    border: "1px solid #C7A542",
    background: "#fff",
    fontSize: 12.5,
    color: "#23281f",
    marginBottom: 0,
    width: "auto",
  },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "#8a6d1f",
    fontWeight: 700,
    fontSize: 11.5,
    textDecoration: "underline",
    cursor: "pointer",
    padding: 0,
    whiteSpace: "nowrap",
  },
  playerRow: { display: "flex", alignItems: "center", gap: 8 },
  playerIndex: { width: 22, fontFamily: "'Fraunces', serif", color: "#C7A542", fontWeight: 700, fontSize: 14, textAlign: "center" },
  input: { flex: 1, padding: "10px 12px", borderRadius: 9, border: "1px solid #E0D7BE", background: "#fff", fontSize: 14.5, color: "#23281f" },
  iconBtn: { border: "none", background: "transparent", color: "#A63D2F", cursor: "pointer", padding: 8 },
  iconBtnSmall: { border: "none", background: "transparent", color: "#9b6b64", cursor: "pointer", padding: 4, marginLeft: "auto" },
  addBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", width: "100%", marginTop: 12,
    padding: "10px 12px", borderRadius: 9, border: "1.5px dashed #C7A542", background: "transparent",
    color: "#8a6d1f", fontWeight: 600, fontSize: 13.5, cursor: "pointer",
  },
  primaryBtn: {
    width: "100%", marginTop: 18, padding: "13px 12px", borderRadius: 10, border: "none",
    background: "#123524", color: "#F5EFDD", fontWeight: 700, fontSize: 14.5, cursor: "pointer", letterSpacing: 0.2,
  },
  ghostBtn: {
    width: "100%", marginTop: 18, padding: "11px 12px", borderRadius: 9, border: "1.5px solid #123524",
    background: "transparent", color: "#123524", fontWeight: 600, fontSize: 13.5, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  resetBtn: {
    width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: 9, border: "none", background: "transparent",
    color: "#8a6d1f", fontWeight: 600, fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  confirmBox: {
    marginTop: 8, background: "#F7E6E1", border: "1px solid #E7C7BE", borderRadius: 9,
    padding: "10px 12px", fontSize: 12.5, color: "#7a2e22",
  },
  confirmYes: {
    padding: "7px 14px", borderRadius: 7, border: "none", background: "#A63D2F",
    color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
  },
  confirmNo: {
    padding: "7px 14px", borderRadius: 7, border: "1px solid #A63D2F", background: "transparent",
    color: "#A63D2F", fontWeight: 700, fontSize: 12, cursor: "pointer",
  },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#5b6357", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },
  select: { width: "100%", padding: "11px 12px", borderRadius: 9, border: "1px solid #E0D7BE", background: "#fff", fontSize: 14.5, color: "#23281f", marginBottom: 16 },
  segmented: { display: "flex", gap: 6, marginBottom: 16, background: "#EFE7D0", padding: 4, borderRadius: 10 },
  segBtn: { flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 7, border: "none", background: "transparent", color: "#5b6357", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  segBtnActive: { background: "#123524", color: "#F5EFDD" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: "#23281f", cursor: "pointer" },
  helperBox: { background: "#EFE7D0", border: "1px solid #E0D7BE", borderRadius: 12, padding: 14 },
  helperTitle: { display: "flex", alignItems: "center", fontWeight: 700, fontSize: 13.5, color: "#23281f", marginBottom: 4 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { padding: "7px 12px", borderRadius: 999, border: "1px solid #C7A542", background: "transparent", color: "#23281f", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  chipActive: { background: "#C7A542", color: "#123524" },
  previewBox: { background: "#fff", border: "1px solid #E8DFC5", borderRadius: 12, padding: 14, marginTop: 14 },
  previewRow: { display: "flex", justifyContent: "space-between", fontSize: 13.5, color: "#23281f" },
  scoreRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#fff", border: "1px solid #E8DFC5", borderRadius: 9, padding: "8px 10px" },
  scoreName: { fontSize: 14, color: "#23281f", fontWeight: 500 },
  numInputSmall: { width: 92, padding: "8px 10px", borderRadius: 8, border: "1px solid #E0D7BE", background: "#F9F5E9", fontSize: 14, textAlign: "right", fontVariantNumeric: "tabular-nums" },
  sumRow: { display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, marginTop: 10 },
  leaderboard: { display: "flex", flexDirection: "column", gap: 6 },
  leaderRow: { display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E8DFC5", borderRadius: 10, padding: "10px 14px" },
  leaderRank: { fontFamily: "'Fraunces', serif", fontWeight: 700, color: "#C7A542", width: 20 },
  leaderName: { flex: 1, fontSize: 15, fontWeight: 600, color: "#23281f" },
  leaderScore: { fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  roundCard: { background: "#fff", border: "1px solid #E8DFC5", borderRadius: 10, padding: "10px 12px" },
  roundHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  roundNum: { fontSize: 11.5, color: "#9b917a", fontWeight: 700 },
  roundType: { fontSize: 12.5, fontWeight: 700, color: "#123524", background: "#EFE7D0", padding: "2px 8px", borderRadius: 999 },
  roundGrid: { display: "flex", flexWrap: "wrap", gap: 10 },
  roundCell: { display: "flex", alignItems: "baseline", gap: 5 },
  roundCellName: { fontSize: 11.5, color: "#8a8571" },
  roundCellVal: { fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
};

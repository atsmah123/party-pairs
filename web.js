// The guest web: every guest is a dot, every confirmed pair is a line.
// Drawn as SVG and laid out with a small force simulation.

import { hash } from "./match.js";

const NS = "http://www.w3.org/2000/svg";
const W = 360, H = 440, PAD = 28, GAP = 46;

// Positions outlive the view, so the web keeps its shape between tab switches.
const remembered = new Map();

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function layout(ids, links, prev = new Map()) {
  const n = ids.length, cx = W / 2, cy = H / 2;
  const pos = new Map();
  let warmCount = 0;
  for (const id of ids) {
    const p = prev.get(id);
    if (p) {
      pos.set(id, { x: p.x, y: p.y });
      warmCount++;
    } else {
      const h = hash(id);
      const angle = ((h % 3600) / 3600) * Math.PI * 2;
      const radius = 40 + ((h >>> 12) % 110);
      pos.set(id, { x: cx + Math.cos(angle) * radius * 0.9, y: cy + Math.sin(angle) * radius * 1.15 });
    }
  }
  if (n === 0) return pos;
  if (n === 1) return pos.set(ids[0], { x: cx, y: cy });

  // Dots push apart only when closer than a comfortable spacing, pairs pull
  // gently together, and everything leans toward the middle. That fills the
  // frame evenly instead of pinning guests to its edges.
  const k = Math.min(110, Math.sqrt(((W - 2 * PAD) * (H - 2 * PAD)) / n));
  const reach = k * 1.2, rest = k * 0.9;
  const warm = n > 2 && warmCount >= n - 1;
  const iters = warm ? 120 : 320;
  const t0 = warm ? 8 : 30;
  const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));

  for (let it = 0; it < iters; it++) {
    for (const d of disp.values()) { d.x = 0; d.y = 0; }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(ids[i]), b = pos.get(ids[j]);
        let dx = a.x - b.x, dy = a.y - b.y;
        if (dx === 0 && dy === 0) { dx = ((i * 7 + j) % 5) - 2 || 1; dy = ((i + j * 3) % 5) - 2 || 1; }
        const dist = Math.max(Math.hypot(dx, dy), 0.5);
        if (dist >= reach) continue;
        const f = (reach - dist) * 0.5;
        const da = disp.get(ids[i]), db = disp.get(ids[j]);
        da.x += (dx / dist) * f; da.y += (dy / dist) * f;
        db.x -= (dx / dist) * f; db.y -= (dy / dist) * f;
      }
    }
    for (const [u, v] of links) {
      const a = pos.get(u), b = pos.get(v);
      if (!a || !b) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.5);
      if (dist <= rest) continue;
      const f = (dist - rest) * 0.05;
      const da = disp.get(u), db = disp.get(v);
      da.x -= (dx / dist) * f; da.y -= (dy / dist) * f;
      db.x += (dx / dist) * f; db.y += (dy / dist) * f;
    }
    const t = t0 * (1 - it / iters);
    for (const id of ids) {
      const p = pos.get(id), d = disp.get(id);
      d.x -= (p.x - cx) * 0.02;
      d.y -= (p.y - cy) * 0.02;
      const m = Math.hypot(d.x, d.y);
      if (m > 0) {
        p.x = clamp(p.x + (d.x / m) * Math.min(m, t), PAD, W - PAD);
        p.y = clamp(p.y + (d.y / m) * Math.min(m, t), PAD, H - PAD);
      }
    }
  }
  // Keep every dot far enough from its neighbours to tap.
  for (let pass = 0; pass < 16; pass++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(ids[i]), b = pos.get(ids[j]);
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= GAP) continue;
        if (dist < 0.01) { dx = 1; dy = 0.5; dist = Math.hypot(dx, dy); }
        const push = (GAP - dist) / 2;
        a.x = clamp(a.x + (dx / dist) * push, PAD, W - PAD); a.y = clamp(a.y + (dy / dist) * push, PAD, H - PAD);
        b.x = clamp(b.x - (dx / dist) * push, PAD, W - PAD); b.y = clamp(b.y - (dy / dist) * push, PAD, H - PAD);
      }
    }
  }
  return pos;
}

export function createWeb(container, onSelect) {
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "web", role: "group", "aria-label": "Guests and the pairs they have made" });
  const gEdges = el("g"), gNodes = el("g");
  svg.append(gEdges, gNodes);
  container.append(svg);

  const nodes = new Map(), edges = new Map();
  let drawn = new Map(), first = true, raf = 0;
  const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  svg.addEventListener("click", (e) => {
    const g = e.target.closest("[data-id]");
    onSelect(g ? g.dataset.id : null);
  });
  svg.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const g = e.target.closest("[data-id]");
    if (g) { e.preventDefault(); onSelect(g.dataset.id); }
  });

  function place(pos) {
    for (const [id, node] of nodes) {
      const p = pos.get(id);
      if (p) node.g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    }
    for (const edge of edges.values()) {
      const a = pos.get(edge.a), b = pos.get(edge.b);
      if (a && b) edge.path.setAttribute("d", `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    }
  }

  function update({ guests, pairs, meId, selected }) {
    const ids = guests.map((g) => g.id);
    const idSet = new Set(ids);
    const live = pairs.filter((p) => idSet.has(p.a) && idSet.has(p.b));
    const met = new Set();
    for (const p of live) {
      if (p.a === meId) met.add(p.b);
      if (p.b === meId) met.add(p.a);
    }

    for (const g of guests) {
      let node = nodes.get(g.id);
      if (!node) {
        const group = el("g", { "data-id": g.id, tabindex: "0", role: "button" });
        const disc = el("circle", { r: "18", class: "node__disc" });
        const face = el("text", { class: "node__face", "text-anchor": "middle", dy: ".36em" });
        group.append(el("circle", { r: "23", class: "node__hit" }), disc, face);
        gNodes.append(group);
        node = { g: group, face, fresh: !first };
        if (node.fresh) group.addEventListener("animationend", () => { node.fresh = false; group.classList.remove("node--in"); }, { once: true });
        nodes.set(g.id, node);
      }
      node.face.textContent = String(g.emoji || "").slice(0, 8);
      node.g.setAttribute("aria-label", g.id === meId ? `${g.name}, you` : g.name);
      node.g.setAttribute("class", "node" + (g.id === meId ? " node--me" : "") + (met.has(g.id) ? " node--met" : "") + (g.id === selected ? " node--sel" : "") + (node.fresh ? " node--in" : ""));
    }
    for (const [id, node] of nodes) {
      if (!idSet.has(id)) { node.g.remove(); nodes.delete(id); remembered.delete(id); }
    }

    const liveIds = new Set(live.map((p) => p.id));
    for (const p of live) {
      let edge = edges.get(p.id);
      if (!edge) {
        const path = el("path", { pathLength: "1" });
        gEdges.append(path);
        edge = { a: p.a, b: p.b, path, fresh: !first };
        edges.set(p.id, edge);
        if (edge.fresh) path.addEventListener("animationend", () => { edge.fresh = false; path.classList.remove("edge--new"); }, { once: true });
      }
      const mine = p.a === meId || p.b === meId;
      const picked = selected && (p.a === selected || p.b === selected);
      edge.path.setAttribute("class", "edge" + (mine ? " edge--mine" : "") + (picked ? " edge--sel" : "") + (edge.fresh ? " edge--new" : ""));
    }
    for (const [id, edge] of edges) {
      if (!liveIds.has(id)) { edge.path.remove(); edges.delete(id); }
    }

    const target = layout(ids, live.map((p) => [p.a, p.b]), remembered);
    remembered.clear();
    for (const [id, p] of target) remembered.set(id, p);

    cancelAnimationFrame(raf);
    const from = new Map();
    for (const id of ids) from.set(id, drawn.get(id) || target.get(id));
    const moving = !first && !still() && ids.some((id) => {
      const a = from.get(id), b = target.get(id);
      return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 0.5;
    });
    first = false;
    if (!moving) { drawn = target; place(target); return; }
    const start = performance.now(), dur = 520;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const cur = new Map();
      for (const id of ids) {
        const a = from.get(id), b = target.get(id);
        cur.set(id, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
      }
      drawn = cur;
      place(cur);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  return { update, destroy() { cancelAnimationFrame(raf); svg.remove(); } };
}

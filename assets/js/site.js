// InfraPI portal: search, copy buttons, code tabs, tutorial filters, active TOC entry,
// closing header menus. No dependencies.
(() => {
  "use strict";

  // ---------- header menus: one open at a time, close on outside click ----------
  const menus = [...document.querySelectorAll(".menu")];
  menus.forEach((m) => m.addEventListener("toggle", () => {
    if (m.open) menus.forEach((o) => { if (o !== m) o.open = false; });
  }));
  document.addEventListener("click", (e) => {
    menus.forEach((m) => { if (m.open && !m.contains(e.target)) m.open = false; });
  });

  // ---------- docs sidebar: collapsed by default on small screens ----------
  const nav = document.querySelector("[data-docs-nav]");
  if (nav && window.matchMedia("(max-width: 820px)").matches) nav.open = false;
  if (nav) nav.querySelector("summary").addEventListener("click", (e) => {
    if (!window.matchMedia("(max-width: 820px)").matches) e.preventDefault();
  });

  // ---------- shell blocks: commands and flags ----------
  // Chroma's bash lexer leaves a command and its flags as plain text: mark
  // the command, first word of a line, or after a pipe, &&, ;, $( or do,
  // and every -flag. The text stays the same, copy included.
  const SHELL = 'code[data-lang="bash"], code[data-lang="sh"], code[data-lang="shell"], code[data-lang="console"]';
  const opensCommand = /(\|\|?|&&|;|\$\(|\(|`|^do$|^then$|^else$)\s*$/;
  const shellSpan = (cls, text) => { const s = document.createElement("span"); s.className = cls; s.textContent = text; return s; };
  document.querySelectorAll(SHELL).forEach((code) => {
    let continued = false;
    code.querySelectorAll(".cl").forEach((line) => {
      let cmdNext = !continued, assigned = false;
      continued = /\\\s*$/.test(line.textContent);
      for (const node of [...line.childNodes]) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches(".c, .c1")) break;
          const t = node.textContent.trim();
          if (!t) continue;
          if (opensCommand.test(t)) { cmdNext = true; assigned = false; }
          else if (node.matches(".nv") && cmdNext) assigned = true;  // VAR=value cmd: VAR
          else if (!(node.matches(".o") && t === "=" && assigned)) cmdNext = false; // for, $VAR, a string...
          continue;
        }
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const frag = document.createDocumentFragment();
        let changed = false;
        for (const part of node.textContent.split(/(\s+|\||&&|;)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(part); continue; }
          if (/^(\||&&|;)$/.test(part)) { frag.append(part); cmdNext = true; continue; }
          if (cmdNext && assigned) { frag.append(part); assigned = false; continue; } // VAR=value cmd
          if (cmdNext) { frag.append(shellSpan("sh-cmd", part)); cmdNext = false; changed = true; continue; }
          if (/^--?[A-Za-z]/.test(part)) { frag.append(shellSpan("sh-flag", part)); changed = true; continue; }
          frag.append(part);
        }
        if (changed) node.replaceWith(frag);
      }
    });
  });

  // ---------- copy buttons on code blocks ----------
  const copyIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';
  const doneIcon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  document.querySelectorAll(".prose pre, .step pre").forEach((pre) => {
    const wrap = document.createElement("div");
    wrap.className = "copy-wrap";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.setAttribute("aria-label", "Copy code");
    btn.innerHTML = copyIcon;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText.replace(/\n$/, ""));
        btn.innerHTML = doneIcon; btn.classList.add("is-done");
        setTimeout(() => { btn.innerHTML = copyIcon; btn.classList.remove("is-done"); }, 1400);
      } catch (_) { /* clipboard unavailable */ }
    });
    wrap.appendChild(btn);
  });

  // ---------- code tabs ----------
  // Two or more consecutive "**label**" paragraphs, each followed by a code
  // block, render as tabs: the portable way docs write alternatives
  // (**infrapi-cli**, then **curl**), which github.com shows one after the
  // other. Picking a tab picks it in every group of the page, and is
  // remembered.
  const TAB_KEY = "infrapi.code-tab";
  const isLabel = (el) => el && el.tagName === "P" && el.children.length === 1 &&
    el.firstElementChild.tagName === "STRONG" && el.textContent.trim() === el.firstElementChild.textContent.trim();
  const isCode = (el) => el && (el.matches(".highlight, pre, .copy-wrap"));
  const groups = [];
  document.querySelectorAll(".prose p").forEach((p) => {
    if (!isLabel(p) || !isCode(p.nextElementSibling)) return;
    const prev = p.previousElementSibling;
    if (isCode(prev) && isLabel(prev.previousElementSibling)) return; // not the first pair
    const pairs = [];
    for (let l = p; isLabel(l) && isCode(l.nextElementSibling); l = l.nextElementSibling.nextElementSibling) {
      pairs.push([l, l.nextElementSibling]);
    }
    if (pairs.length >= 2) groups.push(pairs);
  });
  const tabSets = [];
  groups.forEach((pairs, g) => {
    const box = document.createElement("div");
    box.className = "code-tabs";
    const list = document.createElement("div");
    list.className = "code-tabs__list";
    list.setAttribute("role", "tablist");
    box.appendChild(list);
    pairs[0][0].parentNode.insertBefore(box, pairs[0][0]);
    const tabs = pairs.map(([label, code], i) => {
      const name = label.textContent.trim();
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "code-tabs__tab";
      tab.id = `code-tab-${g}-${i}`;
      tab.textContent = name;
      tab.setAttribute("role", "tab");
      const panel = document.createElement("div");
      panel.className = "code-tabs__panel";
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.appendChild(code);
      label.remove();
      list.appendChild(tab);
      box.appendChild(panel);
      tab.addEventListener("click", () => select(name));
      return { name, tab, panel };
    });
    list.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = tabs.findIndex((t) => t.tab === document.activeElement);
      if (i < 0) return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next.name); next.tab.focus();
    });
    tabSets.push(tabs);
  });
  function show(tabs, name) {
    const pick = tabs.find((t) => t.name === name) || tabs[0];
    tabs.forEach((t) => {
      const on = t === pick;
      t.tab.setAttribute("aria-selected", String(on));
      t.tab.tabIndex = on ? 0 : -1;
      t.panel.hidden = !on;
    });
  }
  function select(name) {
    tabSets.forEach((tabs) => show(tabs, name));
    try { localStorage.setItem(TAB_KEY, name); } catch (_) { /* storage unavailable */ }
  }
  if (tabSets.length) {
    let saved = null;
    try { saved = localStorage.getItem(TAB_KEY); } catch (_) { /* storage unavailable */ }
    tabSets.forEach((tabs) => show(tabs, saved));
  }

  // ---------- tutorial filters ----------
  const filters = document.querySelector("[data-filters]");
  if (filters) {
    const cards = [...document.querySelectorAll("[data-filter-target] > [data-products]")];
    const empty = document.querySelector("[data-filter-empty]");
    filters.addEventListener("click", (e) => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      filters.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const want = b.dataset.filter;
      let shown = 0;
      cards.forEach((c) => {
        const ok = !want || c.dataset.products.split(" ").includes(want);
        c.hidden = !ok; if (ok) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    });
  }

  // ---------- table of contents: highlight the section in view ----------
  const tocLinks = [...document.querySelectorAll(".docs-toc a[href^='#']")];
  if (tocLinks.length && "IntersectionObserver" in window) {
    const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const heads = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    let current = null;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) current = en.target.id; });
      tocLinks.forEach((a) => a.classList.toggle("is-active", byId.get(current) === a));
    }, { rootMargin: "-80px 0px -70% 0px" });
    heads.forEach((h) => io.observe(h));
  }

  // ---------- search ----------
  const dialog = document.querySelector("[data-search]");
  if (!dialog) return;
  const input = dialog.querySelector("[data-search-input]");
  const list = dialog.querySelector("[data-search-results]");
  const empty = dialog.querySelector("[data-search-empty]");
  const indexURL = document.querySelector('meta[name="search-index"]').content;
  let index = null;
  let selected = 0;

  const load = () => index || (index = fetch(indexURL).then((r) => r.json()).catch(() => []));
  const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mark = (s, terms) => {
    let out = esc(s);
    terms.forEach((t) => { out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "<mark>$1</mark>"); });
    return out;
  };

  const open = () => {
    if (!dialog.open) dialog.showModal();
    input.select();
    load();
  };
  document.querySelectorAll("[data-search-open]").forEach((b) => b.addEventListener("click", open));
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault(); open();
    }
  });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  const render = async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { list.innerHTML = ""; empty.hidden = true; return; }
    const terms = q.split(/\s+/).filter(Boolean);
    const items = await load();
    const scored = [];
    for (const it of items) {
      const t = it.t.toLowerCase(), d = (it.d || "").toLowerCase(), h = (it.h || "").toLowerCase(), w = (it.w || "").toLowerCase();
      let score = 0, all = true;
      for (const term of terms) {
        let s = 0;
        if (t.startsWith(term)) s += 12; else if (t.includes(term)) s += 8;
        if (w.includes(term)) s += 4;
        if (d.includes(term)) s += 3;
        if (h.includes(term)) s += 2;
        if (!s) { all = false; break; }
        score += s;
      }
      if (all) scored.push([score + (it.k === "Product" ? 3 : 0), it]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const top = scored.slice(0, 12).map((x) => x[1]);
    selected = 0;
    list.innerHTML = top.map((it, i) => `
      <li><a href="${esc(it.u)}" role="option" aria-selected="${i === 0}">
        <span class="r-where">${esc(it.w || it.k)}${it.w && it.k !== "Product" ? " · " + esc(it.k) : ""}</span>
        <span class="r-title">${mark(it.t, terms)}</span>
        ${it.d ? `<span class="r-desc">${mark(it.d, terms)}</span>` : ""}
      </a></li>`).join("");
    empty.hidden = top.length > 0;
  };
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    const links = [...list.querySelectorAll("a")];
    if (!links.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      selected = (selected + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
      links.forEach((a, i) => a.setAttribute("aria-selected", String(i === selected)));
      links[selected].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      window.location.href = links[selected].href;
    }
  });
})();

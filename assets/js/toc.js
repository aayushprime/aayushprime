// §11.11 Floating table of contents.
//
// The guide's version is Framer Motion: a spring-morphing shell, staggered row
// entrance and an indicator animated between measured row rects. Without React
// the shell morph and indicator travel are CSS transitions (declared on the
// elements in toc.html); this file owns state, reading position and the
// measurement the indicator needs.
//
// §12 reduced-motion layer: every scripted animation is skipped when the user
// asks for it, matching the global CSS kill switch.

(function () {
  const nav = document.querySelector("[data-toc]");
  if (!nav) return;

  const shell = nav.querySelector("[data-toc-shell]");
  const toggle = nav.querySelector("[data-toc-toggle]");
  const closeBtn = nav.querySelector("[data-toc-close]");
  const panel = nav.querySelector("[data-toc-panel]");
  const scroller = nav.querySelector("[data-toc-scroll]");
  const indicator = nav.querySelector("[data-toc-indicator]");
  const current = nav.querySelector("[data-toc-current]");
  const links = Array.from(nav.querySelectorAll("[data-toc-link]"));
  if (!links.length) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let open = false;
  // Must start null: setActive() short-circuits when the link is already active,
  // so pre-seeding links[0] would suppress the very first DOM update.
  let active = null;

  function setOpen(next) {
    open = next;
    shell.dataset.open = String(next);
    panel.hidden = !next;
    toggle.setAttribute("aria-expanded", String(next));
    if (next) {
      moveIndicator();
      scrollActiveIntoView();
    }
  }

  toggle.addEventListener("click", () => setOpen(!open));
  closeBtn.addEventListener("click", () => {
    setOpen(false);
    toggle.focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) {
      setOpen(false);
      toggle.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (open && !nav.contains(e.target)) setOpen(false);
  });

  links.forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  // §11.11: left: 8 for top-level rows, left: 12 for nested.
  function moveIndicator() {
    if (!active || !open) return;
    const top = active.offsetTop;
    const height = active.offsetHeight;
    indicator.style.top = top + "px";
    indicator.style.height = height + "px";
    indicator.style.left = (active.dataset.depth === "0" ? 8 : 12) + "px";
    indicator.style.opacity = "1";
  }

  function scrollActiveIntoView() {
    if (!active || !scroller) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < scroller.scrollTop || bottom > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTo({
        top: top - scroller.clientHeight / 2,
        behavior: reduce.matches ? "auto" : "smooth",
      });
    }
  }

  function setActive(link) {
    if (!link || link === active) return;
    links.forEach((l) => l.removeAttribute("data-active"));
    link.dataset.active = "true";
    active = link;
    current.textContent = link.textContent.trim();
    moveIndicator();
    if (open) scrollActiveIntoView();
  }

  // Reading position: track which heading was most recently crossed.
  const targets = links
    .map((link) => {
      const el = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      return el ? { el, link } : null;
    })
    .filter(Boolean);

  if (!targets.length) return;

  const visible = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });

      // Prefer the topmost heading currently in the reading band; if none are,
      // fall back to the last one scrolled past.
      let chosen = null;
      if (visible.size) {
        chosen = targets.find((t) => visible.has(t.el));
      } else {
        for (const t of targets) {
          if (t.el.getBoundingClientRect().top <= window.innerHeight * 0.2) chosen = t;
        }
      }
      if (chosen) setActive(chosen.link);
    },
    { rootMargin: "-10% 0px -70% 0px", threshold: 0 }
  );

  targets.forEach((t) => observer.observe(t.el));
  setActive(targets[0].link);
  window.addEventListener("resize", moveIndicator);
})();

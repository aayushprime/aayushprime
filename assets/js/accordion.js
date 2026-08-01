// §11.7 / §12 Expandable section motion.
//
// Two layers, and the offset between them is the point: the outer wrapper
// animates height, the inner animates opacity + a small slide delayed by 40ms
// so it trails. Collapsing them into one animated element loses the physicality.
//
// §12 durations:
//   open   height 380ms apple-ease, opacity 280ms apple-ease, inner 320ms +40ms
//   close  height 300ms apple-ease, opacity 180ms ease-in,    inner 160ms
// Exits are ~60% of entrances.

(function () {
  const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.querySelectorAll("[data-accordion]").forEach((item) => {
    const trigger = item.querySelector("[data-accordion-trigger]");
    const content = item.querySelector("[data-accordion-content]");
    const inner = item.querySelector("[data-accordion-inner]");
    if (!trigger || !content || !inner) return;

    let animation = null;

    function expand() {
      item.dataset.state = "open";
      trigger.setAttribute("aria-expanded", "true");
      content.hidden = false;

      if (reduce.matches) return;

      const target = inner.getBoundingClientRect().height;
      animation?.cancel();
      animation = content.animate(
        [
          { height: "0px", opacity: 0 },
          { height: target + "px", opacity: 1 },
        ],
        { duration: 380, easing: APPLE_EASE, fill: "none" }
      );
      inner.animate(
        [
          { opacity: 0, transform: "translateY(-6px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 320, delay: 40, easing: APPLE_EASE, fill: "backwards" }
      );
    }

    function collapse() {
      item.dataset.state = "closed";
      trigger.setAttribute("aria-expanded", "false");

      if (reduce.matches) {
        content.hidden = true;
        return;
      }

      const start = inner.getBoundingClientRect().height;
      animation?.cancel();
      animation = content.animate(
        [
          { height: start + "px", opacity: 1 },
          { height: "0px", opacity: 0 },
        ],
        { duration: 300, easing: APPLE_EASE, fill: "none" }
      );
      inner.animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(-4px)" },
        ],
        { duration: 160, easing: "ease-in", fill: "forwards" }
      );
      animation.onfinish = () => {
        content.hidden = true;
      };
    }

    trigger.addEventListener("click", () => {
      if (item.dataset.state === "open") collapse();
      else expand();
    });
  });
})();

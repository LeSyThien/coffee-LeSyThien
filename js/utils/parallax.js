/**
 * Parallax Effect - Smooth parallax scrolling for background elements
 * Elements with data-parallax-speed attribute will move at different speeds when scrolling
 */

export function initParallax() {
  const parallaxElements = document.querySelectorAll("[data-parallax-speed]");

  if (!parallaxElements.length) return;

  let ticking = false;

  function updateParallax() {
    const scrollY = window.scrollY;

    parallaxElements.forEach((element) => {
      const speed =
        parseFloat(element.getAttribute("data-parallax-speed")) || 0.5;
      const yMove = scrollY * speed;
      element.style.transform = `translateY(${yMove}px)`;
    });

    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }

  // Throttled scroll listener using requestAnimationFrame
  window.addEventListener("scroll", onScroll, { passive: true });

  // Initial call to set starting position
  updateParallax();
}

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initParallax);
} else {
  initParallax();
}

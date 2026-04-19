/**
 * Scroll Reveal - Intersection Observer for smooth reveal animations
 * Elements with [data-scroll-reveal] attribute will animate in as they come into view
 */

export function initScrollReveal() {
  const revealElements = document.querySelectorAll("[data-scroll-reveal]");

  if (!revealElements.length) return;

  // Intersection Observer with smooth Apple-like reveal
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Add revealed class when element comes into view
          entry.target.classList.add("revealed");
          // Optional: unobserve after reveal for performance
          // observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1, // Trigger when 10% of element is visible
      rootMargin: "0px 0px -100px 0px", // Start animation 100px before element enters viewport
    },
  );

  revealElements.forEach((element) => {
    observer.observe(element);
  });
}

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initScrollReveal);
} else {
  initScrollReveal();
}

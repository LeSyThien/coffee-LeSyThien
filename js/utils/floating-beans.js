/**
 * Floating Coffee Beans - Creates animated floating coffee beans in the hero section
 * Beans move slowly with parallax effect for 3D depth perception
 */

export function initFloatingBeans() {
  const beansContainer = document.getElementById("floating-beans");

  if (!beansContainer) return;

  const beanCount = Math.min(
    15,
    Math.max(8, Math.floor(window.innerWidth / 100)),
  );
  const beans = [];

  // Create random floating beans
  for (let i = 0; i < beanCount; i++) {
    const bean = document.createElement("div");
    bean.className = "floating-bean";

    const size = 6 + Math.random() * 8; // Random size between 6-14px
    const xPos = Math.random() * 100;
    const yPos = Math.random() * 100;
    const duration = 6 + Math.random() * 8; // Animation duration 6-14s
    const delay = Math.random() * -20; // Random delay
    const opacity = 0.2 + Math.random() * 0.3; // Opacity between 0.2-0.5

    bean.style.left = xPos + "%";
    bean.style.top = yPos + "%";
    bean.style.width = size + "px";
    bean.style.height = size * 1.5 + "px";
    bean.style.opacity = opacity;
    bean.style.animation = `float ${duration}s ease-in-out ${delay}s infinite`;

    beansContainer.appendChild(bean);
    beans.push({
      element: bean,
      x: xPos,
      y: yPos,
      speed: 0.3 + Math.random() * 0.7,
    });
  }

  // Parallax effect for floating beans on scroll
  let ticking = false;

  function updateBeansParallax() {
    const scrollY = window.scrollY;

    beans.forEach((bean) => {
      const offset = scrollY * bean.speed * 0.02;
      bean.element.style.transform = `translateY(${offset}px)`;
    });

    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateBeansParallax);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
}

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFloatingBeans);
} else {
  initFloatingBeans();
}

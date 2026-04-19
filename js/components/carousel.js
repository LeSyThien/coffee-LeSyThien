export function initBannerCarousel() {
  const heroContent = document.querySelector(".hero-content");
  const heroTitle = document.querySelector(".hero-title");
  const heroSubtitle = document.querySelector(".hero-subtitle");
  const heroCta = document.querySelector(".hero-cta");
  const heroSection = document.querySelector(".hero-section");

  if (!heroContent || !heroTitle || !heroSubtitle) return;

  // Banner data with different themes
  const banners = [
    {
      title: "Premium Coffee",
      subtitle:
        "Experience the art of exceptional coffee, crafted for the discerning palate",
      buttonText: "Order Now",
      buttonColor: "#c89b3c",
      backgroundColor:
        "linear-gradient(135deg, #0a0a0b 0%, #1a1a1c 50%, #0a0a0b 100%)",
    },
    {
      title: "Signature Aromat",
      subtitle:
        "Discover our carefully selected beans with rich, bold flavors from around the world",
      buttonText: "Explore Now",
      buttonColor: "#8b6914",
      backgroundColor:
        "linear-gradient(135deg, #2a1810 0%, #1a0f08 50%, #2a1810 100%)",
    },
    {
      title: "Morning Ritual",
      subtitle:
        "Start your day with our smooth, velvety cappuccino and fresh pastries",
      buttonText: "Get Started",
      buttonColor: "#d4af37",
      backgroundColor:
        "linear-gradient(135deg, #1a1410 0%, #0a0a0a 50%, #1a1410 100%)",
    },
    {
      title: "Limited Edition",
      subtitle:
        "Try our exclusive single-origin espresso blend available this season",
      buttonText: "Buy Now",
      buttonColor: "#c89b3c",
      backgroundColor:
        "linear-gradient(135deg, #0a0a0b 0%, #1a1a1c 50%, #0a0a0b 100%)",
    },
  ];

  let currentBannerIndex = 0;
  let isTransitioning = false;

  function updateBanner(newIndex) {
    if (isTransitioning) return;
    isTransitioning = true;

    const oldBanner = banners[currentBannerIndex];
    const newBanner = banners[newIndex];

    // Morphing animation: fade out old content
    heroTitle.style.animation = "none";
    heroTitle.style.transition = "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
    heroSubtitle.style.transition = "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)";

    heroTitle.style.opacity = "0.3";
    heroTitle.style.blur = "10px";
    heroTitle.style.transform = "scale(1.1)";
    heroSubtitle.style.opacity = "0.3";
    heroSubtitle.style.filter = "blur(10px)";

    // Update background with transition
    heroSection.style.transition =
      "background 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
    heroSection.style.background = newBanner.backgroundColor;

    // Update button color
    const button = heroCta.querySelector(".btn-primary");
    if (button) {
      button.style.transition = "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
      button.textContent = newBanner.buttonText;
      button.style.background = `linear-gradient(135deg, ${newBanner.buttonColor} 0%, ${adjustColor(newBanner.buttonColor, -30)} 100%)`;
    }

    // Wait for fade out, then update content
    setTimeout(() => {
      heroTitle.textContent = newBanner.title;
      heroSubtitle.textContent = newBanner.subtitle;

      // Fade in with new content
      heroTitle.style.opacity = "1";
      heroTitle.style.filter = "blur(0)";
      heroTitle.style.transform = "scale(1)";
      heroSubtitle.style.opacity = "1";
      heroSubtitle.style.filter = "blur(0)";

      // Add animation for letter-spacing
      heroTitle.style.letterSpacing = "0.2em";
      setTimeout(() => {
        heroTitle.style.transition = "letter-spacing 0.8s ease";
        heroTitle.style.letterSpacing = "normal";
      }, 100);

      currentBannerIndex = newIndex;
      isTransitioning = false;
    }, 400);
  }

  // Initialize with first banner
  const firstButton = heroCta.querySelector(".btn-primary");
  if (firstButton) {
    firstButton.style.background = `linear-gradient(135deg, ${banners[0].buttonColor} 0%, ${adjustColor(banners[0].buttonColor, -30)} 100%)`;
  }

  // Auto-rotate every 4 seconds
  setInterval(() => {
    const nextIndex = (currentBannerIndex + 1) % banners.length;
    updateBanner(nextIndex);
  }, 4000);
}

// Utility function to adjust hex color brightness
function adjustColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

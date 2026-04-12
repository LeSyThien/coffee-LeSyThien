/**
 * ============================================================================
 * LUMINA COFFEE - PRODUCT CATALOG MODULE
 * Description: Fetches products from Firestore, handles client-side filtering,
 * sorting, rendering UI cards, and manages the Product Details Modal.
 * Architecture: ES Modules, Dynamic DOM Generation.
 * ============================================================================
 */

import { fetchCollection } from "./firebase.js";
import { formatCurrency, calculateDiscountPrice, Toast } from "./utils.js";
import { addToCart } from "./cart.js"; // Will be defined in Part 3

// Local state caching to avoid redundant Firestore reads
let allProducts = [];
let currentCategory = "all";
let currentSort = "featured";
let searchQuery = "";

/**
 * Initializes the product catalog: Fetches data, sets up listeners, and renders.
 */
export async function initProducts() {
  const gridContainer = document.getElementById("product-grid");
  if (!gridContainer) return; // Not on the index page

  try {
    // Fetch all available products (admin manages 'available' flag)
    // We fetch all at once for seamless client-side filtering in MVP
    allProducts = await fetchCollection("products");

    setupEventListeners();
    filterAndRenderProducts();
  } catch (error) {
    console.error("Failed to initialize products:", error);
    gridContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <h3 class="text-danger">Failed to load menu.</h3>
                <p>Please refresh the page or try again later.</p>
            </div>
        `;
    Toast.error("Could not load products from the database.");
  }
}

/**
 * Sets up listeners for category tabs, search input, and sort dropdown.
 */
function setupEventListeners() {
  // 1. Category Tabs
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", (e) => {
      // Update active state
      tabs.forEach((t) => t.classList.remove("active"));
      e.target.classList.add("active");

      // Update state and re-render
      currentCategory = e.target.getAttribute("data-category");
      filterAndRenderProducts();
    });
  });

  // 2. Search Input
  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");

  const handleSearch = () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    filterAndRenderProducts();
  };

  if (searchInput) {
    searchInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") handleSearch();
      // Real-time search for better UX
      searchQuery = e.target.value.trim().toLowerCase();
      filterAndRenderProducts();
    });
  }
  if (searchBtn) searchBtn.addEventListener("click", handleSearch);

  // 3. Sort Dropdown
  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      currentSort = e.target.value;
      filterAndRenderProducts();
    });
  }

  // 4. Modal Close Handlers
  const modal = document.getElementById("product-modal");
  const closeBtn = document.getElementById("closeModalBtn");

  if (modal && closeBtn) {
    closeBtn.addEventListener("click", closeProductModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeProductModal(); // Click outside to close
    });
  }
}

/**
 * Applies current filters and sorts, then triggers DOM rendering.
 */
function filterAndRenderProducts() {
  let filtered = [...allProducts];

  // Filter by Category
  if (currentCategory !== "all") {
    filtered = filtered.filter((p) => p.category === currentCategory);
  }

  // Filter by Search Query
  if (searchQuery) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery) ||
        (p.description && p.description.toLowerCase().includes(searchQuery)),
    );
  }

  // Sort Logic
  switch (currentSort) {
    case "price-low":
      filtered.sort((a, b) => {
        const priceA = calculateDiscountPrice(a.price, a.discount);
        const priceB = calculateDiscountPrice(b.price, b.discount);
        return priceA - priceB;
      });
      break;
    case "price-high":
      filtered.sort((a, b) => {
        const priceA = calculateDiscountPrice(a.price, a.discount);
        const priceB = calculateDiscountPrice(b.price, b.discount);
        return priceB - priceA;
      });
      break;
    case "featured":
    default:
      // For MVP, 'featured' can just be default DB order, or prioritize discounted
      filtered.sort((a, b) => (b.discount || 0) - (a.discount || 0));
      break;
  }

  renderProductGrid(filtered);
}

/**
 * Constructs and injects HTML for the product grid based on filtered data.
 * @param {Array} products - Array of product objects.
 */
function renderProductGrid(products) {
  const grid = document.getElementById("product-grid");
  const emptyMsg = document.getElementById("no-products-msg");

  grid.innerHTML = ""; // Clear existing

  if (products.length === 0) {
    grid.classList.add("hidden");
    emptyMsg.classList.remove("hidden");
    return;
  }

  grid.classList.remove("hidden");
  emptyMsg.classList.add("hidden");

  products.forEach((product) => {
    const finalPrice = calculateDiscountPrice(product.price, product.discount);
    const isDiscounted = product.discount && product.discount > 0;
    const isAvailable = product.available;

    // Construct dynamic Badges
    let badgesHtml = "";
    if (isDiscounted && isAvailable) {
      badgesHtml += `<span class="badge-discount">-${product.discount}%</span>`;
    }
    if (!isAvailable) {
      badgesHtml += `<span class="badge-stock">Out of Stock</span>`;
    }

    // Price Row HTML
    let priceHtml = "";
    if (isDiscounted) {
      priceHtml = `
                <span class="price-current">${formatCurrency(finalPrice)}</span>
                <span class="price-original">${formatCurrency(product.price)}</span>
            `;
    } else {
      priceHtml = `<span class="price-current">${formatCurrency(product.price)}</span>`;
    }

    // Create DOM Element
    const card = document.createElement("div");
    card.className = `product-card ${!isAvailable ? "opacity-50" : ""}`;
    // Using dataset to store ID for click listener
    card.dataset.id = product.id;

    // Placeholder fallback if image missing
    const imgSrc = product.image || "assets/images/placeholder-coffee.jpg";

    card.innerHTML = `
            <div class="product-image-wrapper">
                ${badgesHtml}
                <img src="${imgSrc}" alt="${product.name}" class="product-image" loading="lazy">
            </div>
            <div class="product-info">
                <span class="product-category">${product.category || "Coffee"}</span>
                <h3 class="product-name">${product.name}</h3>
                <div class="product-price-row">
                    ${priceHtml}
                </div>
            </div>
        `;

    // Attach click listener to open modal (if available)
    card.addEventListener("click", () => {
      if (isAvailable) {
        openProductModal(product.id);
      } else {
        Toast.warning("This item is currently out of stock.");
      }
    });

    grid.appendChild(card);
  });
}

/**
 * Opens the Product Detail Modal with rich UI data.
 * @param {string} productId - Document ID of the product.
 */
function openProductModal(productId) {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;

  const modal = document.getElementById("product-modal");
  const modalBody = document.getElementById("modal-product-details");

  const finalPrice = calculateDiscountPrice(product.price, product.discount);
  const isDiscounted = product.discount && product.discount > 0;
  const imgSrc = product.image || "assets/images/placeholder-coffee.jpg";

  // Inject rich modal content
  modalBody.innerHTML = `
        <div style="display: flex; flex-wrap: wrap; gap: 30px;">
            <div style="flex: 1; min-width: 300px; border-radius: var(--radius-md); overflow: hidden;">
                <img src="${imgSrc}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <div style="flex: 1; min-width: 300px; display: flex; flex-direction: column; justify-content: center;">
                <span class="accent" style="text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1px;">
                    ${product.category || "Premium Selection"}
                </span>
                <h2 style="font-size: 2.2rem; margin-bottom: 16px; margin-top: 8px;">${product.name}</h2>
                <p class="text-muted" style="margin-bottom: 24px;">
                    ${product.description || "A rich, flavorful blend crafted by our master roasters to awaken your senses and provide the perfect coffee experience."}
                </p>
                
                <div style="display: flex; align-items: baseline; gap: 16px; margin-bottom: 30px;">
                    <span style="font-size: 2rem; font-weight: 700; color: var(--accent-secondary);">
                        ${formatCurrency(finalPrice)}
                    </span>
                    ${
                      isDiscounted
                        ? `
                        <span style="text-decoration: line-through; color: var(--text-muted); font-size: 1.2rem;">
                            ${formatCurrency(product.price)}
                        </span>
                        <span style="background: var(--danger); color: white; padding: 4px 8px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: bold;">
                            -${product.discount}%
                        </span>
                    `
                        : ""
                    }
                </div>

                <div style="display: flex; gap: 16px; align-items: center;">
                    <div style="display: flex; align-items: center; background: rgba(255,255,255,0.05); border-radius: var(--radius-pill); padding: 5px;">
                        <button id="modalQtyMinus" style="width: 40px; height: 40px; border-radius: 50%; background: none; color: white; font-size: 1.2rem;">-</button>
                        <span id="modalQtyDisplay" style="width: 40px; text-align: center; font-weight: 600;">1</span>
                        <button id="modalQtyPlus" style="width: 40px; height: 40px; border-radius: 50%; background: var(--accent-primary); color: white; font-size: 1.2rem;">+</button>
                    </div>
                    
                    <button id="modalAddToCartBtn" class="btn btn-primary btn-large" style="flex: 1;">
                        Add to Cart
                    </button>
                </div>
            </div>
        </div>
    `;

  // Setup Quantity Listeners
  let qty = 1;
  const qtyDisplay = document.getElementById("modalQtyDisplay");

  document.getElementById("modalQtyMinus").addEventListener("click", () => {
    if (qty > 1) {
      qty--;
      qtyDisplay.textContent = qty;
    }
  });

  document.getElementById("modalQtyPlus").addEventListener("click", () => {
    if (qty < 10) {
      // Max 10 per item for MVP safety
      qty++;
      qtyDisplay.textContent = qty;
    } else {
      Toast.warning("Maximum 10 items per order.");
    }
  });

  // Setup Add to Cart Listener
  document.getElementById("modalAddToCartBtn").addEventListener("click", () => {
    // Construct item object to pass to Cart Module
    const itemToAdd = {
      id: product.id,
      name: product.name,
      price: finalPrice, // Store the calculated price at time of add
      image: product.image,
      qty: qty,
    };

    addToCart(itemToAdd);
    closeProductModal();
  });

  // Reveal Modal
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden"; // Prevent background scrolling
}

/**
 * Closes the Product Detail Modal.
 */
function closeProductModal() {
  const modal = document.getElementById("product-modal");
  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = ""; // Restore scrolling
  }
}

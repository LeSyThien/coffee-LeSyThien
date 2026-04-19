/**
 * Seed VIP-Exclusive Products
 * Run this once to populate the database with exclusive VIP products
 * Usage: node seed-vip-products.js (from functions folder)
 */
import admin from "firebase-admin";
import serviceAccount from "./serviceAccountKey.json" with { type: "json" };
// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const vipProducts = [
  // VIP 1-2: Exclusive Light Roasts
  {
    name: "Ethiopian Yirgacheffe Reserve VIP",
    description: "Exclusive single-origin Ethiopian coffee with floral notes",
    price: 150000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 50,
    discount: 5,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 1,
  },
  {
    name: "Kenya AA Premium VIP",
    description: "Rare Kenya AA grade beans exclusive for VIP members",
    price: 160000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1556742743-4174b4e6e3b5?w=500&h=500&fit=crop",
    stock: 40,
    discount: 5,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 1,
  },
  {
    name: "Colombia Geisha VIP",
    description: "Rare and exotic Colombian Geisha variety",
    price: 180000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 30,
    discount: 8,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 2,
  },

  // VIP 3: Medium Roasts + Accessories
  {
    name: "Java Island Dark Roast VIP",
    description: "Bold and rich Dark Roast from Java with chocolate undertones",
    price: 140000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559329007-40732582a0f5?w=500&h=500&fit=crop",
    stock: 45,
    discount: 10,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 3,
  },
  {
    name: "Vietnamese Weasel Coffee VIP",
    description: "Famous Vietnamese Weasel-processed coffee (Limited Edition)",
    price: 250000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1514432324607-2e467f4af445?w=500&h=500&fit=crop",
    stock: 25,
    discount: 12,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 3,
  },
  {
    name: "Premium Coffee Grinder VIP",
    description: "Professional-grade burr grinder for VIP members",
    price: 2000000,
    category: "Equipment",
    image:
      "https://images.unsplash.com/photo-1599639957438-a8d967a2e56f?w=500&h=500&fit=crop",
    stock: 20,
    discount: 10,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 3,
  },

  // VIP 5: Rare & Limited Editions
  {
    name: "Jamaican Blue Mountain Elite",
    description: "Ultra-rare Jamaican Blue Mountain (Limited to 10 bags)",
    price: 450000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 10,
    discount: 15,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 5,
  },
  {
    name: "Hawaiian Kona Supreme VIP",
    description: "Exclusive Hawaiian Kona from Kona District (VIP 5+ only)",
    price: 380000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500&h=500&fit=crop",
    stock: 15,
    discount: 12,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 5,
  },
  {
    name: "Tanzanian Peaberry VIP",
    description: "Rare peaberry beans from Tanzania with complex flavors",
    price: 200000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1581558991395-fsi0f2af4f45?w=500&h=500&fit=crop",
    stock: 35,
    discount: 10,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 5,
  },

  // VIP 6+: Premium Accessories & Services
  {
    name: "Vintage Italian Espresso Machine VIP",
    description:
      "Authentic vintage Italian espresso machine for true coffee lovers",
    price: 8000000,
    category: "Equipment",
    image:
      "https://images.unsplash.com/photo-1565299580473-dea0002995c9?w=500&h=500&fit=crop",
    stock: 5,
    discount: 8,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 6,
  },
  {
    name: "Thai Elephant Dung Coffee VIP",
    description:
      "Extremely rare coffee processed through elephant digestive system",
    price: 550000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 8,
    discount: 20,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 6,
  },
  {
    name: "Hand-Crafted Ceramic Pour Over Set VIP",
    description: "Artisan-made ceramic pour over set with luxury packaging",
    price: 1500000,
    category: "Equipment",
    image:
      "https://images.unsplash.com/photo-1511868809267-b3f0b75da0c8?w=500&h=500&fit=crop",
    stock: 12,
    discount: 10,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 6,
  },

  // VIP 8+: Ultra-Premium Collection
  {
    name: "Panama Geisha Auction Winner VIP",
    description: "Award-winning Panama Geisha - once per year harvest",
    price: 1200000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 5,
    discount: 15,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 8,
  },
  {
    name: "Brazilian Anaerobic Fermentation",
    description: "Experimental anaerobic fermented coffee with wine-like notes",
    price: 280000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 18,
    discount: 12,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 8,
  },
  {
    name: "Gold-Plated Coffee Maker VIP",
    description: "Luxury gold-plated Turkish coffee maker - status symbol",
    price: 3500000,
    category: "Equipment",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 3,
    discount: 5,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 8,
  },

  // VIP 10: The Ultimate Collection
  {
    name: "Afghan Heirloom VIP 10",
    description:
      "Ultra-rare Afghan heirloom coffee - only available for VIP 10",
    price: 2000000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 3,
    discount: 20,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 10,
  },
  {
    name: "Exclusive VIP 10 Coffee Club Membership",
    description:
      "One-year membership to elite coffee club with monthly rare beans",
    price: 50000000,
    category: "Services",
    image:
      "https://images.unsplash.com/photo-1495474472645-4c71bcdd2d18?w=500&h=500&fit=crop",
    stock: 100,
    discount: 0,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 10,
  },
  {
    name: "Personal Coffee Sommelier Consultation VIP 10",
    description: "1-hour consultation with professional coffee sommelier",
    price: 15000000,
    category: "Services",
    image:
      "https://images.unsplash.com/photo-1506884119237-4588168b6c37?w=500&h=500&fit=crop",
    stock: 50,
    discount: 0,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 10,
  },

  // Fill remaining slots with varied tiers
  {
    name: "Vietnamese Traditional Filter Set VIP",
    description:
      "Classic Vietnamese phin filter set - perfect for traditionalists",
    price: 89000,
    category: "Equipment",
    image:
      "https://images.unsplash.com/photo-1511868809267-b3f0b75da0c8?w=500&h=500&fit=crop",
    stock: 60,
    discount: 8,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 2,
  },
  {
    name: "Cambodian Arabica Reserve VIP",
    description: "Rare Cambodian single-origin arabica with unique terroir",
    price: 170000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 28,
    discount: 7,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 3,
  },
  {
    name: "Peruvian Highland Organic VIP",
    description:
      "Certified organic Peruvian highland coffee - environmentally conscious",
    price: 195000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 32,
    discount: 10,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 4,
  },
  {
    name: "Sumatra Mandheling VIP",
    description: "Bold Sumatran Mandheling with earthy undertones",
    price: 155000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1599639957438-a8d967a2e56f?w=500&h=500&fit=crop",
    stock: 42,
    discount: 8,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 3,
  },
  {
    name: "Mexican Altura Chiapas VIP",
    description: "Premium Mexican high-altitude Chiapas with balanced flavor",
    price: 162000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 38,
    discount: 9,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 4,
  },
  {
    name: "Rwanda Fully Washed Specialty VIP",
    description: "Specialty-grade Rwandan coffee with exceptional clarity",
    price: 185000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1514432324607-2e467f4af445?w=500&h=500&fit=crop",
    stock: 26,
    discount: 11,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 5,
  },
  {
    name: "Burundian Arabica Natural Process VIP",
    description: "Natural processed Burundian arabica for complex sweetness",
    price: 210000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1559056199-641a0ac8b3f7?w=500&h=500&fit=crop",
    stock: 19,
    discount: 12,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 5,
  },
  {
    name: "Uganda Elgon Mountain VIP",
    description:
      "Limited edition Uganda Elgon mountain coffee - collectors' item",
    price: 220000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500&h=500&fit=crop",
    stock: 14,
    discount: 13,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 6,
  },
  {
    name: "Premium Turkish Copper Coffee Pot VIP",
    description: "Handcrafted Turkish copper coffee pot - antique style",
    price: 950000,
    category: "Equipment",
    image:
      "https://images.unsplash.com/photo-1599639957438-a8d967a2e56f?w=500&h=500&fit=crop",
    stock: 8,
    discount: 10,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 7,
  },
  // VIP 9: The World's Rarest
  {
    name: "Black Ivory Coffee Reserve (VIP 9+)",
    description:
      "The world's rarest coffee processed by elephants in Thailand. Extremely limited.",
    price: 1500000,
    category: "Coffee Beans",
    image:
      "https://images.unsplash.com/photo-1514432324607-2e467f4af445?w=500&h=500&fit=crop",
    stock: 5,
    discount: 15,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 9,
  },
  // VIP 10: The Ultimate Status Symbols
  {
    name: "24K Gold-Encrusted Porcelain Cup",
    description:
      "Hand-painted porcelain cup with 24K gold rim and a real diamond accent.",
    price: 25000000,
    category: "Equipment",
    image:
      "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=500&h=500&fit=crop",
    stock: 2,
    discount: 0,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 10,
  },
  {
    name: "Private Coffee Plantation Helicopter Tour",
    description:
      "A luxury helicopter tour to our private estates in Da Lat with a personal sommelier.",
    price: 100000000,
    category: "Services",
    image:
      "https://images.unsplash.com/photo-1478214751550-682f3c3d3a7d?w=500&h=500&fit=crop",
    stock: 10,
    discount: 0,
    available: true,
    showOnHome: false,
    isVIPOnly: true,
    requiredVIP: 10,
  },
];

async function seedDatabase() {
  try {
    console.log("🗑️ Clearing existing products...");
    const productsRef = db.collection("products");
    const snapshot = await productsRef.get();

    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`🗑️ Cleared ${snapshot.docs.length} existing products`);
    }

    console.log("🌱 Starting to seed VIP products...");
    let count = 0;

    for (const product of vipProducts) {
      const docRef = await db.collection("products").add({
        ...product,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      count++;
      console.log(
        `✅ Added product ${count}/${vipProducts.length}: ${product.name}`,
      );
    }

    console.log(`\n🎉 Successfully seeded ${count} VIP products!`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();

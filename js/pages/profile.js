import store from "../store/index.js";
import { calculateMemberRank } from "../services/firebase.service.js";

/**
 * Render member rank information on profile (Badge has been moved to Navbar)
 */
export function renderMemberRankBadge() {
  const user = store.getState().user;
  if (!user) return;

  // Badge now only shows on Navbar - just render the name
  const nameBadgeContainer = document.getElementById("name-badge-container");
  if (nameBadgeContainer) {
    nameBadgeContainer.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; justify-content: center;">
        <span id="user-name" style="font-family: var(--font-family-heading); font-size: 24px; font-weight: 700; color: #fff; text-align: center; animation: nameSlideUp 0.8s ease-out 0.2s both;">${user.name || "Guest"}</span>
      </div>
    `;
  }

  // Add sparkling animation keyframes if not already in style
  if (!document.getElementById("member-rank-styles")) {
    const style = document.createElement("style");
    style.id = "member-rank-styles";
    style.textContent = `
      @keyframes sparkle {
        0%, 100% { 
          box-shadow: 0 0 20px rgba(212, 175, 55, 0.6), 
                      0 0 40px rgba(212, 175, 55, 0.3);
        }
        50% { 
          box-shadow: 0 0 30px rgba(212, 175, 55, 0.9), 
                      0 0 60px rgba(212, 175, 55, 0.5);
        }
      }
      
      @keyframes starPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      
      .member-tier-card {
        background: linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(198, 124, 78, 0.05) 100%);
        border: 1px solid rgba(212, 175, 55, 0.3);
        border-radius: 12px;
        padding: 20px;
        animation: sectionFadeIn 0.6s ease-out forwards;
      }
      
      .tier-progress-bar {
        width: 100%;
        height: 8px;
        background: #1c1c1e;
        border-radius: 4px;
        overflow: hidden;
        position: relative;
      }
      
      .tier-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #d4af37, #f4d03f);
        border-radius: 4px;
        transition: width 0.6s ease-out;
        box-shadow: 0 0 10px rgba(212, 175, 55, 0.6);
      }
    `;
    document.head.appendChild(style);
  }

  // Render member tier card in profile sections
  const tierCardContainer = document.getElementById("member-tier-card");
  if (tierCardContainer) {
    const nextTierSpent = memberInfo.nextThreshold - totalSpent;
    const spentDisplay = totalSpent.toLocaleString("vi-VN");
    const nextDisplay =
      memberInfo.nextThreshold === Infinity
        ? "👑 Max Tier Reached!"
        : `${memberInfo.nextThreshold.toLocaleString("vi-VN")}đ`;

    tierCardContainer.innerHTML = `
      <div class="member-tier-card">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
          <div style="
            font-size: 32px;
            animation: starPulse 2s ease-in-out infinite;
            filter: drop-shadow(0 0 8px rgba(212, 175, 55, 0.8));
          ">⭐</div>
          <div>
            <div style="color: #d4af37; font-size: 12px; font-weight: 700; text-transform: uppercase;">Your Rank</div>
            <div style="color: #fff; font-size: 20px; font-weight: 700;">${memberInfo.title}</div>
            <div style="color: #aaa; font-size: 12px;">Get ${memberInfo.discount}% discount on all purchases</div>
          </div>
        </div>

        <div class="tier-progress-bar" style="margin-bottom: 12px;">
          <div class="tier-progress-fill" style="width: ${memberInfo.progress}%;"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 12px;">
          <div>
            <div style="color: #aaa; margin-bottom: 4px;">Total Spent</div>
            <div style="color: #d4af37; font-weight: 700; font-size: 14px;">${spentDisplay}đ</div>
          </div>
          <div>
            <div style="color: #aaa; margin-bottom: 4px;">Next Tier at</div>
            <div style="color: #fff; font-weight: 700; font-size: 14px;">${nextDisplay}</div>
          </div>
        </div>

        ${
          memberInfo.nextThreshold !== Infinity
            ? `<div style="
              margin-top: 16px;
              padding: 12px;
              background: rgba(212, 175, 55, 0.1);
              border-left: 3px solid #d4af37;
              border-radius: 4px;
              font-size: 12px;
              color: #d4af37;
            ">
              💡 Spend ${nextTierSpent.toLocaleString("vi-VN")}đ more to reach ${memberInfo.title} (Tier ${memberInfo.rank + 1})!
            </div>`
            : `<div style="
              margin-top: 16px;
              padding: 12px;
              background: rgba(212, 175, 55, 0.1);
              border-left: 3px solid #d4af37;
              border-radius: 4px;
              font-size: 12px;
              color: #d4af37;
            ">
              🎉 You've reached the maximum VIP rank! Enjoy 10% discount on all purchases!
            </div>`
        }
      </div>
    `;
  }
}

/**
 * Initialize profile page
 */
export function initProfile() {
  // Subscribe to store updates to re-render badge when user data changes
  store.subscribe(() => {
    renderMemberRankBadge();
  });

  // Initial render
  renderMemberRankBadge();
}

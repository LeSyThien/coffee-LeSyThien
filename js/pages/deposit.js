import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { initializeAuth } from "../core/auth-init.js";
import { initCart } from "../components/cart.js";
import { initNavbar } from "../components/navbar.js";
import store from "../store/index.js";
import { auth, db, storage } from "../services/firebase.service.js";
import { depositTransaction } from "../services/transaction.service.js";

// VietQR: mã BIN MB BANK — giữ khớp với thông tin thụ hưởng thật trên UI.
const BANK_INFO = {
  accountName: "LE SY THIEN",
  accountNumber: "0963926476",
  bankName: "MB BANK",
  bankCode: "970422",
};

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000, 1000000, 2000000];
const TRANSACTION_CODE_PATTERN = /^[A-Z0-9]{8,20}$/;
const CREATE_BUTTON_COOLDOWN_MS = 7000;
const QR_TIMEOUT_MS = 15 * 60 * 1000;
const STORAGE_KEY = "deposit-active-request-v2";
const SUPPORT_URL = "./profile.html#support";

let els = {};

function isDepositPage() {
  return document.body.getAttribute("data-page") === "deposit";
}

function bindDepositElements() {
  els = {
    balance: document.getElementById("current-balance"),
    amountInput: document.getElementById("deposit-amount"),
    quickAmounts: document.getElementById("quick-amounts"),
    createQrBtn: document.getElementById("create-qr-btn"),
    backBtn: document.getElementById("back-step-btn"),
    confirmTransferredBtn: document.getElementById("confirm-transferred-btn"),
    regenerateBtn: document.getElementById("regenerate-qr-btn"),
    copyTransferBtn: document.getElementById("copy-transfer-btn"),
    uploadEvidenceBtn: document.getElementById("upload-evidence-btn"),
    evidenceInput: document.getElementById("evidence-input"),
    evidencePreview: document.getElementById("evidence-preview"),
    evidenceHint: document.getElementById("evidence-hint"),
    stagePanels: [...document.querySelectorAll(".stage-panel")],
    stepDots: [...document.querySelectorAll(".step-dot")],
    toastStack: document.getElementById("toast-stack"),
    offlineBanner: document.getElementById("offline-banner"),
    offlineText: document.getElementById("offline-text"),
    countdown: document.getElementById("countdown"),
    qrImage: document.getElementById("vietqr-image"),
    transferContent: document.getElementById("transfer-content"),
    txnId: document.getElementById("txn-id"),
    transactionCodeInput: document.getElementById("transaction-code-input"),
    transactionCodeError: document.getElementById("transaction-code-error"),
    transactionCodeHelper: document.getElementById("transaction-code-helper"),
    submitTransactionCodeBtn: document.getElementById(
      "submit-transaction-code-btn",
    ),
    progressTimeline: document.getElementById("progress-timeline"),
    recentTransactions: document.getElementById("recent-transactions"),
    detailTxnId: document.getElementById("detail-txn-id"),
    detailTransactionCode: document.getElementById("detail-transaction-code"),
    detailAmount: document.getElementById("detail-amount"),
    detailStatus: document.getElementById("detail-status"),
    detailUpdatedAt: document.getElementById("detail-updated-at"),
    detailHint: document.getElementById("detail-hint"),
    statusPill: document.getElementById("status-pill"),
    statusTitle: document.getElementById("status-title"),
    statusCopy: document.getElementById("status-copy"),
    supportBtn: document.getElementById("support-btn"),
    summaryAccountName: document.getElementById("summary-account-name"),
    summaryAccountNumber: document.getElementById("summary-account-number"),
    summaryBankName: document.getElementById("summary-bank-name"),
    qrAmount: document.getElementById("qr-amount"),
    qrOwner: document.getElementById("qr-owner"),
    qrBank: document.getElementById("qr-bank"),
    helpCenterLink: document.getElementById("help-center-link"),
    confettiLayer: document.getElementById("confetti-layer"),
    stageTrack: document.getElementById("stage-track"),
  };
}

const state = {
  stage: 1,
  user: null,
  balance: 0,
  isBusy: false,
  unsubscribeDeposit: null,
  countdownTimer: null,
  activeRequest: null,
};

let createCooldownTimer = null;
let createCooldownInterval = null;

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")}đ`;
}

function formatDate(value) {
  if (!value) return "Chưa cập nhật";
  const parsed = value?.toDate ? value.toDate() : new Date(value);
  return parsed.toLocaleString("vi-VN");
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function setLoading(button, loading, label) {
  if (!button) return;
  button.disabled = loading;
  button.classList.toggle("loading", loading);
  if (label) {
    button.dataset.defaultLabel ||= button.textContent;
    button.textContent = loading ? label : button.dataset.defaultLabel;
  }
}

function setCreateButtonCooldown(duration = CREATE_BUTTON_COOLDOWN_MS) {
  if (!els.createQrBtn) return;
  els.createQrBtn.disabled = true;
  const defaultLabel =
    els.createQrBtn.dataset.defaultLabel || els.createQrBtn.textContent;
  let remaining = Math.ceil(duration / 1000);
  els.createQrBtn.textContent = `Đang tạo yêu cầu... (${remaining}s)`;

  if (createCooldownTimer) {
    window.clearTimeout(createCooldownTimer);
  }
  if (createCooldownInterval) {
    window.clearInterval(createCooldownInterval);
  }

  createCooldownInterval = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      els.createQrBtn.textContent = `Đang tạo yêu cầu... (${remaining}s)`;
    } else {
      window.clearInterval(createCooldownInterval);
      createCooldownInterval = null;
      els.createQrBtn.textContent = defaultLabel;
      els.createQrBtn.disabled = false;
    }
  }, 1000);

  createCooldownTimer = window.setTimeout(() => {
    if (createCooldownInterval) {
      window.clearInterval(createCooldownInterval);
      createCooldownInterval = null;
    }
    els.createQrBtn.textContent = defaultLabel;
    els.createQrBtn.disabled = false;
    createCooldownTimer = null;
  }, duration);
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `deposit-toast ${type}`;
  toast.textContent = message;
  els.toastStack.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 240);
  }, 3200);
}

function updateOfflineBanner() {
  const online = navigator.onLine;
  els.offlineBanner.classList.toggle("show", !online);
  els.offlineBanner.classList.toggle("offline", !online);
  els.offlineText.textContent = online
    ? ""
    : "Mất mạng tạm thời. Trang vẫn giữ trạng thái giao dịch và sẽ đồng bộ lại khi có kết nối.";
}

function updateStageTrackTransform(stage) {
  if (!els.stageTrack) return;
  const offset = -(stage - 1) * (100 / 3);
  els.stageTrack.style.transform = `translateX(${offset}%)`;
}

function setStage(nextStage) {
  state.stage = nextStage;
  updateStageTrackTransform(nextStage);

  els.stagePanels.forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.stage) === nextStage);
  });

  els.stepDots.forEach((dot) => {
    const step = Number(dot.dataset.step);
    dot.classList.toggle("active", step === nextStage);
    dot.classList.toggle("done", step < nextStage);
  });

  els.backBtn.classList.toggle("hidden", nextStage === 1);
}

function renderQuickAmounts() {
  els.quickAmounts.innerHTML = QUICK_AMOUNTS.map(
    (amount) => `
      <button type="button" class="quick-amount-btn" data-amount="${amount}">
        ${formatCurrency(amount)}
      </button>
    `,
  ).join("");

  els.quickAmounts.querySelectorAll(".quick-amount-btn").forEach((button) => {
    button.addEventListener("click", () => {
      els.amountInput.value = button.dataset.amount;
      syncQuickAmountState();
      vibrateButton(button);
    });
  });
}

function syncQuickAmountState() {
  const amount = Number(els.amountInput.value || 0);
  els.quickAmounts.querySelectorAll(".quick-amount-btn").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.amount) === amount);
  });
}

function vibrateButton(button) {
  button.style.transform = "scale(0.94)";
  window.setTimeout(() => {
    button.style.transform = "";
  }, 110);
}

function generateTxnId() {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 12; i += 1) {
    suffix += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return `DEP_${suffix}`;
}

function buildTransferContent(txnId, userId) {
  return `${txnId} ${userId}`;
}

function buildVietQrUrl({ amount, transferContent }) {
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: transferContent,
    accountName: BANK_INFO.accountName,
  });
  return `https://img.vietqr.io/image/${BANK_INFO.bankCode}-${BANK_INFO.accountNumber}-compact2.png?${params.toString()}`;
}

function saveActiveRequest() {
  if (!state.activeRequest) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      depositId: state.activeRequest.depositId,
      txnId: state.activeRequest.txnId,
      amount: state.activeRequest.amount,
      userId: state.activeRequest.userId,
    }),
  );
}

function clearActiveRequest() {
  if (state.unsubscribeDeposit) {
    state.unsubscribeDeposit();
    state.unsubscribeDeposit = null;
  }

  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }

  state.activeRequest = null;
  saveActiveRequest();
}

function loadActiveRequestFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (error) {
    console.warn("Cannot parse saved deposit request", error);
    return null;
  }
}

function updateBalanceDisplay(nextBalance) {
  const start = Number(state.balance || 0);
  const end = Number(nextBalance || 0);
  const duration = 1400;
  const startAt = performance.now();

  function animate(now) {
    const linear = Math.min((now - startAt) / duration, 1);
    const progress = easeOutCubic(linear);
    const currentValue = Math.floor(start + (end - start) * progress);
    els.balance.textContent = formatCurrency(currentValue);
    if (linear < 1) {
      requestAnimationFrame(animate);
      return;
    }
    state.balance = end;
  }

  requestAnimationFrame(animate);
}

function updateStageSummary(requestData) {
  const status = normalizeStatus(requestData?.status);
  els.transferContent.value = requestData?.transferContent || "";
  els.txnId.textContent = requestData?.txnId || "--";
  els.detailTxnId.textContent = requestData?.txnId || "--";
  if (els.detailTransactionCode) {
    els.detailTransactionCode.textContent = requestData?.transactionCode || "—";
  }
  els.detailAmount.textContent = formatCurrency(requestData?.amount || 0);
  els.detailStatus.textContent = status.label;
  els.detailUpdatedAt.textContent = formatDate(
    requestData?.updatedAt || requestData?.createdAt,
  );
  els.qrAmount.textContent = formatCurrency(requestData?.amount || 0);
  els.qrOwner.textContent = BANK_INFO.accountName;
  els.qrBank.textContent = `${BANK_INFO.bankName} - ${BANK_INFO.accountNumber}`;
  els.qrImage.src = requestData?.qrUrl || "";
}

function normalizeStatus(rawStatus) {
  const status = rawStatus || "pending";

  if (status === "approved") {
    return { value: "success", label: "Nạp tiền thành công" };
  }

  if (status === "rejected") {
    return { value: "failed", label: "Đã từ chối" };
  }

  if (status === "success") {
    return { value: "success", label: "Nạp tiền thành công" };
  }

  if (status === "failed") {
    return { value: "failed", label: "Cần đối soát" };
  }

  if (status === "checking") {
    return { value: "checking", label: "Đang kiểm tra" };
  }

  return { value: "pending", label: "Chờ chuyển khoản" };
}

function renderStatusState(requestData) {
  const normalized = normalizeStatus(requestData?.status);
  const currentStatus = normalized.value;

  els.statusPill.className = `status-pill ${currentStatus}`;
  els.statusPill.textContent = normalized.label;

  if (currentStatus === "pending") {
    els.statusTitle.textContent = "Mã QR đã sẵn sàng";
    els.statusCopy.textContent =
      "Nhập mã giao dịch để hệ thống xác thực. Sau đó yêu cầu sẽ vào hàng đợi đối soát.";
    els.detailHint.textContent =
      "Bạn có thể dán mã giao dịch từ biên lai hoặc thông báo ngân hàng.";
    return;
  }

  if (currentStatus === "checking") {
    els.statusTitle.textContent = "Đang đối soát mã giao dịch";
    els.statusCopy.textContent =
      "Hệ thống đang kiểm tra mã giao dịch với dữ liệu hiện tại. Vui lòng chờ.";
    els.detailHint.textContent =
      "Nếu mã bị trùng, yêu cầu sẽ được đánh dấu suspicious và admin sẽ kiểm tra chi tiết.";
    return;
  }

  if (currentStatus === "success") {
    els.statusTitle.textContent = "Nạp tiền thành công";
    els.statusCopy.textContent =
      "Giao dịch đã được xác nhận. Số dư ví sẽ cập nhật ngay khi admin hoàn tất.";
    els.detailHint.textContent =
      "Hiệu ứng chỉ xuất hiện khi trạng thái thật sự success.";
    return;
  }

  if (currentStatus === "suspicious") {
    els.statusTitle.textContent = "Giao dịch bị nghi vấn";
    els.statusCopy.textContent =
      requestData?.reason ||
      "Mã giao dịch trùng với một yêu cầu khác. Admin sẽ kiểm tra và xử lý.";
    els.detailHint.textContent =
      "Yêu cầu vẫn được ghi nhận nhưng cần đối soát thêm do trùng mã.";
    return;
  }

  if (currentStatus === "failed" || currentStatus === "expired") {
    els.statusTitle.textContent = "Giao dịch cần xử lý";
    els.statusCopy.textContent =
      requestData?.reason ||
      "Yêu cầu hiện không được xác nhận tự động. Vui lòng liên hệ admin.";
    els.detailHint.textContent =
      "Đội ngũ đối soát sẽ xem xét yêu cầu này trong thời gian sớm nhất.";
    return;
  }

  els.statusTitle.textContent = "Trạng thái giao dịch";
  els.statusCopy.textContent =
    requestData?.reason || "Đang chờ cập nhật từ hệ thống đối soát.";
  els.detailHint.textContent =
    "Giữ trang và không gửi lại mã giao dịch trùng lặp.";
}

function startCountdown(expiresAt) {
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
  }

  function render() {
    if (!expiresAt) {
      els.countdown.textContent = "Không giới hạn thời gian";
      els.countdown.classList.remove("expired");
      return;
    }

    const expiresDate = expiresAt?.toDate
      ? expiresAt.toDate()
      : new Date(expiresAt);
    const remaining = expiresDate.getTime() - Date.now();

    if (remaining <= 0) {
      els.countdown.textContent = "Mã QR đã hết hạn";
      els.countdown.classList.add("expired");
      els.confirmTransferredBtn.disabled = true;
      return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    els.countdown.textContent = `Hiệu lực ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    els.countdown.classList.remove("expired");
    els.confirmTransferredBtn.disabled = false;
  }

  render();
  state.countdownTimer = window.setInterval(render, 1000);
}

async function createDepositRequest() {
  if (!state.user || state.isBusy) return;

  if (state.activeRequest) {
    const normalized = normalizeStatus(state.activeRequest.status);
    const expiresDate = state.activeRequest.expiresAt?.toDate
      ? state.activeRequest.expiresAt.toDate()
      : new Date(state.activeRequest.expiresAt || 0);

    if (normalized.value !== "failed" && expiresDate.getTime() > Date.now()) {
      showToast(
        "Bạn đang có một giao dịch đang mở. Hãy dùng mã QR hiện tại hoặc chờ hết hạn để tạo mã mới.",
        "error",
      );
      return;
    }
  }

  const amount = Number(els.amountInput.value || 0);
  if (amount < 10000) {
    showToast("Số tiền tối thiểu là 10.000 ₫.", "error");
    return;
  }

  const txnId = generateTxnId();
  const transferContent = buildTransferContent(txnId, state.user.uid);
  const expiresAt = Timestamp.fromMillis(Date.now() + QR_TIMEOUT_MS);

  const previewRequest = {
    userId: state.user.uid,
    amount,
    status: "pending",
    paymentMethod: "bank",
    txnId,
    transactionCode: "",
    transferContent,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    qrUrl: buildVietQrUrl({ amount, transferContent }),
  };

  state.activeRequest = previewRequest;
  updateStageSummary(previewRequest);
  renderStatusState(previewRequest);
  startCountdown(expiresAt);
  setStage(2);
  setCreateButtonCooldown();
  showToast(
    "Mã QR đã sẵn sàng. Tiếp theo nhập mã giao dịch để gửi yêu cầu.",
    "success",
  );
}

async function markAsTransferred() {
  if (!state.activeRequest || state.isBusy) return;

  setStage(3);
  els.transactionCodeInput?.focus();
}

async function submitTransactionCode() {
  if (!state.activeRequest || !state.user || state.isBusy) return;

  const rawCode = String(els.transactionCodeInput?.value || "")
    .trim()
    .toUpperCase();
  if (!TRANSACTION_CODE_PATTERN.test(rawCode)) {
    setTransactionCodeError(
      "Mã giao dịch không hợp lệ. Chỉ gồm 8-20 ký tự A-Z và số.",
    );
    return;
  }

  setTransactionCodeError("");
  state.isBusy = true;
  setLoading(els.submitTransactionCodeBtn, true, "Đang kiểm tra mã…");
  els.statusTitle.textContent = "Hệ thống đang đối soát mã giao dịch...";
  els.statusCopy.textContent =
    "Hệ thống đang đối soát mã giao dịch. Vui lòng chờ trong giây lát.";
  updateProgressTimeline("checking");

  try {
    const result = await depositTransaction(
      db,
      state.user.uid,
      state.activeRequest.amount,
      {
        paymentMethod: "bank",
        transactionCode: rawCode,
        transferContent: state.activeRequest.transferContent,
        expiresAt: state.activeRequest.expiresAt,
      },
    );

    if (!result.success) {
      throw new Error(result.error || "Không thể gửi mã giao dịch");
    }

    state.activeRequest = {
      depositId: result.depositId,
      userId: state.user.uid,
      amount: state.activeRequest.amount,
      status: result.status,
      txnId: result.txnId,
      transactionCode: result.transactionCode,
      transferContent: result.transferContent,
      hasUserConfirmed: false,
      expiresAt: state.activeRequest.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      qrUrl: state.activeRequest.qrUrl,
    };

    saveActiveRequest();
    bindDepositListener(result.depositId);

    window.setTimeout(() => {
      updateStageSummary(state.activeRequest);
      renderStatusState(state.activeRequest);
      updateProgressTimeline(state.activeRequest.status);
      showToast("Yêu cầu đã được ghi nhận", "success");
      loadRecentTransactions();
    }, 2000);
  } catch (error) {
    console.error("Submit transaction code failed", error);
    showToast(error.message || "Không thể gửi mã giao dịch", "error");
  } finally {
    state.isBusy = false;
    setLoading(els.submitTransactionCodeBtn, false);
    els.submitTransactionCodeBtn.disabled = true;
    window.setTimeout(() => {
      els.submitTransactionCodeBtn.disabled = false;
    }, 1000);
  }
}

function setTransactionCodeError(message) {
  els.transactionCodeError.textContent = message;
  els.transactionCodeInput.classList.toggle("input-error", Boolean(message));
  if (message) {
    els.transactionCodeInput.classList.add("shake");
    window.setTimeout(() => {
      els.transactionCodeInput.classList.remove("shake");
    }, 360);
  }
}

function updateProgressTimeline(status) {
  if (!els.progressTimeline) return;

  const steps = Array.from(
    els.progressTimeline.querySelectorAll(".timeline-step"),
  );
  let activeStep = 1;
  if (
    status === "pending" ||
    status === "checking" ||
    status === "suspicious" ||
    status === "failed" ||
    status === "expired"
  ) {
    activeStep = 2;
  }
  if (status === "success") {
    activeStep = 3;
  }

  steps.forEach((step, index) => {
    step.classList.toggle("active", index + 1 <= activeStep);
  });
}

async function loadRecentTransactions() {
  if (!state.user) return;

  try {
    const snapshot = await getDocs(
      query(
        collection(db, "deposit_requests"),
        where("userId", "==", state.user.uid),
        orderBy("createdAt", "desc"),
      ),
    );

    const items = snapshot.docs.slice(0, 5).map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    renderRecentTransactions(items);
  } catch (error) {
    console.error("Load recent transactions failed", error);
  }
}

function renderRecentTransactions(transactions) {
  if (!els.recentTransactions) return;
  const list = els.recentTransactions.querySelector(".recent-transaction-list");
  if (!list) return;

  if (transactions.length === 0) {
    list.innerHTML = `<div>Chưa có giao dịch</div>`;
    return;
  }

  list.innerHTML = transactions
    .map((item) => {
      return `
        <div class="recent-transaction-item">
          <div>
            <div style="font-weight: 600;">${item.transactionCode || item.txnId}</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.7);">${formatDate(item.createdAt)}</div>
          </div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.85);">
            ${normalizeStatus(item.status).label}
          </div>
        </div>
      `;
    })
    .join("");
}

async function uploadEvidence(file) {
  // The evidence upload flow is deprecated in favor of user confirmation
  // via hasUserConfirmed + transactionCode. This prevents direct document
  // mutation by the client and keeps deposit_requests secure.
  if (!file || !state.user || !state.activeRequest) {
    return;
  }

  showToast(
    "Tính năng gửi biên lai đã tạm dừng. Vui lòng xác nhận chuyển khoản bằng nút 'Tôi đã chuyển'.",
    "info",
  );
}

async function expireCurrentRequestIfNeeded() {
  if (!state.activeRequest) return;

  const normalized = normalizeStatus(state.activeRequest.status);
  if (normalized.value !== "pending") return;

  const expiresDate = state.activeRequest.expiresAt?.toDate
    ? state.activeRequest.expiresAt.toDate()
    : new Date(state.activeRequest.expiresAt || 0);

  if (expiresDate.getTime() > Date.now()) return;

  const requestRef = doc(db, "deposit_requests", state.activeRequest.depositId);
  await updateDoc(requestRef, {
    status: "failed",
    updatedAt: serverTimestamp(),
  });
}

function bindDepositListener(depositId) {
  if (state.unsubscribeDeposit) {
    state.unsubscribeDeposit();
  }

  const requestRef = doc(db, "deposit_requests", depositId);
  state.unsubscribeDeposit = onSnapshot(
    requestRef,
    async (snapshot) => {
      if (!snapshot.exists()) return;

      const requestData = {
        depositId: snapshot.id,
        qrUrl:
          state.activeRequest?.qrUrl ||
          buildVietQrUrl({
            amount: snapshot.data().amount,
            transferContent: snapshot.data().transferContent || "",
          }),
        ...snapshot.data(),
      };

      state.activeRequest = requestData;
      saveActiveRequest();
      updateStageSummary(requestData);
      renderStatusState(requestData);

      if (requestData.expiresAt) {
        startCountdown(requestData.expiresAt);
      }

      const normalized = normalizeStatus(requestData.status);
      if (
        normalized.value === "checking" ||
        normalized.value === "success" ||
        normalized.value === "failed" ||
        requestData.hasUserConfirmed === true
      ) {
        setStage(3);
      }

      if (normalized.value === "success") {
        const freshUserSnap = await getDoc(doc(db, "users", state.user.uid));
        const nextBalance = freshUserSnap.exists()
          ? Number(freshUserSnap.data().balance || state.balance)
          : state.balance + Number(requestData.amount || 0);
        updateBalanceDisplay(nextBalance);
        playSuccessTing();
        createConfetti();
        showToast("Nạp tiền thành công. Số dư đã được cập nhật.", "success");
        clearActiveRequest();
      }

      if (normalized.value === "failed") {
        showToast(
          "Giao dịch cần đối soát. Hãy tải biên lai nếu bạn đã chuyển khoản.",
          "error",
        );
      }
    },
    (error) => {
      console.error("Deposit snapshot error", error);
      showToast("Mất kết nối realtime với giao dịch nạp tiền.", "error");
    },
  );
}

async function resumeActiveRequest() {
  const cached = loadActiveRequestFromStorage();
  if (!cached || !state.user || cached.userId !== state.user.uid) return;

  try {
    const requestSnap = await getDoc(
      doc(db, "deposit_requests", cached.depositId),
    );
    if (!requestSnap.exists()) {
      clearActiveRequest();
      return;
    }

    const data = requestSnap.data();
    const requestData = {
      depositId: requestSnap.id,
      qrUrl: buildVietQrUrl({
        amount: data.amount,
        transferContent:
          data.transferContent ||
          buildTransferContent(data.txnId || cached.txnId, state.user.uid),
      }),
      ...data,
    };

    state.activeRequest = requestData;
    saveActiveRequest();
    bindDepositListener(requestSnap.id);
    updateStageSummary(requestData);
    renderStatusState(requestData);

    const normalized = normalizeStatus(requestData.status);
    setStage(
      requestData.hasUserConfirmed === true || normalized.value !== "pending"
        ? 3
        : 2,
    );

    if (requestData.evidenceImage) {
      els.evidencePreview.src = requestData.evidenceImage;
      els.evidencePreview.classList.add("show");
    }

    if (requestData.expiresAt) {
      startCountdown(requestData.expiresAt);
    }

    showToast("Đã khôi phục trạng thái giao dịch đang mở.", "info");
  } catch (error) {
    console.error("Resume request failed", error);
    clearActiveRequest();
  }
}

function playSuccessTing() {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(1320, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      1760,
      audioContext.currentTime + 0.18,
    );
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.18,
      audioContext.currentTime + 0.02,
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.22,
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.24);
  } catch (error) {
    console.warn("Audio ting unavailable", error);
  }
}

function createConfetti() {
  els.confettiLayer.innerHTML = "";
  const colors = ["#ffd700", "#ffffff", "#58d68d", "#5ed3ff"];

  for (let index = 0; index < 28; index += 1) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.top = `${-10 - Math.random() * 20}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--x-end", `${Math.random() * 200 - 100}px`);
    els.confettiLayer.appendChild(piece);
  }

  window.setTimeout(() => {
    els.confettiLayer.innerHTML = "";
  }, 1900);
}

async function copyTransferContent() {
  if (!els.transferContent.value) return;
  await navigator.clipboard.writeText(els.transferContent.value);
  els.copyTransferBtn.classList.add("is-copied");
  window.setTimeout(
    () => els.copyTransferBtn.classList.remove("is-copied"),
    2200,
  );
  showToast("Đã sao chép nội dung chuyển khoản.", "success");
}

function attachCursorGlow() {
  const root = document.body;
  root.addEventListener(
    "mousemove",
    (event) => {
      const x = (event.clientX / window.innerWidth) * 100;
      const y = (event.clientY / window.innerHeight) * 100;
      root.style.setProperty("--cursor-x", `${x}%`);
      root.style.setProperty("--cursor-y", `${y}%`);
    },
    { passive: true },
  );
}

function attachEvents() {
  // Only check for truly essential elements to keep the page functional
  const criticalEls = [els.amountInput, els.createQrBtn];
  const missing = criticalEls.filter((el) => !el);

  if (missing.length > 0) {
    console.warn(
      "Some UI components are missing, but continuing initialization...",
    );
  }

  // Use optional chaining for all event listeners to prevent crashes
  attachCursorGlow();
  renderQuickAmounts();
  syncQuickAmountState();

  if (els.summaryAccountName) {
    els.summaryAccountName.textContent = BANK_INFO.accountName;
  }
  if (els.summaryAccountNumber) {
    els.summaryAccountNumber.textContent = BANK_INFO.accountNumber;
  }
  if (els.summaryBankName) {
    els.summaryBankName.textContent = BANK_INFO.bankName;
  }
  if (els.helpCenterLink) {
    els.helpCenterLink.href = SUPPORT_URL;
  }
  if (els.supportBtn) {
    els.supportBtn.href = SUPPORT_URL;
  }
  if (els.evidenceHint) {
    els.evidenceHint.textContent =
      "Ảnh biên lai được lưu an toàn để đối soát; không đổi tên trường dữ liệu trên máy chủ.";
  }

  els.amountInput?.addEventListener("input", syncQuickAmountState);
  els.createQrBtn?.addEventListener("click", createDepositRequest);
  els.backBtn?.addEventListener("click", () =>
    setStage(Math.max(1, state.stage - 1)),
  );
  els.confirmTransferredBtn?.addEventListener("click", markAsTransferred);
  els.submitTransactionCodeBtn?.addEventListener(
    "click",
    submitTransactionCode,
  );
  els.transactionCodeInput?.addEventListener("input", () =>
    setTransactionCodeError(""),
  );
  els.regenerateBtn?.addEventListener("click", async () => {
    try {
      await expireCurrentRequestIfNeeded();
    } catch (error) {
      console.warn("Cannot expire old deposit before regenerating", error);
    }
    clearActiveRequest();
    setStage(1);
    await createDepositRequest();
  });
  els.copyTransferBtn?.addEventListener("click", copyTransferContent);
  els.uploadEvidenceBtn?.addEventListener("click", () =>
    els.evidenceInput.click(),
  );
  els.evidenceInput?.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    uploadEvidence(file);
  });

  window.addEventListener("online", updateOfflineBanner);
  window.addEventListener("offline", updateOfflineBanner);

  setStage(state.stage);
}

function syncBalanceFromStore() {
  const currentState = store.getState();
  if (!currentState.user.data) return;
  state.user = currentState.user.data;
  if (!state.balance) {
    state.balance = Number(currentState.user.data.balance || 0);
  }
  els.balance.textContent = formatCurrency(state.balance);
}

async function init() {
  if (!isDepositPage()) {
    return;
  }

  initNavbar();
  initCart();

  if (document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true }),
    );
  }

  bindDepositElements();
  await initializeAuth();
  attachEvents();
  updateOfflineBanner();

  syncBalanceFromStore();
  updateStageTrackTransform(state.stage);

  store.subscribe(() => {
    const previousBalance = state.balance;
    syncBalanceFromStore();
    if (state.balance !== previousBalance) {
      els.balance.textContent = formatCurrency(state.balance);
    }
  });

  if (!auth.currentUser) {
    showToast("Vui lòng đăng nhập để nạp tiền.", "error");
    return;
  }

  state.user = auth.currentUser;
  await resumeActiveRequest();
}

// Only run on deposit page and after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  if (!isDepositPage()) {
    console.log("Not deposit page, skipping deposit.js init");
    return;
  }
  init().catch((error) => {
    console.error("Deposit page init failed", error);
    showToast("Không thể khởi tạo trang nạp tiền.", "error");
  });
});

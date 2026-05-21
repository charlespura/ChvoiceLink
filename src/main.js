import {
  addDoc,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { db, storage } from "./firebase.js";
import { calculateExpiryMs } from "./retention.js";
import { recordToMp3 } from "./recorder.js";

const appEl = document.getElementById("app");

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (typeof child === "string") node.appendChild(document.createTextNode(child));
    else if (child) node.appendChild(child);
  }
  return node;
}

function card(children) {
  return el("section", { class: "rounded-xl border border-slate-800 bg-slate-900/40 p-4" }, children);
}

function button(label, { onClick, variant = "primary", disabled = false } = {}) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-indigo-500 text-white hover:bg-indigo-400"
      : variant === "danger"
        ? "bg-rose-500 text-white hover:bg-rose-400"
        : "bg-slate-800 text-slate-100 hover:bg-slate-700";
  return el(
    "button",
    { class: `${base} ${styles}`, type: "button", ...(disabled ? { disabled: "" } : {}), onclick: onClick },
    [label],
  );
}

function formatDate(ms) {
  if (ms === null) return "Never";
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function parseViewId() {
  const url = new URL(window.location.href);
  return url.searchParams.get("v");
}

function setViewId(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("v", id);
  history.replaceState(null, "", url.toString());
}

async function renderViewMode(id) {
  appEl.replaceChildren();

  const title = el("h2", { class: "text-lg font-semibold" }, ["Listening"]);
  const status = el("p", { class: "mt-1 text-sm text-slate-300" }, ["Loading…"]);
  const audio = el("audio", { class: "mt-3 w-full", controls: "" });
  const meta = el("div", { class: "mt-3 text-xs text-slate-300 space-y-1" });

  appEl.appendChild(
    card([
      title,
      status,
      audio,
      meta,
      el("div", { class: "mt-4 flex gap-2" }, [
        button("Record new", {
          variant: "secondary",
          onClick: () => {
            const url = new URL(window.location.href);
            url.searchParams.delete("v");
            history.replaceState(null, "", url.toString());
            renderRecordMode();
          },
        }),
      ]),
    ]),
  );

  const snap = await getDoc(doc(db, "recordings", id));
  if (!snap.exists()) {
    status.textContent = "Not found.";
    return;
  }

  const data = snap.data();
  audio.src = data.downloadUrl;
  status.textContent = data.title ? `Title: ${data.title}` : "Ready";

  const expiresAtMs = data.expiresAt?.toMillis?.() ?? null;
  const lastViewedAtMs = data.lastViewedAt?.toMillis?.() ?? null;

  meta.replaceChildren(
    el("div", {}, [`Views: ${data.views ?? 0}`]),
    el("div", {}, [`Created: ${data.createdAt?.toMillis?.() ? formatDate(data.createdAt.toMillis()) : "—"}`]),
    el("div", {}, [`Last viewed: ${lastViewedAtMs ? formatDate(lastViewedAtMs) : "—"}`]),
    el("div", {}, [`Expires: ${formatDate(expiresAtMs)}`]),
  );

  // Track view + extend expiry
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "recordings", id);
      const fresh = await tx.get(ref);
      if (!fresh.exists()) return;
      const current = fresh.data();

      const currentViews = Number(current.views ?? 0);
      const nextViews = currentViews + 1;

      const nowMs = Date.now();
      const nextExpiryMs = calculateExpiryMs({ views: nextViews, nowMs });

      tx.update(ref, {
        views: nextViews,
        lastViewedAt: serverTimestamp(),
        expiresAt: nextExpiryMs === null ? null : Timestamp.fromMillis(nextExpiryMs),
        keepForever: nextExpiryMs === null,
      });
    });
  } catch (e) {
    // Non-blocking; viewing should still work.
    console.warn("Failed to update view stats:", e);
  }
}

async function renderRecordMode() {
  appEl.replaceChildren();

  const status = el("p", { class: "text-sm text-slate-300" }, ["Ready"]);
  const titleInput = el("input", {
    class:
      "mt-3 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500",
    placeholder: "Optional title (e.g. 'Hello, Maam Rich')",
    maxlength: "80",
  });

  const audio = el("audio", { class: "mt-3 w-full", controls: "" });
  const shareBox = el("div", { class: "mt-4 hidden" });
  const debugBox = el("pre", {
    class:
      "mt-4 hidden whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-200",
  });

  let recordingController = null;
  let mp3Blob = null;
  let durationSec = null;
  let lastDocId = null;
  let lastStoragePath = null;

  const startBtn = button("Start recording", {
    onClick: async () => {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      uploadBtn.disabled = true;
      mp3Blob = null;
      durationSec = null;
      lastDocId = null;
      lastStoragePath = null;
      audio.removeAttribute("src");
      shareBox.classList.add("hidden");
      debugBox.classList.add("hidden");
      debugBox.textContent = "";

      try {
        recordingController = await recordToMp3({
          onStatus: (msg) => (status.textContent = msg),
        });
      } catch (e) {
        status.textContent = `Error: ${e.message || e}`;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        uploadBtn.disabled = true;
      }
    },
  });

  const stopBtn = button("Stop", {
    variant: "danger",
    disabled: true,
    onClick: async () => {
      stopBtn.disabled = true;
      try {
        const result = await recordingController?.stop();
        mp3Blob = result?.mp3Blob ?? null;
        durationSec = result?.durationSec ?? null;
        if (mp3Blob) {
          audio.src = URL.createObjectURL(mp3Blob);
          uploadBtn.disabled = false;
          status.textContent = "Preview ready";
        } else {
          status.textContent = "No audio recorded.";
          startBtn.disabled = false;
        }
      } catch (e) {
        status.textContent = `Convert failed: ${e.message || e}`;
        startBtn.disabled = false;
      } finally {
        startBtn.disabled = false;
      }
    },
  });

  const uploadBtn = button("Upload & get link", {
    disabled: true,
    onClick: async () => {
      if (!mp3Blob) return;

      startBtn.disabled = true;
      stopBtn.disabled = true;
      uploadBtn.disabled = true;
      status.textContent = "Uploading…";
      shareBox.classList.add("hidden");
      debugBox.classList.add("hidden");
      debugBox.textContent = "";

      try {
        const nowMs = Date.now();
        const expiryMs = calculateExpiryMs({ views: 0, nowMs });

        const docRef = await addDoc(collection(db, "recordings"), {
          title: titleInput.value.trim() || null,
          storagePath: null,
          downloadUrl: null,
          createdAt: serverTimestamp(),
          views: 0,
          lastViewedAt: null,
          duration: durationSec ? Math.round(durationSec) : null,
          size: mp3Blob.size,
          expiresAt: expiryMs === null ? null : Timestamp.fromMillis(expiryMs),
          keepForever: false,
          contentType: "audio/mpeg",
        });

        const id = docRef.id;
        const path = `recordings/${id}.mp3`;
        lastDocId = id;
        lastStoragePath = path;
        const fileRef = storageRef(storage, path);

        const task = uploadBytesResumable(fileRef, mp3Blob, {
          contentType: "audio/mpeg",
        });

        await new Promise((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => {
              const pct = snap.totalBytes
                ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
                : 0;
              status.textContent = `Uploading… ${pct}%`;
            },
            (err) => reject(err),
            () => resolve(),
          );
        });

        const url = await getDownloadURL(fileRef);

        await updateDoc(doc(db, "recordings", id), {
          storagePath: path,
          downloadUrl: url,
        });

        setViewId(id);

        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set("v", id);

        shareBox.replaceChildren(
          card([
            el("h3", { class: "text-sm font-semibold" }, ["Share link"]),
            el(
              "input",
              {
                class:
                  "mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100",
                readonly: "",
                value: shareUrl.toString(),
              },
              [],
            ),
            el("p", { class: "mt-2 text-xs text-slate-300" }, [
              `Link expires on ${formatDate(expiryMs)} unless it gets views (popular links live longer).`,
            ]),
            el("div", { class: "mt-3 flex gap-2" }, [
              button("Open listen page", {
                variant: "secondary",
                onClick: () => renderViewMode(id),
              }),
              button("Copy", {
                variant: "secondary",
                onClick: async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl.toString());
                    status.textContent = "Copied!";
                  } catch {
                    status.textContent = "Copy failed (browser blocked clipboard).";
                  }
                },
              }),
            ]),
          ]),
        );
        shareBox.classList.remove("hidden");
        status.textContent = "Uploaded";
      } catch (e) {
        const code = e?.code ? ` (${e.code})` : "";
        status.textContent = `Upload failed${code}: ${e?.message || e}`;
        debugBox.textContent = [
          `docId: ${lastDocId ?? "—"}`,
          `storagePath: ${lastStoragePath ?? "—"}`,
          `errorCode: ${e?.code ?? "—"}`,
          `errorMessage: ${e?.message ?? String(e)}`,
        ].join("\n");
        debugBox.classList.remove("hidden");
      } finally {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        uploadBtn.disabled = !mp3Blob;
      }
    },
  });

  appEl.appendChild(
    card([
      el("h2", { class: "text-lg font-semibold" }, ["Record"]),
      status,
      titleInput,
      el("div", { class: "mt-4 flex gap-2" }, [startBtn, stopBtn, uploadBtn]),
      audio,
      shareBox,
      debugBox,
      el("p", { class: "mt-4 text-xs text-slate-400" }, [
        "Retention rules: 0 views=1 month, 1–2=2 months, 3–4=3 months, 5–9=6 months, 10+=never delete (expiry clears).",
      ]),
    ]),
  );
}

const viewId = parseViewId();
if (viewId) renderViewMode(viewId);
else renderRecordMode();

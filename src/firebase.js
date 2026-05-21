import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = globalThis.__FIREBASE_CONFIG__;
if (!firebaseConfig) {
  throw new Error(
    "Missing Firebase config. Generate `env.js` (see README) or ensure it is loaded before `src/main.js`.",
  );
}

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const bucketName = (() => {
  const b = firebaseConfig.storageBucket;
  if (!b) return `${firebaseConfig.projectId}.appspot.com`;
  if (b.endsWith(".appspot.com")) return b;
  if (b.endsWith(".firebasestorage.app")) return b;
  return b;
})();
export const storage = getStorage(app, `gs://${bucketName}`);


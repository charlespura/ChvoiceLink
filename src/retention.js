const DAY_MS = 24 * 60 * 60 * 1000;

function days(n) {
  return n * DAY_MS;
}

function months(n) {
  // Simple fixed-month approximation (30 days) to keep logic deterministic client-side.
  return days(30 * n);
}

export function calculateExpiryMs({ views, nowMs }) {
  if (views >= 10) return null;
  if (views >= 5) return nowMs + months(6);
  if (views >= 3) return nowMs + months(3);
  if (views >= 1) return nowMs + months(2);
  return nowMs + months(1);
}


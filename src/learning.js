/* Local recall scheduling. Every stored record follows a real user rating. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const AGAIN = 600000;
  const intervals = [1, 3, 7, 14, 30];
  const MAX_INTERVAL = intervals[intervals.length - 1] * DAY;
  const MAX_TIME = 8640000000000000 - MAX_INTERVAL;
  const CLOCK_SKEW = 300000;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const time = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME;

  function valid(record, now) {
    return object(record) && ['step', 'reviews', 'last', 'due'].every(key => own(record, key)) &&
      Number.isInteger(record.step) && record.step >= 0 && record.step <= intervals.length &&
      Number.isSafeInteger(record.reviews) && record.reviews > 0 &&
      record.reviews >= record.step && time(record.last) && time(record.due) &&
      record.last <= now + CLOCK_SKEW && record.due >= record.last &&
      record.due - record.last <= MAX_INTERVAL;
  }

  function copy(record) {
    return { step: record.step, reviews: record.reviews, last: record.last, due: record.due };
  }

  function put(result, id, record) {
    // Defining an own property also handles a future card ID such as "__proto__" safely.
    Object.defineProperty(result, id, { value: copy(record), enumerable: true, writable: true, configurable: true });
  }

  function cleanAt(raw, ids, now) {
    const result = {};
    if (!object(raw)) return result;
    for (const id of ids || []) {
      if (typeof id === 'string' && id.length && own(raw, id) && valid(raw[id], now)) put(result, id, raw[id]);
    }
    return result;
  }

  function clean(raw, ids) {
    return cleanAt(raw, ids, Date.now());
  }

  function nextDays(previous) {
    if (previous == null) return intervals[0];
    if (!object(previous) || !Number.isInteger(previous.step) || previous.step < 0 || previous.step > intervals.length) {
      throw new RangeError('Invalid review step');
    }
    return intervals[Math.min(previous.step, intervals.length - 1)];
  }

  function rate(previous, grade, now = Date.now()) {
    if (grade !== 'again' && grade !== 'good') throw new RangeError('Unknown rating');
    if (!time(now) || now + MAX_INTERVAL > MAX_TIME) throw new RangeError('Invalid review time');
    if (previous != null && !valid(previous, now)) throw new RangeError('Invalid previous review');
    if (previous && previous.reviews === Number.MAX_SAFE_INTEGER) throw new RangeError('Review count overflow');
    return {
      step: grade === 'again' ? 0 : Math.min((previous?.step || 0) + 1, intervals.length),
      reviews: (previous?.reviews || 0) + 1,
      last: now,
      due: now + (grade === 'again' ? AGAIN : nextDays(previous) * DAY)
    };
  }

  function select(cards, state, options = {}) {
    const { topic = 'all', kind = 'all', all = false, now = Date.now() } = options;
    if (!Array.isArray(cards)) throw new TypeError('Cards must be an array');
    if (!time(now)) throw new RangeError('Invalid selection time');
    const progress = cleanAt(state, cards.map(card => card.id), now);
    const rank = card => !own(progress, card.id) ? 1 : progress[card.id].due <= now ? 0 : 2;
    return cards.map((card, index) => ({ card, index })).filter(({ card }) =>
      (topic === 'all' || card.topic === topic) && (kind === 'all' || card.kind === kind) &&
      (all || !own(progress, card.id) || progress[card.id].due <= now)
    ).sort((a, b) => rank(a.card) - rank(b.card) ||
      (rank(a.card) === 1 ? 0 : progress[a.card.id].due - progress[b.card.id].due) || a.index - b.index
    ).map(entry => entry.card);
  }

  function merge(a, b, ids) {
    const now = Date.now();
    const left = cleanAt(a, ids, now);
    const right = cleanAt(b, ids, now);
    const result = {};
    for (const id of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const first = own(left, id) ? left[id] : null;
      const second = own(right, id) ? right[id] : null;
      let chosen = first || second;
      if (first && second) {
        // For an exact simultaneous tie, the earlier repeat wins instead of postponing it.
        const order = second.last - first.last || second.reviews - first.reviews ||
          first.due - second.due || first.step - second.step;
        if (order > 0) chosen = second;
      }
      put(result, id, chosen);
    }
    return result;
  }

  const api = { clean, rate, nextDays, select, merge };
  root.ReliqLearning = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

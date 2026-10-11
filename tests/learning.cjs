'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../src/learning.js');
const DAY = 86400000;
const NOW = Date.now() - 1000;
const record = (step = 1, reviews = 1, last = NOW - DAY, due = NOW) => ({ step, reviews, last, due });
const names = cards => cards.map(card => card.id);
let checks = 0;
function test(name, callback) {
  callback(); checks++; process.stdout.write(`PASS ${name}\n`);
}

test('browser and CommonJS exports provide the same public contract', () => {
  const sandbox = { window: {}, Date };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/learning.js'), 'utf8'), sandbox);
  assert.deepEqual(Object.keys(sandbox.window.ReliqLearning).sort(), ['clean', 'merge', 'nextDays', 'rate', 'select']);
  assert.equal(globalThis.ReliqLearning, L);
});

test('ratings schedule the real time and cap at thirty days', () => {
  let previous;
  let now = NOW - 90 * DAY;
  for (const days of [1, 3, 7, 14, 30, 30, 30]) {
    assert.equal(L.nextDays(previous), days);
    const rated = L.rate(previous, 'good', now);
    assert.equal(rated.due, now + days * DAY);
    assert.equal(rated.reviews, (previous?.reviews || 0) + 1);
    assert.equal(rated.last, now);
    assert.equal(rated.step, Math.min(rated.reviews, 5));
    previous = rated;
    now += DAY;
  }
});

test('again gives ten minutes, resets the interval, and preserves the rating count', () => {
  const prior = record(4, 9, NOW - DAY, NOW + 13 * DAY);
  const saved = JSON.stringify(prior);
  const again = L.rate(prior, 'again', NOW);
  assert.deepEqual(again, { step: 0, reviews: 10, last: NOW, due: NOW + 600000 });
  assert.equal(L.nextDays(again), 1);
  assert.equal(L.rate(again, 'good', NOW + 600000).due, NOW + 600000 + DAY);
  assert.equal(JSON.stringify(prior), saved);
});

test('due boundary is inclusive and future cards are hidden until due', () => {
  const cards = [{ id: 'a', topic: 'place', kind: 'fact' }];
  const state = { a: record() };
  assert.deepEqual(names(L.select(cards, state, { now: NOW - 1 })), []);
  assert.deepEqual(names(L.select(cards, state, { now: NOW })), ['a']);
  assert.deepEqual(names(L.select(cards, state, { now: NOW + 1 })), ['a']);
});

const CARDS = [
  { id: 'new-first', topic: 'place', kind: 'fact' },
  { id: 'future', topic: 'layers', kind: 'case' },
  { id: 'due-later', topic: 'place', kind: 'link' },
  { id: 'new-second', topic: 'layers', kind: 'case' },
  { id: 'due-earlier', topic: 'layers', kind: 'fact' },
  { id: 'due-tie', topic: 'layers', kind: 'link' }
];
const STATE = {
  future: record(1, 1, NOW, NOW + DAY),
  'due-later': record(1, 1, NOW - DAY, NOW),
  'due-earlier': record(1, 1, NOW - DAY - 5000, NOW - 5000),
  'due-tie': record(1, 1, NOW - DAY - 5000, NOW - 5000)
};

test('due learned cards precede unseen cards, with stable ties and unseen order', () => {
  assert.deepEqual(names(L.select(CARDS, STATE, { now: NOW })), ['due-earlier', 'due-tie', 'due-later', 'new-first', 'new-second']);
  assert.deepEqual(names(L.select(CARDS, STATE, { all: true, now: NOW })), ['due-earlier', 'due-tie', 'due-later', 'new-first', 'new-second', 'future']);
  assert.deepEqual(names(CARDS), ['new-first', 'future', 'due-later', 'new-second', 'due-earlier', 'due-tie']);
});

test('topic and question kind filters work together in either practice mode', () => {
  assert.deepEqual(names(L.select(CARDS, STATE, { topic: 'layers', kind: 'case', now: NOW })), ['new-second']);
  assert.deepEqual(names(L.select(CARDS, STATE, { topic: 'layers', kind: 'case', all: true, now: NOW })), ['new-second', 'future']);
  assert.deepEqual(names(L.select(CARDS, STATE, { kind: 'link', now: NOW })), ['due-tie', 'due-later']);
  assert.deepEqual(names(L.select(CARDS, STATE, { topic: 'missing', now: NOW })), []);
});

test('clean keeps valid progress, strips extra fields, and rejects corrupt values', () => {
  const good = record();
  const variants = [
    null, [], {}, { ...good, step: 6 }, { ...good, step: -1 }, { ...good, step: 1.5 },
    { ...good, reviews: 0 }, { ...good, reviews: Infinity }, { ...good, reviews: Number.MAX_SAFE_INTEGER + 1 },
    { ...good, step: 5, reviews: 2 }, { ...good, last: NaN }, { ...good, last: -1 },
    { ...good, last: Date.now() + DAY, due: Date.now() + 2 * DAY },
    { ...good, due: Infinity }, { ...good, due: -1 }, { ...good, due: NOW - 2 * DAY },
    { ...good, due: good.last + 31 * DAY }, { ...good, due: '1' }, { ...good, last: 1.5 }
  ];
  const raw = { good: { ...good, junk: 'remove' }, unknown: good };
  for (let i = 0; i < variants.length; i++) raw[`bad${i}`] = variants[i];
  assert.deepEqual(L.clean(raw, ['good', ...variants.map((_, i) => `bad${i}`)]), { good });
  assert.deepEqual(L.clean(null, ['good']), {});
  assert.deepEqual(L.clean([], ['good']), {});
  assert.notEqual(L.clean(raw, ['good']).good, raw.good);
  assert.deepEqual(L.clean(Object.create({ good }), ['good']), {});
});

test('invalid persistence does not produce fake learned cards or suppress new cards', () => {
  assert.deepEqual(names(L.select(CARDS.slice(0, 1), { 'new-first': { step: 1, reviews: 10, last: NOW, due: Infinity } }, { now: NOW })), ['new-first']);
});

test('merge preserves independent cards and chooses the latest valid rating', () => {
  const older = record(3, 20, NOW - DAY, NOW + 6 * DAY);
  const latest = record(0, 21, NOW, NOW + 600000);
  const other = record();
  const a = { a: older, b: other };
  const b = { a: latest, c: other, unknown: other };
  assert.deepEqual(L.merge(a, b, ['a', 'b', 'c']), { a: latest, b: other, c: other });
  assert.deepEqual(L.merge(b, a, ['a', 'b', 'c']), { a: latest, c: other, b: other });
  assert.deepEqual(L.merge(a, { a: { ...latest, due: Infinity } }, ['a', 'b']), a);
  assert.notEqual(L.merge(a, b, ['a']).a, latest);
});

test('merge breaks timestamp ties by reviews and exact conflicts by earlier repeat', () => {
  const a = record(1, 2, NOW, NOW + DAY);
  const b = record(2, 3, NOW, NOW + 3 * DAY);
  assert.deepEqual(L.merge({ x: a }, { x: b }, ['x']), { x: b });
  const again = record(0, 3, NOW, NOW + 600000);
  assert.deepEqual(L.merge({ x: b }, { x: again }, ['x']), { x: again });
  assert.deepEqual(L.merge({ x: again }, { x: b }, ['x']), { x: again });
});

test('special IDs are data, not prototype writes', () => {
  const raw = JSON.parse(JSON.stringify({ good: record() }).replace('"good"', '"__proto__"'));
  const cleaned = L.clean(raw, ['__proto__']);
  assert.equal(Object.getPrototypeOf(cleaned), Object.prototype);
  assert.equal(Object.hasOwn(cleaned, '__proto__'), true);
  assert.equal(cleaned.__proto__.reviews, 1);
  assert.equal(Object.prototype.reviews, undefined);
  assert.deepEqual(L.merge({}, raw, ['__proto__']), cleaned);
});

test('invalid calls fail without silently resetting prior progress', () => {
  assert.throws(() => L.rate(undefined, 'easy', NOW), /Unknown rating/);
  for (const now of [Infinity, NaN, -1, 1.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => L.rate(undefined, 'good', now), /Invalid review time/);
  assert.throws(() => L.rate({ ...record(), reviews: Infinity }, 'good', NOW), /Invalid previous review/);
  assert.throws(() => L.rate({ ...record(), reviews: Number.MAX_SAFE_INTEGER }, 'good', NOW), /overflow/);
  assert.throws(() => L.nextDays({ step: Infinity }), /Invalid review step/);
  assert.throws(() => L.select(CARDS, {}, { now: Infinity }), /Invalid selection time/);
});

process.stdout.write(`${checks} learning checks passed.\n`);

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { isPathInside, isTraversalSegment } = require('../safe-path');

describe('isPathInside', () => {
  const root = path.resolve('/data/Anixapp');
  it('принимает сам корень и вложенные пути', () => {
    assert.equal(isPathInside(root, root), true);
    assert.equal(isPathInside(root, path.join(root, 'Title', 'ep 01.mp4')), true);
  });
  it('отклоняет соседнюю папку с общим префиксом', () => {
    assert.equal(isPathInside(root, root + '-evil'), false);
    assert.equal(isPathInside(root, path.join(root + '-evil', 'x.mp4')), false);
  });
  it('отклоняет выход через ..', () => {
    assert.equal(isPathInside(root, path.join(root, '..', 'secret')), false);
    assert.equal(isPathInside(root, path.join(root, 'a', '..', '..', 'x')), false);
  });
  it('отклоняет пустые и нестроковые значения', () => {
    assert.equal(isPathInside('', root), false);
    assert.equal(isPathInside(root, ''), false);
    assert.equal(isPathInside(root, undefined), false);
  });
});

describe('isTraversalSegment', () => {
  it('ловит ., .. и пустые части', () => {
    for (const s of ['', ' ', '.', '..', '...', ' .. ']) assert.equal(isTraversalSegment(s), true, JSON.stringify(s));
    for (const s of ['Title', '.hidden', 'a..b', '2024']) assert.equal(isTraversalSegment(s), false, s);
  });
});

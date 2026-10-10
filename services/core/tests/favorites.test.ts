import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyFavorites, favoriteRank, favoriteStorageId, isFavorite, normalizeFavorites, toggleFavorite } from '../src/favorites.js';

test('favorites normalize, deduplicate and toggle with role scope', () => {
  const clean=normalizeFavorites({roles:['builtin','builtin',''],voices:['operator:A::v1','operator:A::v1','  operator:B::v2 ']});
  assert.deepEqual(clean.roles,['builtin']);
  assert.deepEqual(clean.voices,['operator:A::v1','operator:B::v2']);
  let next=toggleFavorite(emptyFavorites(),'voice','v1','operator:A');
  assert.equal(favoriteStorageId('voice','v1','operator:A'),'operator:A::v1');
  assert.equal(isFavorite(next,'voice','v1','operator:A'),true);
  assert.equal(isFavorite(next,'voice','v1','operator:B'),false);
  next=toggleFavorite(next,'voice','v1','operator:A');
  assert.deepEqual(next.voices,[]);
});

test('legacy unscoped favorite is cancellable and does not leak to another role', () => {
  const legacy={...emptyFavorites(),actions:['Interact']};
  assert.equal(isFavorite(legacy,'action','Interact','operator:A'),true);
  const cleared=toggleFavorite(legacy,'action','Interact','operator:A');
  assert.deepEqual(cleared.actions,[]);
  const added=toggleFavorite(emptyFavorites(),'action','Interact','operator:A');
  assert.equal(favoriteRank(added,'action','Interact','', 'operator:A'),1);
  assert.equal(favoriteRank(added,'action','Interact','', 'operator:B'),2);
});

test('current selection outranks favorite and favorite outranks ordinary item', () => {
  const f=toggleFavorite(emptyFavorites(),'role','operator:A');
  assert.equal(favoriteRank(f,'role','operator:A','operator:A'),0);
  assert.equal(favoriteRank(f,'role','operator:A','builtin'),1);
  assert.equal(favoriteRank(f,'role','operator:B','builtin'),2);
});

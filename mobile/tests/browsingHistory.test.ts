import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyHistory, readHistory, recentEntries, recordVisit, studioPhoto } from '../src/core/browsingHistory.ts';

test('revisiting a piece promotes it and its store, without duplicating either', () => {
  let history = emptyHistory();
  for (let i = 0; i < 20; i++) history = recordVisit(history, 'store-' + i, 'piece-' + i);
  history = recordVisit(history, 'store-5', 'piece-5');
  assert.equal(history.products.length, 16);
  assert.equal(history.stores.length, 16);
  assert.deepEqual(history.products.slice(0, 2), ['piece-5','piece-19']);
  assert.deepEqual(history.stores.slice(0, 2), ['store-5','store-19']);
  assert.deepEqual(recentEntries(history.products, [{id:'piece-12'}, {id:'piece-5'}]), [{id:'piece-5'}, {id:'piece-12'}]);
  assert.deepEqual(readHistory(JSON.stringify(history)), history);
  assert.deepEqual(readHistory('bad data'), emptyHistory());
});

test('guests, missing photos and unavailable accounts get distinct studio states', async () => {
  assert.equal(await studioPhoto(new Response(null, {status:401})), 'guest');
  assert.equal(await studioPhoto(new Response(null, {status:503})), 'error');
  assert.equal(await studioPhoto(Response.json({id:'a',hasPhoto:false})), 'missing');
  assert.equal(await studioPhoto(Response.json({id:'a',hasPhoto:true})), 'ready');
});

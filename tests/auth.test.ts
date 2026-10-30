import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashKey, newApiKey } from '../apps/api/src/auth.js';
describe('API key primitives',()=>{
  it('generates high entropy single-view secrets and hashes them deterministically',()=>{
    process.env.API_KEY_PEPPER='test-pepper';
    const secret=newApiKey(); assert.equal(secret.startsWith('pfx_'),true); assert.ok(secret.length>40);
    assert.equal(hashKey(secret),hashKey(secret)); assert.notEqual(hashKey(secret),secret);
  });
});

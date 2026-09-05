import { describe, it, expect } from 'vitest';
import { signState, verifyState } from '../src/state';

const SECRET = 'test-secret';
const PAYLOAD = { clientId: 'client-1', redirectUri: 'https://example.com/cb', scope: ['mcp'] };

describe('state', () => {
  it('簽出的 state 可以驗回原本的 payload', async () => {
    const state = await signState(PAYLOAD, SECRET);
    expect(await verifyState(state, SECRET)).toEqual(PAYLOAD);
  });

  it('被竄改的 state 會回 null', async () => {
    const state = await signState(PAYLOAD, SECRET);
    const [body] = state.split('.');
    expect(await verifyState(`${body}.deadbeef`, SECRET)).toBeNull();
  });

  it('用錯誤密鑰驗證會回 null', async () => {
    const state = await signState(PAYLOAD, SECRET);
    expect(await verifyState(state, 'other-secret')).toBeNull();
  });

  it('格式不對的 state 會回 null 而非拋錯', async () => {
    expect(await verifyState('garbage', SECRET)).toBeNull();
  });
});

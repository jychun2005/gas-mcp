/// <reference types="@cloudflare/vitest-pool-workers/types" />

// 讓 cloudflare:test / cloudflare:workers 匯出的 env 具備本專案的 binding 型別
declare global {
  namespace Cloudflare {
    interface Env extends import('../src/types').Env {}
  }
}

export {};

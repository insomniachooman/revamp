import type { RevampApi } from "../../preload/index";

declare global {
  interface Window {
    revamp: RevampApi;
  }
}

export {};

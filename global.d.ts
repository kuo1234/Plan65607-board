// global.d.ts
export {};

declare global {
  interface Window {
    electronAPI: {
      on: (channel: string, func: (...args: any[]) => void) => void;
      // 定義其他需要的方法
    };
  }
}

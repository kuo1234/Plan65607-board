// global.d.ts
export {};

declare global {
  interface Window {
    electronAPI: {
      editCommand: () => Promise<string>;
      on: (channel: string, func: (...args: any[]) => void) => void;
      send: (channel: string, data?: any) => void;
      invoke: (channel: string, data?: any) => Promise<any>;
      getHistoryData: (query: { uid?: string, startTime?: string, endTime?: string }) => Promise<any[]>;
      getStudentList: () => Promise<string[]>;
      deleteStudentData: (uid: string) => Promise<boolean>;
      clearAllData: () => Promise<boolean>;
      // Exam DB APIs
      getExamStudentList: () => Promise<string[]>;
      getExamStudentData: (studentNumber: string) => Promise<any>;
      // DB config APIs
      getDbConfig: () => Promise<{ ip: string; username: string; password: string }>;
      saveDbConfig: (config: { ip: string; username: string; password: string }) => Promise<{ success: boolean; message: string }>;
      // Add other methods as needed
      startRecording: () => void;
      stopRecording: () => void;
      receive: (channel: string, func: (...args: any[]) => void) => void;
      removeListener: (channel: string, func: (...args: any[]) => void) => void;
    };
  }
}

// src/data/mockData.ts

export interface QuestionRecord {
  _id: string; // Simulate MongoDB _id
  uid: string;
  questionId: number;
  startTime: string; // ISO date string
  endTime: string;   // ISO date string
}

export interface SensorData {
  _id: string;
  timestamp: string;
  uid: string;
  data: {
    ecg_value: number;
    gsr_value: number;
    muscle_value: number;
    muscle_ok: boolean;
    muscle_voltage: number;
    muscle_reason: string;
    env_temperature: number;
    env_humidity: number;
    body_temperature: number;
    body_temp_fresh: boolean;
    hr_value: number;
    spo2_value: number;
    ir_value: number;
    lead_off_plus: boolean;
    lead_off_minus: boolean;
    lead_off: boolean;
    datetime: string; // "YYYY/M/D H:m:s.ms" format
  };
  __v: number;
}

// 產生 5 位學員的假資料
const BASE_TIME = new Date("2025-12-22T09:00:00.000Z");
const QUESTION_COUNT = 10;
const DURATION_PER_QUESTION_SEC = 60; // 每題假設 1 分鐘
const GAP_SEC = 30; // 題與題之間休息 30 秒

export const mockStudents = [
  { uid: "TEST_STUDENT_001", name: "王小明" },
  { uid: "TEST_STUDENT_002", name: "陳大華" },
  { uid: "TEST_STUDENT_003", name: "張志豪" },
  { uid: "TEST_STUDENT_004", name: "林雅婷" },
  { uid: "TEST_STUDENT_005", name: "李淑芬" },
];

export const mockQuestions: QuestionRecord[] = [];

// 生成題目區間資料
mockStudents.forEach((student, index) => {
  // 為了讓時間錯開，每位學員的開始時間都不一樣 (間隔 2 小時)
  const studentBaseTime = new Date(BASE_TIME.getTime() + index * 2 * 60 * 60 * 1000);

  for (let i = 1; i <= QUESTION_COUNT; i++) {
    const startMs = studentBaseTime.getTime() + (i - 1) * (DURATION_PER_QUESTION_SEC + GAP_SEC) * 1000;
    const endMs = startMs + DURATION_PER_QUESTION_SEC * 1000;
    
    mockQuestions.push({
      _id: `q_${student.uid}_${i}`,
      uid: student.uid,
      questionId: i,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString()
    });
  }
});

// 輔助函式：產生隨機 Sensor 數據
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// 生成指定時間範圍內的 Sensor 數據
// intervalMs: 每幾毫秒產生一筆資料 (例如 100ms = 10Hz)
export function generateMockSensorData(startIso: string, endIso: string, uid: string, intervalMs: number = 200): SensorData[] {
  const data: SensorData[] = [];
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  
  let current = start;
  while (current <= end) {
    const dateObj = new Date(current);
    // datetime 格式: "2021/1/1 0:49:26.4.1" -> 模擬一下
    const dateStr = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()} ${dateObj.getHours()}:${dateObj.getMinutes()}:${dateObj.getSeconds()}.${dateObj.getMilliseconds()}`;

    // 模擬一些波形
    const t = current / 1000;
    const ecg = 30000 + 10000 * Math.sin(2 * Math.PI * 1 * t) + randomInt(-500, 500); // 1Hz sine wave + noise
    const muscle = 20000 + 5000 * Math.sin(2 * Math.PI * 0.5 * t); 

    data.push({
      _id: `sensor_${current}`,
      timestamp: dateObj.toISOString(),
      uid: uid,
      data: {
        ecg_value: Math.floor(ecg),
        gsr_value: randomInt(40000, 45000), // ~42000
        muscle_value: Math.floor(muscle),
        muscle_ok: true,
        muscle_voltage: randomFloat(1.5, 2.5),
        muscle_reason: "ok",
        env_temperature: randomFloat(25, 27),
        env_humidity: randomFloat(55, 65),
        body_temperature: randomFloat(36.5, 37.0),
        body_temp_fresh: true,
        hr_value: randomInt(60, 100),
        spo2_value: randomInt(96, 99),
        ir_value: randomInt(60, 70),
        lead_off_plus: false,
        lead_off_minus: false,
        lead_off: false,
        datetime: dateStr
      },
      __v: 0
    });
    
    current += intervalMs;
  }
  return data;
}

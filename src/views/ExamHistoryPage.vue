<template>
  <div class="exam-history-container">
    <!-- 頂部控制列 -->
    <div class="controls">
      <button @click="$router.push('/')">返回首頁</button>
      <button class="danger-btn" @click="clearAllHistoryData" :disabled="loading || sensorLoading">
        清除所有歷史資料
      </button>
      <div class="search-box">
        <label>學員編號：</label>
        <input
          v-model="studentNumberInput"
          placeholder="輸入學員編號 (例如: 6)"
          @keyup.enter="fetchStudentData"
        />
        <button @click="fetchStudentData" :disabled="loading || !studentNumberInput">
          {{ loading ? '查詢中...' : '查詢' }}
        </button>
      </div>
    </div>

    <div class="sensor-student-panel">
      <div class="sensor-student-header">
        <h3>plan65607 有資料的學員</h3>
        <button class="refresh-btn" @click="loadSensorStudents" :disabled="studentListLoading">
          {{ studentListLoading ? '讀取中...' : '重新整理' }}
        </button>
      </div>
      <div v-if="sensorStudents.length === 0" class="no-data-text">
        {{ studentListLoading ? '載入中...' : '目前沒有可用學員資料' }}
      </div>
      <div v-else class="student-chip-list">
        <button
          v-for="uid in sensorStudents"
          :key="uid"
          class="student-chip"
          @click="selectSensorStudent(uid)"
          :disabled="loading"
        >
          {{ uid }}
        </button>
      </div>
    </div>

    <!-- 錯誤訊息 -->
    <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>

    <!-- 學員資訊卡片 -->
    <div v-if="studentData" class="student-info-card">
      <div class="info-header">
        <div class="avatar-lg">👤</div>
        <div class="info-text">
          <h2>學員 #{{ studentData.student_number }}</h2>
        </div>
      </div>

      <!-- 科目成績總覽 -->
      <div class="grade-summary">
        <h3>科目成績總覽</h3>
        <div class="grade-grid">
          <div
            v-for="(score, subject) in studentData.grade"
            :key="subject"
            class="grade-card"
            :class="{ 'not-taken': score === -1 }"
          >
            <div class="subject-name">{{ subject }}</div>
            <div class="score">{{ score === -1 ? '未作答' : score + ' 分' }}</div>
          </div>
        </div>
      </div>

      <!-- 作答生理狀態 - 各科目題目表格 -->
      <div class="exam-sections">
        <h3>作答紀錄（點擊題目查看生理量測）</h3>
        <div v-for="(entries, subject) in parsedExamData" :key="subject" class="exam-subject-section">
          <h4>
            {{ subject }}
            <span class="question-count">（共 {{ entries.length }} 題）</span>
            <span class="grade-badge" :class="getGradeClass(subject)">
              {{ getGradeText(subject) }}
            </span>
          </h4>
          <table class="exam-table">
            <thead>
              <tr>
                <th>題號</th>
                <th>開始時間</th>
                <th>結束時間</th>
                <th>作答時長</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="q in entries"
                :key="subject + '-' + q.questionId"
                :class="{ 'active-row': isSelected(subject, q.questionId) }"
              >
                <td>第 {{ q.questionId }} 題</td>
                <td>{{ formatDateTime(q.startTime) }}</td>
                <td>{{ formatDateTime(q.endTime) }}</td>
                <td>{{ formatDuration(q.startTime, q.endTime) }}</td>
                <td>
                  <button
                    class="view-btn"
                    @click="selectQuestion(subject, q)"
                    :disabled="sensorLoading"
                  >
                    {{ isSelected(subject, q.questionId) ? '已選取' : '查看生理數據' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="Object.keys(parsedExamData).length === 0" class="no-data-text">
          此學員無作答紀錄
        </div>
      </div>
    </div>

    <!-- 生理量測資料圖表 -->
    <div v-if="selectedSubject" class="charts-area">
      <h3>
        {{ selectedSubject }} - 第 {{ selectedQuestionId }} 題 生理量測
        <span class="time-range-label">
          {{ formatDateTime(selectedStartTime) }} ~ {{ formatDateTime(selectedEndTime) }}
        </span>
      </h3>
      <div v-if="sensorLoading" class="loading-text">載入生理數據中...</div>
      <div v-else-if="sensorDataPoints.length === 0 && sensorSearched" class="no-data-text">
        該時段無生理量測資料
      </div>
      <template v-else-if="sensorDataPoints.length > 0">
        <p class="data-count">共 {{ sensorDataPoints.length }} 筆資料</p>
        <div class="chart-box"><CanvasJSChart :options="ecgOptions" /></div>
        <div class="chart-box"><CanvasJSChart :options="emgOptions" /></div>
        <div class="chart-box"><CanvasJSChart :options="gsrOptions" /></div>
        <div class="chart-box"><CanvasJSChart :options="tempOptions" /></div>
        <div class="chart-box"><CanvasJSChart :options="hrOptions" /></div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';

// --- State ---
const studentNumberInput = ref('');
const loading = ref(false);
const errorMsg = ref('');
const studentData = ref(null);
const studentListLoading = ref(false);
const sensorStudents = ref([]);

const selectedSubject = ref('');
const selectedQuestionId = ref(null);
const selectedStartTime = ref('');
const selectedEndTime = ref('');
const sensorLoading = ref(false);
const sensorSearched = ref(false);
const sensorDataPoints = ref([]);

const EXAM_DEFAULT_TIMEZONE = '+08:00';

const normalizeExamTimeString = (value) => {
  if (typeof value !== 'string') return '';

  let text = value.trim();
  if (!text) return '';

  text = text.replace(
    /\.(\d{3})\d+([zZ]|[+-]\d{2}:\d{2})$/,
    '.$1$2'
  );
  text = text.replace(
    /\.(\d{3})\d+$/,
    '.$1'
  );

  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(text);
  if (!hasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
    return `${text}${EXAM_DEFAULT_TIMEZONE}`;
  }

  return text;
};

const parseExamDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const normalized = normalizeExamTimeString(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// --- 解析作答生理狀態為題目列表 ---
const parsedExamData = computed(() => {
  if (!studentData.value || !studentData.value['作答生理狀態']) return {};
  const raw = studentData.value['作答生理狀態'];
  const result = {};

  for (const [subject, entries] of Object.entries(raw)) {
    // entries is like { "1": "2026-...", "2": "2026-...", "3": -1, ... }
    // 收集有效時間戳（非 -1）
    const validEntries = [];
    const keys = Object.keys(entries).sort((a, b) => Number(a) - Number(b));
    for (const key of keys) {
      const val = entries[key];
      if (val !== -1 && typeof val === 'string') {
        const normalizedTime = normalizeExamTimeString(val);
        if (normalizedTime) {
          validEntries.push({ index: Number(key), time: normalizedTime });
        }
      }
    }

    // 連續時間戳配對：第 N 個是開始，第 N+1 個是結束
    // 最後一個時間是結束時間，所以題數 = validEntries.length - 1
    if (validEntries.length < 2) continue; // 至少需要兩個時間戳才能形成一題

    const questions = [];
    for (let i = 0; i < validEntries.length - 1; i++) {
      questions.push({
        questionId: i + 1,
        startTime: validEntries[i].time,
        endTime: validEntries[i + 1].time,
      });
    }
    if (questions.length > 0) {
      result[subject] = questions;
    }
  }

  return result;
});

// --- 取得學員資料 ---
const fetchStudentData = async () => {
  if (!studentNumberInput.value) return;
  loading.value = true;
  errorMsg.value = '';
  studentData.value = null;
  resetSensorSelection();

  try {
    const data = await window.electronAPI.getExamStudentData(studentNumberInput.value.trim());
    if (!data) {
      errorMsg.value = `找不到學員編號 "${studentNumberInput.value}" 的資料`;
    } else {
      studentData.value = data;
    }
  } catch (err) {
    errorMsg.value = '查詢失敗: ' + err.message;
  } finally {
    loading.value = false;
  }
};

const loadSensorStudents = async () => {
  studentListLoading.value = true;
  try {
    const list = await window.electronAPI.getStudentList();
    // 僅保留有值的 uid，並排序方便查找
    sensorStudents.value = (list || []).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
  } catch (err) {
    console.error('載入 plan65607 學員列表失敗:', err);
  } finally {
    studentListLoading.value = false;
  }
};

const selectSensorStudent = (uid) => {
  studentNumberInput.value = String(uid);
  fetchStudentData();
};

const clearAllHistoryData = async () => {
  if (!confirm('確定要清除 plan65607 的所有歷史生理資料嗎？此動作無法復原。')) return;

  loading.value = true;
  try {
    const success = await window.electronAPI.clearAllData();
    if (success) {
      alert('已清除 plan65607 歷史資料。');
      resetSensorSelection();
      await loadSensorStudents();
    } else {
      alert('清除失敗，請查看後端日誌。');
    }
  } catch (err) {
    alert('清除失敗: ' + err.message);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadSensorStudents();
});

// --- 選取題目、載入生理數據 ---
const isSelected = (subject, qId) => {
  return selectedSubject.value === subject && selectedQuestionId.value === qId;
};

const selectQuestion = async (subject, q) => {
  selectedSubject.value = subject;
  selectedQuestionId.value = q.questionId;
  selectedStartTime.value = q.startTime;
  selectedEndTime.value = q.endTime;
  sensorLoading.value = true;
  sensorSearched.value = false;
  sensorDataPoints.value = [];
  clearChartData();

  try {
    // 用學員編號作為 uid，從 plan65607 DB 撈取生理量測資料
    const uid = studentData.value.student_number;
    const startDate = parseExamDate(q.startTime);
    const endDate = parseExamDate(q.endTime);

    if (!startDate || !endDate) {
      throw new Error('題目時間格式無法解析');
    }

    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();
    console.log(`[ExamHistory] Querying sensor data: uid=${uid}, start=${startISO}, end=${endISO}`);
    const results = await window.electronAPI.getHistoryData({
      uid: uid,
      startTime: startISO,
      endTime: endISO,
    });
    console.log(`[ExamHistory] Got ${results ? results.length : 0} sensor records`);
    sensorDataPoints.value = results || [];
    processSensorData(results || []);
  } catch (err) {
    console.error('Error fetching sensor data:', err);
  } finally {
    sensorLoading.value = false;
    sensorSearched.value = true;
  }
};

const resetSensorSelection = () => {
  selectedSubject.value = '';
  selectedQuestionId.value = null;
  selectedStartTime.value = '';
  selectedEndTime.value = '';
  sensorDataPoints.value = [];
  sensorSearched.value = false;
  clearChartData();
};

// --- 格式化工具 ---
// 將時間轉為 UTC+8 顯示
const toUTC8 = (dateInput) => {
  const d = new Date(dateInput);
  // 取得 UTC 毫秒 + 加上 8 小時偏移
  return new Date(d.getTime() + 8 * 60 * 60 * 1000);
};

const formatDateTime = (iso) => {
  if (!iso) return '';
  const d = parseExamDate(iso);
  if (!d) return String(iso);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatDuration = (start, end) => {
  const startDate = parseExamDate(start);
  const endDate = parseExamDate(end);
  if (!startDate || !endDate) return '';

  const ms = endDate - startDate;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min} 分 ${sec} 秒`;
  return `${sec} 秒`;
};

const getGradeText = (subject) => {
  if (!studentData.value || !studentData.value.grade) return '';
  const score = studentData.value.grade[subject];
  if (score === undefined || score === -1) return '未作答';
  return `${score} 分`;
};

const getGradeClass = (subject) => {
  if (!studentData.value || !studentData.value.grade) return '';
  const score = studentData.value.grade[subject];
  if (score === undefined || score === -1) return 'grade-na';
  if (score >= 60) return 'grade-pass';
  return 'grade-fail';
};

// --- Chart Options ---
const TH = {
  ecg_quality: { rms_low: 150, rms_high: 8000 },
  emg_env: { low: 20, high: 1200 },
  gsr_uS: { low: 1, high: 20 },
  body_temp: { low: 36.1, high: 37.2, fever: 38.0 },
  hr: { low: 60, high: 100 },
  spo2: { low: 90, normal: 95 },
};

const ecgOptions = reactive({
  exportEnabled: true, zoomEnabled: true,
  title: { text: "ECG" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: { title: "ADC" },
  data: [{ type: "line", dataPoints: [] }],
});

const emgOptions = reactive({
  exportEnabled: true, zoomEnabled: true,
  title: { text: "EMG" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: { title: "ADC" },
  data: [{ type: "line", dataPoints: [] }],
});

const gsrOptions = reactive({
  exportEnabled: true, zoomEnabled: true,
  title: { text: "GSR" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: { title: "µS", stripLines: [{ startValue: TH.gsr_uS.low, endValue: TH.gsr_uS.high, color: "rgba(0,255,0,0.1)", label: "正常範圍" }] },
  data: [{ type: "line", dataPoints: [] }],
});

const tempOptions = reactive({
  exportEnabled: true, zoomEnabled: true,
  title: { text: "體溫/濕度" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: {
    title: "°C",
    stripLines: [
      { startValue: TH.body_temp.low, endValue: TH.body_temp.high, color: "rgba(0,255,0,0.15)", label: "正常體溫" },
      { value: TH.body_temp.fever, color: "rgba(255,0,0,0.2)", lineDashType: "dash", label: "發燒警戒" },
    ],
  },
  axisY2: { minimum: 0, maximum: 100, title: "Humidity (%)" },
  data: [
    { type: "line", name: "Env Temp", showInLegend: true, dataPoints: [] },
    { type: "line", name: "Body Temp", showInLegend: true, dataPoints: [] },
    { type: "line", name: "Humidity", axisYType: "secondary", showInLegend: true, dataPoints: [] },
  ],
});

const hrOptions = reactive({
  exportEnabled: true, zoomEnabled: true,
  title: { text: "心率與血氧" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: {
    title: "BPM", minimum: 0, maximum: 180,
    stripLines: [{ startValue: TH.hr.low, endValue: TH.hr.high, color: "rgba(0,255,0,0.1)", label: "正常HR" }],
  },
  axisY2: {
    title: "SpO2 (%)", minimum: 0, maximum: 100,
    stripLines: [
      { value: TH.spo2.normal, color: "rgba(255,170,51,0.2)", lineDashType: "dash", label: "SpO2 正常" },
      { value: TH.spo2.low, color: "rgba(255,0,0,0.2)", lineDashType: "dash", label: "SpO2 缺氧" },
    ],
  },
  data: [
    { type: "line", name: "Heart Rate", showInLegend: true, color: "red", dataPoints: [] },
    { type: "line", name: "SpO2", axisYType: "secondary", showInLegend: true, color: "blue", dataPoints: [] },
  ],
});

const clearChartData = () => {
  ecgOptions.data[0].dataPoints = [];
  emgOptions.data[0].dataPoints = [];
  gsrOptions.data[0].dataPoints = [];
  tempOptions.data[0].dataPoints = [];
  tempOptions.data[1].dataPoints = [];
  tempOptions.data[2].dataPoints = [];
  hrOptions.data[0].dataPoints = [];
  hrOptions.data[1].dataPoints = [];
};

function convertGSRtoConductance(analogValue) {
  const Vcc = 3.3, R_fixed = 10000;
  const Vout = (analogValue / 65535) * Vcc;
  if (Vout <= 0) return 0;
  const R_skin = (R_fixed * (Vcc - Vout)) / Vout;
  if (R_skin <= 0) return 0;
  return 1e6 / R_skin;
}

const processSensorData = (results) => {
  const ecgPts = [], emgPts = [], gsrPts = [];
  const envTempPts = [], bodyTempPts = [], humidityPts = [];
  const hrPts = [], spo2Pts = [];

  results.forEach((record) => {
    // 感測器的 timestamp 是 UTC，轉為 UTC+8 顯示
    const time = toUTC8(record.timestamp);
    const d = record.data;
    if (!d) return;

    if (d.ecg_value !== undefined) {
      const val = Number(d.ecg_value);
      const pt = { x: time, y: val };
      if (val < 50 || val > 65000) { pt.markerColor = "red"; pt.markerType = "cross"; }
      ecgPts.push(pt);
    }
    if (d.muscle_value !== undefined) emgPts.push({ x: time, y: Number(d.muscle_value) });
    if (d.gsr_value !== undefined) gsrPts.push({ x: time, y: convertGSRtoConductance(Number(d.gsr_value)) });
    if (d.env_temperature !== undefined) envTempPts.push({ x: time, y: Number(d.env_temperature) });
    if (d.body_temperature !== undefined) bodyTempPts.push({ x: time, y: Number(d.body_temperature) });
    if (d.env_humidity !== undefined) humidityPts.push({ x: time, y: Number(d.env_humidity) });
    if (d.hr_value !== undefined) {
      const val = Number(d.hr_value);
      const pt = { x: time, y: val };
      if (val < TH.hr.low || val > TH.hr.high) { pt.markerColor = "red"; pt.markerType = "circle"; pt.markerSize = 10; }
      hrPts.push(pt);
    }
    if (d.spo2_value !== undefined) {
      const val = Number(d.spo2_value);
      const pt = { x: time, y: val };
      if (val < TH.spo2.low) { pt.markerColor = "red"; pt.markerType = "triangle"; }
      spo2Pts.push(pt);
    }
  });

  ecgOptions.data[0].dataPoints = ecgPts;
  emgOptions.data[0].dataPoints = emgPts;
  gsrOptions.data[0].dataPoints = gsrPts;
  tempOptions.data[0].dataPoints = envTempPts;
  tempOptions.data[1].dataPoints = bodyTempPts;
  tempOptions.data[2].dataPoints = humidityPts;
  hrOptions.data[0].dataPoints = hrPts;
  hrOptions.data[1].dataPoints = spo2Pts;
};
</script>

<style scoped>
.exam-history-container {
  padding: 20px;
  max-width: 1300px;
  margin: 0 auto;
}

/* 控制列 */
.controls {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-bottom: 20px;
  background: #1e1e1e;
  padding: 15px;
  border-radius: 8px;
  flex-wrap: wrap;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-box label {
  font-weight: bold;
  white-space: nowrap;
}
.search-box input {
  padding: 8px 12px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #2a2a2a;
  color: #e0e0e0;
  width: 220px;
}
.search-box button {
  padding: 8px 20px;
}

.danger-btn {
  background: #b71c1c;
}

.danger-btn:hover {
  background: #8e1515;
}

.sensor-student-panel {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 14px;
}

.sensor-student-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.sensor-student-header h3 {
  margin: 0;
  font-size: 0.95rem;
  color: #cfd8dc;
}

.refresh-btn {
  background: #455a64;
  padding: 6px 12px;
}

.refresh-btn:hover {
  background: #37474f;
}

.student-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.student-chip {
  background: #263238;
  border: 1px solid #3b4a52;
  padding: 6px 10px;
  border-radius: 999px;
}

.student-chip:hover {
  background: #1f2a30;
}

/* 錯誤 */
.error-msg {
  color: #ff6b6b;
  background: #2a1515;
  padding: 10px 15px;
  border-radius: 6px;
  margin-bottom: 15px;
  border-left: 4px solid #ff4444;
}

/* 學員資訊卡片 */
.student-info-card {
  background: #1e1e1e;
  border-radius: 10px;
  padding: 25px;
  margin-bottom: 25px;
  border: 1px solid #333;
}
.info-header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
}
.avatar-lg {
  font-size: 40px;
  background: #2a2a2a;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.info-text h2 {
  margin: 0;
  color: #fff;
}

/* 成績總覽 */
.grade-summary {
  margin-bottom: 25px;
}
.grade-summary h3 {
  color: #bbb;
  margin-bottom: 10px;
  font-size: 1em;
}
.grade-grid {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
}
.grade-card {
  background: #2a2a2a;
  padding: 15px 25px;
  border-radius: 8px;
  text-align: center;
  min-width: 120px;
  border: 1px solid #444;
}
.grade-card .subject-name {
  font-size: 0.85em;
  color: #aaa;
  margin-bottom: 5px;
}
.grade-card .score {
  font-size: 1.4em;
  font-weight: bold;
  color: #4fc3f7;
}
.grade-card.not-taken .score {
  color: #888;
  font-size: 1em;
}

/* 作答紀錄 */
.exam-sections h3 {
  color: #bbb;
  margin-bottom: 15px;
}
.exam-subject-section {
  margin-bottom: 25px;
}
.exam-subject-section h4 {
  color: #e0e0e0;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.question-count {
  font-size: 0.8em;
  color: #888;
  font-weight: normal;
}
.grade-badge {
  font-size: 0.75em;
  padding: 2px 10px;
  border-radius: 12px;
  font-weight: bold;
}
.grade-pass {
  background: #1b5e20;
  color: #a5d6a7;
}
.grade-fail {
  background: #b71c1c;
  color: #ef9a9a;
}
.grade-na {
  background: #37474f;
  color: #90a4ae;
}

/* 表格 */
.exam-table {
  width: 100%;
  border-collapse: collapse;
  background: #252525;
  border-radius: 6px;
  overflow: hidden;
}
.exam-table th {
  background: #333;
  color: #aaa;
  padding: 10px 15px;
  text-align: left;
  font-size: 0.85em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.exam-table td {
  padding: 10px 15px;
  border-bottom: 1px solid #333;
  color: #ddd;
}
.exam-table tr:last-child td {
  border-bottom: none;
}
.exam-table tr:hover {
  background: #2a3a4a;
}
.active-row {
  background: #1a3a5c !important;
  border-left: 3px solid #4fc3f7;
}

.view-btn {
  padding: 5px 14px;
  font-size: 0.85em;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.view-btn:hover {
  background: #1565c0;
}
.view-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 圖表區 */
.charts-area {
  margin-top: 25px;
}
.charts-area h3 {
  color: #e0e0e0;
  margin-bottom: 15px;
}
.time-range-label {
  font-size: 0.75em;
  color: #888;
  font-weight: normal;
  margin-left: 10px;
}
.chart-box {
  height: 350px;
  margin-bottom: 25px;
  border: 1px solid #333;
  padding: 10px;
  border-radius: 6px;
  background: #1e1e1e;
}
.data-count {
  color: #888;
  font-size: 0.9em;
  margin-bottom: 10px;
}
.loading-text {
  color: #4fc3f7;
  font-style: italic;
}
.no-data-text {
  color: #888;
  font-style: italic;
  padding: 15px;
}

/* 按鈕基本樣式 */
button {
  padding: 8px 18px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  background: #4caf50;
  color: white;
  font-size: 0.9em;
  transition: background 0.2s;
}
button:hover {
  background: #388e3c;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

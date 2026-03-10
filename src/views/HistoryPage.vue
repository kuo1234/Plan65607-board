<template>
  <div class="history-container">
    <div class="controls">
      <button @click="$router.push('/')">返回首頁</button>
      
      <!-- Toggle Mock/Real -->
      <button @click="toggleDemoMode" :class="{ 'active-mode': isMockData }">
        {{ isMockData ? '切換回真實資料' : '切換至演示模式 (Mock Data)' }}
      </button>

       <button @click="clearData" class="danger-btn" :disabled="loading">
        清除所有資料 (DB)
      </button>
    </div>

    <!-- Student Selection Area -->
    <div class="section-panel">
      <div class="panel-header">
        <h3>1. 選擇學員 ({{ isMockData ? '演示資料' : '資料庫紀錄' }})</h3>
        <input 
            v-if="availableStudents.length > 0"
            v-model="searchStudentKeyword" 
            placeholder="搜尋學員 ID 或 姓名..." 
            class="search-input"
        />
      </div>

      <div v-if="filteredStudents.length === 0" class="no-data-text">
        {{ loading ? '載入中...' : (availableStudents.length === 0 ? '無學員資料' : '找不到相符學員') }}
      </div>
      <div class="student-grid" v-else>
        <div 
          v-for="student in filteredStudents" 
          :key="student.uid || student"
          class="student-card"
          :class="{ active: searchUid === (student.uid || student) }"
          @click="selectStudent(student)"
        >
          <div class="avatar">👤</div>
          <div class="info">
            <div class="name">{{ student.name || '學員' }}</div>
            <div class="uid">{{ student.uid || student }}</div>
          </div>
          <button 
                class="delete-icon" 
                v-if="!isMockData"
                title="刪除該學員資料"
                @click="deleteStudent(student, $event)"
              >
            🗑️
          </button>
        </div>
      </div>
    </div>

    <!-- Question/Time Selection Area -->
    <div class="section-panel" v-if="searchUid">
      <h3>
        2. 選擇作答紀錄 
        <span v-if="!isMockData" style="font-size:0.8em; font-weight:normal;">(真實資料暫無題目紀錄，請手動選擇時間)</span>
      </h3>
      
      <!-- For Mock Data: Show Questions -->
      <div v-if="questionList.length > 0" class="questions-grid">
        <div 
          v-for="q in questionList" 
          :key="q.questionId"
          class="question-card"
          :class="{ active: selectedQuestion && selectedQuestion.questionId === q.questionId }"
          @click="selectQuestion(q)"
        >
          <h4>第 {{ q.questionId }} 題</h4>
          <p class="time-range">{{ formatTime(q.startTime) }} - {{ formatTime(q.endTime) }}</p>
        </div>
      </div>
      
      <!-- Manual Time Picker (Always available but secondary for Mock) -->
      <div class="manual-controls" :class="{ 'disabled': loading }">
         <label>
            開始: <input type="datetime-local" v-model="startTime" />
         </label>
         <label>
            結束: <input type="datetime-local" v-model="endTime" />
         </label>
         <button @click="fetchData" :disabled="loading || !startTime || !endTime">
            查詢區間
         </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    

    <div class="charts-area" v-if="dataPoints.length > 0">
      <h3>查詢結果: {{ dataPoints.length }} 筆資料</h3>
      
      <!-- ECG Chart -->
      <div class="chart-box">
        <CanvasJSChart :options="ecgOptions" />
      </div>

      <!-- EMG Chart -->
      <div class="chart-box">
        <CanvasJSChart :options="emgOptions" />
      </div>

      <!-- GSR Chart -->
      <div class="chart-box">
        <CanvasJSChart :options="gsrOptions" />
      </div>

      <!-- Temp/Humidity Chart -->
      <div class="chart-box">
        <CanvasJSChart :options="tempOptions" />
      </div>

      <!-- HR/SpO2 Chart -->
      <div class="chart-box">
        <CanvasJSChart :options="hrOptions" />
      </div>
    </div>
    <div v-else-if="!loading && searched" class="no-data">
      沒有找到資料
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { mockQuestions, generateMockSensorData, mockStudents } from '../data/mockData';

const searchUid = ref('');
const startTime = ref('');
const endTime = ref('');
const loading = ref(false);
const error = ref('');
const searched = ref(false);
const dataPoints = ref([]);

// State for Student Selection
const availableStudents = ref([]); // List of UIDs or objects
const isMockData = ref(false); // Whether current student list is mock
const searchStudentKeyword = ref(''); // Added for filtering

// Demo Mode State
const questionList = ref([]);
const selectedQuestion = ref(null);
const selectedStudent = ref(null);

const filteredStudents = computed(() => {
    if (!searchStudentKeyword.value) return availableStudents.value;
    const lowerKey = searchStudentKeyword.value.toLowerCase();
    
    return availableStudents.value.filter(s => {
        if (typeof s === 'string') {
            return s.toLowerCase().includes(lowerKey); // Real data usually just string UID
        } else {
            // Mock object {uid, name}
             return (s.uid && s.uid.toLowerCase().includes(lowerKey)) || 
                    (s.name && s.name.toLowerCase().includes(lowerKey));
        }
    });
});

const deleteStudent = async (student, event) => {
    event.stopPropagation(); // Prevent card selection
    
    if (isMockData.value) {
        alert("Mock data cannot be deleted.");
        return;
    }

    const uid = student.uid || student;
    if (!confirm(`確定要刪除學員 ${uid} 的所有資料嗎？此動作無法復原！`)) return;

    loading.value = true;
    try {
        const success = await window.electronAPI.deleteStudentData(uid);
        if (success) {
            alert(`學員 ${uid} 資料已刪除`);
            if (searchUid.value === uid) {
               resetSelection();
            }
            await loadRealStudents();
        } else {
            alert('刪除失敗');
        }
    } catch (e) {
        alert('刪除時發生錯誤: ' + e.message);
    } finally {
        loading.value = false;
    }
};

onMounted(async () => {
    await loadRealStudents();
});

const loadRealStudents = async () => {
    loading.value = true;
    try {
        const list = await window.electronAPI.getStudentList();
        availableStudents.value = list || [];
        isMockData.value = false;
    } catch (e) {
        console.error("Failed to load students", e);
    } finally {
        loading.value = false;
    }
}

const toggleDemoMode = () => {
    isMockData.value = !isMockData.value;
    resetSelection();
    
    if (isMockData.value) {
        availableStudents.value = mockStudents;
    } else {
        loadRealStudents();
    }
};

const resetSelection = () => {
    searchUid.value = '';
    startTime.value = '';
    endTime.value = '';
    questionList.value = [];
    selectedQuestion.value = null;
    selectedStudent.value = null;
    dataPoints.value = [];
    searched.value = false;
    clearChartData();
}

const selectStudent = (student) => {
    const uid = student.uid || student;
    searchUid.value = uid;
    selectedStudent.value = student;
    selectedQuestion.value = null;
    
    clearChartData();
    dataPoints.value = [];

    if (isMockData.value) {
        questionList.value = mockQuestions.filter(q => q.uid === uid);
    } else {
        questionList.value = [];
    }
};

const formatTime = (iso) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

const formatForInput = (isoString) => {
    const d = new Date(isoString);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const selectQuestion = (q) => {
  selectedQuestion.value = q;
  startTime.value = formatForInput(q.startTime);
  endTime.value = formatForInput(q.endTime);
  fetchData();
};

const clearChartData = () => {
  ecgOptions.data[0].dataPoints = [];
  emgOptions.data[0].dataPoints = [];
  gsrOptions.data[0].dataPoints = [];
  tempOptions.data[0].dataPoints = [];
  tempOptions.data[1].dataPoints = [];
  tempOptions.data[2].dataPoints = [];
  hrOptions.data[0].dataPoints = [];
  hrOptions.data[1].dataPoints = [];
}

// Thresholds (copied from BiosignalPage for consistency)
const TH = {
  ecg_quality: { rms_low: 150, rms_high: 8000 },
  emg_env: { low: 20, high: 1200 },
  gsr_uS: { low: 1, high: 20 },
  body_temp: { low: 36.1, high: 37.2, fever: 38.0 },
  hr: { low: 60, high: 100 },
  spo2: { low: 90, normal: 95 },
};

const ecgOptions = reactive({
  exportEnabled: true,
  zoomEnabled: true,
  title: { text: "歷史 ECG (異常點標示為紅色)" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: { title: "ADC" },
  data: [{
    type: "line",
    dataPoints: []
  }]
});

const emgOptions = reactive({
  exportEnabled: true,
  zoomEnabled: true,
  title: { text: "歷史 EMG" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: { title: "ADC" },
  data: [{
    type: "line",
    dataPoints: []
  }]
});

const gsrOptions = reactive({
  exportEnabled: true,
  zoomEnabled: true,
  title: { text: "歷史 GSR" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: { title: "µS", stripLines: [{ startValue: TH.gsr_uS.low, endValue: TH.gsr_uS.high, color: "rgba(0, 255, 0, 0.1)", label: "正常範圍" }] },
  data: [{
    type: "line",
    dataPoints: []
  }]
});

const tempOptions = reactive({
  exportEnabled: true,
  zoomEnabled: true,
  title: { text: "歷史體溫/濕度" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: { 
    title: "°C", 
    stripLines: [
      { startValue: TH.body_temp.low, endValue: TH.body_temp.high, color: "rgba(0, 255, 0, 0.15)", label: "正常體溫" },
      { value: TH.body_temp.fever, color: "rgba(255, 0, 0, 0.2)", lineDashType: "dash", label: "發燒警戒" }
    ]
  },
  axisY2: { minimum: 0, maximum: 100, title: "Humidity (%)" },
  data: [
    { type: "line", name: "Env Temp", showInLegend: true, dataPoints: [] },
    { type: "line", name: "Body Temp", showInLegend: true, dataPoints: [] },
    { type: "line", name: "Humidity", axisYType: "secondary", showInLegend: true, dataPoints: [] }
  ]
});

const hrOptions = reactive({
  exportEnabled: true,
  zoomEnabled: true,
  title: { text: "歷史心率與血氧" },
  axisX: { valueFormatString: "HH:mm:ss" },
  axisY: { 
    title: "BPM", 
    minimum: 0, maximum: 180,
    stripLines: [{ startValue: TH.hr.low, endValue: TH.hr.high, color: "rgba(0,255,0,0.1)", label: "正常 HR" }]
  },
  axisY2: { 
    title: "SpO2 (%)", 
    minimum: 0, maximum: 100,
    stripLines: [
      { value: TH.spo2.normal, color: "rgba(255, 170, 51, 0.2)", lineDashType: "dash", label: "SpO2 正常" },
      { value: TH.spo2.low, color: "rgba(255, 0, 0, 0.2)", lineDashType: "dash", label: "SpO2 缺氧" }
    ]
  },
  data: [
    { type: "line", name: "Heart Rate", showInLegend: true, color: "red", dataPoints: [] },
    { type: "line", name: "SpO2", axisYType: "secondary", showInLegend: true, color: "blue", dataPoints: [] }
  ]
});

// Helper to convert GSR
function convertGSRtoConductance(analogValue) {
  const Vcc = 3.3, R_fixed = 10000;
  const Vout = (analogValue / 65535) * Vcc;
  if (Vout <= 0) return 0;
  const R_skin = (R_fixed * (Vcc - Vout)) / Vout;
  if (R_skin <= 0) return 0;
  return 1e6 / R_skin; // µS
}

const fetchData = async () => {
  loading.value = true;
  error.value = '';
  searched.value = true;
  dataPoints.value = [];
  
  clearChartData();

  try {
    let results;
    if (isMockData.value && searchUid.value) {
       // Demo Data Generation
       const s = startTime.value ? new Date(startTime.value).toISOString() : new Date().toISOString();
       const e = endTime.value ? new Date(endTime.value).toISOString() : new Date().toISOString();
       results = generateMockSensorData(s, e, searchUid.value);
       // Fake network delay
       await new Promise(resolve => setTimeout(resolve, 300));
    } else {
      results = await window.electronAPI.getHistoryData({
        uid: searchUid.value || undefined,
        startTime: startTime.value ? new Date(startTime.value).toISOString() : undefined,
        endTime: endTime.value ? new Date(endTime.value).toISOString() : undefined
      });
    }

    dataPoints.value = results;

    // Process data for charts
    const ecgPoints = [];
    const emgPoints = [];
    const gsrPoints = [];
    const envTempPoints = [];
    const bodyTempPoints = [];
    const humidityPoints = [];
    const hrPoints = [];
    const spo2Points = [];

    results.forEach(record => {
      const time = new Date(record.timestamp);
      const data = record.data;

      if (data) {
        // ECG
        if (data.ecg_value !== undefined) {
          const val = Number(data.ecg_value);
          const point = { x: time, y: val };
          if (val < 50 || val > 65000) {
            point.markerColor = "red";
            point.markerType = "cross";
            point.indexLabel = "異常";
          }
          ecgPoints.push(point);
        }

        // EMG
        if (data.muscle_value !== undefined) {
          const val = Number(data.muscle_value);
          emgPoints.push({ x: time, y: val });
        }

        // GSR
        if (data.gsr_value !== undefined) {
          const val = convertGSRtoConductance(Number(data.gsr_value));
          gsrPoints.push({ x: time, y: val });
        }

        // Temp/Humidity
        if (data.env_temperature !== undefined) envTempPoints.push({ x: time, y: Number(data.env_temperature) });
        if (data.body_temperature !== undefined) bodyTempPoints.push({ x: time, y: Number(data.body_temperature) });
        if (data.env_humidity !== undefined) humidityPoints.push({ x: time, y: Number(data.env_humidity) });

        // HR/SpO2
        if (data.hr_value !== undefined) {
          const val = Number(data.hr_value);
          const point = { x: time, y: val };
          if (val < TH.hr.low || val > TH.hr.high) {
            point.markerColor = "red";
            point.markerType = "circle";
            point.markerSize = 10;
          }
          hrPoints.push(point);
        }
        if (data.spo2_value !== undefined) {
          const val = Number(data.spo2_value);
          const point = { x: time, y: val };
          if (val < TH.spo2.low) {
             point.markerColor = "red";
             point.markerType = "triangle";
          }
          spo2Points.push(point);
        }
      }
    });

    ecgOptions.data[0].dataPoints = ecgPoints;
    emgOptions.data[0].dataPoints = emgPoints;
    gsrOptions.data[0].dataPoints = gsrPoints;
    
    tempOptions.data[0].dataPoints = envTempPoints;
    tempOptions.data[1].dataPoints = bodyTempPoints;
    tempOptions.data[2].dataPoints = humidityPoints;

    hrOptions.data[0].dataPoints = hrPoints;
    hrOptions.data[1].dataPoints = spo2Points;

  } catch (e) {
    error.value = '讀取失敗: ' + e.message;
  } finally {
    loading.value = false;
  }
};

const clearData = async () => {
  if (!confirm('確定要清除所有歷史資料嗎？此動作無法復原！')) return;
  
  loading.value = true;
  try {
    const success = await window.electronAPI.clearAllData();
    if (success) {
      alert('資料已清除');
      dataPoints.value = [];
      searched.value = false;
      // Clear charts
      ecgOptions.data[0].dataPoints = [];
      emgOptions.data[0].dataPoints = [];
      gsrOptions.data[0].dataPoints = [];
      tempOptions.data[0].dataPoints = [];
      tempOptions.data[1].dataPoints = [];
      tempOptions.data[2].dataPoints = [];
      hrOptions.data[0].dataPoints = [];
      hrOptions.data[1].dataPoints = [];
    } else {
      alert('清除失敗');
    }
  } catch (e) {
    alert('清除失敗: ' + e.message);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.history-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}
.controls {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  align-items: flex-end;
  flex-wrap: wrap;
  background: #f5f5f5;
  padding: 15px;
  border-radius: 8px;
}
.controls label {
  display: flex;
  flex-direction: column;
  font-weight: bold;
}
.controls input {
  padding: 5px;
  margin-top: 5px;
}
.danger-btn {
  background-color: #ff4444;
  color: white;
  border: none;
  margin-left: auto;
}
.danger-btn:hover {
  background-color: #cc0000;
}
.chart-box {
  height: 400px;
  margin-bottom: 30px;
  border: 1px solid #ddd;
  padding: 10px;
  border-radius: 4px;
}
.error { color: red; margin: 10px 0; }
.no-data { color: #666; font-style: italic; }

/* Student Selection Panel */
.section-panel {
  margin-bottom: 25px;
  padding: 20px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  border: 1px solid #eee;
}
.section-panel h3 {
  margin-top: 0;
  margin-bottom: 15px;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
  color: #333;
}

.student-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
}
.panel-header h3 {
  margin: 0;
  border: none;
  padding: 0;
}
.search-input {
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 200px;
}

.student-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: #f9f9f9;
}
.student-card:hover {
  border-color: #2196F3;
  background: #e3f2fd;
  transform: translateY(-2px);
}
.student-card.active {
  border-color: #2196F3;
  background: #2196F3;
  color: white;
}
.delete-icon {
  position: absolute;
  top: 5px;
  right: 5px;
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  font-size: 1.2em;
  padding: 0;
}
.student-card:hover .delete-icon {
  opacity: 1;
}
.delete-icon:hover {
  transform: scale(1.2);
}
.student-card .avatar {
  font-size: 24px;
  background: #fff;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.student-card.active .avatar {
  background: rgba(255,255,255,0.2);
}
.student-card .name {
  font-weight: bold;
}
.student-card .uid {
  font-size: 0.8em;
  opacity: 0.8;
}

/* Question Grid (inherited/modified) */
.questions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 15px;
}
.question-card.active {
  background-color: #e3f2fd;
  border-color: #1976D2;
}

/* Toggle Button */
.active-mode {
  background-color: #4CAF50 !important;
  color: white;
}

.manual-controls {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed #ccc;
  display: flex;
  gap: 15px;
  align-items: flex-end;
}
.manual-controls.disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>
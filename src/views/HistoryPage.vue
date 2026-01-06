<template>
  <div class="history-container">
    <div class="controls">
      <button @click="$router.push('/')">返回首頁</button>
      
      <label>
        學員 ID (UID):
        <input v-model="searchUid" placeholder="例如: S001" />
      </label>

      <label>
        開始時間:
        <input type="datetime-local" v-model="startTime" />
      </label>

      <label>
        結束時間:
        <input type="datetime-local" v-model="endTime" />
      </label>

      <button @click="fetchData" :disabled="loading">
        {{ loading ? '載入中...' : '查詢資料' }}
      </button>

      <button @click="clearData" class="danger-btn" :disabled="loading">
        清除所有資料
      </button>
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
import { ref, reactive } from 'vue';

const searchUid = ref('');
const startTime = ref('');
const endTime = ref('');
const loading = ref(false);
const error = ref('');
const searched = ref(false);
const dataPoints = ref([]);

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
  
  // Clear charts
  ecgOptions.data[0].dataPoints = [];
  emgOptions.data[0].dataPoints = [];
  gsrOptions.data[0].dataPoints = [];
  tempOptions.data[0].dataPoints = []; // Env
  tempOptions.data[1].dataPoints = []; // Body
  tempOptions.data[2].dataPoints = []; // Humidity
  hrOptions.data[0].dataPoints = []; // HR
  hrOptions.data[1].dataPoints = []; // SpO2

  try {
    const results = await window.electronAPI.getHistoryData({
      uid: searchUid.value || undefined,
      startTime: startTime.value ? new Date(startTime.value).toISOString() : undefined,
      endTime: endTime.value ? new Date(endTime.value).toISOString() : undefined
    });

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
</style>
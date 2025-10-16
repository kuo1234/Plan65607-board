<template>
  <div class="main-container">
    <!-- 操作區 -->
    <div class="home-button-container">
      <button @click="returnHome">返回主畫面</button>
      <button @click="restartPicoW">重新執行 Pico W 程式</button>
    </div>

    <!-- 學員欄（水平排列） -->
    <div class="scrollable-charts-container">
      <div class="student-container" v-for="(sensorCharts, path) in charts" :key="path">
        <h2>{{ deviceLabelMap[path] || path }}</h2>

        <!-- 狀態指示 -->
        <div class="status-list">
          <span v-for="group in sensorCharts" :key="group.label">
            <span v-for="item in group.statusList" :key="item.label" :class="['status-indicator', item.status]">
              {{ item.label }}
            </span>
          </span>
        </div>

        <!-- ECG 模式切換 -->
        <div v-if="sensorCharts.ecg_group" class="norm-control">
          <label>ECG 顯示：
            <select v-model="sensorCharts.ecg_group.runtime.normMode"
              @change="onNormModeChanged(sensorCharts.ecg_group)">
              <option value="z">z-score（預設）</option>
              <option value="pct">%Δ 基線</option>
              <option value="raw">原始值（ADC）</option>
            </select>
          </label>
          <label style="margin-left:8px;">
            <input type="checkbox" v-model="sensorCharts.ecg_group.runtime.useEnvelope"
              @change="onNormModeChanged(sensorCharts.ecg_group)" />
            ECG 包絡
          </label>
          <small class="muted">
            視窗 {{ sensorCharts.ecg_group.runtime.windowLen / 10 }}s，基線 {{ sensorCharts.ecg_group.runtime.baselineLen / 10
            }}s
          </small>
        </div>

        <!-- EMG 模式切換 -->
        <div v-if="sensorCharts.emg_group" class="norm-control">
          <label>EMG 顯示：
            <select v-model="sensorCharts.emg_group.runtime.normMode"
              @change="onNormModeChanged(sensorCharts.emg_group)">
              <option value="z">z-score（預設）</option>
              <option value="pct">%Δ 基線</option>
              <option value="raw">原始值（ADC）</option>
            </select>
          </label>
          <label style="margin-left:8px;">
            <input type="checkbox" v-model="sensorCharts.emg_group.runtime.useEnvelope"
              @change="onNormModeChanged(sensorCharts.emg_group)" />
            EMG 包絡
          </label>
          <small class="muted">
            視窗 {{ sensorCharts.emg_group.runtime.windowLen / 10 }}s，基線 {{ sensorCharts.emg_group.runtime.baselineLen / 10
            }}s
          </small>
        </div>

        <!-- 圖表群（垂直堆疊） -->
        <div class="charts-container-vertical">
          <div v-for="(group, key) in sensorCharts" :key="key" v-show="group.visible" class="chart-container">
            <CanvasJSChart :options="group.options" :style="styleOptions"
              @chart-ref="(instance) => setChartInstance(path, key, instance)" />
          </div>
        </div>

        <!-- 各學員自己的顯示切換 -->
        <div class="checkbox-group">
          <label v-for="(group, key) in sensorCharts" :key="key">
            <input type="checkbox" v-model="group.visible" @change="adjustChartHeights" />
            {{ group.label }}
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 監聽 Pico W 插入/移除
if (window.electronAPI && typeof window.electronAPI.onPicoPortsChanged === 'function') {
  window.electronAPI.onPicoPortsChanged((portPaths) => {
    for (const path in charts) { delete charts[path]; }
    for (const key in deviceLabelMap) { delete deviceLabelMap[key]; }
    tabs.value = ['All'];
    deviceCount.value = 0;
    portPaths.forEach(path => {
      initialChart(path);
      deviceCount.value++;
      deviceLabelMap[path] = `學員${deviceCount.value}`;
      tabs.value.push(path);
    });
    adjustChartHeights();
  });
}

import { useRouter } from "vue-router";
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from "vue";

const router = useRouter();
const xVal = ref(0);
const chartUpdateFreq = 100; // ms（10 Hz）

const tabs = ref(["All"]);
const activeTab = ref("All");
const deviceLabelMap = reactive({});
let deviceCount = ref(0);
const charts = reactive({});

// ===== 狀態範圍（可依需求調整）=====
const TH = {
  // ECG/EMG 狀態：以訊號品質/包絡幅度為主，不看標準化值
  ecg_quality: { rms_low: 150, rms_high: 8000, clip_ratio_high: 0.02 }, // ADC LSB
  emg_env: { low: 20, high: 1200 }, // 整流後移動平均的包絡（ADC LSB）

  // GSR：µS
  gsr_uS: { low: 1, high: 20 },

  // 溫溼度/HR/SpO2：實際單位
  body_temp: { low: 36.1, high: 37.2, fever: 38.0 },
  env_temp: { low: 20, high: 35 },
  humidity: { low: 30, high: 70 }, // %
  hr: { low: 60, high: 100 },      // bpm
  spo2: { low: 90, normal: 95 },   // %
};

// 新掛載圖用的 style；已掛載圖會直接改 instance.options.height
const styleOptions = reactive({ width: "100%", height: "360px" });
const chartHeight = ref("360px");

// 響應式字級
function cssSizeVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? parseInt(v) : fallback;
  } catch { return fallback; }
}
let chartTitleFontSize = cssSizeVar("--title-size", 26);
let labelFontSize = cssSizeVar("--label-size", 14);
let labelTitleFontSize = cssSizeVar("--label-title-size", 14);

// —— 換算與狀態
function convertGSRtoConductance(analogValue) {
  const Vcc = 3.3, R_fixed = 10000;
  const Vout = (analogValue / 65535) * Vcc;
  if (Vout <= 0) return 0;
  const R_skin = (R_fixed * (Vcc - Vout)) / Vout;
  if (R_skin <= 0) return 0;
  return 1e6 / R_skin; // µS
}

// 狀態評分（hold 最高優先）
function getStatus(value, key, extra = {}) {
  if (extra.hold) return "hold";

  if (key === "gsr_value") {
    if (value < TH.gsr_uS.low) return "low";
    if (value > TH.gsr_uS.high) return "high";
    return "normal";
  }
  if (key === "body_temperature") {
    if (value >= TH.body_temp.fever) return "high";
    if (value < TH.body_temp.low) return "low";
    if (value <= TH.body_temp.high) return "normal";
    return "high";
  }
  if (key === "env_temperature") {
    if (value < TH.env_temp.low) return "low";
    if (value > TH.env_temp.high) return "high";
    return "normal";
  }
  if (key === "env_humidity") {
    if (value < TH.humidity.low) return "low";
    if (value > TH.humidity.high) return "high";
    return "normal";
  }
  if (key === "hr_value") {
    if (value < TH.hr.low) return "low";
    if (value > TH.hr.high) return "high";
    return "normal";
  }
  if (key === "spo2_value") {
    if (value < TH.spo2.low) return "high";
    if (value < TH.spo2.normal) return "low";
    return "normal";
  }
  // 其他（含 ecg/emg）預設 normal，實際會在群組專屬邏輯中以品質評估
  return "normal";
}

// ===== 標準化工具 =====
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1); }
function std(arr) {
  if (arr.length === 0) return 1;
  const m = mean(arr);
  const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length;
  return Math.sqrt(v) || 1;
}
function normalizeValue(groupRuntime, key, v) {
  const rt = groupRuntime;
  const buf = rt.buffers[key] || (rt.buffers[key] = []);
  buf.push(v);
  if (buf.length > rt.windowLen) buf.shift();

  const mode = rt.normMode;
  if (mode === 'raw') return v;

  if (mode === 'z') {
    return (v - mean(buf)) / std(buf);
  }

  if (mode === 'pct') {
    if (rt.baselines[key] == null) {
      if (buf.length >= rt.baselineLen) {
        rt.baselines[key] = mean(buf.slice(0, rt.baselineLen));
      } else {
        rt.baselines[key] = mean(buf);
      }
    }
    const b = rt.baselines[key] || 1;
    return ((v - b) / b) * 100;
  }
  return v;
}

// ===== 包絡與品質評估 =====
// 全波整流 + 移動平均（EMG/ECG用）
function pushEnvelope(rt, bufName, v, winDefault) {
  const name = bufName || 'envBuf';
  const winProp = (bufName === 'ecgEnvBuf') ? 'ecgEnvWin' : (bufName === 'emgEnvBuf') ? 'emgEnvWin' : 'envWin';
  const buf = rt[name] || (rt[name] = []);
  const win = rt[winProp] || winDefault || 5;
  buf.push(Math.abs(Number(v) || 0));
  if (buf.length > win) buf.shift();
  return mean(buf);
}

// 估算 ECG 訊號品質（RMS + 夾飽和率）
function updateEcgQuality(rt, raw) {
  const b = rt.ecgRawBuf || (rt.ecgRawBuf = []);
  b.push(Number(raw) || 0);
  if (b.length > rt.qualityWin) b.shift();
  const m = mean(b), rms = Math.sqrt(mean(b.map(x => (x - m) * (x - m))));
  const clipCnt = b.filter(x => x < 50 || x > 65485).length; // 接近 0/滿刻度
  const clipRatio = b.length ? clipCnt / b.length : 0;

  let status = "normal";
  if (rms < TH.ecg_quality.rms_low) status = "low";
  if (rms > TH.ecg_quality.rms_high || clipRatio > TH.ecg_quality.clip_ratio_high) status = "high";
  rt.ecgQuality = { rms, clipRatio, status };
  return rt.ecgQuality;
}

// —— Chart options
const createChartOptions = (title, yAxisTitle, extraOptions = {}) => ({
  exportEnabled: true,
  title: { text: title, fontSize: chartTitleFontSize },
  axisX: { labelFontSize, title: "Time (s)", titleFontSize: labelTitleFontSize },
  axisY: { labelFontSize, title: yAxisTitle, titleFontSize: labelTitleFontSize },
  data: [],
  legend: {
    cursor: "pointer",
    dockInsidePlotArea: true,
    verticalAlign: "bottom",
    itemclick: function (e) {
      e.dataSeries.visible = !e.dataSeries.visible;
      e.chart.render();
    },
  },
  ...extraOptions,
});

// —— 建立每位學員的群組
function initialChart(path) {
  charts[path] = reactive({
    ecg_group: {
      label: "ECG",
      visible: true,
      dataKeys: [{ key: "ecg_value", label: "ECG", color: "red" }],
      options: createChartOptions("ECG", "z-score", {
        axisY: { labelFontSize, title: "z-score", titleFontSize: labelTitleFontSize },
        data: [{ type: "line", name: "ECG", showInLegend: true, color: "red", dataPoints: [] }],
      }),
      instance: null,
      runtime: reactive({
        normMode: 'z',     // 'raw' | 'z' | 'pct'
        windowLen: 150,    // 15s（10Hz）
        baselineLen: 30,   // 3s
        buffers: {},
        baselines: {},
        useEnvelope: true,
        ecgEnvBuf: [],
        ecgEnvWin: 7,      // ~700ms 平滑
        ecgRawBuf: [],
        qualityWin: 50,    // 5s 用於品質判斷
        ecgQuality: { rms: 0, clipRatio: 0, status: 'normal' },
      }),
      statusList: [],
    },
    emg_group: {
      label: "Muscle (EMG)",
      visible: true,
      dataKeys: [{ key: "muscle_value", label: "EMG", color: "green" }],
      options: createChartOptions("EMG", "z-score", {
        axisY: { labelFontSize, title: "z-score", titleFontSize: labelTitleFontSize },
        data: [{ type: "line", name: "EMG", showInLegend: true, color: "green", dataPoints: [] }],
      }),
      instance: null,
      runtime: reactive({
        normMode: 'z',
        windowLen: 150,
        baselineLen: 30,
        buffers: {},
        baselines: {},
        useEnvelope: true,
        emgEnvBuf: [],
        emgEnvWin: 5,      // 500ms
      }),
      statusList: [],
    },
    gsr_group: {
      label: "皮膚導電度",
      visible: true,
      dataKeys: [{ key: "gsr_value", label: "GSR (µS)", color: "blue" }],
      options: createChartOptions("GSR 皮膚導電度", "µS", {
        axisY: {
          labelFontSize, title: "GSR (µS)", titleFontSize: labelTitleFontSize,
          stripLines: [{ startValue: TH.gsr_uS.low, endValue: TH.gsr_uS.high, color: "rgba(0, 255, 0, 0.1)", label: "正常導電度範圍", labelFontColor: "green" }],
        },
        data: [{ type: "line", name: "GSR (µS)", showInLegend: true, color: "blue", dataPoints: [] }],
      }),
      instance: null,
      statusList: [],
    },
    temp_humidity_group: {
      label: "體溫/濕度",
      visible: true,
      dataKeys: [
        { key: "env_temperature", label: "Env", color: "orange", yAxis: "primary" },
        { key: "body_temperature", label: "BodyTemp", color: "purple", yAxis: "primary", freshKey: "body_temp_fresh" },
        { key: "env_humidity", label: "Humidity", color: "green", yAxis: "secondary" },
      ],
      options: createChartOptions("體溫/濕度", "°C", {
        axisY: {
          labelFontSize, title: "°C", titleFontSize: labelTitleFontSize,
          stripLines: [
            { startValue: TH.body_temp.low, endValue: TH.body_temp.high, color: "rgba(0, 255, 0, 0.15)", label: `正常體溫 ${TH.body_temp.low}–${TH.body_temp.high}`, labelFontColor: "green" },
            { value: TH.body_temp.fever, color: "rgba(255, 0, 0, 0.2)", lineDashType: "dash", label: `發燒警戒線 ${TH.body_temp.fever}°C`, labelFontColor: "red" },
          ],
        },
        axisY2: { minimum: 0, maximum: 100, labelFontSize, title: "Humidity (%)", titleFontSize: labelTitleFontSize },
        data: [
          { type: "line", name: "Env", showInLegend: true, color: "orange", dataPoints: [], axisYType: "primary" },
          { type: "line", name: "BodyTemp", showInLegend: true, color: "purple", dataPoints: [], axisYType: "primary" },
          { type: "line", name: "Humidity", showInLegend: true, color: "green", dataPoints: [], axisYType: "secondary" },
        ],
      }),
      instance: null,
      statusList: [],
    },
    hr_spo2_group: {
      label: "心率與血氧",
      visible: true,
      dataKeys: [
        { key: "hr_value", label: "Heart Rate", color: "red" },
        { key: "spo2_value", label: "SpO2", color: "blue" },
      ],
      options: createChartOptions("心率與血氧", "HR / SpO2", {
        axisY: {
          minimum: 40, maximum: 150,
          labelFontSize, title: "HR / SpO2", titleFontSize: labelTitleFontSize,
          stripLines: [
            { startValue: TH.hr.low, endValue: TH.hr.high, color: "rgba(0, 255, 0, 0.2)", label: `正常 HR ${TH.hr.low}–${TH.hr.high}`, labelFontColor: "green" },
            { value: TH.spo2.normal, color: "rgba(255, 170, 51, 0.2)", lineDashType: "dash", label: `SpO2 正常 ≥${TH.spo2.normal}%` },
            { value: TH.spo2.low, color: "rgba(255, 0, 0, 0.2)", lineDashType: "dash", label: `SpO2 輕度缺氧 ${TH.spo2.low}%` },
          ],
        },
        data: [
          { type: "line", name: "Heart Rate", showInLegend: true, color: "red", dataPoints: [] },
          { type: "line", name: "SpO2", showInLegend: true, color: "blue", dataPoints: [] },
        ],
      }),
      instance: null,
      statusList: [],
    },
  });
}

function onNormModeChanged(group) {
  // 更新 y 軸標題
  const mode = group.runtime?.normMode || 'raw';
  group.options.axisY.title = (mode === 'z') ? 'z-score' : (mode === 'pct') ? '%Δ（相對基線）' : 'Signal (ADC)';
  group.instance?.render?.();
}

function setChartInstance(path, key, instance) {
  if (!charts[path]) return;
  if (!charts[path][key]) return;
  charts[path][key].instance = instance;
}

// —— 高度自動化
function visibleGroupsCount(sensorCharts) {
  return Object.values(sensorCharts).filter((g) => g.visible !== false).length || 1;
}
function adjustChartHeights() {
  const vh = window.innerHeight;
  const headerReserve = 180;
  const available = Math.max(240, vh - headerReserve);

  let computedOne = 280;
  const firstKey = Object.keys(charts)[0];
  if (firstKey) {
    const count = visibleGroupsCount(charts[firstKey]);
    computedOne = Math.max(220, Math.floor((available - (count - 1) * 20) / count));
  }

  for (const path in charts) {
    for (const key in charts[path]) {
      const grp = charts[path][key];
      if (grp?.instance) grp.instance.options.height = computedOne;
    }
  }
  const hpx = computedOne + "px";
  styleOptions.height = hpx;
  chartHeight.value = hpx;

  nextTick(() => {
    for (const p in charts) for (const k in charts[p]) charts[p][k]?.instance?.render?.();
  });
}

onMounted(() => {
  const onResize = () => {
    chartTitleFontSize = cssSizeVar("--title-size", 26);
    labelFontSize = cssSizeVar("--label-size", 14);
    labelTitleFontSize = cssSizeVar("--label-title-size", 14);
    adjustChartHeights();
  };
  window.addEventListener("resize", onResize);
  adjustChartHeights();
  onBeforeUnmount(() => window.removeEventListener("resize", onResize));
});

const isUpdating = ref(false);

const updateCharts = async () => {
  if (isUpdating.value) return;
  isUpdating.value = true;

  try {
    const frame = await window.electronAPI.getSensorData(); // { path1:{...}, path2:{...} }
    if (frame) {
      updateTabsFromData(frame);

      const toRender = new Set();

      for (const path in charts) {
        const sensorCharts = charts[path];
        const dataObj = frame[path];
        if (!dataObj) continue;

        for (const groupKey in sensorCharts) {
          const group = sensorCharts[groupKey];
          if (!group) continue;
          group.statusList = [];

          group.dataKeys.forEach((entry, index) => {
            let rawValue = dataObj[entry.key];
            if (rawValue === undefined) return;

            // 顯示值（displayValue）可以被轉換/標準化；狀態依「意義單位」判斷
            let displayValue = rawValue;

            // GSR：轉 µS 顯示並用 µS 判斷狀態
            if (entry.key === "gsr_value" && typeof rawValue === "number") {
              displayValue = convertGSRtoConductance(rawValue);
              rawValue = displayValue;
            }
            function adcToVolt(adc, Vref=3.3){ return (Number(adc)||0) / 65535 * Vref; }
            // EMG/ECG 包絡（可選）
            if (groupKey === "emg_group" && group.runtime?.useEnvelope) {
              const v = adcToVolt(rawValue, 3.3);
              // 若你確認目前供 5V 且未分壓，請先改硬體；程式只能暫時夾到顯示範圍
              displayValue = v; // 之後再做包絡/標準化
              displayValue = pushEnvelope(group.runtime, 'emgEnvBuf', displayValue, group.runtime.emgEnvWin);
            }
            if (groupKey === "ecg_group" && group.runtime?.useEnvelope) {
              displayValue = pushEnvelope(group.runtime, 'ecgEnvBuf', displayValue, group.runtime.ecgEnvWin);
            }

            // 標準化（僅影響顯示）
            if (group.runtime) {
              displayValue = normalizeValue(group.runtime, entry.key, Number(displayValue) || 0);
            }

            // 畫圖
            group.options.data[index].dataPoints.push({ x: xVal.value, y: displayValue });
            if (group.options.data[index].dataPoints.length > 100) {
              const arr = group.options.data[index].dataPoints;
              arr.splice(0, arr.length - 100);
            }

            // 狀態：基本規則
            const hold = entry.freshKey ? dataObj[entry.freshKey] === false : false;
            let status = getStatus(Number(rawValue) || 0, entry.key, { hold });

            // 進階：ECG/EMG 以品質/包絡幅度覆蓋狀態
            if (groupKey === "ecg_group") {
              const q = updateEcgQuality(group.runtime, dataObj["ecg_value"]);
              status = q.status; // low/high 來自 rms/飽和率
            }
            if (groupKey === "emg_group" && group.runtime?.useEnvelope) {
              const envVal = Number(displayValue); // 已做包絡且可能標準化，但狀態要用包絡原值
              // 這裡改用未標準化包絡：再計一次
              const envRaw = pushEnvelope(group.runtime, 'emgEnvBuf_state', dataObj["muscle_value"], group.runtime.emgEnvWin);
              if (envRaw < TH.emg_env.low) status = "low";
              else if (envRaw > TH.emg_env.high) status = "high";
              else status = "normal";
            }

            group.statusList.push({ label: entry.label, status });
            toRender.add(group);
          });

          // 軸標題依模式
          if (group.runtime) onNormModeChanged(group);
        }
      }

      for (const group of toRender) group.instance?.render?.();
      xVal.value++;
      adjustChartHeights();
    }
  } catch (err) {
    // console.error(err);
  } finally {
    isUpdating.value = false;
    setTimeout(updateCharts, chartUpdateFreq);
  }
};
updateCharts();

function updateTabsFromData(data) {
  const keys = Object.keys(data);
  for (const key of keys) {
    if (!tabs.value.includes(key)) {
      tabs.value.push(key);
      initialChart(key);
      if (!deviceLabelMap[key]) {
        deviceCount.value++;
        deviceLabelMap[key] = `學員${deviceCount.value}`;
      }
    }
  }
}

const returnHome = () => router.push("/");
const restartPicoW = () => window.electronAPI.restartPicoW();
</script>

<style scoped>
:root {
  --title-size: clamp(18px, 2.2vw, 30px);
  --label-size: clamp(12px, 1.6vw, 20px);
  --label-title-size: clamp(12px, 1.6vw, 20px);
}

.main-container {
  margin: 20px;
}

.home-button-container {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 10px;
}

.scrollable-charts-container {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(clamp(320px, 40vw, 560px), 1fr);
  gap: 20px;
  overflow-x: auto;
  padding: 10px;
  margin: 30px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-height: calc(100vh - 200px);
}

.student-container {
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-right: 6px;
}

.student-container>h2 {
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
  padding: 2px 0 8px;
  margin: 0 0 8px;
}

.status-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 8px 0 14px;
}

.norm-control {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
}

.norm-control .muted {
  color: #777;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 10px 0 0;
}

.charts-container-vertical {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chart-container {
  width: 100%;
  height: v-bind(chartHeight);
  padding: 0;
  background-color: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
}

.canvasjs-chart-toolbar button {
  transform: none;
}

.status-indicator {
  font-weight: bold;
  padding: 6px 5px;
  border-radius: 6px;
  background-color: rgba(200, 200, 200, 0.2);
}

.status-indicator.normal {
  background-color: rgba(0, 255, 0, 0.1);
  color: green;
}

.status-indicator.low {
  background-color: rgba(255, 255, 0, 0.2);
  color: goldenrod;
}

.status-indicator.high {
  background-color: rgba(255, 0, 0, 0.1);
  color: red;
}

.status-indicator.hold {
  background-color: rgba(100, 100, 100, 0.15);
  color: #666;
}
</style>

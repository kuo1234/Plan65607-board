<template>
  <div class="main-container">
    <!-- 操作區 -->
    <div class="home-button-container">
      <button @click="returnHome">返回主畫面</button>
      <button @click="restartPicoW">重新執行 Pico W 程式</button>
      <button @click="toggleRecording" :class="{ recording: isRecording }">
        {{ isRecording ? '停止紀錄' : '開始紀錄' }}
      </button>
      <button @click="toggleThresholdSettings">
        {{ showThresholdSettings ? '收合門檻設定' : '門檻設定' }}
      </button>
      <!-- <button @click="$router.push('/history-page')">歷史資料查詢</button> -->
    </div>

    <div ref="thresholdSettingsPanelRef" class="threshold-settings-panel" v-if="showThresholdSettings">
      <div class="threshold-settings-header">
        <div>
          <h3>生理訊號門檻設定</h3>
          <p>修改後會立即套用到狀態燈與圖表，並儲存在這台電腦。</p>
        </div>
        <div class="threshold-settings-actions">
          <button class="save-settings-btn" @click="saveThresholdSettings">套用並儲存</button>
          <button class="reset-settings-btn" @click="resetThresholdSettings">還原預設</button>
        </div>
      </div>

      <p v-if="thresholdSaveMessage" class="threshold-save-message">{{ thresholdSaveMessage }}</p>

      <div class="threshold-settings-grid">
        <div
          v-for="section in thresholdFieldGroups"
          :key="section.key"
          class="threshold-settings-card"
        >
          <h4>{{ section.label }}</h4>
          <p v-if="section.description" class="threshold-card-description">
            {{ section.description }}
          </p>
          <label
            v-for="field in section.fields"
            :key="`${section.key}-${field.key}`"
            class="threshold-input"
          >
            <span>{{ field.label }}</span>
            <input
              v-model.number="thresholdSettings[section.key][field.key]"
              type="number"
              :step="field.step || 'any'"
              @change="onThresholdFieldChange"
            />
          </label>
        </div>
      </div>
    </div>

    <div class="status-legend">
      <span class="legend-item">
        <span class="legend-dot normal"></span>
        綠色正常
      </span>
      <span class="legend-item">
        <span class="legend-dot low"></span>
        黃色過低
      </span>
      <span class="legend-item">
        <span class="legend-dot high"></span>
        紅色過高
      </span>
      <span class="legend-item">
        <span class="legend-dot hold"></span>
        灰色暫停/異常
      </span>
    </div>

    <!-- 學員欄（水平排列） -->
    <div class="scrollable-charts-container">
      <div class="student-container" v-for="(sensorCharts, path) in charts" :key="path">
        <h2>
          {{ deviceLabelMap[path] || path }}
          <input 
            v-model="studentUids[path]" 
            placeholder="輸入學員 ID" 
            @change="updateUid(path)"
            class="uid-input"
          />
        </h2>

        <!-- 狀態指示 -->
        <div class="status-list">
          <span v-for="(group, groupKey) in sensorCharts" :key="groupKey">
            <span
              v-for="item in group.statusList"
              :key="`${groupKey}-${item.label}-${item.status}`"
              :class="['status-indicator', item.status]"
              :title="item.tooltip || ''"
            >
              {{ item.label }}
            </span>
          </span>
        </div>

        <!-- ECG 控制（只保留包絡；原始 ADC） -->
        <div v-if="sensorCharts.ecg_group" class="norm-control">
          <label>
            <input
              type="checkbox"
              v-model="sensorCharts.ecg_group.runtime.useEnvelope"
              @change="onEcgModeChanged(sensorCharts.ecg_group)"
            />
            ECG 包絡（以原始 ADC 計算）
          </label>
          <small class="muted">
            包絡視窗 {{ sensorCharts.ecg_group.runtime.ecgEnvWin / 10 }}s（@10Hz）
          </small>
        </div>

        <!-- EMG 控制（只保留包絡；原始 ADC） + 一鍵校準 -->
        <div v-if="sensorCharts.emg_group" class="norm-control">
          <label>
            <input
              type="checkbox"
              v-model="sensorCharts.emg_group.runtime.useEnvelope"
              @change="onEmgModeChanged(sensorCharts.emg_group)"
            />
            EMG 包絡（以原始 ADC 計算）
          </label>

          <button
            class="calib-btn"
            :disabled="sensorCharts.emg_group.runtime.calibActive"
            @click="startEmgCalibration(sensorCharts.emg_group)"
            title="按下後請用力收縮 3 秒"
          >
            {{ sensorCharts.emg_group.runtime.calibActive ? '校準中…' : '校準 %MVC' }}
          </button>

          <button
            class="calib-reset-btn"
            :disabled="sensorCharts.emg_group.runtime.calibActive || (!sensorCharts.emg_group.runtime.mvcMax)"
            @click="resetEmgCalibration(sensorCharts.emg_group)"
            title="清除已校準的 MVC 與基線"
          >
            重置校準
          </button>

          <small class="muted" v-if="sensorCharts.emg_group.runtime.calibActive">
            仍需 {{ sensorCharts.emg_group.runtime.calibRemainMs / 1000 }}s …
          </small>
          <small class="muted" v-else>
            視窗 {{ sensorCharts.emg_group.runtime.emgEnvWin / 10 }}s（@10Hz）
            <span v-if="sensorCharts.emg_group.runtime.mvcMax">
              ，MVC={{ sensorCharts.emg_group.runtime.mvcMax.toFixed(0) }}，Rest={{ sensorCharts.emg_group.runtime.restBase.toFixed(0) }}
            </span>
          </small>
        </div>

        <!-- EMG 一眼辨識：徽章 + 量表 -->
        <div v-if="sensorCharts.emg_group" class="emg-activation">
          <span :class="['badge', sensorCharts.emg_group.runtime.active ? 'on' : 'off']">
            {{ sensorCharts.emg_group.runtime.active ? 'EMG ACTIVE' : 'EMG IDLE' }}
          </span>
          <div class="meter" :title="`強度 ${(sensorCharts.emg_group.runtime.level01*100).toFixed(0)}%`">
            <div class="fill" :style="{ width: (sensorCharts.emg_group.runtime.level01*100)+'%' }"></div>
          </div>
        </div>

        <!-- 圖表群（垂直堆疊） -->
        <div class="charts-container-vertical">
          <div
            v-for="(group, key) in sensorCharts"
            :key="key"
            v-show="group.visible"
            class="chart-container"
            :class="(key==='emg_group' && group.runtime?.active) ? 'chart-active' : ''"
          >
            <CanvasJSChart
              :options="group.options"
              :style="styleOptions"
              @chart-ref="(instance) => setChartInstance(path, key, instance)"
            />
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
const studentUids = reactive({});
let deviceCount = ref(0);
const charts = reactive({});
const thresholdSettingsPanelRef = ref(null);
const showThresholdSettings = ref(false);
const thresholdSaveMessage = ref("");
let thresholdSaveMessageTimer = null;

function updateUid(path) {
  window.electronAPI.setDeviceUid(path, studentUids[path]);
}

const THRESHOLD_STORAGE_KEY = "biosignal-threshold-settings";

const createDefaultThresholds = () => ({
  ecg_quality: { rms_low: 150, rms_high: 8000, clip_ratio_high: 0.02 }, // 供狀態燈參考
  emg_env: { low: 20, high: 1200 }, // EMG 包絡（ADC）映射 0~100% 的預設範圍（未校準時用）
  emg_activation: { on: 120, off: 90, debounce_ms: 200 }, // 遲滯 + 去抖
  gsr_uS: { low: 1, high: 20 },
  body_temp: { low: 36.1, high: 37.2, fever: 38.0 },
  env_temp: { low: 20, high: 35 },
  humidity: { low: 30, high: 70 },
  hr: { low: 60, high: 100 },
  spo2: { low: 90, normal: 95 },
});

const thresholdSettings = reactive(createDefaultThresholds());
const thresholdFieldGroups = [
  {
    key: "ecg_quality",
    label: "ECG 品質",
    fields: [
      { key: "rms_low", label: "RMS 低門檻", step: 1 },
      { key: "rms_high", label: "RMS 高門檻", step: 1 },
      { key: "clip_ratio_high", label: "Clip Ratio 高門檻", step: 0.001 },
    ],
  },
  {
    key: "emg_env",
    label: "EMG 包絡",
    description: "把肌電原始訊號做平滑後的強度範圍，用來判斷 EMG 過低、正常或過高。",
    fields: [
      { key: "low", label: "Low", step: 1 },
      { key: "high", label: "High", step: 1 },
    ],
  },
  {
    key: "emg_activation",
    label: "EMG 啟動判定",
    description: "用來判斷肌肉是否進入 ACTIVE 狀態。超過啟動門檻會變 ACTIVE，低於解除門檻才會回到 IDLE。",
    fields: [
      { key: "on", label: "啟動門檻", step: 1 },
      { key: "off", label: "解除門檻", step: 1 },
      { key: "debounce_ms", label: "去抖時間 ms", step: 10 },
    ],
  },
  {
    key: "gsr_uS",
    label: "GSR (µS)",
    fields: [
      { key: "low", label: "Low", step: 0.1 },
      { key: "high", label: "High", step: 0.1 },
    ],
  },
  {
    key: "body_temp",
    label: "體溫 (°C)",
    fields: [
      { key: "low", label: "Low", step: 0.1 },
      { key: "high", label: "High", step: 0.1 },
      { key: "fever", label: "發燒線", step: 0.1 },
    ],
  },
  {
    key: "env_temp",
    label: "環境溫度 (°C)",
    fields: [
      { key: "low", label: "Low", step: 0.1 },
      { key: "high", label: "High", step: 0.1 },
    ],
  },
  {
    key: "humidity",
    label: "濕度 (%)",
    fields: [
      { key: "low", label: "Low", step: 1 },
      { key: "high", label: "High", step: 1 },
    ],
  },
  {
    key: "hr",
    label: "心率 (bpm)",
    fields: [
      { key: "low", label: "Low", step: 1 },
      { key: "high", label: "High", step: 1 },
    ],
  },
  {
    key: "spo2",
    label: "SpO2 (%)",
    fields: [
      { key: "low", label: "缺氧線", step: 1 },
      { key: "normal", label: "正常線", step: 1 },
    ],
  },
];

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

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeThresholds(source) {
  source.ecg_quality.rms_low = Math.max(0, toFiniteNumber(source.ecg_quality.rms_low, 150));
  source.ecg_quality.rms_high = Math.max(
    source.ecg_quality.rms_low,
    toFiniteNumber(source.ecg_quality.rms_high, 8000)
  );
  source.ecg_quality.clip_ratio_high = Math.max(
    0,
    toFiniteNumber(source.ecg_quality.clip_ratio_high, 0.02)
  );

  source.emg_env.low = Math.max(0, toFiniteNumber(source.emg_env.low, 20));
  source.emg_env.high = Math.max(source.emg_env.low, toFiniteNumber(source.emg_env.high, 1200));

  source.emg_activation.off = Math.max(0, toFiniteNumber(source.emg_activation.off, 90));
  source.emg_activation.on = Math.max(
    source.emg_activation.off,
    toFiniteNumber(source.emg_activation.on, 120)
  );
  source.emg_activation.debounce_ms = Math.max(
    0,
    Math.round(toFiniteNumber(source.emg_activation.debounce_ms, 200))
  );

  source.gsr_uS.low = Math.max(0, toFiniteNumber(source.gsr_uS.low, 1));
  source.gsr_uS.high = Math.max(source.gsr_uS.low, toFiniteNumber(source.gsr_uS.high, 20));

  source.body_temp.low = toFiniteNumber(source.body_temp.low, 36.1);
  source.body_temp.high = Math.max(
    source.body_temp.low,
    toFiniteNumber(source.body_temp.high, 37.2)
  );
  source.body_temp.fever = Math.max(
    source.body_temp.high,
    toFiniteNumber(source.body_temp.fever, 38.0)
  );

  source.env_temp.low = toFiniteNumber(source.env_temp.low, 20);
  source.env_temp.high = Math.max(source.env_temp.low, toFiniteNumber(source.env_temp.high, 35));

  source.humidity.low = Math.max(0, toFiniteNumber(source.humidity.low, 30));
  source.humidity.high = Math.max(
    source.humidity.low,
    toFiniteNumber(source.humidity.high, 70)
  );

  source.hr.low = Math.max(0, toFiniteNumber(source.hr.low, 60));
  source.hr.high = Math.max(source.hr.low, toFiniteNumber(source.hr.high, 100));

  source.spo2.low = Math.max(0, toFiniteNumber(source.spo2.low, 90));
  source.spo2.normal = Math.max(source.spo2.low, toFiniteNumber(source.spo2.normal, 95));

  return source;
}

function buildThresholdState(source = {}) {
  const merged = createDefaultThresholds();
  for (const sectionKey of Object.keys(merged)) {
    const section = merged[sectionKey];
    for (const fieldKey of Object.keys(section)) {
      if (source?.[sectionKey]?.[fieldKey] !== undefined) {
        section[fieldKey] = source[sectionKey][fieldKey];
      }
    }
  }
  return normalizeThresholds(merged);
}

function assignThresholds(target, source) {
  for (const sectionKey of Object.keys(target)) {
    for (const fieldKey of Object.keys(target[sectionKey])) {
      target[sectionKey][fieldKey] = source[sectionKey][fieldKey];
    }
  }
}

function formatThresholdLabel(value) {
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, "");
}

function buildGsrStripLines() {
  return [
    {
      startValue: thresholdSettings.gsr_uS.low,
      endValue: thresholdSettings.gsr_uS.high,
      color: "rgba(0, 255, 0, 0.1)",
      label: `正常導電度 ${formatThresholdLabel(thresholdSettings.gsr_uS.low)}–${formatThresholdLabel(thresholdSettings.gsr_uS.high)} µS`,
      labelFontColor: "green",
    },
  ];
}

function buildEcgStripLines() {
  return [
    {
      startValue: thresholdSettings.ecg_quality.rms_low,
      endValue: thresholdSettings.ecg_quality.rms_high,
      color: "rgba(255, 99, 132, 0.10)",
      label: `ECG 參考區間 ${formatThresholdLabel(thresholdSettings.ecg_quality.rms_low)}–${formatThresholdLabel(thresholdSettings.ecg_quality.rms_high)}`,
      labelFontColor: "#c0392b",
    },
  ];
}

function buildEmgStripLines() {
  return [
    {
      startValue: thresholdSettings.emg_env.low,
      endValue: thresholdSettings.emg_env.high,
      color: "rgba(46, 204, 113, 0.12)",
      label: `EMG 參考區間 ${formatThresholdLabel(thresholdSettings.emg_env.low)}–${formatThresholdLabel(thresholdSettings.emg_env.high)}`,
      labelFontColor: "#1e8449",
    },
  ];
}

function buildBodyTempStripLines() {
  return [
    {
      startValue: thresholdSettings.body_temp.low,
      endValue: thresholdSettings.body_temp.high,
      color: "rgba(0, 255, 0, 0.15)",
      label: `正常體溫 ${formatThresholdLabel(thresholdSettings.body_temp.low)}–${formatThresholdLabel(thresholdSettings.body_temp.high)}°C`,
      labelFontColor: "green",
    },
    {
      value: thresholdSettings.body_temp.fever,
      color: "rgba(255, 0, 0, 0.2)",
      lineDashType: "dash",
      label: `發燒警戒線 ${formatThresholdLabel(thresholdSettings.body_temp.fever)}°C`,
      labelFontColor: "red",
    },
  ];
}

function buildHrStripLines() {
  return [
    {
      startValue: thresholdSettings.hr.low,
      endValue: thresholdSettings.hr.high,
      color: "rgba(0, 255, 0, 0.2)",
      label: `正常 HR ${formatThresholdLabel(thresholdSettings.hr.low)}–${formatThresholdLabel(thresholdSettings.hr.high)}`,
      labelFontColor: "green",
    },
  ];
}

function buildSpo2StripLines() {
  return [
    {
      value: thresholdSettings.spo2.normal,
      color: "rgba(255, 170, 51, 0.2)",
      lineDashType: "dash",
      label: `SpO2 正常 ≥${formatThresholdLabel(thresholdSettings.spo2.normal)}%`,
    },
    {
      value: thresholdSettings.spo2.low,
      color: "rgba(255, 0, 0, 0.2)",
      lineDashType: "dash",
      label: `SpO2 輕度缺氧 ${formatThresholdLabel(thresholdSettings.spo2.low)}%`,
    },
  ];
}

function setThresholdSaveMessage(message) {
  thresholdSaveMessage.value = message;
  if (thresholdSaveMessageTimer) {
    clearTimeout(thresholdSaveMessageTimer);
  }
  thresholdSaveMessageTimer = setTimeout(() => {
    thresholdSaveMessage.value = "";
  }, 2500);
}

function refreshThresholdVisuals() {
  for (const path in charts) {
    const sensorCharts = charts[path];
    if (sensorCharts.ecg_group?.options?.axisY) {
      sensorCharts.ecg_group.options.axisY.stripLines = buildEcgStripLines();
    }
    if (sensorCharts.emg_group?.options?.axisY) {
      sensorCharts.emg_group.options.axisY.stripLines = buildEmgStripLines();
    }
    if (sensorCharts.gsr_group?.options?.axisY) {
      sensorCharts.gsr_group.options.axisY.stripLines = buildGsrStripLines();
    }

    for (const key in sensorCharts) {
      sensorCharts[key]?.instance?.render?.();
    }
  }
}

function applyThresholdSettings({ persist = true, message = "" } = {}) {
  const normalized = buildThresholdState(thresholdSettings);
  assignThresholds(thresholdSettings, normalized);
  if (persist) {
    localStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(normalized));
  }
  refreshThresholdVisuals();
  if (message) {
    setThresholdSaveMessage(message);
  }
}

function loadThresholdSettings() {
  try {
    const raw = localStorage.getItem(THRESHOLD_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    assignThresholds(thresholdSettings, buildThresholdState(parsed));
  } catch {
    assignThresholds(thresholdSettings, buildThresholdState());
  }
}

function onThresholdFieldChange() {
  applyThresholdSettings({ message: "門檻已更新" });
}

function saveThresholdSettings() {
  applyThresholdSettings({ message: "門檻已儲存" });
}

function resetThresholdSettings() {
  const defaults = buildThresholdState();
  assignThresholds(thresholdSettings, defaults);
  localStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(defaults));
  refreshThresholdVisuals();
  setThresholdSaveMessage("已還原預設門檻");
}

function toggleThresholdSettings() {
  showThresholdSettings.value = !showThresholdSettings.value;
  nextTick(() => adjustChartHeights());
}

loadThresholdSettings();

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
    if (value < thresholdSettings.gsr_uS.low) return "low";
    if (value > thresholdSettings.gsr_uS.high) return "high";
    return "normal";
  }
  if (key === "body_temperature") {
    if (value >= thresholdSettings.body_temp.fever) return "high";
    if (value < thresholdSettings.body_temp.low) return "low";
    if (value <= thresholdSettings.body_temp.high) return "normal";
    return "high";
  }
  if (key === "env_temperature") {
    if (value < thresholdSettings.env_temp.low) return "low";
    if (value > thresholdSettings.env_temp.high) return "high";
    return "normal";
  }
  if (key === "env_humidity") {
    if (value < thresholdSettings.humidity.low) return "low";
    if (value > thresholdSettings.humidity.high) return "high";
    return "normal";
  }
  if (key === "hr_value") {
    if (value < thresholdSettings.hr.low) return "low";
    if (value > thresholdSettings.hr.high) return "high";
    return "normal";
  }
  if (key === "spo2_value") {
    if (value < thresholdSettings.spo2.low) return "high";
    if (value < thresholdSettings.spo2.normal) return "low";
    return "normal";
  }
  return "normal";
}

// ===== 包絡 / 品質評估（ECG/EMG 用）=====
function mean(arr){ return arr.reduce((a,b)=>a+b,0)/Math.max(arr.length,1); }
function pushEnvelope(rt, bufName, v, winDefault){
  const name = bufName || 'envBuf';
  const winProp = (bufName === 'ecgEnvBuf') ? 'ecgEnvWin' : (bufName === 'emgEnvBuf') ? 'emgEnvWin' : 'envWin';
  const buf = rt[name] || (rt[name] = []);
  const win = rt[winProp] || winDefault || 5;
  buf.push(Math.abs(Number(v) || 0));
  if (buf.length > win) buf.shift();
  return mean(buf);
}
function updateEcgQuality(rt, raw){
  const b = rt.ecgRawBuf || (rt.ecgRawBuf = []);
  b.push(Number(raw) || 0);
  if (b.length > rt.qualityWin) b.shift();
  const m = mean(b), rms = Math.sqrt(mean(b.map(x => (x-m)*(x-m))));
  const clipCnt = b.filter(x => x < 50 || x > 65485).length;
  const clipRatio = b.length ? clipCnt / b.length : 0;

  let status = "normal";
  if (rms < thresholdSettings.ecg_quality.rms_low) status = "low";
  if (rms > thresholdSettings.ecg_quality.rms_high || clipRatio > thresholdSettings.ecg_quality.clip_ratio_high) status = "high";
  rt.ecgQuality = { rms, clipRatio, status };
  return rt.ecgQuality;
}

// —— Chart options
const createChartOptions = (title, yAxisTitle, extraOptions = {}) => ({
  exportEnabled: true,
  title: { text: title, fontSize: chartTitleFontSize },
  axisX: { 
    labelFontSize, 
    // title: "Time", 
    // titleFontSize: labelTitleFontSize, 
    valueFormatString: "HH:mm:ss",
    labelAngle: -45,
    labelAutoFit: true
  },
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
      options: createChartOptions("ECG", "ADC (raw)", {
        axisY: {
          labelFontSize,
          title: "ADC (raw)",
          titleFontSize: labelTitleFontSize,
          stripLines: buildEcgStripLines(),
        },
        data: [{ type: "line", name: "ECG", showInLegend: true, color: "red", dataPoints: [] }],
      }),
      instance: null,
      runtime: reactive({
        useEnvelope: true,
        ecgEnvBuf: [],
        ecgEnvWin: 7,   // ~700ms @10Hz
        ecgRawBuf: [],  // 供品質提示
        qualityWin: 50,
        ecgQuality: { rms:0, clipRatio:0, status:'normal' },
      }),
      statusList: [],
    },
    emg_group: {
      label: "Muscle (EMG)",
      visible: true,
      dataKeys: [{ key: "muscle_value", label: "EMG", color: "green" }],
      options: createChartOptions("EMG", "ADC (raw)", {
        axisY: {
          labelFontSize,
          title: "ADC (raw)",
          titleFontSize: labelTitleFontSize,
          stripLines: buildEmgStripLines(),
        },
        data: [{ type: "line", name: "EMG", showInLegend: true, color: "green", dataPoints: [] }],
      }),
      instance: null,
      runtime: reactive({
        useEnvelope: true,
        emgEnvBuf: [],
        emgEnvWin: 5, // 500ms @10Hz
        // 一眼辨識狀態
        active: false,
        activeChangedAt: 0,
        level01: 0, // 0~1 強度
        // 一鍵校準
        calibActive: false,
        calibEndTs: 0,
        calibRemainMs: 0,
        mvcMax: null,     // 校準到的最大包絡（ADC）
        restBase: 0,      // 校準到的基線（ADC）
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
          stripLines: buildGsrStripLines(),
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
        { key: "hr_value", label: "Heart Rate", color: "red", yAxis: "primary" },
        { key: "spo2_value", label: "SpO2", color: "blue", yAxis: "secondary" },
      ],
      options: createChartOptions("心率與血氧", "Heart Rate (bpm)", {
        axisY: {
          minimum: 0, maximum: 180,
          labelFontSize, title: "Heart Rate (bpm)", titleFontSize: labelTitleFontSize,
        },
        axisY2: {
          minimum: 0, maximum: 100,
          labelFontSize, title: "SpO2 (%)", titleFontSize: labelTitleFontSize,
        },
        data: [
          { type: "line", name: "Heart Rate", showInLegend: true, color: "red", dataPoints: [], axisYType: "primary" },
          { type: "line", name: "SpO2", showInLegend: true, color: "blue", dataPoints: [], axisYType: "secondary" },
        ],
      }),
      instance: null,
      statusList: [],
    },
  });
}

function onEcgModeChanged(group){
  group.options.axisY.title = "ADC (raw)";
  group.instance?.render?.();
}
function onEmgModeChanged(group){
  group.options.axisY.title = "ADC (raw)";
  group.instance?.render?.();
}

// —— 一鍵校準：開始/重置
function startEmgCalibration(group){
  const DURATION_MS = 3000; // 按下後連續 3 秒取峰值
  group.runtime.calibActive = true;
  group.runtime.calibEndTs = Date.now() + DURATION_MS;
  group.runtime.calibRemainMs = Math.ceil((group.runtime.calibEndTs - Date.now())/1000)*1000;
  // 暫存期間的峰值/低值（以「未標準化 ADC 包絡」為準）
  group.runtime._calibPeak = 0;
  group.runtime._calibMin = Number.POSITIVE_INFINITY;
}
function resetEmgCalibration(group){
  group.runtime.mvcMax = null;
  group.runtime.restBase = 0;
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
  const settingsPanelHeight = thresholdSettingsPanelRef.value?.offsetHeight || 0;
  const headerReserve = 180 + settingsPanelHeight;
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
      const now = new Date();

      for (const path in charts) {
        const sensorCharts = charts[path];
        const dataObj = frame[path];
        if (!dataObj) continue;

        if (dataObj.board && deviceLabelMap[path] !== dataObj.board) {
          deviceLabelMap[path] = dataObj.board;
        }

        for (const groupKey in sensorCharts) {
          const group = sensorCharts[groupKey];
          if (!group) continue;
          group.statusList.length = 0;

          group.dataKeys.forEach((entry, index) => {
            let rawValue = dataObj[entry.key];
            if (rawValue === undefined) return;

            let displayValue = rawValue;

            // GSR：轉 µS 顯示並用 µS 判斷狀態
            if (entry.key === "gsr_value" && typeof rawValue === "number") {
              displayValue = convertGSRtoConductance(rawValue);
              rawValue = displayValue;
            }

            // ===== EMG：原始 ADC +（可選）包絡 + 一鍵校準 / 一眼辨識 =====
            if (groupKey === "emg_group" && entry.key === "muscle_value") {
              const myoOK = dataObj.muscle_ok;
              const myoVolt = dataObj.muscle_voltage;
              const myoReason = dataObj.muscle_reason;

              if (myoOK === false) {
                const tooltip = `EMG 異常：${myoReason || 'unknown'}，電壓=${(myoVolt ?? 0).toFixed(3)}V`;
                group.statusList.push({ label: "EMG", status: "hold", tooltip });
                displayValue = rawValue;
                group.runtime.level01 = 0;
                group.runtime.active = false;
              } else {
                // 圖上顯示值
                displayValue = Number(rawValue) || 0;
                if (group.runtime?.useEnvelope) {
                  displayValue = pushEnvelope(group.runtime, 'emgEnvBuf', displayValue, group.runtime.emgEnvWin);
                }

                // 狀態/量表都以「未標準化 ADC 包絡」為準
                const envForState = pushEnvelope(
                  group.runtime,
                  'emgEnvBuf_state',
                  Number(dataObj["muscle_value"]) || 0,
                  group.runtime.emgEnvWin
                );

                // ===== 校準進行中：更新峰值與低值 =====
                if (group.runtime.calibActive) {
                  const now = Date.now();
                  group.runtime._calibPeak = Math.max(group.runtime._calibPeak || 0, envForState);
                  group.runtime._calibMin = Math.min(group.runtime._calibMin || Number.POSITIVE_INFINITY, envForState);
                  group.runtime.calibRemainMs = Math.max(0, group.runtime.calibEndTs - now);
                  if (now >= group.runtime.calibEndTs) {
                    // 完成：寫入 mvcMax / restBase
                    group.runtime.mvcMax  = Math.max(1, group.runtime._calibPeak || 1);
                    group.runtime.restBase = Math.max(0, group.runtime._calibMin || 0);
                    group.runtime.calibActive = false;
                    group.runtime.calibEndTs = 0;
                    group.runtime.calibRemainMs = 0;
                  }
                }

                // ===== level01：若已校準用 %MVC，否則用預設 low/high 區間
                if (group.runtime.mvcMax && group.runtime.mvcMax > group.runtime.restBase) {
                  const num = envForState - group.runtime.restBase;
                  const den = group.runtime.mvcMax - group.runtime.restBase;
                  group.runtime.level01 = Math.max(0, Math.min(1, num / den));
                } else {
                  const lo = thresholdSettings.emg_env.low, hi = thresholdSettings.emg_env.high;
                  group.runtime.level01 = Math.max(0, Math.min(1, (envForState - lo) / Math.max(hi - lo, 1)));
                }

                // 一眼辨識：遲滯 + 去抖
                const now = Date.now();
                let nextActive = group.runtime.active;
                const onTh  = thresholdSettings.emg_activation.on;
                const offTh = thresholdSettings.emg_activation.off;
                if (!group.runtime.active && envForState >= onTh) nextActive = true;
                if ( group.runtime.active && envForState <= offTh) nextActive = false;

                if (nextActive !== group.runtime.active) {
                  if (now - (group.runtime.activeChangedAt || 0) >= thresholdSettings.emg_activation.debounce_ms) {
                    group.runtime.active = nextActive;
                    group.runtime.activeChangedAt = now;
                  }
                } else {
                  group.runtime.activeChangedAt = now;
                }
              }
            }

            // ===== ECG：原始 ADC +（可選）包絡 =====
            if (groupKey === "ecg_group" && entry.key === "ecg_value") {
              displayValue = Number(rawValue) || 0;
              if (group.runtime?.useEnvelope) {
                displayValue = pushEnvelope(group.runtime, 'ecgEnvBuf', displayValue, group.runtime.ecgEnvWin);
              }
            }

            // 畫圖
            group.options.data[index].dataPoints.push({ x: now, y: displayValue });
            if (group.options.data[index].dataPoints.length > 100) {
              const arr = group.options.data[index].dataPoints;
              arr.splice(0, arr.length - 100);
            }
            
            // 確保 HR/SpO2 等雙軸圖表的資料正確對應到各自的 Y 軸
            if (entry.yAxis === 'secondary' && group.options.data[index].axisYType !== 'secondary') {
              group.options.data[index].axisYType = 'secondary';
            } else if (entry.yAxis === 'primary' && group.options.data[index].axisYType !== 'primary') {
              group.options.data[index].axisYType = 'primary';
            }

            // 狀態：基本規則（EMG 異常時前面已 push）
            const hold = entry.freshKey ? dataObj[entry.freshKey] === false : false;
            let status = getStatus(Number(rawValue) || 0, entry.key, { hold });

            // ECG 以品質覆蓋狀態（提示用）
            if (groupKey === "ecg_group") {
              const q = updateEcgQuality(group.runtime, dataObj["ecg_value"]);
              status = q.status;
            }

            // EMG 正常：用 ADC 包絡粗分等級（僅作燈號，不影響 ACTIVE 徽章）
            if (groupKey === "emg_group" && dataObj.muscle_ok !== false && group.runtime?.useEnvelope) {
              const envRaw = pushEnvelope(group.runtime, 'emgEnvBuf_status', Number(dataObj["muscle_value"])||0, group.runtime.emgEnvWin);
              if (envRaw < thresholdSettings.emg_env.low) status = "low";
              else if (envRaw > thresholdSettings.emg_env.high) status = "high";
              else status = "normal";
            }

            // EMG 異常時已 push 過燈號，避免重複
            const isEMG = (groupKey === "emg_group" && entry.key === "muscle_value");
            if (!(isEMG && dataObj.muscle_ok === false)) {
              group.statusList.push({ label: entry.label, status });
            }

            toRender.add(group);
          });
        }
      }

      for (const group of toRender) group.instance?.render?.();
      // xVal.value++;
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

const isRecording = ref(false);
const toggleRecording = () => {
  if (isRecording.value) {
    window.electronAPI.stopRecording();
    isRecording.value = false;
  } else {
    window.electronAPI.startRecording();
    isRecording.value = true;
  }
};
</script>

<style scoped>
:root{
  --title-size: clamp(18px, 2.2vw, 30px);
  --label-size: clamp(12px, 1.6vw, 20px);
  --label-title-size: clamp(12px, 1.6vw, 20px);
}

.main-container{ margin:20px; }

.home-button-container{
  display:flex; gap:10px; flex-wrap:wrap; margin:10px;
}

.threshold-settings-panel{
  margin: 0 10px 20px;
  padding: 16px;
  border-radius: 12px;
  background: #f8fbff;
  border: 1px solid #d8e6f3;
  box-shadow: 0 4px 14px rgba(0,0,0,0.05);
  color:#000;
}

.threshold-settings-header{
  display:flex;
  justify-content:space-between;
  gap:16px;
  align-items:flex-start;
  margin-bottom:12px;
}

.threshold-settings-header h3{
  margin:0 0 6px;
}

.threshold-settings-header p{
  margin:0;
  color:#000;
}

.threshold-settings-actions{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}

.save-settings-btn,
.reset-settings-btn{
  padding:8px 14px;
  border:none;
  border-radius:8px;
  cursor:pointer;
}

.save-settings-btn{
  background:#1f78d1;
  color:#fff;
}

.reset-settings-btn{
  background:#e7eef5;
  color:#2f3b46;
}

.threshold-save-message{
  margin: 0 0 12px;
  color:#000;
  font-weight:600;
}

.threshold-settings-grid{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap:12px;
}

.threshold-settings-card{
  background:#fff;
  border:1px solid #e4edf5;
  border-radius:10px;
  padding:12px;
}

.threshold-settings-card h4{
  margin:0 0 10px;
  color:#000;
}

.threshold-card-description{
  margin:0 0 10px;
  color:#000;
  font-size:14px;
  line-height:1.45;
}

.threshold-input{
  display:flex;
  flex-direction:column;
  gap:6px;
  margin-bottom:10px;
  color:#000;
}

.threshold-input:last-child{
  margin-bottom:0;
}

.threshold-input input{
  padding:8px 10px;
  border:1px solid #c9d6e2;
  border-radius:8px;
  color:#000;
  background:#fff;
}

.status-legend{
  display:flex;
  flex-wrap:wrap;
  gap:12px;
  align-items:center;
  margin: 0 10px 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background:#f3f6f9;
  border:1px solid #d3dce5;
}

.legend-item{
  display:flex;
  align-items:center;
  gap:8px;
  font-weight:700;
  color:#24313d;
}

.legend-dot{
  width:14px;
  height:14px;
  border-radius:50%;
  display:inline-block;
  border:2px solid transparent;
}

.legend-dot.normal{
  background:#0b7a33;
  border-color:#065c24;
}

.legend-dot.low{
  background:#d39b00;
  border-color:#9b6f00;
}

.legend-dot.high{
  background:#c62828;
  border-color:#8e1d1d;
}

.legend-dot.hold{
  background:#697682;
  border-color:#4c5660;
}

.scrollable-charts-container{
  display:grid;
  grid-auto-flow:column;
  grid-auto-columns:minmax(clamp(320px, 40vw, 560px), 1fr);
  gap:20px;
  overflow-x:auto;
  padding:10px;
  margin:30px;
  border-radius:10px;
  box-shadow:0 2px 8px rgba(0,0,0,0.1);
  max-height:calc(100vh - 200px);
}

.student-container{
  min-width:0;
  display:flex;
  flex-direction:column;
  overflow-y:auto;
  padding-right:6px;
}

.student-container>h2{
  position:sticky;
  top:0;
  background:#fff;
  z-index:1;
  padding:2px 0 8px;
  margin:0 0 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.uid-input {
  font-size: 14px;
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 120px;
}

.status-list{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin:8px 0 14px;
}

.norm-control{
  display:flex;
  align-items:center;
  gap:10px;
  margin:0 0 10px;
}
.norm-control .muted{ color:#777; }

/* 校準按鈕 */
.calib-btn{
  padding:6px 10px; border-radius:8px; border:1px solid rgba(0,0,0,.1); margin-left:8px;
  background:#0ab; color:#fff; cursor:pointer;
}
.calib-btn:disabled{ opacity:.6; cursor:not-allowed; }
.calib-reset-btn{
  padding:6px 10px; border-radius:8px; border:1px solid rgba(0,0,0,.1); margin-left:6px;
  background:#888; color:#fff; cursor:pointer;
}
.calib-reset-btn:disabled{ opacity:.5; cursor:not-allowed; }

/* EMG 一眼辨識：徽章 + 量表 */
.emg-activation{
  display:flex; align-items:center; gap:12px; margin:6px 0 14px;
}
.badge{
  font-weight:700; padding:6px 10px; border-radius:999px; transition:all .2s ease;
  box-shadow:0 0 0 rgba(0,0,0,0);
}
.badge.on{
  color:#0a5; background:rgba(0,255,120,.12);
  box-shadow:0 0 0 rgba(0,0,0,0), 0 0 14px rgba(0,200,120,.35);
}
.badge.off{
  color:#666; background:rgba(140,140,140,.12);
}
.meter{
  flex:1; height:10px; background:rgba(0,0,0,.06); border-radius:999px; overflow:hidden;
}
.meter .fill{
  height:100%; width:0%;
  background:linear-gradient(90deg, rgba(0,200,120,.85), rgba(0,180,255,.85));
  transition:width .12s linear;
}

/* 圖表高亮（EMG active 時） */
.chart-container.chart-active{
  box-shadow:0 0 0 rgba(0,0,0,0), 0 0 24px rgba(0,200,120,.35);
  outline:2px solid rgba(0,200,120,.35);
}

.checkbox-group{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin:10px 0 0;
}

.charts-container-vertical{
  display:flex;
  flex-direction:column;
  gap:20px;
}

.chart-container{
  width:100%;
  height: v-bind(chartHeight);
  padding:0;
  background-color:#fff;
  border-radius:10px;
  box-shadow:0 2px 8px rgba(0,0,0,0.1);
  box-sizing:border-box;
}

.canvasjs-chart-toolbar button{ transform:none; }

.status-indicator{
  font-weight:bold;
  padding:6px 8px;
  border-radius:6px;
  background-color:#d7dde3;
  border:1px solid transparent;
  transition:background-color .15s ease, color .15s ease, border-color .15s ease;
}
.status-indicator.normal{ background-color:#147a3f; color:#ffffff; border-color:#0d5c2f; }
.status-indicator.low{ background-color:#d39b00; color:#2b1d00; border-color:#9b6f00; }
.status-indicator.high{ background-color:#c62828; color:#ffffff; border-color:#8e1d1d; }
.status-indicator.hold{ background-color:#697682; color:#ffffff; border-color:#4c5660; }

.recording {
  background-color: red !important;
  color: white;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

@media (max-width: 900px) {
  .threshold-settings-header{
    flex-direction:column;
  }
}
</style>

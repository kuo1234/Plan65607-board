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
            <span
              v-for="item in group.statusList"
              :key="item.label"
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
let deviceCount = ref(0);
const charts = reactive({});

// ===== 狀態範圍（可依需求調整）=====
const TH = {
  ecg_quality: { rms_low: 150, rms_high: 8000, clip_ratio_high: 0.02 }, // 供狀態燈參考
  emg_env: { low: 20, high: 1200 }, // EMG 包絡（ADC）映射 0~100% 的預設範圍（未校準時用）
  emg_activation: { on: 120, off: 90, debounce_ms: 200 }, // 遲滯 + 去抖
  gsr_uS: { low: 1, high: 20 },
  body_temp: { low: 36.1, high: 37.2, fever: 38.0 },
  env_temp: { low: 20, high: 35 },
  humidity: { low: 30, high: 70 },
  hr: { low: 60, high: 100 },
  spo2: { low: 90, normal: 95 },
};

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
      options: createChartOptions("ECG", "ADC (raw)", {
        axisY: { labelFontSize, title: "ADC (raw)", titleFontSize: labelTitleFontSize },
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
        axisY: { labelFontSize, title: "ADC (raw)", titleFontSize: labelTitleFontSize },
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
        { key: "hr_value", label: "Heart Rate", color: "red", yAxis: "primary" },
        { key: "spo2_value", label: "SpO2", color: "blue", yAxis: "secondary" },
      ],
      options: createChartOptions("心率與血氧", "Heart Rate (bpm)", {
        axisY: {
          minimum: 0, maximum: 180,
          labelFontSize, title: "Heart Rate (bpm)", titleFontSize: labelTitleFontSize,
          stripLines: [
            { startValue: TH.hr.low, endValue: TH.hr.high, color: "rgba(0, 255, 0, 0.2)", label: `正常 HR ${TH.hr.low}–${TH.hr.high}`, labelFontColor: "green" },
          ],
        },
        axisY2: {
          minimum: 0, maximum: 100,
          labelFontSize, title: "SpO2 (%)", titleFontSize: labelTitleFontSize,
          stripLines: [
            { value: TH.spo2.normal, color: "rgba(255, 170, 51, 0.2)", lineDashType: "dash", label: `SpO2 正常 ≥${TH.spo2.normal}%` },
            { value: TH.spo2.low, color: "rgba(255, 0, 0, 0.2)", lineDashType: "dash", label: `SpO2 輕度缺氧 ${TH.spo2.low}%` },
          ],
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
                  const lo = TH.emg_env.low, hi = TH.emg_env.high;
                  group.runtime.level01 = Math.max(0, Math.min(1, (envForState - lo) / Math.max(hi - lo, 1)));
                }

                // 一眼辨識：遲滯 + 去抖
                const now = Date.now();
                let nextActive = group.runtime.active;
                const onTh  = TH.emg_activation.on;
                const offTh = TH.emg_activation.off;
                if (!group.runtime.active && envForState >= onTh) nextActive = true;
                if ( group.runtime.active && envForState <= offTh) nextActive = false;

                if (nextActive !== group.runtime.active) {
                  if (now - (group.runtime.activeChangedAt || 0) >= TH.emg_activation.debounce_ms) {
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
            group.options.data[index].dataPoints.push({ x: xVal.value, y: displayValue });
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
              if (envRaw < TH.emg_env.low) status = "low";
              else if (envRaw > TH.emg_env.high) status = "high";
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
:root{
  --title-size: clamp(18px, 2.2vw, 30px);
  --label-size: clamp(12px, 1.6vw, 20px);
  --label-title-size: clamp(12px, 1.6vw, 20px);
}

.main-container{ margin:20px; }

.home-button-container{
  display:flex; gap:10px; flex-wrap:wrap; margin:10px;
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
  padding:6px 5px;
  border-radius:6px;
  background-color:rgba(200,200,200,0.2);
}
.status-indicator.normal{ background-color:rgba(0,255,0,0.1); color:green; }
.status-indicator.low{ background-color:rgba(255,255,0,0.2); color:goldenrod; }
.status-indicator.high{ background-color:rgba(255,0,0,0.1); color:red; }
.status-indicator.hold{ background-color:rgba(100,100,100,0.15); color:#666; }
</style>

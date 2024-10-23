<template>
    
    <div class="home-button-container">
        <!-- Put more button in this area -->
        <button @click="returnHome">返回主畫面</button>
        <!-- 重啟按鈕 -->
        <button @click="restartPicoW">重新執行 Pico W 程式</button>
    </div>
    <!-- 感測器數據動態圖表 -->
    <div class="charts-container">
        <!-- ECG -->
        <div class="chart-container">
            <CanvasJSChart :options="ecgOptions" :style="styleOptions" @chart-ref="ecgChartInstance" />
        </div>
        <!-- GSR -->
        <div class="chart-container">
            <CanvasJSChart :options="gsrOptions" :style="styleOptions" @chart-ref="gsrChartInstance" />
        </div>
        <!-- Temperature -->
        <div class="chart-container">
            <CanvasJSChart :options="tempOptions" :style="styleOptions" @chart-ref="tempChartInstance" />
        </div>
        <!-- Humidity -->
        <div class="chart-container">
            <CanvasJSChart :options="humidityOptions" :style="styleOptions" @chart-ref="humidityChartInstance" />
        </div>
        <!-- Muscle -->
        <div class="chart-container">
            <CanvasJSChart :options="muscleOptions" :style="styleOptions" @chart-ref="muscleChartInstance" />
        </div>
        <!-- Heart Rate -->
        <div class="chart-container">
            <CanvasJSChart :options="hrOptions" :style="styleOptions" @chart-ref="hrChartInstance" />
        </div>
    </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { ref, reactive } from 'vue';

// 使用 Window 曝露的 electronAPI 來重啟裝置
const rebootDevice = () => {
  window.electronAPI.rebootPicoW(); // 使用預載的 API 發送重啟指令
};

// 定義響應式狀態
const ecgChart = ref(null);
const gsrChart = ref(null);
const tempChart = ref(null);
const muscleChart = ref(null);
const hrChart = ref(null);
const humidityChart = ref(null);

const chartUpdateFreq = 1000 // 圖表更新頻率（毫秒）

let xVal = ref(0);

const chartTitleFontSize = 30; // 圖表標題 sizea
const labelFontSize = 20; // 圖表 x, y 軸數值 font size
const labelTitleFontSize = 20; // 圖表 x, y 軸標題 size

// 每個感測器的圖表選項，並設定標題的字體大小
const ecgOptions = reactive({
exportEnabled: true,
title: { 
    text: "ECG Data", 
    fontSize: chartTitleFontSize  // 設定標題字體大小
},
axisX: {
    labelFontSize: labelFontSize,  // 設定 X 軸數值字體大小
    title: "Time (s)",  // 設定 X 軸標題
    titleFontSize: labelTitleFontSize   // 設定 X 軸標題字體大小
},
axisY: {
    labelFontSize: labelFontSize,  // 設定 Y 軸數值字體大小
    title: "ECG Value", // 設定 Y 軸標題
    titleFontSize: labelTitleFontSize   // 設定 Y 軸標題字體大小
},
data: [{ type: "line", dataPoints: [] }],
});

const gsrOptions = reactive({
exportEnabled: true,
title: { 
    text: "GSR Data", 
    fontSize: chartTitleFontSize  // 設定標題字體大小
},
axisX: {
    labelFontSize: labelFontSize,  // 設定 X 軸數值字體大小
    title: "Time (s)",  // 設定 X 軸標題
    titleFontSize: labelTitleFontSize   // 設定 X 軸標題字體大小
},
axisY: {
    labelFontSize: labelFontSize,  // 設定 Y 軸數值字體大小
    title: "GSR Value", // 設定 Y 軸標題
    titleFontSize: labelTitleFontSize   // 設定 Y 軸標題字體大小
},
data: [{ type: "line", dataPoints: [] }]
});

const tempOptions = reactive({
exportEnabled: true,
title: { 
    text: "Temperature Data", 
    fontSize: chartTitleFontSize  // 設定標題字體大小
},
axisX: {
    labelFontSize: labelFontSize,  // 設定 X 軸數值字體大小
    title: "Time (s)",  // 設定 X 軸標題
    titleFontSize: labelTitleFontSize   // 設定 X 軸標題字體大小
},
axisY: {
    labelFontSize: labelFontSize,  // 設定 Y 軸數值字體大小
    title: "Temperature (°C)", // 設定 Y 軸標題
    titleFontSize: labelTitleFontSize   // 設定 Y 軸標題字體大小
},
data: [{ type: "line", dataPoints: [] }]
});

const muscleOptions = reactive({
exportEnabled: true,
title: { 
    text: "Muscle Data", 
    fontSize: chartTitleFontSize  // 設定標題字體大小
},
axisX: {
    labelFontSize: labelFontSize,  // 設定 X 軸數值字體大小
    title: "Time (s)",  // 設定 X 軸標題
    titleFontSize: labelTitleFontSize   // 設定 X 軸標題字體大小
},
axisY: {
    labelFontSize: labelFontSize,  // 設定 Y 軸數值字體大小
    title: "Muscle Activity", // 設定 Y 軸標題
    titleFontSize: labelTitleFontSize   // 設定 Y 軸標題字體大小
},
data: [{ type: "line", dataPoints: [] }]
});

const hrOptions = reactive({
exportEnabled: true,
title: { 
    text: "Heart Rate Data", 
    fontSize: chartTitleFontSize  // 設定標題字體大小
},
axisX: {
    labelFontSize: labelFontSize,  // 設定 X 軸數值字體大小
    title: "Time (s)",  // 設定 X 軸標題
    titleFontSize: labelTitleFontSize   // 設定 X 軸標題字體大小
},
axisY: {
    labelFontSize: labelFontSize,  // 設定 Y 軸數值字體大小
    title: "Heart Rate (bpm)", // 設定 Y 軸標題
    titleFontSize: labelTitleFontSize   // 設定 Y 軸標題字體大小
},
data: [{ type: "line", dataPoints: [] }]
});

const humidityOptions = reactive({
exportEnabled: true,
title: { 
    text: "Humidity Data", 
    fontSize: chartTitleFontSize  // 設定標題字體大小
},
axisX: {
    labelFontSize: labelFontSize,  // 設定 X 軸數值字體大小
    title: "Time (s)",  // 設定 X 軸標題
    titleFontSize: labelTitleFontSize   // 設定 X 軸標題字體大小
},
axisY: {
    labelFontSize: labelFontSize,  // 設定 Y 軸數值字體大小
    title: "Humidity (%)", // 設定 Y 軸標題
    titleFontSize: labelTitleFontSize   // 設定 Y 軸標題字體大小
},
data: [{ type: "line", dataPoints: [] }]
});

const styleOptions = reactive({
width: "100%",
height: "360px",
});

// 更新圖表資料
const updateCharts = async () => {
    try {
        const data = await window.electronAPI.getSensorData();
        if (!data) {
            console.error("No data received from sensor.");
            setTimeout(updateCharts, 1000);  // 重試間隔時間
            return;
        }
        
        ecgOptions.data[0].dataPoints.push({ x: xVal.value, y: data.ecg_value });
        gsrOptions.data[0].dataPoints.push({ x: xVal.value, y: data.gsr_value });
        tempOptions.data[0].dataPoints.push({ x: xVal.value, y: data.temperature });
        muscleOptions.data[0].dataPoints.push({ x: xVal.value, y: data.muscle_value });
        hrOptions.data[0].dataPoints.push({ x: xVal.value, y: data.hr_value });
        humidityOptions.data[0].dataPoints.push({ x: xVal.value, y: data.humidity });

        xVal.value++;
        if (ecgOptions.data[0].dataPoints.length > 50) ecgOptions.data[0].dataPoints.shift();
        if (gsrOptions.data[0].dataPoints.length > 50) gsrOptions.data[0].dataPoints.shift();
        if (tempOptions.data[0].dataPoints.length > 50) tempOptions.data[0].dataPoints.shift();
        if (muscleOptions.data[0].dataPoints.length > 50) muscleOptions.data[0].dataPoints.shift();
        if (hrOptions.data[0].dataPoints.length > 50) hrOptions.data[0].dataPoints.shift();
        if (humidityOptions.data[0].dataPoints.length > 50) humidityOptions.data[0].dataPoints.shift();

        ecgChart.value?.render();
        gsrChart.value?.render();
        tempChart.value?.render();
        muscleChart.value?.render();
        hrChart.value?.render();
        humidityChart.value?.render();
    } catch (error) {
        console.error("Error updating charts:", error);
    }
    setTimeout(updateCharts, chartUpdateFreq);  // 設置下一次更新
};
const ecgChartInstance = (chart) => {
    ecgChart.value = chart;
};

const gsrChartInstance = (chart) => {
    gsrChart.value = chart;
};

const tempChartInstance = (chart) => {
    tempChart.value = chart;
};

const muscleChartInstance = (chart) => {
    muscleChart.value = chart;
};

const hrChartInstance = (chart) => {
    hrChart.value = chart;
};

const humidityChartInstance = (chart) => {
    humidityChart.value = chart;
    updateCharts();
};

const router = useRouter();
const returnHome = () => {
    router.push("/");
};
</script>

<style scoped>
.home-button-container {
    position: absolute;
    top: 20px;
    left: 20px;
    display: flex;
    gap: 10px;
    display: flex;
    justify-content: start;
    gap: 10px;
    margin: 20px;
}

.charts-container {
    margin-top: 100px;
    padding: 30px;
    width: 800px;
}
.chart-container {
  margin-bottom: 30px;  /* 設置每個圖表之間的 margin */
}

/* 調整 CanvasJS 圖表匯出按鈕的大小 */
.canvasjs-chart-toolbar button {
  transform: scale(1.5);  /* 調整大小倍率，1.0 為原始大小 */
}
</style>
<template>
	<div class="main-container">
		<!-- <<<<< 按鈕區塊 <<<<< -->
		<div class="home-button-container">
			<button @click="returnHome">返回主畫面</button>
			<button @click="restartPicoW">重新執行 Pico W 程式</button>
		</div>

		<!-- <<<<< CheckBox 控制區塊 <<<<< -->
		<div class="device-block" v-for="(sensorCharts, path) in charts" :key="path">
			<h5 class="device-title">{{ path }}</h5>
			<div class="checkbox-group">
				<label v-for="(chart, key) in sensorCharts" :key="key">
					<input type="checkbox" v-model="chart.visible" />
					{{ chart.label }}
				</label>
			</div>
		</div>


		<!-- <<<<< 感測器數據動態圖表 <<<<<  -->
		<div class="scrollable-charts-container">
			<div
				v-for="(sensorCharts, path) in charts" 
				:key="path"
			>
				<h2>{{ path }}</h2>
				<div class="charts-container">
					<div
						v-for="(chart, key) in sensorCharts"
						:key="key"
						v-show="chart.visible"
						class="chart-container"
					>
						<CanvasJSChart
							:options="chart.options"
							:style="styleOptions"
							@chart-ref="(instance) => setChartInstance(path, key, instance)"
						/>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { ref, reactive } from "vue";

const tabs = ref(['All']);

function updateTabsFromData(data) {
	const keysInData = Object.keys(data);

	// Step 1: 加入缺少的 keys（除了 'All'）
	for (const key of keysInData) {
		if (!tabs.value.includes(key)) {
			tabs.value.push(key);
			initialChart(key); // 初始化圖表
		}
	}

	// Step 2: 移除 tabs 中不存在於 data 的元素（排除 'All'）
	tabs.value = tabs.value.filter((tab) => {
		return tab === 'All' || keysInData.includes(tab);
	});
}
const activeTab = ref('All');

const router = useRouter();

// <<<<< 按鈕功能 <<<<<
const returnHome = () => router.push("/");
const restartPicoW = () => window.electronAPI.restartPicoW();

// 圖表通用設定
const chartTitleFontSize = 30;
const labelFontSize = 20;
const labelTitleFontSize = 20;

const chartUpdateFreq = 100; // 圖表更新頻率（毫秒）
let xVal = ref(0);

// **🔹 通用圖表設定函式**
const createChartOptions = (title, yAxisTitle, extraOptions = {}) => ({
	exportEnabled: true,
	title: { text: title, fontSize: chartTitleFontSize },
	axisX: { labelFontSize, title: "Time (s)", titleFontSize: labelTitleFontSize },
	axisY: { labelFontSize, title: yAxisTitle, titleFontSize: labelTitleFontSize },
	data: [{ type: "line", dataPoints: [] }],
	...extraOptions // 可用來擴充不同圖表的特殊設定
});

// **🔹 用 charts 物件統一管理所有圖表**
const charts = reactive({});
function initialChart(path) {
	// console.log('initialChart', path);
	charts[path] = reactive({
		ecg_value: { 
			label: "ECG", 
			visible: true, 
			options: createChartOptions("ECG Data", "ECG Value"), 
			instance: null 
		},
		gsr_value: { 
			label: "GSR", 
			visible: true, 
			options: createChartOptions("GSR Data", "GSR Value"), 
			instance: null 
		},
		temperature: { 
			label: "Temperature", 
			visible: true, 
			options: createChartOptions("Temperature", "°C"), 
			instance: null 
		},
		muscle_value: { 
			label: "Muscle Activity", 
			visible: true, 
			options: createChartOptions("Muscle Data", "Muscle Activity"), 
			instance: null 
		},
		hr_value: { 
			label: "Heart Rate", 
			visible: true, 
			options: createChartOptions("Heart Rate Data", "bpm", {
				axisY: {
					minimum: 30, // 設定 Y 軸最小值
					maximum: 150, 
					labelFontSize: labelFontSize,
					title: "Heart Rate (bpm)",
					titleFontSize: labelTitleFontSize,
					stripLines: [
						{
							startValue: 60,
							endValue: 100,
							color: "rgba(0, 255, 0, 0.2)", // 綠色透明區塊
							label: "正常範圍（60-100）",
							labelFontColor: "green"
						}
					]
				}
			}), 
			instance: null ,
			
		},
		humidity: { 
			label: "Humidity", 
			visible: true, 
			options: createChartOptions("Humidity Data", "Humidity (%)"), 
			instance: null 
		},
		tmp102_temperature: { 
			label: "Human Body Temperature", 
			visible: true, 
			options: createChartOptions("Human Body Temperature", "°C"), 
			instance: null 
		},
		spo2_value: { 
			label: "SPO2",
			visible: true,
			options: createChartOptions("SPO2 Data", "SPO2", {
				axisY: {
					minimum: 50, // 設定 Y 軸最小值
					maximum: 100, // 設定 Y 軸最大值
					labelFontSize,
					title: "SPO2",
					titleFontSize: labelTitleFontSize,
					stripLines: [
						{
							value: 95,
							color: "rgba(255, 170, 51, 0.5)",
							lineDashType: "dash",
							thickness: 4,
							labelFontColor: "green",
							label: "正常 (95-100%)",
						},
						{
							value: 90,
							color: "rgba(255, 0, 0, 0.5)",
							lineDashType: "dash",
							thickness: 2,
							label: "輕度缺氧（90-95％）",
						},
						{
							value: 85,
							lineDashType: "dash",
							thickness: 0,
							labelFontColor: "red",
							label: "重度缺氧 (<90%)",
						}
					]
				},
				data: [{
					type: "line",
					dataPoints: []
				}],
				legend: {
					cursor: "pointer",
					itemclick: function(e) {
						e.dataSeries.visible = !e.dataSeries.visible;
						e.chart.render();
					}
				},
			}),
			instance: null
		}
	});
	// console.log('initialChart', charts);
}

// **🔹 設定圖表實例**
function setChartInstance(path, key, instance) {
	if (!charts[path]) {
		// 可選：你可以初始化整個 charts[path] = reactive({ ... })，或跳過
		console.warn(`charts[${path}] 尚未初始化`);
		return;
	}

	if (!charts[path][key]) {
		console.warn(`charts[${path}][${key}] 尚未定義`);
		return;
	}

	charts[path][key].instance = instance;
}


// **🔹 更新圖表資料**
const updateCharts = async () => {
	try {
		const data = await window.electronAPI.getSensorData();
		// console.log(data);
		if (!data) {
			// console.error("No data received from sensor.");
			setTimeout(updateCharts, 1000);
			return;
		}

		updateTabsFromData(data);

		// **自動更新所有感測器的圖表**
		for (const path in charts){
			for (const key in charts[path]) {
				const sensorKey = key; // e.g., "ecg_value", "gsr_value", "spo2_value"
				if (data[path][sensorKey] !== undefined) {
					charts[path][key].options.data[0].dataPoints.push({ x: xVal.value, y: data[path][sensorKey] });
					// console.log(charts[path][key].options.data[0].dataPoints);

					// 限制資料數量
					if (charts[path][key].options.data[0].dataPoints.length > 50) {
						charts[path][key].options.data[0].dataPoints.shift();
					}

					// 重新渲染圖表
					charts[path][key].instance?.render();
				}
			}
		}
		// for (const key in charts) {
		// 	const sensorKey = key; // e.g., "ecg_value", "gsr_value", "spo2_value"
		// 	if (data[sensorKey] !== undefined) {
		// 		charts[key].options.data[0].dataPoints.push({ x: xVal.value, y: data[sensorKey] });

		// 		// 限制資料數量
		// 		if (charts[key].options.data[0].dataPoints.length > 50) {
		// 			charts[key].options.data[0].dataPoints.shift();
		// 		}

		// 		// 重新渲染圖表
		// 		charts[key].instance?.render();
		// 	}
		// }

		xVal.value++;
	} catch (error) {
		// console.error("Error updating charts:", error);
	}

	setTimeout(updateCharts, chartUpdateFreq);
};

updateCharts(); // 啟動更新迴圈

// 圖表通用樣式設定
const styleOptions = {
	width: "100%",
	height: "400px",
};


</script>

<style scoped>
.main-container {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	margin: 20px;
}

.home-button-container {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
	margin: 10px;
}

.scrollable-charts-container {
	overflow-y: auto;
	max-height: 80vh; /* 限制最大高度 */
	padding: 10px;
	margin: 30px;
	border-radius: 10px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}


.checkbox-container {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}

.charts-container {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 20px;
	/* background-color: aqua; */
	/* width: 100%; */
	/* box-sizing: border-box; */
}

.chart-container {
	width: 100%;
	background-color: #fff;
	border-radius: 10px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	padding: 10px;
	box-sizing: border-box;
}

/* 調整 CanvasJS 圖表匯出按鈕的大小 */
.canvasjs-chart-toolbar button {
	transform: scale(1.5);
}


</style>

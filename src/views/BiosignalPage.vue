<template>
    
    <div class="home-button-container">
        <!-- Put more button in this area -->
        <button @click="returnHome">返回主畫面</button>
    </div>
    <div v-for="(records, ip) in data" :key="ip">
        <h3>{{ ip }}</h3>
        <ul>
            <li v-for="record in records" :key="record.ECG">
                ECG: {{ record.ECG }}, EMG: {{ record.EMG }}, EDA: {{ record.EDA }}, Temp: {{ record.Temp }}, Humidity: {{ record.Humi }}
            </li>
        </ul>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from "vue-router";

const data = ref({});

onMounted(() => {
    window.electronAPI.onSensorDataUpdate(newData => {
        data.value = { ...data.value, [newData.ip]: newData.data };
    });
});

const loadData = async () => {
    data.value = await window.electronAPI.getDeviceData();
};

const router = useRouter();
const returnHome = () => {
  router.push("/");
};

loadData();
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
</style>